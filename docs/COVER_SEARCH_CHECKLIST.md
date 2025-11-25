# Cover Search Integration Checklist

Use this checklist when adding or modifying cover search functionality.

## Before Adding Cover Search

- [ ] Read `docs/COVER_SEARCH_SYSTEM.md` for system overview
- [ ] Review `docs/COVER_SEARCH_QUICK_REFERENCE.md` for code examples
- [ ] Check existing integration points for patterns

## Implementation Checklist

### 1. Import Required Utilities

- [ ] Import `parseComicIssueForSearch` or `parseIssueForSearch` from `../utils/issueParser`
- [ ] Import `coverAPIService` from `../utils/coverAPIService`
- [ ] Import `imageStorageManager` if storing covers

### 2. Parse Issue Before Searching

- [ ] Call parser before `coverAPIService.searchCovers()`
- [ ] Use parsed `series` and `issue` values (not original)
- [ ] Add comment: "IMPORTANT: Always use issueParser before searching"

### 3. Handle Search Results

- [ ] Check for empty results
- [ ] Display results to user
- [ ] Handle selection/download

### 4. Store Downloaded Covers

- [ ] Convert Blob to File with proper metadata
- [ ] Include filename: `cover-${comicId}.jpg`
- [ ] Include MIME type: `blob.type || 'image/jpeg'`
- [ ] Pass metadata (source, provider, originalUrl, etc.)

### 5. Error Handling

- [ ] Catch and display user-friendly errors
- [ ] Don't retry on "No covers found" errors
- [ ] Log errors for debugging

## Code Review Checklist

### Required Patterns

- [ ] ✅ Uses `parseComicIssueForSearch()` or `parseIssueForSearch()`
- [ ] ✅ Passes parsed values to `coverAPIService.searchCovers()`
- [ ] ✅ Converts Blob to File before storage
- [ ] ✅ Includes proper error handling

### Anti-Patterns to Avoid

- [ ] ❌ Searches without parsing issue number
- [ ] ❌ Passes Blob directly to `processAndStoreImage()`
- [ ] ❌ Retries on "No covers found" errors
- [ ] ❌ Missing error handling

## Testing Checklist

### Test Cases

- [ ] Regular issue (e.g., "Spider-Man" #42)
- [ ] Annual (e.g., "X-Men" "Annual 9")
- [ ] Special (e.g., "Batman" "Special 1")
- [ ] Series with "The" (e.g., "The Amazing Spider-Man" #1)
- [ ] Series with adjective (e.g., "The Uncanny X-Men Annual" "Annual 9")
- [ ] No results found (verify no retry loop)
- [ ] Network error (verify proper retry)

### Integration Tests

- [ ] Works in ComicDetailView (individual replacement)
- [ ] Works in ComicForm (new comic creation)
- [ ] Works in BulkCoverManager (bulk operations)
- [ ] Cache works correctly
- [ ] Fallback searches trigger when needed

## Documentation Checklist

- [ ] Add inline comments explaining parser usage
- [ ] Reference `docs/COVER_SEARCH_SYSTEM.md` in comments
- [ ] Update this checklist if adding new patterns
- [ ] Document any new edge cases discovered

## Deployment Checklist

- [ ] Frontend changes deployed (Vercel auto-deploys on push)
- [ ] Backend changes deployed (if any API changes)
- [ ] Test in production environment
- [ ] Monitor logs for errors
- [ ] Clear cache if needed: `coverAPIService.clearCache()`

## Current Integration Points

| Component | Status | Notes |
|-----------|--------|-------|
| ComicDetailView | ✅ Integrated | Individual cover replacement |
| ComicForm | ✅ Integrated | Cover search during creation |
| BulkCoverManager | ✅ Integrated | Bulk operations |

## Common Issues and Solutions

### Issue: "Can't find variable: coverAPIService"
**Solution**: Hard refresh browser (Cmd+Shift+R) or redeploy

### Issue: Covers not found for annuals
**Solution**: Verify parser is being called before search

### Issue: Retry loop on failed searches
**Solution**: Check that errors are marked with `noRetry` flag

### Issue: Storage fails after download
**Solution**: Verify Blob is converted to File before storage

## Resources

- [Complete Documentation](./COVER_SEARCH_SYSTEM.md)
- [Quick Reference](./COVER_SEARCH_QUICK_REFERENCE.md)
- [Recent Fixes](./COVER_SEARCH_FIXES_2024-11-24.md)
- [Cover Search Spec](../.kiro/specs/comic-covers/COVER_SEARCH_FIX_2025-11-20.md)

## Questions?

If you encounter issues not covered here:
1. Check the logs for error messages
2. Review `docs/COVER_SEARCH_SYSTEM.md` for detailed explanations
3. Test with `coverAPIService.clearCache()` to rule out cache issues
4. Check Comic Vine directly to verify data exists
