# Research: moving cover image storage off AWS (COM-62)

**Goal:** stop paying AWS for cover image storage (S3 + CloudFront). Consider free options, including Oracle Cloud, and whether Vercel itself can do it.

**Status:** research, November 2026. Figures come from each provider's own pricing or docs page (linked), unless marked otherwise.

## TL;DR

- **The data is tiny:** about 371 covers × 3 sizes ≈ **85 MB** across production and preview. Every option below holds it within its free allowance, so the decision is about **effort, lock-in and fit**, not price.
- **Recommended: Vercel Blob.**
  - The team is on **Vercel Pro**, where Blob usage comes out of Pro's monthly usage credit. At this size, storage is about **$0.002–0.004/month** at the listed $0.023/GB, plus negligible transfer and operation costs.
  - No new vendor, account or keys to manage, and it can be set up per environment for production and previews.
  - The cost is a moderate code change: `@vercel/blob` is its own API, not S3.
- **Runner-up: Cloudflare R2.** It's **S3-compatible**, so the code barely changes (a new endpoint and keys). It has 10 GB free and **no egress fees**. It needs a Cloudflare account.
- **Oracle Cloud is not recommended** despite its generous storage (20 GB, 10 TB egress). The **50,000 requests/month** cap is the problem: every cover a browser hasn't cached is a storage request, because the app proxies images and the CDN doesn't cache them. Signup is also harder, and Oracle has cut free-tier limits without notice before.
- **First, check the AWS bill.** At 85 MB, S3 storage should cost cents. The bill is more likely driven by CloudFront, requests, or something unrelated. Also, the **Vercel Pro plan** is probably a bigger monthly cost than this storage, which matters if cost is the goal.

## How the app uses image storage today

- Uploads go through `api/images/upload.js` → `api/s3-client.js` (AWS SDK v3). Each cover is stored as three sizes at `<prefix>/covers/<assetId>/{thumbnail,medium,full}.jpg`, where the prefix is `production` or `preview`.
- **Images are proxied:** `api/images/[comicId].js` fetches each image from its **stored full CloudFront URL** (`cover_images.images.<size>.url`) and streams it to the browser. The response carries `Cache-Control: public, max-age=86400`, so browsers cache it for a day. With no `s-maxage`, Vercel's CDN doesn't cache it, so each browser cache miss is a storage request.
- **CloudFront adds little:** browsers never fetch from it directly. Its invalidation code (`invalidateCache`) can go away.
- **Other users of S3:** the cover cleanup tool (`api/lib/coverGarbageCollection.js`) and some one-off scripts.

## Options compared

| | **Vercel Blob** | **Cloudflare R2** | **Backblaze B2** | **Oracle Cloud Object Storage** |
|---|---|---|---|---|
| Free allowance | Hobby: 1 GB, 10k simple + 2k advanced ops, 10 GB transfer per month. **Pro (our plan): usage-based, paid from the monthly credit** ([pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)) | 10 GB-month, 1M Class A + 10M Class B ops per month ([pricing](https://developers.cloudflare.com/r2/pricing/)) | First 10 GB free ([pricing](https://www.backblaze.com/cloud-storage/pricing)) | 20 GB always free, 50,000 API requests per month ([Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)) |
| Egress | Blob Data Transfer (Hobby: 10 GB free; Pro: about $0.05/GB in iad1) | **Free** | Free up to 3× average storage (about 255 MB/month here), then $0.01/GB; unlimited via partners such as Cloudflare | 10 TB/month free |
| Cost at our size | ≈ $0 (cents a month, inside the Pro credit) | $0 | $0, or cents | $0, unless the request cap is hit |
| API | `@vercel/blob` SDK (`put`, `del`, `list`), **not S3** | **S3-compatible** | **S3-compatible** | **S3 Compatibility API**, using Customer Secret Keys and a `<namespace>.compat.objectstorage.<region>.oraclecloud.com` endpoint ([docs](https://docs.oracle.com/iaas/Content/Object/Tasks/s3compatibleapi.htm)) |
| Code change | Moderate: replace S3 calls with Blob calls; the cleanup tool's adapter too | **Small:** `@aws-sdk/client-s3` with a custom `endpoint` | Small (S3-compatible) | Small (S3-compatible) |
| New account or keys | **None.** Vercel provisions a `BLOB_READ_WRITE_TOKEN` per environment | Cloudflare account, plus R2 API token | Backblaze account | Oracle account. Signup asks for a card; home-region limits apply |
| Public access | Public or private stores; public blobs are served from Vercel's CDN | A custom domain on Cloudflare is needed for production public access; `r2.dev` is rate-limited and dev-only ([docs](https://developers.cloudflare.com/r2/buckets/public-buckets/)). Not needed if we keep proxying with the S3 API | Public buckets, or via a CDN partner | Pre-authenticated requests or public buckets |
| Risks | Vercel lock-in. If we drop to Hobby, going over the limits blocks Blob for 30 days (we're far below them) | Another vendor | The egress allowance is small, but overage is cheap | **The 50k requests/month cap**; free-tier limits changed without notice in 2026 ([InfoQ](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)); trial-end rules delete everything above 20 GB |

## Why not Oracle, despite the free storage

The storage and egress allowances are generous. But this app's access pattern doesn't fit a **50,000 requests/month** cap. Covers are proxied through `api/images/[comicId].js` without CDN caching, so a browser that hasn't cached a cover triggers a storage GET. Opening the collection on a new device, or after clearing the cache, can easily mean hundreds of requests. That's manageable for one person, but it's a hard limit to keep watching, unlike the other options. Add the harder signup, keys tied to one home region, and recent unannounced cuts to free-tier limits, and the risk outweighs the benefit.

## Recommendation and migration outline

**Recommended: Vercel Blob** (it's already the hosting platform, and costs nothing extra on Pro). Keep **R2** as the fallback, for example if moving off Vercel Pro later.

Whichever option is chosen, the first refactor is the same and worth doing anyway:

1. **Build image URLs from the stored key** plus a configured base, instead of storing full CloudFront URLs, so future moves are config-only. One-off script, dry run plus backup like COM-48 and COM-54: rewrite or drop `url` in `cover_images.images.*`.
2. **Hide storage behind a small interface,** `put / get / delete / list` by key, used by upload, the image proxy and the cleanup tool. Then implement it for the chosen store:
   - **Blob:** `@vercel/blob`.
   - **R2:** the existing S3 client with an `endpoint` option.
3. **Copy objects:** about 1,100 files for production plus preview. Check counts, and checksums or sizes.
4. **Separate environments:** a Blob store (or R2 bucket) per environment, or keep the `production/` and `preview/` prefixes.
5. **Cut over:** env vars in Vercel, deploy, then confirm covers load and uploads and the cleanup tool work. Then delete the S3 bucket and CloudFront distribution and revoke the IAM keys.
6. **Optional:** with **public** Blob URLs, browsers could load covers straight from Vercel's CDN, skipping the proxy function. That's faster and cheaper, but means rethinking `api/images/[comicId].js`. Cover art isn't sensitive.

## Decisions needed

- **AWS bill:** how much does it actually cost per month, and what's driving it? This sets the real savings.
- **Vendor choice:** Vercel Blob (recommended, stays on Vercel) or Cloudflare R2 (vendor-neutral, S3-compatible).
- **Vercel Pro:** are you staying on it? If cost is the goal and Pro isn't needed for anything else, Hobby still covers Blob at our size. Hobby's terms are for personal, non-commercial use.

## Sources

- Vercel: [Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- Cloudflare: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- Backblaze: [B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- Oracle: [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm), [Object Storage S3 Compatibility API](https://docs.oracle.com/iaas/Content/Object/Tasks/s3compatibleapi.htm), [Customer Secret Keys](https://docs.oracle.com/iaas/Content/Identity/access/working-with-customer-secret-keys.htm), [InfoQ: Oracle Cloud free tier limits (2026)](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
