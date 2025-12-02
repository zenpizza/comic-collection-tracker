# Comic Covers Spec Review - Complete

## Date
November 7, 2025

## Status
✅ **COMPLETE** - All specification documents are now internally consistent with unidirectional architecture

## Documents Reviewed and Updated

### 1. design.md
**Status**: ✅ Updated (2 rounds)
**Round 1 Changes** (Unidirectional Architecture):
- Added "Core Principle: Unidirectional Data Flow" section at top
- Removed all references to bidirectional sync, offline writes, conflict resolution
- Removed `coverId` from Comic model (prevents bidirectional relationship)
- Added comprehensive cache invalidation strategy with version tracking
- Added denormalization strategy explaining authoritative vs cached data
- Updated all data flow diagrams to show unidirectional flow
- Updated API endpoints to include version metadata
- Removed sync endpoint
- Renumbered implementation phases (removed "Sync and Offline Support" phase)

**Round 2 Changes** (Requirements Alignment):
- Added ComicDetailView component documentation (Req 7)
- Added CoverSelector component documentation (Req 8)
- Added "Dual Cover Source Strategy" section (Req 2, 3, 8)
- Enhanced CollectionView documentation (Req 1, 5, 7)
- Added ViewModeToggle component documentation (Req 5)
- Enhanced CoverGallery documentation (Req 5)
- Added user interface flow diagrams
- Documented component hierarchy and integration

### 2. requirements.md
**Status**: ✅ Updated
**Changes**:
- Added "Architecture Note" explaining unidirectional data flow
- Updated glossary: removed "Image Synchronization" and "Offline Support"
- Updated glossary: added "Cache Invalidation", "Version Tracking", "Read-Through Cache"
- Rewrote Requirement 6 to specify MongoDB as single source of truth
- Added Requirement 7: Comic detail view with large cover display
- Added Requirement 8: Cover management from detail view (add/replace/delete)
- Rewrote Requirement 9 (formerly 7) from "offline sync" to "local caching with invalidation"
- Added Requirement 10: Immediate reflection of changes in collection view
- Added acceptance criteria for version tracking and cache validation
- Added acceptance criteria clarifying network required for mutations
- Added acceptance criteria for detail view functionality and cover management

### 3. SPEC_CLEANUP.md
**Status**: ✅ Created
**Purpose**: Documents all changes made during spec cleanup

## Architecture Summary

### What We Have (Unidirectional)
```
User Action → MongoDB API → Cache Invalidation → UI Refresh
                    ↓
              Single Source of Truth
```

**Key Principles**:
- MongoDB Atlas is authoritative for all data
- Caches are read-only (IndexedDB + Memory)
- All writes go through MongoDB API first
- Caches invalidated after successful writes
- Version tracking for cache validation
- No sync, no conflicts, no offline writes

### What We Don't Have (Removed)
- ❌ Bidirectional sync
- ❌ Conflict resolution
- ❌ Offline write support
- ❌ Local-first mutations
- ❌ Background sync jobs
- ❌ Sync endpoints
- ❌ coverId in Comic model

### Data Model

**Comic Model** (comics collection):
```typescript
{
  id: string
  // ... other fields
  
  // Denormalized metadata (for performance)
  hasCover: boolean
  coverSource: 'upload' | 'api' | 'manual' | null
  coverLastUpdated: Date | null
  coverAttribution: string | null
  
  // NOT STORED:
  // - coverUrl (resolved dynamically)
  // - coverId (would create bidirectional relationship)
}
```

**CoverImage Model** (cover_images collection):
```typescript
{
  _id: ObjectId
  comicId: string  // ONLY reference (unidirectional)
  images: {
    thumbnail: { data, mimeType, size, dimensions, version }
    medium: { data, mimeType, size, dimensions, version }
    full: { data, mimeType, size, dimensions, version }
  }
  source: 'upload' | 'api' | 'manual'
  createdAt: Date
  updatedAt: Date
}
```

**Relationship**: CoverImage → Comic (unidirectional via comicId)

### Cache Invalidation Strategy

**Version Tracking**:
- Each image size has a `version` field (content hash)
- API responses include version metadata
- Cache entries store version for validation

**Validation Methods**:
1. Lightweight metadata check: `GET /api/images/{comicId}/metadata`
2. Conditional GET with ETag: `If-None-Match` header
3. Explicit invalidation after mutations

**Invalidation Triggers**:
- After upload/update/delete (explicit)
- Version mismatch detected (implicit)
- Cache TTL expired (implicit)
- User-triggered refresh (manual)

## Implementation Checklist

### Architecture Compliance
- [ ] MongoDB is single source of truth
- [ ] All writes go through MongoDB API first
- [ ] Caches are read-only (no writes back to MongoDB)
- [ ] Cache invalidation after successful MongoDB operations
- [ ] No sync endpoints or conflict resolution code

### Comic Detail View (Req 7)
- [x] ComicDetailView component created
- [x] Large cover image display
- [x] All comic metadata displayed
- [x] Edit mode for comic details
- [x] Autocomplete for series and publisher
- [x] Close button and click-outside-to-close
- [x] Responsive design for mobile/desktop

### Cover Management from Detail View (Req 8)
- [x] "Add Cover" button when no cover exists
- [x] "Replace Cover" and "Delete Cover" buttons when cover exists
- [x] Cover uploader integration
- [ ] API cover search integration
- [ ] Preview and selection for multiple API results
- [ ] Cache invalidation after cover upload
- [ ] Cache invalidation after cover delete
- [x] Confirmation prompt for delete
- [ ] Immediate UI refresh after cover changes
- [x] Cover attribution display with source tracking

### Collection View Updates (Req 10)
- [x] Save updates to MongoDB first
- [x] Refresh collection data after save
- [ ] Update detail view with refreshed data
- [ ] Collection view shows updated info after detail view closes
- [ ] Maintain scroll position in collection view
- [ ] New cover shows in both views after update
- [ ] Placeholder shows in both views after delete
- [x] Loading indicators during save

### Data Model Compliance
- [ ] Comic model has NO coverId field
- [ ] Comic model has denormalized metadata only
- [ ] CoverImage model has comicId (unidirectional reference)
- [ ] coverUrl is NOT persisted to database
- [ ] coverUrl is resolved dynamically by UI

### Cache Invalidation Compliance
- [ ] Version tracking in all image responses
- [ ] Metadata endpoint for lightweight validation
- [ ] ETag support for conditional GET
- [ ] Cache cleared after upload/update/delete
- [ ] Version checked on cache hit

### API Compliance
- [ ] POST /api/images/upload returns version metadata
- [ ] GET /api/images/{comicId}/{size} includes ETag and version headers
- [ ] GET /api/images/{comicId}/metadata returns version info
- [ ] DELETE /api/images/{comicId} invalidates cache
- [ ] No sync endpoint exists

## Known Issues to Fix

Based on user testing:
1. **Cover delete not working** - Likely cache not being invalidated properly
2. **Cover replace showing old image** - Cache not being invalidated after update

These are likely caused by missing cache invalidation implementation. The spec now clearly defines how this should work.

## Next Actions

1. **Review Implementation Code**:
   - Check if coverId exists in Comic model (should not)
   - Check if cache invalidation happens after mutations
   - Check if version tracking is implemented
   - Check if coverUrl is being persisted (should not)

2. **Implement Missing Features**:
   - Add version tracking to image storage
   - Add cache invalidation after mutations
   - Add metadata endpoint for validation
   - Add ETag support for conditional GET

3. **Fix Known Issues**:
   - Implement proper cache invalidation for delete
   - Implement proper cache invalidation for update
   - Test that UI refreshes after mutations

4. **Testing**:
   - Test upload → cache invalidation → UI refresh
   - Test update → cache invalidation → UI refresh
   - Test delete → cache invalidation → UI refresh
   - Test version mismatch detection
   - Test cache validation flow

## Conclusion

The specification is now internally consistent and follows a clear unidirectional architecture. All contradictions have been resolved. The next step is to review the implementation code to ensure it conforms to this spec.
