# Cover Update Service - Centralized Cover Management

## Overview

The `coverUpdateService.js` is a centralized service that handles all cover update operations in the Comic Collection Tracker application. It was created to eliminate DRY violations and ensure consistency across all cover management operations.

## Problem Solved

### Before (DRY Violations)
- **Duplicate upload logic**: `BulkCoverManager` and `ComicDetailView` had different code paths for uploading covers
- **Inconsistent metadata**: Different components constructed metadata objects differently
- **Missing cache invalidation**: `BulkCoverManager` didn't clear cache after updates
- **Incomplete cleanup**: Cover removal didn't clear all metadata fields
- **Wrong coverId**: `BulkCoverManager` used `comic.id` instead of `uploadResult.imageId`

### After (Single Source of Truth)
- All cover operations go through `coverUpdateService`
- Consistent metadata construction
- Automatic cache invalidation
- Complete metadata cleanup on removal
- Correct `coverId` assignment

## API

### `addCover(comicId, imageBlob, metadata)`
Adds a new cover to a comic.

**Parameters:**
- `comicId` (string): Comic identifier
- `imageBlob` (Blob): Image data
- `metadata` (Object): Cover metadata
  - `source` (string): 'api' or 'upload'
  - `provider` (string): Provider name (e.g., 'comicvine')
  - `originalUrl` (string): Original image URL
  - `attribution` (string): Attribution text
  - `quality` (string): Quality level
  - `dimensions` (Object): Image dimensions

**Returns:**
```javascript
{
  success: true,
  metadata: {
    hasCover: true,
    coverId: "...",
    coverSource: "api",
    coverSourceProvider: "comicvine",
    coverOriginalUrl: "...",
    coverAttribution: "...",
    coverLastUpdated: "2025-11-24T..."
  },
  uploadResult: { ... }
}
```

### `removeCover(comicId)`
Removes a cover from a comic.

**Parameters:**
- `comicId` (string): Comic identifier

**Returns:**
```javascript
{
  success: true,
  metadata: {
    hasCover: false,
    coverId: null,
    coverSource: null,
    coverSourceProvider: null,
    coverOriginalUrl: null,
    coverAttribution: null,
    coverLastUpdated: "2025-11-24T..."
  }
}
```

### `replaceCover(comicId, imageBlob, metadata)`
Replaces an existing cover with a new one.

**Parameters:** Same as `addCover()`

**Returns:** Same as `addCover()`

### `batchAddCovers(operations, options)`
Batch add covers for multiple comics.

**Parameters:**
- `operations` (Array): Array of `{comicId, imageBlob, metadata}` objects
- `options` (Object):
  - `onProgress` (Function): Progress callback
  - `onResult` (Function): Individual result callback

**Returns:**
```javascript
{
  success: [...],  // Successful operations
  failed: [...],   // Failed operations
  total: 10        // Total operations
}
```

## Usage Examples

### Individual Cover Update (ComicDetailView)
```javascript
import coverUpdateService from '../utils/coverUpdateService'

const result = await coverUpdateService.addCover(
  comic.id,
  imageBlob,
  {
    source: 'api',
    provider: 'comicvine',
    originalUrl: 'https://...',
    attribution: 'Cover image provided by Comic Vine',
    quality: 'medium'
  }
)

const updatedComic = {
  ...comic,
  ...result.metadata
}

await onSave(updatedComic)
```

### Bulk Cover Operations (BulkCoverManager)
```javascript
import coverUpdateService from '../utils/coverUpdateService'

const result = await coverUpdateService.addCover(
  comic.id,
  imageBlob,
  metadata
)

if (result.success) {
  onCoverUpdate(comic.id, result.metadata)
}
```

### Cover Removal
```javascript
import coverUpdateService from '../utils/coverUpdateService'

const result = await coverUpdateService.removeCover(comic.id)

const updatedComic = {
  ...comic,
  ...result.metadata
}

await onSave(updatedComic)
```

## Standardized Metadata Fields

The service ensures these fields are always set consistently:

- `hasCover` (boolean): Whether comic has a cover
- `coverId` (string|null): Image ID from upload result
- `coverSource` (string|null): 'api' or 'upload'
- `coverSourceProvider` (string|null): Provider name (e.g., 'comicvine')
- `coverOriginalUrl` (string|null): Original image URL
- `coverAttribution` (string|null): Attribution text
- `coverLastUpdated` (string): ISO timestamp of last update

## Benefits

1. **Single Source of Truth**: All cover operations use the same code path
2. **Consistency**: Metadata is constructed identically everywhere
3. **Maintainability**: Changes to cover logic only need to be made in one place
4. **Cache Management**: Automatic cache invalidation after all operations
5. **Error Handling**: Centralized error handling and logging
6. **Testing**: Easier to test cover operations in isolation

## Components Using This Service

- `ComicDetailView.jsx`: Individual cover add/replace/remove
- `BulkCoverManager.jsx`: Bulk cover operations
- Any future component that needs to update covers

## Related Files

- `src/utils/coverUpdateService.js`: The service implementation
- `src/utils/imageUploadClient.js`: Used by the service for uploads
- `src/utils/ImageURLService.js`: Used by the service for cache invalidation
- `.kiro/specs/prompt-initializer.md`: Project documentation

## Migration Notes

When adding new cover operations:
1. Always use `coverUpdateService` instead of direct API calls
2. Use the returned `metadata` object to update the comic
3. Don't construct metadata manually
4. Don't call `ImageURLService.clearCache()` directly (service handles it)

## Future Enhancements

Potential improvements:
- Add validation for metadata fields
- Support for cover quality assessment integration
- Batch operations with progress tracking
- Rollback support for failed operations
- Event emitter for cover update notifications
