# Comic Collection Tracker Documentation

## Cover Search System

The cover search system handles finding and downloading comic book cover images from external APIs.

### Documentation Files

1. **[COVER_SEARCH_SYSTEM.md](./COVER_SEARCH_SYSTEM.md)** - Complete system documentation
   - Architecture overview
   - Cover search flow
   - Integration points
   - API reference
   - Troubleshooting guide

2. **[COVER_SEARCH_QUICK_REFERENCE.md](./COVER_SEARCH_QUICK_REFERENCE.md)** - Quick reference guide
   - Code examples
   - Common patterns
   - Debugging commands
   - Common mistakes to avoid

3. **[COVER_SEARCH_CHECKLIST.md](./COVER_SEARCH_CHECKLIST.md)** - Integration checklist
   - Implementation checklist
   - Code review checklist
   - Testing checklist
   - Deployment checklist

4. **[COVER_SEARCH_FIXES_2024-11-24.md](./COVER_SEARCH_FIXES_2024-11-24.md)** - Recent fixes
   - Issues fixed
   - Files changed
   - Examples
   - Testing results

## Quick Start

### Adding Cover Search to a Component

```javascript
import { parseComicIssueForSearch } from '../utils/issueParser'
import coverAPIService from '../utils/coverAPIService'

// Parse issue number
const { series, issue } = parseComicIssueForSearch(comic)

// Search for covers
const results = await coverAPIService.searchCovers(series, issue, publisher, year)

// Download and store
const blob = await coverAPIService.downloadCover(coverUrl, comicId)
const file = new File([blob], `cover-${comicId}.jpg`, { type: blob.type || 'image/jpeg' })
await imageStorageManager.processAndStoreImage(comicId, file, metadata)
```

### Key Concepts

1. **Always parse issue numbers** before searching (handles Annuals, Specials, etc.)
2. **Fallback searches** automatically try variations if no results found
3. **Convert Blob to File** before storing downloaded covers
4. **Don't retry** on "No covers found" errors

## Current Integration Points

- ✅ **ComicDetailView** - Individual cover replacement
- ✅ **ComicForm** - Cover search when adding comics
- ✅ **BulkCoverManager** - Bulk cover operations

## Common Issues

| Issue | Solution |
|-------|----------|
| Covers not found for annuals | Verify parser is being used |
| Retry loop on failures | Check error has `noRetry` flag |
| Storage fails after download | Convert Blob to File first |
| Cache issues | Run `coverAPIService.clearCache()` |

## Related Documentation

- [Prompt Initializer](../.kiro/specs/prompt-initializer.md) - Project overview
- [Cover Search Fix Spec](../.kiro/specs/comic-covers/COVER_SEARCH_FIX_2025-11-20.md) - Original spec

## Need Help?

1. Start with [COVER_SEARCH_QUICK_REFERENCE.md](./COVER_SEARCH_QUICK_REFERENCE.md)
2. Check [COVER_SEARCH_SYSTEM.md](./COVER_SEARCH_SYSTEM.md) for details
3. Use [COVER_SEARCH_CHECKLIST.md](./COVER_SEARCH_CHECKLIST.md) when implementing
4. Review [COVER_SEARCH_FIXES_2024-11-24.md](./COVER_SEARCH_FIXES_2024-11-24.md) for recent changes
