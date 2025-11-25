# Test Scripts

This directory contains test scripts for the Comic Collection Tracker application.

## Available Test Scripts

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

## Running Tests

Run tests using npm scripts:
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

## Notes

- No local MongoDB required - tests use production Atlas instance
- Test scripts are saved in `scripts/` directory (not `dist/scripts`)
- No testing framework installed - scripts use direct API calls