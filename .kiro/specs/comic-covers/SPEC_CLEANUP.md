# Comic Covers Spec Cleanup - Option A (Unidirectional)

## Date
November 7, 2025

## Changes Made

### Removed Contradictions

#### 1. Storage Strategy
**Before**: Contradictory "Hybrid Storage" with "Local-First" and "Background Sync"
**After**: Clear "Unidirectional Read-Through Cache" with MongoDB as single source of truth

#### 2. Data Flow
**Before**: Mixed messages about bidirectional sync and offline writes
**After**: Explicit unidirectional flow: `User → MongoDB API → Cache Invalidation → UI`

#### 3. Comic Model
**Before**: Said "REMOVED: coverId, coverUrl" but then listed them as optional, creating bidirectional relationship
**After**: 
- NO `coverId` field (would create bidirectional relationship)
- Denormalized metadata only (`hasCover`, `coverSource`, etc.) for performance
- `cover_images` collection is authoritative
- Unidirectional relationship: CoverImage → Comic (via comicId)

#### 4. Sync Endpoint
**Before**: Had `/api/images/sync` endpoint with conflict resolution
**After**: Removed entirely - no sync needed in unidirectional architecture

#### 5. Implementation Phases
**Before**: Phase 4 was "Sync and Offline Support"
**After**: Removed - renumbered remaining phases

### Key Clarifications Added

1. **Core Principle Section**: Added explicit explanation of unidirectional data flow at the top
2. **What This Eliminates**: Clear list of what we DON'T support (offline writes, sync, conflicts)
3. **What This Provides**: Clear benefits of the simpler approach
4. **Data Flow Details**: Separated Read Flow, Write Flow, and Delete Flow with explicit cache invalidation steps
5. **Architecture Diagram**: Updated to show unidirectional write flow with cache invalidation
6. **Cache Invalidation Strategy**: Version tracking, validation flow, and invalidation triggers
7. **Denormalization Strategy**: Clear rules for authoritative vs denormalized data

### Removed Features

- Bidirectional sync
- Conflict resolution mechanisms
- Offline write support
- Background sync processes
- Local-first mutations
- Sync status tracking in database schema

### Retained Features

- Read-through caching (IndexedDB + Memory)
- LRU cache with automatic eviction
- Blob URL lifecycle management
- Content-type security validation
- Image processing and optimization
- External API integration for cover fetching

## Current Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│                   User Action                        │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              MongoDB API (Write)                     │
│  POST /api/images/upload                            │
│  DELETE /api/images/{comicId}                       │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           Cache Invalidation                         │
│  Clear IndexedDB + Memory for comicId               │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              UI Refresh                              │
│  Triggers read flow (cache miss)                    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│         Read Flow (Cached)                           │
│  Memory → IndexedDB → MongoDB API                   │
└─────────────────────────────────────────────────────┘
```

## Implementation Checklist

### Must Have (Spec Compliant)
- [ ] All writes go through MongoDB API first
- [ ] Cache invalidation after successful MongoDB operations
- [ ] No writes from IndexedDB back to MongoDB
- [ ] coverUrl NOT persisted to database
- [ ] Dynamic URL resolution via ImageURLService
- [ ] Proper error handling when network unavailable
- [ ] Version tracking in all image responses
- [ ] Cache validation using version/ETag
- [ ] Metadata endpoint for lightweight cache checks
- [ ] Denormalized fields in Comic for performance
- [ ] cover_images collection as authoritative source

### Must Not Have (Spec Violations)
- [ ] No offline write queue
- [ ] No sync endpoint
- [ ] No conflict resolution
- [ ] No local-first mutations
- [ ] No background sync jobs
- [ ] No blob URLs stored in database
- [ ] No `coverId` field in Comic model (creates bidirectional relationship)

## Files Updated

### Specification Documents
- ✅ `.kiro/specs/comic-covers/design.md` - Updated to unidirectional architecture
- ✅ `.kiro/specs/comic-covers/requirements.md` - Updated to match design decisions
- ✅ `.kiro/specs/comic-covers/SPEC_CLEANUP.md` - This document

### Key Changes in Requirements
- Removed "Image Synchronization" and "Offline Support" from glossary
- Added "Cache Invalidation", "Version Tracking", "Read-Through Cache" to glossary
- Updated Requirement 6 to specify unidirectional flow and MongoDB as single source of truth
- Rewrote Requirement 7 from "offline sync" to "local caching with version tracking"
- Added Architecture Note explaining unidirectional data flow

## Next Steps

1. Review current implementation against this spec
2. Identify any code that violates unidirectional flow
3. Remove or refactor bidirectional sync code
4. Ensure cache invalidation happens after all MongoDB writes
5. Verify coverUrl is not being persisted to database
6. Verify coverId is not in Comic model (would create bidirectional relationship)
7. Implement version tracking in API responses
8. Implement cache validation using versions
9. Test that cover delete properly invalidates caches
10. Test that cover update properly invalidates caches
