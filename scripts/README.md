# Test Scripts

This directory contains test and utility scripts for the Comic Collection Tracker application.

## Available Scripts

### Playwright Auth (one-time setup)
- `save-playwright-auth.cjs` - Capture a signed-in Clerk session for headless Playwright verification scripts

```bash
# Requires dev server running: npm run dev
npm run auth:save
# A browser window opens — sign in, then press Enter in the terminal.
# Saves .playwright-auth.json (gitignored). Re-run when the session expires.
# Override the default port: APP_URL=http://localhost:3001 npm run auth:save
```

### S3 Image Storage
- `migrate-images-to-s3.js` - Migrate images from MongoDB base64 to S3
- `cleanup-legacy-images.js` - Remove base64 data after S3 migration
- `verify-s3-setup.js` - Verify S3/CloudFront configuration

### MongoDB Tests
- `test-mongodb.js` - Test MongoDB connection and operations
- `test-mongodb-simple.js` - Simple MongoDB connectivity test
- `test-storage-operations.js` - Test storage operations

### API Tests
- `test-api-endpoints.js` - Test API endpoints
- `test-api-simple.js` - Simple API connectivity test
- `test-production-deployment.js` - Test production deployment

### Cover Image Tests
- `test-blob-cleanup.js` - Test blob URL cleanup functionality
- `test-app-blob-cleanup.js` - Integration test for blob cleanup
- `test-cover-replacement.js` - Test cover replacement functionality
- `test-cover-replacement-comicvine.js` - Test ComicVine cover replacement

## Running Scripts

### S3 Migration (one-time)
```bash
# Verify S3 setup
node scripts/verify-s3-setup.js

# Migrate images (dry run first)
node scripts/migrate-images-to-s3.js --dry-run
node scripts/migrate-images-to-s3.js

# Cleanup legacy data (dry run first)
node scripts/cleanup-legacy-images.js --dry-run
node scripts/cleanup-legacy-images.js
```

### Tests
```bash
# MongoDB tests
npm run test:mongodb
npm run test:mongodb-simple

# Storage tests
npm run test:storage

# API tests
npm run test:api
npm run test:api-simple

# Cover image tests
npm run test:blob-cleanup
npm run test:blob-integration
npm run test:cover-replacement
npm run test:cover-replacement-comicvine
```

## Environment Variables

Required for tests:
- `MONGODB_URI` - MongoDB Atlas connection string
- `COMICVINE_API_KEY` - ComicVine API key (for cover search tests)

Required for S3 scripts:
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_S3_BUCKET` - S3 bucket name
- `AWS_S3_PUBLIC_BASE_URL` - CloudFront distribution URL
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_S3_KEY_PREFIX` - Environment prefix (production/preview/development)

## Notes

- No local MongoDB required - tests use production Atlas instance
- Test scripts are saved in `scripts/` directory (not `dist/scripts`)
- No testing framework installed - scripts use direct API calls