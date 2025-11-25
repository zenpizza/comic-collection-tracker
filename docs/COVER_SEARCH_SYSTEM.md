# Cover Search System Documentation

## Overview

The cover search system handles finding and downloading comic book cover images from external APIs (primarily Comic Vine). It includes intelligent parsing, fallback strategies, and caching to handle the complexities of comic book naming conventions.

## Architecture

### Core Components

1. **coverAPIService** (`src/utils/coverAPIService.js`)
   - Main service for searching and downloading covers
   - Manages multiple provider integrations (Comic Vine, etc.)
   - Implements caching and rate limiting
   - Handles fallback search strategies

2. **issueParser** (`src/utils/issueParser.js`)
   - Parses issue numbers to handle special formats (Annuals, Specials, etc.)
   - Generates fallback search variations
   - Normalizes series names for better matching

3. **imageStorageManager** (`src/utils/imageStorageManager.js`)
   - Handles storing downloaded covers
   - Manages hybrid storage (local + MongoDB)
   - Processes images into multiple sizes

## Cover Search Flow

### 1. Issue Parsing

When a cover search is initiated, the issue number is parsed to handle special formats:

```javascript
import { parseIssueForSearch } from '../utils/issueParser'

// Input: series="The Uncanny X-Men", issue="Annual 9"
const { series, issue } = parseIssueForSearch("The Uncanny X-Men", "Annual 9")
// Output: series="Uncanny X-Men Annual", issue="9"
```

**Transformations:**
- `"Annual 18"` → Series gets " Annual" appended, issue becomes "18"
- `"Special 5"` → Series gets " Special" appended, issue becomes "5"
- `"Giant-Size 3"` → Series gets " Giant-Size" appended, issue becomes "3"
- Removes "The" prefix for annuals/specials (Comic Vine often omits it)

### 2. Primary Search

The parsed series and issue are sent to Comic Vine API via backend proxy:

```
GET /api/cover-search?series=Uncanny+X-Men+Annual&issue=9&publisher=Marvel&year=1985
```

The backend performs a two-step search:
1. Find matching volumes (series)
2. Find specific issue within those volumes

### 3. Fallback Search Strategy

If the primary search returns no results, the system automatically tries fallback variations:

**Fallback Logic:**
1. Detects common adjectives: "uncanny", "amazing", "spectacular", "incredible", etc.
2. Removes each adjective and tries again
3. Returns first successful match

**Example:**
```
Primary: "Uncanny X-Men Annual" #9 → 0 results
Fallback: "X-Men Annual" #9 → 1 result ✓
```

### 4. Result Caching

Results are cached for 1 hour to reduce API calls:
- Cache key: `${series}-${issue}-${publisher}-${year}`.toLowerCase()
- Cached data includes both successful results and empty results
- Cache can be cleared: `coverAPIService.clearCache()`

### 5. Cover Download

When a cover is selected:
1. Download via backend proxy (avoids CORS issues)
2. Convert Blob to File object with proper metadata
3. Process into multiple sizes (thumbnail, medium, full)
4. Store in MongoDB via imageStorageManager

## Integration Points

### Where Cover Searches Are Invoked

All three integration points use the issue parser:

#### 1. ComicDetailView (Individual Cover Replacement)

```javascript
// src/components/ComicDetailView.jsx
const { parseComicIssueForSearch } = await import('../utils/issueParser')
const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)

const results = await coverAPIService.searchCovers(
  searchSeries,
  searchIssue,
  comic.publisher,
  comic.year
)
```

#### 2. ComicForm (Adding New Comics)

```javascript
// src/components/ComicForm.jsx
const { parseIssueForSearch } = await import('../utils/issueParser')
const { series: searchSeries, issue: searchIssue } = parseIssueForSearch(
  formData.series, 
  formData.issueNumber
)

const results = await coverAPIService.searchCovers(
  searchSeries,
  searchIssue,
  formData.publisher
)
```

#### 3. BulkCoverManager (Bulk Operations)

```javascript
// src/components/BulkCoverManager.jsx
import { parseComicIssueForSearch } from '../utils/issueParser'

const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)

const searchResults = await coverAPIService.searchCovers(
  searchSeries,
  searchIssue,
  comic.publisher
)
```

## Common Issues and Solutions

### Issue: Cover Not Found

**Symptoms:**
- Search returns 0 results
- Comic exists in Comic Vine

**Common Causes:**
1. **Series name mismatch** - Comic Vine uses different naming
   - Solution: Fallback search automatically tries variations
   
2. **Annual/Special not parsed** - Issue stored as "Annual 18" instead of separate fields
   - Solution: Issue parser handles this automatically
   
3. **"The" prefix** - Comic Vine often omits "The" from series names
   - Solution: Parser strips "The" for annuals/specials

### Issue: Retry Loop

**Symptoms:**
- Multiple retry warnings in console
- Same search attempted 3 times

**Cause:**
- Error marked as retryable when it shouldn't be

**Solution:**
- Errors with `error.noRetry = true` skip retry logic
- "No covers found" and "No suitable covers after filtering" are marked non-retryable

### Issue: Blob/File Conversion Error

**Symptoms:**
- Cover download succeeds but storage fails
- Error accessing `file.name` property

**Cause:**
- `downloadCover()` returns Blob, but `processAndStoreImage()` expects File

**Solution:**
```javascript
const imageBlob = await coverAPIService.downloadCover(url, comicId)

// Convert Blob to File with proper metadata
const imageFile = new File(
  [imageBlob], 
  `cover-${comicId}.jpg`,
  { type: imageBlob.type || 'image/jpeg' }
)

await imageStorageManager.processAndStoreImage(comicId, imageFile, metadata)
```

## API Reference

### issueParser.js

#### `parseIssueForSearch(series, issueNumber)`
Parses issue number and returns normalized search parameters.

**Parameters:**
- `series` (string) - Comic series name
- `issueNumber` (string|number) - Issue number (may include "Annual", "Special", etc.)

**Returns:**
```javascript
{
  series: string,        // Normalized series name
  issue: string,         // Numeric issue number
  alternativeSeries?: string  // Original series name (for fallback)
}
```

#### `parseComicIssueForSearch(comic)`
Convenience wrapper for parsing from comic object.

**Parameters:**
- `comic` (object) - Comic object with `series` and `issueNumber` properties

#### `generateSearchFallbacks(series, issue)`
Generates fallback search variations.

**Parameters:**
- `series` (string) - Series name
- `issue` (string) - Issue number

**Returns:**
```javascript
[
  {
    series: string,
    issue: string,
    reason: string  // Description of transformation
  }
]
```

### coverAPIService.js

#### `searchCovers(series, issue, publisher, year)`
Search for cover images with automatic fallback.

**Parameters:**
- `series` (string) - Series name (should be pre-parsed)
- `issue` (string) - Issue number (should be pre-parsed)
- `publisher` (string, optional) - Publisher name
- `year` (number, optional) - Publication year

**Returns:** `Promise<CoverResult[]>`

#### `downloadCover(coverUrl, comicId)`
Download cover image via backend proxy.

**Returns:** `Promise<Blob>`

#### `clearCache()`
Clear the search result cache.

**Returns:** `{ cleared: number }` - Number of entries removed

## Testing

### Manual Testing Checklist

- [ ] Regular issue: "Spider-Man" #42
- [ ] Annual: "X-Men" "Annual 9"
- [ ] Special: "Batman" "Special 1"
- [ ] Series with "The": "The Amazing Spider-Man" #1
- [ ] Series with adjective: "The Uncanny X-Men Annual" "Annual 9"
- [ ] Bulk operations with mixed formats
- [ ] Cover replacement on existing comic
- [ ] Cover search during comic creation

### Debug Tools

**Clear cache:**
```javascript
coverAPIService.clearCache()
```

**Check cache stats:**
```javascript
coverAPIService.getCacheStats()
```

**View providers:**
```javascript
coverAPIService.getProviders()
```

## Future Enhancements

1. **Additional Fallbacks**
   - Try searching without year if initial search fails
   - Try alternate publisher names (e.g., "DC" vs "DC Comics")

2. **Smart Caching**
   - Persist cache to localStorage
   - Share cache across sessions

3. **Provider Expansion**
   - Add League of Comic Geeks integration
   - Add Grand Comics Database integration

4. **User Feedback**
   - Show which fallback succeeded
   - Allow manual override of search parameters

## Related Documentation

- [Cover Search Fix Spec](.kiro/specs/comic-covers/COVER_SEARCH_FIX_2025-11-20.md)
- [Prompt Initializer](.kiro/specs/prompt-initializer.md)
- Backend API: `api/cover-search.js`
