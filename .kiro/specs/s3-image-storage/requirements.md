# Requirements Document

## Introduction

This feature migrates comic cover image storage from MongoDB (base64-encoded binary data) to Amazon S3, while retaining MongoDB as the source of truth for comic metadata and S3 references. The migration addresses MongoDB's 16MB document size limit, reduces storage costs, improves image delivery performance through CDN integration, and maintains offline capabilities through the existing hybrid storage architecture.

## Glossary

- **S3**: Amazon Simple Storage Service - object storage service for storing and retrieving binary data
- **CloudFront**: Amazon's CDN service for caching and delivering content globally
- **Pre-signed URL**: A time-limited URL that grants temporary access to upload or download S3 objects
- **OAC (Origin Access Control)**: CloudFront security feature that restricts S3 bucket access to CloudFront only
- **Cover Image**: A comic book cover stored in multiple sizes (thumbnail, medium, full)
- **Hybrid Storage**: The existing architecture combining IndexedDB (local) with MongoDB (remote) storage
- **Base64**: Text encoding scheme currently used to store binary image data in MongoDB

## Requirements

### Requirement 1

**User Story:** As a user, I want to store comic cover images from ComicVine in S3, so that the application can handle larger images without hitting MongoDB limits.

#### Acceptance Criteria

1. WHEN a user selects a cover from ComicVine search results THEN the Image_Upload_Service SHALL download the image via the backend proxy
2. WHEN the backend has downloaded the image THEN the Image_Upload_Service SHALL request a pre-signed URL from S3 and upload the image data directly to S3
3. WHEN an image upload to S3 completes THEN the Image_Upload_Service SHALL call the backend to persist S3 references (key, URL, metadata) in MongoDB
4. WHEN storing S3 references THEN the MongoDB_Service SHALL store the S3 key, public URL, content type, file size, ETag, and timestamp for each image size
5. WHEN an upload fails THEN the Image_Upload_Service SHALL provide clear error feedback and allow retry without corrupting existing data

### Requirement 2

**User Story:** As a user, I want to view comic covers that load quickly from a CDN, so that I have a responsive browsing experience.

#### Acceptance Criteria

1. WHEN a comic has S3-stored images THEN the Image_Retrieval_Service SHALL return the CloudFront/S3 public URL for direct browser loading
2. WHEN requesting an image size THEN the Image_Retrieval_Service SHALL return the URL for the requested size (thumbnail, medium, or full)
3. WHEN an S3 image URL is unavailable THEN the Image_Retrieval_Service SHALL fall back to the legacy MongoDB base64 retrieval path during the migration period
4. WHEN serving images THEN the CDN SHALL cache images with appropriate Cache-Control headers for optimal performance

### Requirement 3

**User Story:** As a user, I want to delete comic covers, so that I can remove unwanted images from my collection.

#### Acceptance Criteria

1. WHEN a user deletes a cover image THEN the Image_Deletion_Service SHALL remove all size variants from S3
2. WHEN S3 deletion completes THEN the Image_Deletion_Service SHALL delete the entire cover_images document from MongoDB (hard delete)
3. WHEN deleting images THEN the Image_Deletion_Service SHALL update the comic's hasCover flag to false
4. IF an S3 object does not exist during deletion THEN the Image_Deletion_Service SHALL continue without error (idempotent deletion)

### Requirement 4

**User Story:** As a user, I want my covers to remain available offline, so that I can browse my collection without an internet connection.

#### Acceptance Criteria

1. WHEN an image is successfully loaded from S3 THEN the Hybrid_Storage_Service SHALL cache the image locally in IndexedDB
2. WHEN offline THEN the Hybrid_Storage_Service SHALL serve images from the local IndexedDB cache
3. WHEN coming back online THEN the Hybrid_Storage_Service SHALL sync any locally-stored images that were not uploaded to S3

### Requirement 5

**User Story:** As a system administrator, I want to migrate existing MongoDB-stored images to S3, so that all images use the new storage architecture.

#### Acceptance Criteria

1. WHEN running the migration script THEN the Migration_Service SHALL upload each existing base64 image to S3 for all size variants
2. WHEN an image is migrated THEN the Migration_Service SHALL update the MongoDB document with S3 references while preserving the legacy base64 data
3. WHEN migration completes for a comic THEN the Migration_Service SHALL mark the document with a migratedAt timestamp
4. WHEN running migration THEN the Migration_Service SHALL support resumable execution with checkpoint tracking
5. WHEN running migration THEN the Migration_Service SHALL support dry-run mode to preview changes without writing

### Requirement 6

**User Story:** As a system administrator, I want to clean up legacy base64 data after successful migration, so that MongoDB storage is reduced.

#### Acceptance Criteria

1. WHEN running the cleanup script THEN the Cleanup_Service SHALL only remove base64 data from documents that have valid S3 references
2. WHEN cleaning up THEN the Cleanup_Service SHALL verify S3 objects exist before removing legacy data
3. WHEN cleanup completes THEN the Cleanup_Service SHALL update the document to indicate legacy data has been removed

### Requirement 7

**User Story:** As a developer, I want the S3 integration to be configurable per environment, so that I can use different buckets for development, preview, and production.

#### Acceptance Criteria

1. WHEN the application starts THEN the S3_Client SHALL read configuration from environment variables (AWS_REGION, AWS_S3_BUCKET, AWS_S3_PUBLIC_BASE_URL)
2. WHEN AWS credentials are not configured THEN the S3_Client SHALL fall back to MongoDB-only storage without errors
3. WHEN generating S3 keys THEN the S3_Client SHALL use the pattern `covers/{comicId}/{size}.jpg` for consistent organization

### Requirement 8

**User Story:** As a developer, I want backward-compatible API endpoints, so that existing frontend code continues to work during the migration.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/images/{comicId}/{size}` THEN the API SHALL redirect to the S3 URL if available, otherwise serve from MongoDB
2. WHEN a POST request is made to the upload endpoint THEN the API SHALL support both the new S3 flow and legacy MongoDB flow based on configuration
3. WHEN metadata is requested THEN the API SHALL return S3 URLs in the response when available

### Requirement 9

**User Story:** As a developer, I want to generate and validate pre-signed URLs for secure uploads, so that clients can upload directly to S3 without exposing AWS credentials.

#### Acceptance Criteria

1. WHEN a pre-signed URL is requested THEN the Pre-signed_URL_Service SHALL generate a URL valid for a limited time period
2. WHEN generating pre-signed URLs THEN the Pre-signed_URL_Service SHALL enforce content-type restrictions to image types only
3. WHEN a pre-signed URL expires THEN S3 SHALL reject the upload attempt

### Requirement 10

**User Story:** As a developer, I want to parse S3 URLs and serialize image references, so that the application can correctly store and retrieve S3 metadata.

#### Acceptance Criteria

1. WHEN storing an S3 reference THEN the Serialization_Service SHALL serialize the S3 key, URL, content type, size, ETag, and timestamp to JSON
2. WHEN reading an S3 reference THEN the Serialization_Service SHALL parse the JSON and reconstruct the image metadata object
3. WHEN serializing then deserializing an S3 reference THEN the Serialization_Service SHALL produce an equivalent object (round-trip consistency)
