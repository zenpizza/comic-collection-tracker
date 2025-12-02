# Cover Search Quick Reference

## Adding Cover Search to New Components

### Step 1: Import the Parser

```javascript
import { parseComicIssueForSearch } from '../utils/issueParser'
// OR for non-comic objects:
import { parseIssueForSearch } from '../utils/issueParser'
```

### Step 2: Parse Before Searching

```javascript
// For comic objects:
const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)

// For separate series/issue:
const { series: searchSeries, issue: searchIssue } = parseIssueForSearch(series, issueNumber)
```

### Step 3: Search with Parsed Values

```javascript
const results = await coverAPIService.searchCovers(
  searchSeries,
  searchIssue,
  publisher,  // optional
  year        // optional
)
```

### Step 4: Handle Downloaded Covers

```javascript
// Download returns a Blob
const imageBlob = await coverAPIService.downloadCover(coverUrl, comicId)

// Convert to File for storage
const imageFile = new File(
  [imageBlob], 
  `cover-${comicId}.jpg`,
  { type: imageBlob.type || 'image/jpeg' }
)

// Store the image
await imageStorageManager.processAndStoreImage(comicId, imageFile, metadata)
```

## What Gets Transformed

| Input | Output |
|-------|--------|
| series: "Fantastic Four"<br>issue: "Annual 18" | series: "Fantastic Four Annual"<br>issue: "18" |
| series: "The Uncanny X-Men"<br>issue: "Annual 9" | series: "Uncanny X-Men Annual"<br>issue: "9" |
| series: "Spider-Man"<br>issue: "Special 5" | series: "Spider-Man Special"<br>issue: "5" |
| series: "X-Men"<br>issue: "42" | series: "X-Men"<br>issue: "42" |

## Automatic Fallbacks

If search returns no results, these fallbacks are tried automatically:

1. **Remove adjectives**: "Uncanny X-Men" → "X-Men"
2. **Remove adjectives**: "Amazing Spider-Man" → "Spider-Man"
3. **Remove adjectives**: "Incredible Hulk" → "Hulk"

Supported adjectives: uncanny, amazing, spectacular, sensational, incredible, invincible, mighty, astonishing, extraordinary

## Current Integration Points

✅ **ComicDetailView** - Individual cover replacement
✅ **ComicForm** - Cover search when adding comics
✅ **BulkCoverManager** - Bulk cover operations

## Debugging

```javascript
// Clear cache
coverAPIService.clearCache()

// Check cache stats
coverAPIService.getCacheStats()

// View available providers
coverAPIService.getProviders()
```

## Common Mistakes

❌ **DON'T** search without parsing:
```javascript
// BAD - will fail for annuals
await coverAPIService.searchCovers(comic.series, comic.issueNumber, ...)
```

✅ **DO** parse first:
```javascript
// GOOD - handles all formats
const { series, issue } = parseComicIssueForSearch(comic)
await coverAPIService.searchCovers(series, issue, ...)
```

❌ **DON'T** pass Blob directly to storage:
```javascript
// BAD - will fail
const blob = await coverAPIService.downloadCover(url, id)
await imageStorageManager.processAndStoreImage(id, blob, metadata)
```

✅ **DO** convert Blob to File:
```javascript
// GOOD - includes proper metadata
const blob = await coverAPIService.downloadCover(url, id)
const file = new File([blob], `cover-${id}.jpg`, { type: blob.type || 'image/jpeg' })
await imageStorageManager.processAndStoreImage(id, file, metadata)
```

## See Also

- [Complete Documentation](./COVER_SEARCH_SYSTEM.md)
- [Cover Search Fix Spec](../.kiro/specs/comic-covers/COVER_SEARCH_FIX_2025-11-20.md)
