# Migration Plan: Move Image Storage from MongoDB (base64) to Amazon S3

Goal:
- Store binary image data in S3 and keep MongoDB as the source of truth for comic metadata and S3 references.
- Preserve offline capabilities and hybrid behavior.
- Roll out safely with a clear rollback path.

Out of scope:
- Infra-as-code for AWS (Terraform/CDK) is optional; you can configure manually.
- Lambda-based image processing is optional but recommended at scale.

---

## 1) Target End-State Architecture

- Amazon S3:
  - Private bucket with either:
    - CloudFront distribution using Origin Access Control (recommended for public images), or
    - Private bucket accessed via pre-signed URLs for private images.
  - Keys pattern: `covers/{comicId}/{size}.jpg` where size ∈ {thumbnail, medium, full}; optional `original.jpg`.

- MongoDB:
  - Comic document stores references and metadata instead of base64:
    ```
    images: {
      thumbnail: { key, url, width, height, bytes, contentType, etag, updatedAt },
      medium:    { key, url, width, height, bytes, contentType, etag, updatedAt },
      full:      { key, url, width, height, bytes, contentType, etag, updatedAt },
      version:   1,
      migratedAt: ISODate,
      legacy: { hasInline: Boolean } // to manage fallback
    }
    ```
  - Keep legacy base64 fields during rollout; remove after validation window.

- Delivery:
  - Prefer direct CloudFront/S3 URLs in the frontend for performance.
  - Keep existing API endpoints to support backward compatibility, deletes, and metadata reads.

---

## 2) AWS Setup

- Create S3 bucket:
  - Block Public Access: ON.
  - CORS (for browser PUT/POST if doing direct uploads):
    ```
    [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
        "AllowedOrigins": ["https://your-domain.com", "http://localhost:5173"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
      }
    ]
    ```
  - Lifecycle policies (optional):
    - Move `full` to STANDARD_IA after 90 days.
    - Enable versioning and delete noncurrent versions after 180 days.

- CloudFront (recommended):
  - Origin: S3 bucket with OAC.
  - Cache policy with long max-age for immutable keys.
  - Custom domain e.g., `images.your-domain.com`.

- IAM:
  - Create a role/user with least privilege for server:
    - s3:PutObject, s3:GetObject, s3:DeleteObject for bucket prefix `covers/*`.
    - s3:ListBucket (optional for diagnostics).
  - For pre-signed URLs, server signs using its credentials (no client secrets in browser).

- Environment variables (per environment):
  - AWS_REGION
  - AWS_S3_BUCKET
  - AWS_S3_PUBLIC_BASE_URL (CloudFront domain or `https://{bucket}.s3.amazonaws.com` if public)
  - AWS_ACCESS_KEY_ID (server only)
  - AWS_SECRET_ACCESS_KEY (server only)
  - IMAGE_SIZES (optional JSON or comma-list: `thumbnail:200,medium:800,full:1600`)
  - IMAGE_PRIVACY (public|private) to choose URL strategy.

---

## 3) Backend Changes

Recommended libraries:
- @aws-sdk/client-s3
- @aws-sdk/s3-request-presigner
- sharp (already present) for resizing if processing server-side

Utilities:
- Create `s3Client` module:
  - Configure with region and credentials (from env).
  - Helpers:
    - `putObject({Key, Body, ContentType, CacheControl})`
    - `deleteObject({Key})`
    - `getSignedUrl({Key, method, expiresIn})`
    - `keyFor(comicId, size)` -> `covers/{comicId}/{size}.jpg`
    - `publicUrlFor(key)` -> `${AWS_S3_PUBLIC_BASE_URL}/${key}`

API endpoints (recommended minimal set):
- POST `/api/images/upload-url`
  - Request: `{ comicId, sizes: ["thumbnail","medium","full"], contentTypes: {...} }`
  - Response: Per-size pre-signed PUT URLs and expected keys, e.g.:
    ```
    {
      comicId,
      urls: {
        full: { url, key, headers: { "Content-Type": "image/jpeg" } },
        medium: { ... },
        thumbnail: { ... }
      }
    }
    ```
  - If you choose server-side generation of sizes: only return one URL for `original`; the server (or Lambda) will generate derivatives.

- POST `/api/images/complete`
  - Request: `{ comicId, uploaded: { size: { key, etag, contentType, width, height, bytes } } }`
  - Server writes MongoDB `images.*` fields for each size with `key`, `etag`, `contentType`, `bytes`, and constructs `url` using `publicUrlFor`.
  - Returns the persisted images metadata.

- GET `/api/images/:comicId/:size`
  - For compatibility with existing callers. Behavior:
    - If images.* exists: redirect (302) to public URL or stream from S3 (if private).
    - Else: fallback to legacy base64 flow (if still present) until cutover.

- GET `/api/images/:comicId/metadata`
  - Returns the `images` object from MongoDB.

- DELETE `/api/images/:comicId`
  - Deletes `covers/{comicId}/{size}.jpg` for all sizes and clears image refs in MongoDB.
  - If keys are missing, ignore and continue; return idempotent success.

Server-side processing options:
- Option A (simplest now): Client uploads three sizes using pre-signed URLs (frontend resizes or server provides three upload URLs). This avoids server CPU for sharp in serverless.
- Option B (preferred long-term): Client uploads only `original` via pre-signed URL; then:
  - S3 ObjectCreated triggers a Lambda to write `thumbnail`, `medium`, `full`.
  - Lambda updates MongoDB (via AWS Lambda env for DB URI).
- Option C (synchronous server): Send original to an API route; server streams through sharp to S3 for each size. Watch function timeouts on serverless.

Cache headers:
- Set `Cache-Control: public, max-age=31536000, immutable` for immutable keys (if you use content-hashed keys); otherwise a shorter max-age with ETag validation.

---

## 4) Frontend Changes

High level:
- Switch from uploading image bytes to the backend → request pre-signed URLs and PUT directly to S3.
- Switch from requesting image bytes via backend → use `images.*.url` for direct loading (or keep the existing GET endpoint as a fallback/redirect).

Concrete tasks:
- Update the upload flow (in your upload client):
  1) Call `POST /api/images/upload-url` with `{ comicId, sizes }`.
  2) PUT each Blob to the returned pre-signed URL with the specified headers.
  3) Collect upload results (etag, size, width/height if available) and call `POST /api/images/complete` so the server writes MongoDB refs.
  4) Update local cache/metadata with the returned `images` object.

- Update image retrieval:
  - If the comic document has `images[size].url`, use it directly in `<img src>`.
  - Fallback to the compatibility endpoint `/api/images/:comicId/:size` during rollout.

- Keep hybrid/offline:
  - Continue storing a local copy in IndexedDB for offline cache (unchanged).
  - When back online, prefer remote URL but keep local as fallback.

- Deletion:
  - Call `DELETE /api/images/:comicId` for remote deletion.
  - Clear local cache for that comic id.

---

## 5) Data Model Migration

Strategy: additive fields → backfill → cutover → cleanup.

- Add new `images` object to documents; do not remove legacy base64 fields yet.
- Backfill script uploads existing base64 (3 sizes) to S3 and writes `images.*` refs.
- Cutover frontend to prefer `images.*.url`. Fallback to legacy if missing.
- After validation window (e.g., 2–4 weeks), run cleanup to remove legacy base64 from MongoDB.

Field mapping:
- From legacy: `{ thumbnail.base64, medium.base64, full.base64, mimeType }`
- To new: for each size:
  ```
  {
    key: "covers/{comicId}/{size}.jpg",
    url: "https://images.your-domain.com/covers/{comicId}/{size}.jpg",
    width, height, bytes, contentType, etag, updatedAt
  }
  ```

---

## 6) Migration Script (Node)

Create `scripts/migrate-images-to-s3.js`:
- Inputs:
  - MongoDB URI/DB/COLLECTION via env.
  - AWS/S3 env (bucket, region).
  - Options: `--concurrency`, `--dry-run`, `--resume`, `--only comicId`, `--sizes=thumbnail,medium,full`.

- Steps:
  1) Query documents with legacy images and either missing or incomplete `images.*`.
  2) For each comic:
     - Extract base64 per size → Buffer.
     - Upload to S3 with `Key = covers/{comicId}/{size}.jpg`, `ContentType` = from document or default `image/jpeg`, `Cache-Control` as configured.
     - Capture `ETag`, `ContentLength`, and compute width/height (optional using sharp).
     - Update MongoDB `images.*` fields and set `migratedAt` + `legacy.hasInline = true`.
  3) Write progress checkpoints (e.g., a `migrations` collection or a JSON state file) to allow resume.
  4) On `--dry-run`, do not write to S3 or DB; only report.

- Validation:
  - After upload, GET the public URL (or HEAD) to verify 200/etag matches.
  - For a random sample, download and compare hash with source.

- Cleanup (later):
  - Separate script `scripts/cleanup-legacy-inline-images.js` to unset legacy base64 and set `legacy.hasInline=false`.

---

## 7) Rollout Plan

- Phase 1: Backend ready
  - Deploy S3 client and new API endpoints (upload-url/complete/redirect/metadata/delete).
  - No frontend changes yet; existing behavior still works.

- Phase 2: Frontend upload change (feature flag)
  - Add a feature flag `USE_S3_UPLOADS` to switch new upload path on in preview.
  - Test end-to-end in preview (uploads, loads, deletes, offline fallback).

- Phase 3: Data backfill in production
  - Run migration script during low traffic; throttle concurrency.
  - Monitor S3 and DB metrics; log failures and resume.

- Phase 4: Read path cutover
  - Frontend prefers `images.*.url`. Keep fallback to legacy endpoint.

- Phase 5: Cleanup
  - After 2–4 weeks with no regressions, run cleanup script to remove legacy base64.
  - Remove fallback code paths when safe.

- Rollback plan:
  - If issues arise, toggle `USE_S3_UPLOADS=false`.
  - Because legacy base64 is still present until cleanup, reads continue to work.

---

## 8) Security, Privacy, and Performance

- Bucket privacy:
  - If public images are acceptable, use CloudFront OAC + public Cache-Control.
  - If images must be private, avoid public URLs; use pre-signed GETs or proxy via API route.

- Validation:
  - Enforce MIME types and size limits on upload-url issuance.
  - Optionally compute and store a content hash; reject duplicates.

- Cache:
  - Use long-lived cache headers for immutable keys (add content hash to keys if you need true immutability).
  - Example key: `covers/{comicId}/{size}-{etag}.jpg` and store the final canonical URL in MongoDB.

- Observability:
  - Log each upload/delete with comicId, size, user, and etag.
  - Add metrics for endpoint latency and error rates.

---

## 9) Testing Checklist

- Unit tests:
  - s3Client helpers (key generation, URL building).
  - Upload URL issuance (header constraints, content-type).
  - Complete endpoint (DB update schema).

- Integration tests:
  - Upload via pre-signed URL → complete → GET URL works.
  - Delete endpoint deletes from S3 and DB.
  - Fallback path works for non-migrated docs.

- E2E manual:
  - Upload new cover, refresh page, image loads from CDN.
  - Offline mode still shows cached image (IndexedDB).
  - Replace cover, old URLs invalidated or overwritten as expected.

---

## 10) Concrete Code Changes (by area)

Backend:
- Add S3 utility module and env parsing.
- Add `POST /api/images/upload-url`, `POST /api/images/complete`, `GET /api/images/:comicId/:size`, `GET /api/images/:comicId/metadata`, `DELETE /api/images/:comicId`.
- Update existing image read routes to redirect or stream from S3 if `images.*` exists.

Frontend:
- Update upload client to:
  - Request pre-signed URLs,
  - PUT Blobs to S3,
  - Call complete endpoint with etag/bytes/metadata.
- Update image retrieval to use `images.*.url` when available; keep fallback to API endpoint.
- Keep offline cache logic; no change required beyond using the canonical URL for remote.

Data & scripts:
- Create `scripts/migrate-images-to-s3.js` (backfill).
- Create `scripts/cleanup-legacy-inline-images.js` (final cleanup).

Configuration:
- Add AWS env vars; configure per environment in your hosting provider.
- Add S3 CORS and CloudFront if using direct browser uploads.

---

## 11) Timeline and Effort

- Day 1–2: AWS setup, backend endpoints, environment config.
- Day 3: Frontend upload and retrieval changes behind a feature flag.
- Day 4: Preview testing, bug fixes.
- Day 5: Production deploy of endpoints (flag OFF), run backfill (dry-run then live).
- Day 6–7: Turn flag ON for uploads, monitor. Keep read fallback for 2–4 weeks.
- Week 3–4: Cleanup legacy base64 and remove fallbacks.

---

## 12) Risks and Mitigations

- Large images exceed serverless limits:
  - Use pre-signed direct uploads (no body-size cap on your server).
- Inconsistent DB ↔ S3 state:
  - Use two-phase upload (upload-url → complete) and idempotent updates.
- Permissions errors:
  - Test IAM policy with least privilege in preview before prod.
- CDN staleness:
  - Use immutable keys or versioned URLs; invalidate CloudFront if necessary.

---

## 13) Rollback

- Keep legacy base64 until after validation window.
- Feature flag to revert upload path.
- Endpoints retain legacy behavior until final cleanup.

---

This plan is intentionally implementation-focused to map directly to code changes. When you’re ready, I can generate the exact code patches for the backend endpoints, S3 helper, frontend upload client changes, and the migration scripts.
