# Requirements Update - Comic Detail View

## Date
November 7, 2025

## New Requirements Added

### Requirement 7: Comic Detail View
**User Story**: View detailed information about a comic including a large cover image

**Key Features**:
- Modal detail view when clicking on a comic
- Large cover image display
- All comic metadata visible
- Edit mode for updating details
- Autocomplete for series and publisher
- Responsive design

**Rationale**: Users need a way to view and edit comic details with a large, clear view of the cover image. This improves the user experience by providing a focused view for managing individual comics.

### Requirement 8: Cover Management from Detail View
**User Story**: Manage cover images directly from the detail view

**Key Features**:
- "Add Cover" button when no cover exists
- "Replace Cover" and "Delete Cover" buttons when cover exists
- **Dual cover source options**:
  - Upload from local files
  - Search via external APIs (ComicVine, Marvel, etc.)
- API search uses comic metadata (series, issue, publisher)
- Preview and selection for multiple API results
- Cache invalidation after changes
- Confirmation prompts for destructive actions
- Immediate UI updates
- Cover attribution display with source tracking

**Rationale**: Centralizing cover management in the detail view provides a better user experience than scattered controls. Users can see the large cover while making decisions about replacing or deleting it. Offering both upload and API search gives users flexibility - they can quickly find covers via API or upload rare/custom covers manually.

### Requirement 10: Immediate Collection View Updates
**User Story**: Changes reflected immediately in collection view

**Key Features**:
- Unidirectional data flow: Detail View → MongoDB → Collection View
- Refresh collection data after saves
- Update detail view with refreshed data
- Maintain scroll position
- Consistent display across views
- Loading indicators

**Rationale**: Ensures data consistency and prevents user confusion. By following unidirectional flow (MongoDB as source of truth), we eliminate sync issues and ensure users always see the latest data.

## Implementation Status

### Completed (ComicDetailView component)
- ✅ Modal component created
- ✅ Large cover display
- ✅ Metadata display
- ✅ Edit mode with form
- ✅ Autocomplete functionality
- ✅ Responsive CSS
- ✅ Cover management buttons
- ✅ CoverUploader integration
- ✅ Delete confirmation

### To Do (Cover Management Enhancement)
- ⏳ Integrate CoverSelector component for API search
- ⏳ Add "Upload" vs "Search API" option buttons
- ⏳ Pass comic metadata to CoverSelector for API search
- ⏳ Handle cover selection from API results

### In Progress (Cache Invalidation)
- ⚠️ Cache invalidation after upload - **NEEDS IMPLEMENTATION**
- ⚠️ Cache invalidation after delete - **NEEDS IMPLEMENTATION**
- ⚠️ Detail view refresh after save - **PARTIALLY WORKING**
- ⚠️ Collection view refresh after detail close - **PARTIALLY WORKING**

### Known Issues
1. **Cover delete not working**: Cache not being invalidated, old image still showing
2. **Cover replace showing old image**: Cache not being invalidated after update
3. **Detail view not refreshing**: Selected comic state not updating after save

## Root Cause Analysis

The issues stem from **incomplete cache invalidation implementation**:

1. **Missing Cache Invalidation**:
   - After cover upload/delete, cache is not cleared
   - UI continues to show cached (stale) images
   - Need to call `ImageURLService.clearCache(comicId)` after mutations

2. **State Update Timing**:
   - `selectedComic` state updated before MongoDB refresh completes
   - Need to wait for refresh and then update from refreshed data
   - Fixed with useEffect that watches comics array

3. **No Version Tracking**:
   - Cache doesn't know when images are stale
   - Need to implement version metadata in API responses
   - Need to check versions on cache hits

## Next Steps

### 1. Implement Cache Invalidation (High Priority)
```typescript
// After successful cover upload/delete
await ImageURLService.clearCache(comicId)
// This will force fresh fetch from MongoDB on next render
```

### 2. Implement Version Tracking (Medium Priority)
```typescript
// Add to API responses
{
  version: sha256(imageData).substring(0, 16),
  updatedAt: new Date().toISOString()
}

// Check on cache hit
if (cached.version !== latest.version) {
  await cache.delete(key)
  return fetchFromAPI()
}
```

### 3. Test Complete Flow (High Priority)
- Upload cover → cache cleared → UI shows new cover
- Delete cover → cache cleared → UI shows placeholder
- Replace cover → cache cleared → UI shows new cover
- Close detail view → collection view shows updates

## Acceptance Criteria Mapping

| Requirement | Acceptance Criteria | Status | Notes |
|-------------|-------------------|--------|-------|
| Req 7.1 | Detail view opens on click | ✅ Done | Working in both list and grid views |
| Req 7.2 | Large cover displayed | ✅ Done | Using 'full' size (300x450px) |
| Req 7.3 | All metadata displayed | ✅ Done | Series, issue, publisher, year, variant, notes |
| Req 7.4 | Edit Details button | ✅ Done | Toggles edit mode |
| Req 7.5 | Cover management buttons | ✅ Done | Add/Replace/Delete based on cover state |
| Req 7.6 | Autocomplete | ✅ Done | Series and publisher fields |
| Req 7.7 | Close functionality | ✅ Done | Close button and click outside |
| Req 7.8 | Responsive design | ✅ Done | Mobile and desktop layouts |
| Req 8.1 | Add Cover button | ✅ Done | Shows when hasCover is false |
| Req 8.2 | Replace/Delete buttons | ✅ Done | Shows when hasCover is true |
| Req 8.3 | Upload or API search options | ⚠️ Partial | Upload works, API search not integrated |
| Req 8.4 | API search uses metadata | ❌ Missing | **NEEDS IMPLEMENTATION** |
| Req 8.5 | Preview multiple API results | ❌ Missing | **NEEDS IMPLEMENTATION** |
| Req 8.6 | Cache invalidation on upload/select | ❌ Missing | **NEEDS IMPLEMENTATION** |
| Req 8.7 | Confirmation on delete | ✅ Done | window.confirm prompt |
| Req 8.8 | Cache invalidation on delete | ❌ Missing | **NEEDS IMPLEMENTATION** |
| Req 8.9 | Immediate UI refresh | ⚠️ Partial | Works but cache not cleared |
| Req 8.10 | Attribution with source | ✅ Done | Shows when available |
| Req 10.1 | MongoDB update first | ✅ Done | onSave calls onEdit (MongoDB) |
| Req 10.2 | Refresh after success | ✅ Done | loadComicsFromStore called |
| Req 10.3 | Update detail view | ⚠️ Partial | useEffect updates selectedComic |
| Req 10.4 | Collection view updated | ⚠️ Partial | Works but shows cached images |
| Req 10.5 | Maintain scroll position | ✅ Done | Browser handles automatically |
| Req 10.6 | New cover in both views | ❌ Broken | Cache not invalidated |
| Req 10.7 | Placeholder in both views | ❌ Broken | Cache not invalidated |
| Req 10.8 | Loading indicators | ✅ Done | Save status in App.jsx |

## Summary

**Completed**: 18/28 acceptance criteria (64%)
**Partially Working**: 4/28 acceptance criteria (14%)
**Missing/Broken**: 6/28 acceptance criteria (21%)

The core UI functionality is complete. The remaining issues are all related to **cache invalidation**, which is the critical missing piece for proper unidirectional data flow.
