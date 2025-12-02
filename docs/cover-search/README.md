# Cover Search System Documentation

This directory contains comprehensive documentation for the comic book cover search and management system.

## Quick Start

1. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Start here for code examples and common patterns
2. **[SYSTEM.md](./SYSTEM.md)** - Complete system documentation and architecture
3. **[CHECKLIST.md](./CHECKLIST.md)** - Integration checklist for implementing cover search
4. **[FIXES_2024-11-24.md](./FIXES_2024-11-24.md)** - Recent fixes and improvements

## Key Concepts

### Always Parse Issue Numbers
```javascript
import { parseComicIssueForSearch } from '../utils/issueParser'
const { series, issue } = parseComicIssueForSearch(comic)
```

### Search for Covers
```javascript
import coverAPIService from '../utils/coverAPIService'
const results = await coverAPIService.searchCovers(series, issue, publisher, year)
```

### Download and Store
```javascript
const blob = await coverAPIService.downloadCover(coverUrl, comicId)
const file = new File([blob], `cover-${comicId}.jpg`, { type: blob.type || 'image/jpeg' })
await imageStorageManager.processAndStoreImage(comicId, file, metadata)
```

## Integration Points

- ✅ ComicDetailView - Individual cover replacement
- ✅ ComicForm - Cover search when adding comics
- ✅ BulkCoverManager - Bulk cover operations

## Common Issues

| Issue | Solution |
|-------|----------|
| Covers not found for annuals | Verify parser is being used |
| Retry loop on failures | Check error has `noRetry` flag |
| Storage fails after download | Convert Blob to File first |
| Cache issues | Run `coverAPIService.clearCache()` |

## Related Documentation

- [Comic Covers Feature Complete](../features/COMIC_COVERS_COMPLETE.md) - Overall feature documentation
- [Cover Search Fix](../fixes/COVER_SEARCH_FIX.md) - Bug fix documentation
- [Cover Upload Fix](../fixes/COVER_UPLOAD_FIX.md) - Upload system improvements
