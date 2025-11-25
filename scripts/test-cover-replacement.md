# Cover Replacement Flow Test

## Overview

This test validates the complete end-to-end flow for replacing a comic book cover image, including:
- API endpoint integration
- Database state changes
- Metadata updates
- Field validation

## What It Tests

### Flow Steps

1. **Comic Creation** - Creates a test comic in the database
2. **Initial Cover Upload** - Uploads the first cover image
3. **Metadata Update** - Updates comic with initial cover metadata
4. **State Verification (Before)** - Verifies database state before replacement
5. **Cover Replacement** - Uploads new cover and updates metadata
6. **State Verification (After)** - Verifies database state after replacement
7. **Field Change Validation** - Confirms expected fields changed correctly
8. **Cleanup** - Removes test data

### Database Changes Verified

#### Comics Collection
- `coverId` - Should change to new timestamp-based ID
- `coverLastUpdated` - Should update to new timestamp
- `coverSourceProvider` - Should change from `null` to `comicvine`
- `coverAttribution` - Should change from `null` to attribution text
- `coverOriginalUrl` - Should update to new URL
- `hasCover` - Should remain `true`
- `id` - Should remain unchanged

#### Cover Images Collection
- New document created with new image data
- `updatedAt` timestamp should change
- `metadata.source` should reflect new source
- `metadata.provider` should update

## Prerequisites

1. **Server Running**
   ```bash
   npm run server
   ```

2. **Environment Variables**
   - `MONGODB_URI` - MongoDB connection string
   - `API_BASE_URL` (optional) - Defaults to `http://localhost:3001`

3. **MongoDB Access**
   - Test requires direct MongoDB connection to verify database state
   - Ensure your MongoDB instance is accessible

## Running the Test

```bash
# Run the test
npm run test:cover-replacement

# Or directly
node scripts/test-cover-replacement.js
```

## Expected Output

```
🚀 Starting Cover Replacement Flow Test...

📡 API Base URL: http://localhost:3001
🗄️  MongoDB URI: ✓ Set
🧪 Test Comic ID: 1762971234567

🔍 Checking if server is running...
✅ Server is responding

✅ Connected to MongoDB

1️⃣ Creating test comic...
✅ Test comic created: Test Series #1
   Comic ID: 1762971234567

2️⃣ Uploading initial cover...
✅ Initial cover uploaded
   Image ID: 1762971234568

3️⃣ Updating comic with cover metadata...
✅ Comic metadata updated
   hasCover: true
   coverId: 1762971234568
   coverSource: upload

4️⃣ Verifying database state (BEFORE replacement)...
   Comics Collection:
   - hasCover: true
   - coverId: 1762971234568
   - coverSource: upload
   - coverSourceProvider: null
   - coverLastUpdated: 2025-11-12T18:00:00.000Z
   - coverAttribution: null
   Cover Images Collection:
   - comicId: 1762971234567
   - metadata.source: upload
   - metadata.provider: null
   - metadata.mimeType: image/png
   - uploadedAt: 2025-11-12T18:00:00.000Z
   - updatedAt: 2025-11-12T18:00:00.000Z
✅ Database state verified for BEFORE replacement

5️⃣ Replacing cover with new image...
✅ Replacement cover uploaded
   New Image ID: 1762971234569
✅ Comic updated with new cover metadata
   Old coverId: 1762971234568
   New coverId: 1762971234569
   coverSourceProvider: comicvine
   coverAttribution: Cover image provided by Comic Vine

4️⃣ Verifying database state (AFTER replacement)...
   Comics Collection:
   - hasCover: true
   - coverId: 1762971234569
   - coverSource: api
   - coverSourceProvider: comicvine
   - coverLastUpdated: 2025-11-12T18:00:01.000Z
   - coverAttribution: Cover image provided by Comic Vine
   Cover Images Collection:
   - comicId: 1762971234567
   - metadata.source: api
   - metadata.provider: comicvine
   - metadata.mimeType: image/png
   - uploadedAt: 2025-11-12T18:00:01.000Z
   - updatedAt: 2025-11-12T18:00:01.000Z
✅ Database state verified for AFTER replacement

6️⃣ Verifying field changes...

   Field Changes:
   ✅ coverId changed: 1762971234568 → 1762971234569
   ✅ coverLastUpdated changed
   ✅ coverSourceProvider changed: null → comicvine
   ✅ coverAttribution changed: null → Cover image provided by Comic Vine
   ✅ Cover image updatedAt changed
   ✅ Comic ID unchanged: 1762971234567
   ✅ hasCover remains true

🎉 Cover Replacement Flow Test PASSED!

✅ Test Results:
   ✅ Comic creation: PASSED
   ✅ Initial cover upload: PASSED
   ✅ Comic metadata update: PASSED
   ✅ Database state verification (before): PASSED
   ✅ Cover replacement: PASSED
   ✅ Database state verification (after): PASSED
   ✅ Field change verification: PASSED

7️⃣ Cleaning up test data...
✅ Cover image deleted
✅ Test comic deleted

✅ Disconnected from MongoDB
```

## Troubleshooting

### Server Not Running
```
❌ Server is not running or not responding
   Please start the server with: npm run server
```
**Solution:** Start the development server in another terminal

### MongoDB Connection Failed
```
❌ MongoDB connection error
```
**Solution:** Check your `MONGODB_URI` in `.env` file

### Test Data Not Cleaned Up
If the test fails mid-execution, you may need to manually clean up:

```javascript
// In MongoDB shell or Compass
db.comics.deleteOne({ id: <TEST_COMIC_ID> })
db['cover-images'].deleteOne({ comicId: <TEST_COMIC_ID> })
```

## Integration with CI/CD

This test can be integrated into your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Cover Replacement Test
  run: |
    npm run server &
    sleep 5
    npm run test:cover-replacement
  env:
    MONGODB_URI: ${{ secrets.MONGODB_URI }}
```

## Related Files

- `src/components/ComicDetailView.jsx` - UI component that triggers the flow
- `api/images/upload.js` - Image upload endpoint
- `api/comics/[id].js` - Comic update endpoint
- `src/utils/dataStore.js` - Data persistence layer
