# Volume Support Bug Fixes

## Date: December 10, 2025

## Summary
Fixed multiple issues with volume metadata storage and cover image display after bulk import.

## Issues Fixed

### 1. Cover Images Not Displaying After Bulk Import
- **Problem**: Covers added during bulk import weren't displaying in UI despite being stored in database
- **Root Cause**: 
  - `BulkCoverManager` wasn't calling the `onCoverUpdate` callback
  - `CoverImage` component was checking `hasCover` flag before attempting API call
- **Fix**: 
  - Added missing `onCoverUpdate` prop to BulkCoverManager
  - Removed premature `hasCover` check from CoverImage - now always attempts API call

### 2. Image Records Not Deleted When Comics Deleted
- **Problem**: Cover images remained in database after comic deletion
- **Fix**: Added `deleteCoverImages()` call to comic deletion API

### 3. Volume Metadata Loss on Cover Replace
- **Problem**: Replacing a cover would overwrite volume metadata with `null`
- **Root Cause**: Code was doing `volumeId: metadata.volumeId || null`
- **Fix**: Only update volume fields if new values are provided

### 4. Cover Fields Saved to Wrong Collection
- **Problem**: Cover-specific fields (`coverSource`, `coverAttribution`, etc.) were being saved to comic records
- **Fix**: Removed these fields from comic record updates - they belong in `cover_images` collection

## Data Model (Correct)

### Comic Record
```json
{
  "series": "Batman",
  "issueNumber": "1",
  "hasCover": true,
  "coverLastUpdated": "2025-12-10T...",
  "volumeId": "796",
  "volumeName": "Batman"
}
```

### Cover Image Record
```json
{
  "comicId": "...",
  "images": { "thumbnail": {}, "medium": {}, "full": {} },
  "metadata": {
    "source": "api",
    "provider": "comicvine",
    "originalUrl": "...",
    "attribution": "...",
    "volumeId": "796",
    "volumeName": "Batman"
  }
}
```

Note: Volume metadata is stored in both places - on comic record for display, and on cover image for provenance. This duplication is acceptable.

## Files Changed
- `api/comics/[id].js` - Added image cleanup on comic deletion
- `api/images/upload.js` - Removed cover fields from comic record updates
- `src/components/BulkCoverManager.jsx` - Added onCoverUpdate callback
- `src/components/CoverImage.jsx` - Removed hasCover dependency
- `src/utils/coverUpdateService.js` - Fixed volume metadata handling
- `src/App.jsx` - Added data refresh after bulk operations
