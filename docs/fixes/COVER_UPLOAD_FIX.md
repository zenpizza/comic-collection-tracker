# Cover Upload Fix - 413 Payload Too Large

## Problem
Cover image uploads were failing with HTTP 413 (Payload Too Large) error when uploading to Vercel. The issue occurred because:

1. Images were being converted to base64 in the frontend
2. Base64 encoding increases file size by ~33%
3. The entire base64 string was sent as JSON in the request body
4. A 7MB image became ~9.7MB after base64 encoding, exceeding Vercel's payload limits

## Solution
Changed from JSON-based upload to multipart/form-data upload with centralized client and client-side compression:

### Architecture Changes

#### New: Centralized Upload Client (`src/utils/imageUploadClient.js`)
- **Single source of truth** for all image upload operations
- Handles File, Blob, and base64 string inputs
- **Client-side compression** to stay under Vercel's 5MB limit
- Automatic quality adjustment and resizing
- Built-in retry logic and error handling
- Batch upload support for bulk operations
- Progress tracking capabilities

#### Frontend Changes
- `imageStorage.js`: Now uses `imageUploadClient` for remote uploads
- `hybridImageStorage.js`: Now uses `imageUploadClient` for sync operations
- Eliminated code duplication across storage services

#### Backend Changes (`api/images/upload.js`)
- Added `busboy` package for parsing multipart form data
- Disabled default body parser for this endpoint
- Processes uploaded images using `sharp` to create size variants
- Compresses images before storing in MongoDB

### Benefits
1. **Smaller payloads**: No base64 overhead (33% size reduction)
2. **Client-side compression**: Images compressed before upload to stay under 4.5MB
3. **Automatic quality adjustment**: Reduces quality/dimensions until size is acceptable
4. **Better performance**: Direct binary upload is faster
5. **Server-side processing**: Image resizing happens on the server using sharp
6. **Stays within limits**: Even large images now upload successfully
7. **DRY principle**: Single upload implementation used everywhere
8. **Easier maintenance**: Changes to upload logic only need to happen in one place
9. **Better error handling**: Consistent error messages and retry logic

## Technical Details

### Before
```javascript
// Frontend: Convert to base64 (duplicated in multiple files)
const base64Data = await this.blobToBase64(file)
// Send as JSON (9.7MB for a 7MB image)
body: JSON.stringify({ imageData: base64Data, ... })
```

### After
```javascript
// Frontend: Use centralized client
import imageUploadClient from './imageUploadClient.js'
// Client handles conversion and FormData creation
await imageUploadClient.uploadImage(comicId, file, metadata)
```

### Upload Client Features
- **Flexible input**: Accepts File, Blob, or base64 string
- **Automatic normalization**: Converts all inputs to optimal format
- **Smart compression**: Automatically compresses images over 4.5MB
  - Resizes dimensions proportionally
  - Adjusts JPEG quality (0.85 down to 0.3)
  - Iterative approach to find optimal size
  - Logs compression progress for debugging
- **Retry logic**: `uploadWithRetry()` with exponential backoff
- **Batch uploads**: `batchUpload()` with concurrency control
- **Progress tracking**: Optional progress callbacks
- **Cancellation**: Supports AbortSignal for cancelling uploads

### Backend Processing
- Uses `busboy` to parse multipart form data
- Uses `sharp` to create optimized size variants:
  - Thumbnail: 150x225px
  - Medium: 300x450px
  - Full: 300x450px
  - Original: Compressed but full resolution
- All variants stored as JPEG with quality optimization

## Code Organization

### Files Modified
- `src/utils/imageStorage.js` - Uses imageUploadClient
- `src/utils/hybridImageStorage.js` - Uses imageUploadClient
- `src/components/ComicDetailView.jsx` - Uses imageUploadClient (was doing direct base64 upload)
- `api/images/upload.js` - Handles multipart uploads

### Files Created
- `src/utils/imageUploadClient.js` - Centralized upload client

## Testing
Test the fix by:
1. Uploading a large cover image (5-10MB) via manual upload
2. Selecting a cover from Comic Vine search results
3. Using bulk cover manager to upload multiple covers
4. Verify all uploads succeed without 413 errors
5. Check that all size variants are created properly
6. Verify covers display correctly in the UI
