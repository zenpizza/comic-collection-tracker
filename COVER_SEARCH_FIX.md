# Cover Search API Fix - November 20, 2025

## Problem

When searching for "Web of Spider-Man" issue #11, the cover search API was returning incorrect results like "Casper" comics instead of the actual Spider-Man comic. The expected result (https://comicvine.gamespot.com/web-of-spider-man-11-have-you-seenthat-vigilante-m/4000-26521/) was not appearing.

## Root Cause Analysis

The original implementation had a flawed search strategy:

1. **Inefficient Query**: Fetched ALL comics with issue #11 from ComicVine (13,816 results total)
2. **Poor Sorting**: Results were sorted by cover_date, but many comics lack dates, pushing them to the front
3. **Buried Results**: "Web of Spider-Man" #11 (1986) wasn't in the first 100 results returned
4. **Overly Permissive Filtering**: Client-side word matching required only ONE word to match, causing false positives
   - "Web of Spider-Man" → words: ["web", "spider", "man"]
   - Any comic with "man" in the title would match, including "Casper Der Kleine Geist"

## Solution

Implemented a **two-step search approach** that leverages ComicVine's API more effectively:

### Step 1: Volume Search
```javascript
// Search for volumes (series) matching the series name
GET /api/search/?resources=volume&query={series}
```
- Returns the most relevant series first
- Gets volume IDs for matching series
- Example: "Web of Spider-Man" returns volumes from 1985, 2009, 2024, etc.

### Step 2: Issue Query
```javascript
// Query for specific issue within those volumes
GET /api/issues/?filter=volume:{ids},issue_number:{issue}
```
- Only searches within the matched volumes
- Much smaller result set (2-10 results vs 13,816)
- Sorted by cover_date descending (newest first)

### Improved Filtering

Also enhanced the normalization logic:
- Replaces punctuation with spaces (keeps "Spider-Man" as two words)
- Removes leading articles (the, a, an)
- Requires ALL significant words to match (not just one)

## Results

### Before
```
Query: Web of Spider-Man #11
Results: "Casper Der Kleine Geist" #11 (incorrect)
```

### After
```
Query: Web of Spider-Man #11
Results:
1. Web of Spider-Man #11 (2010)
2. Web of Spider-Man #11 (1986) ✓ Correct!
```

## Testing

Verified the fix works for multiple series:

| Series | Issue | Results | Status |
|--------|-------|---------|--------|
| Web of Spider-Man | 11 | 2 versions (2010, 1986) | ✓ Pass |
| Amazing Spider-Man | 300 | 1 result (1988) | ✓ Pass |
| X-Men | 1 | 9 versions (2021-1963) | ✓ Pass |

## Files Modified

### Implementation
- `api/cover-search.js` - Rewrote search logic with two-step approach
- `scripts/test-comicvine-search.js` - Created test script for debugging

### Documentation
- `.kiro/specs/comic-covers/design.md` - Added Cover Search API documentation
- `.kiro/specs/comic-covers/tasks.md` - Added task 6.4 for search accuracy fix
- `.kiro/specs/comic-covers/DESIGN_REQUIREMENTS_ALIGNMENT.md` - Added update notes
- `.kiro/specs/comic-covers/COVER_SEARCH_FIX_2025-11-20.md` - Detailed spec documentation

## Deployment

Deployed to production on Vercel:
- Deployment URL: https://comic-collection-tracker.vercel.app
- API Endpoint: `/api/cover-search?series={series}&issue={issue}`

## Technical Details

### API Calls
The new approach makes 2 API calls instead of 1, but:
- Results are much more accurate
- Total data transferred is less (10-20 results vs 100)
- Response time is similar (~2-3 seconds)

### Rate Limiting
ComicVine API has rate limits, but the two-step approach is still within acceptable limits:
- Volume search: 1 call per search
- Issues query: 1 call per search
- Total: 2 calls per cover search request

### Future Improvements
Potential optimizations:
- Cache volume IDs for popular series
- Add year filtering to narrow results further
- Implement fuzzy matching for series names with typos
