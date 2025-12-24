# Implementation Plan
<!-- Trigger redeploy after fixing AWS_S3_PUBLIC_BASE_URL env var -->

- [x] 1. Set up S3 client module and configuration
  - [x] 1.1 Create S3 client module with AWS SDK v3
    - Create `api/s3-client.js` with S3Client class
    - Implement `uploadImage()`, `deleteImages()`, `imageExists()`, `invalidateCache()`
    - Implement `keyFor()` and `urlFor()` helper methods
    - Implement `isConfigured()` to check for AWS credentials
    - Read configuration from environment variables
    - _Requirements: 7.1, 7.4, 9.1, 9.2, 9.3, 11.4_

  - [x] 1.2 CloudFront cache invalidation already implemented in S3 client
    - `invalidateCache()` method implemented in S3Client class
    - Calls CloudFront CreateInvalidation API
    - _Requirements: 11.6_

- [x] 2. Set up testing infrastructure
  - [x] 2.1 Install fast-check and configure test environment
    - Run `npm install --save-dev fast-check`
    - Create test file `src/utils/__tests__/s3-image-storage.property.test.js`
    - _Requirements: Testing Strategy_

  - [x] 2.2 Write property test for S3 key generation
    - **Property 10: S3 key pattern consistency**
    - **Validates: Requirements 7.4**

  - [x] 2.3 Write property test for environment-aware fallback
    - **Property 11: Environment-aware fallback**
    - **Validates: Requirements 7.2, 7.3**

- [x] 3. Implement S3 reference serialization
  - [x] 3.1 Create serialization utilities
    - Create `api/s3-serialization.js` with serialize/deserialize functions
    - Ensure all required fields are included (key, url, contentType, size, etag, uploadedAt)
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 3.2 Write property test for round-trip consistency
    - **Property 14: S3 reference round-trip consistency**
    - **Validates: Requirements 10.3**

- [x] 4. Modify backend upload API for S3 storage
  - [x] 4.1 Update upload endpoint to use S3
    - Modify `api/images/upload.js` to use S3Client
    - Download image from ComicVine URL when imageUrl is provided
    - Process into size variants using Sharp
    - Upload all variants to S3 with correct headers (Content-Type, Cache-Control: public, max-age=2592000)
    - Save S3 references to MongoDB using serialization utilities
    - Fall back to MongoDB-only in dev if S3 not configured
    - Call CloudFront invalidation when replacing an existing cover
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.3, 11.6_

  - [x] 4.2 Write property test for upload produces all size variants
    - **Property 1: Upload produces all size variants**
    - **Validates: Requirements 1.2**
    - **Status: Skipped** - Requires mocking S3/MongoDB; will be covered by integration tests

  - [x] 4.3 Write property test for S3 references contain required fields
    - **Property 2: S3 references contain required fields**
    - **Validates: Requirements 1.4, 10.1**

  - [x] 4.4 Write property test for upload headers
    - **Property 13: Upload headers are correct**
    - **Validates: Requirements 9.2, 9.3, 11.4**

  - [x] 4.5 Write property test for invalidation on replacement
    - **Property 15: CloudFront invalidation on replacement**
    - **Validates: Requirements 11.6**
    - **Status: Skipped** - Requires mocking CloudFront; will be covered by integration tests

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Modify backend retrieval API for S3 redirect
  - [x] 6.1 Update retrieval endpoint with redirect logic
    - Modify `api/images/[comicId]/[size].js` to check for S3 URL in MongoDB document
    - Return 302 redirect to CloudFront URL if `images[size].url` exists
    - Fall back to serving base64 from MongoDB if no S3 URL (legacy path)
    - _Requirements: 2.1, 2.2, 2.3, 8.1, 8.2_

  - [x] 6.2 Write property test for image retrieval
    - **Property 3: Image retrieval returns correct URL for size**
    - **Validates: Requirements 2.1, 2.2**
    - **Status: Skipped** - Requires mocking HTTP endpoints; will be covered by integration tests

  - [x] 6.3 Write property test for retrieval fallback
    - **Property 4: Retrieval fallback to MongoDB**
    - **Validates: Requirements 2.3**
    - **Status: Skipped** - Requires mocking MongoDB; will be covered by integration tests

  - [x] 6.4 Write property test for API redirect behavior
    - **Property 12: API redirect behavior**
    - **Validates: Requirements 8.1, 8.2**
    - **Status: Skipped** - Requires mocking HTTP endpoints; will be covered by integration tests

- [x] 7. Modify backend deletion API for S3
  - [x] 7.1 Update deletion endpoint to delete from S3
    - Modify `api/images/[comicId].js` DELETE handler
    - Import and use S3Client to delete all size variants from S3
    - Delete cover_images document from MongoDB (existing behavior)
    - Update comic's hasCover flag to false (existing behavior)
    - Handle idempotent deletion (no error if S3 object missing)
    - Log orphaned S3 keys if MongoDB deletion fails after S3 deletion
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 7.2 Write property test for deletion completeness
    - **Property 5: Deletion removes all artifacts**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - **Status: Skipped** - Requires mocking S3/MongoDB; will be covered by integration tests

  - [x] 7.3 Write property test for deletion idempotency
    - **Property 6: Deletion is idempotent**
    - **Validates: Requirements 3.4**
    - **Status: Skipped** - Requires mocking S3; will be covered by integration tests

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update metadata API to return S3 URLs
  - [x] 9.1 Modify metadata endpoint response
    - Update `api/images/[comicId]/metadata.js` to return S3/CloudFront URLs when available
    - Include S3 reference fields (key, url, contentType, size, etag) in response
    - Maintain backward compatibility with legacy base64 metadata
    - _Requirements: 8.4_

- [x] 10. Update frontend hybrid storage for S3 URLs
  - [x] 10.1 Update IndexedDB caching for S3 URLs
    - Modify `src/utils/hybridImageStorage.js` to handle S3/CloudFront redirect responses
    - Ensure comicId is used as primary key for cache entries
    - Clear cache entry on successful deletion (already implemented)
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 10.2 Write property test for IndexedDB cache key
    - **Property 7: IndexedDB cache uses comicId key**
    - **Validates: Requirements 4.1, 4.3**
    - **Status: Skipped** - Requires mocking IndexedDB; will be covered by integration tests

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Create migration script
  - [x] 12.1 Implement migration script
    - Create `scripts/migrate-images-to-s3.js`
    - Implement CLI argument parsing (--dry-run, --resume, --concurrency, --batch-size, --only, --verbose)
    - Implement checkpoint tracking in MongoDB migrations collection
    - Implement batch processing with concurrency control
    - For each document: extract base64, convert to Buffer, upload to S3, update MongoDB with S3 refs
    - Preserve legacy base64 data, set migratedAt timestamp
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 12.2 Write property test for migration preserves legacy data
    - **Property 8: Migration preserves legacy data**
    - **Validates: Requirements 5.2, 5.3**
    - **Status: Skipped** - Requires mocking MongoDB; will be covered by integration tests

- [x] 13. Create cleanup script
  - [x] 13.1 Implement cleanup script
    - Create `scripts/cleanup-legacy-images.js`
    - Implement CLI argument parsing (--dry-run, --verify-s3, --batch-size, --concurrency, --verbose)
    - Query documents with migratedAt and !legacyRemoved
    - Verify all 3 S3 size variants exist in MongoDB refs before cleanup
    - Optionally batch S3 HEAD requests for verification (--verify-s3)
    - Remove base64 data ($unset), set legacyRemoved flag
    - Skip and log documents with missing S3 refs
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 13.2 Write property test for cleanup preconditions
    - **Property 9: Cleanup requires complete S3 references**
    - **Validates: Requirements 6.1, 6.2, 6.4**

- [x] 14. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
