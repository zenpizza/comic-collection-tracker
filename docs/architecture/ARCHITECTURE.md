# Architecture Decision Records (ADR)

This document tracks major architectural decisions made for the Comic Collection Tracker.

## ADR-001: Unidirectional Data Flow

**Date**: 2025-01-24  
**Status**: Implemented  
**Context**: Auto-save loops were causing duplicate data issues  
**Decision**: Implement unidirectional data flow with MongoDB as single source of truth  
**Consequences**: 
- ✅ Eliminates sync conflicts
- ✅ Predictable data state
- ✅ Easier debugging
- ❌ Slightly more API calls

## ADR-002: MongoDB Atlas for All Data

**Date**: 2025-01-24  
**Status**: Implemented  
**Context**: Need reliable, cross-device data storage  
**Decision**: Use MongoDB Atlas for both comic data and image storage  
**Consequences**:
- ✅ Single database solution
- ✅ Cross-device synchronization
- ✅ Reliable cloud storage
- ✅ No GridFS complexity (images < 5MB)

## ADR-003: RESTful API Design

**Date**: 2025-01-24  
**Status**: Implemented  
**Context**: Upgraded to Vercel Pro, no endpoint limits  
**Decision**: Implement proper RESTful endpoints  
**Consequences**:
- ✅ Industry standard patterns
- ✅ Better maintainability
- ✅ Clear HTTP semantics
- ✅ Individual resource operations

## ADR-004: Data Type Standardization

**Date**: 2025-01-24  
**Status**: Implemented  
**Context**: Mixed data types causing query issues  
**Decision**: Standardize on numbers for IDs/years, strings for text fields  
**Consequences**:
- ✅ Optimal database performance
- ✅ Consistent queries
- ✅ Better indexing
- ✅ Automatic normalization

## ADR-005: Hybrid Image Storage

**Date**: 2025-01-24  
**Status**: Implemented  
**Context**: Need fast local access + reliable backup  
**Decision**: Local IndexedDB cache + MongoDB Atlas storage  
**Consequences**:
- ✅ Fast local image access
- ✅ Cross-device availability
- ✅ Offline capability
- ✅ Server-side persistence

## ADR-006: Fix Blob URL Storage Anti-Pattern

**Date**: 2025-01-24  
**Status**: Approved  
**Context**: Comics storing blob URLs in coverUrl field causing WebKit errors on page reload  
**Decision**: Store image identifiers instead of blob URLs, resolve URLs dynamically in UI  
**Consequences**:
- ✅ Eliminates WebKit errors on page reload
- ✅ More reliable image display
- ✅ Better separation of concerns
- ❌ Requires refactoring existing components

## ADR-007: Simplify Image Storage Architecture

**Date**: 2025-01-24  
**Status**: Approved  
**Context**: Multiple overlapping storage layers causing complexity and sync issues  
**Decision**: Simplify to two-layer architecture: Memory/IndexedDB cache + MongoDB API  
**Consequences**:
- ✅ Reduced complexity and maintenance burden
- ✅ Easier debugging and troubleshooting
- ✅ More predictable performance
- ❌ Need to refactor hybrid storage components

## ADR-008: Centralized Image URL Resolution

**Date**: 2025-01-24  
**Status**: Approved  
**Context**: Inconsistent image URL resolution across components  
**Decision**: Create single ImageURLService for all image URL resolution  
**Consequences**:
- ✅ Consistent behavior across components
- ✅ Centralized caching logic
- ✅ Easier performance optimization
- ❌ Requires updating multiple components

## ADR-009: Clerk Authentication + Per-Account Data Isolation

**Date**: 2026-06-24
**Status**: Implemented
**Context**: The app was unauthenticated — any request could read or mutate the shared database.
**Decision**: Add Clerk as the auth provider. Every API route requires a valid Clerk Bearer token (`requireAuth`). Each `comics` document is stamped with a `userId` (Clerk's `sub` claim); all queries filter by it, so accounts are fully isolated without any data visible across account boundaries.
**Consequences**:
- ✅ Full per-account data isolation
- ✅ No code changes needed for future multi-account features
- ✅ Standard JWT-based auth, no session cookies
- ❌ All clients must pass a Bearer token; the existing `apiFetch` utility handles this automatically

## ADR-010: Single `comics` Collection + `coverAssets` Identity Layer

**Date**: 2026-06-25
**Status**: Implemented
**Context**: Initial Clerk rollout used a two-table design (`comicMetadata` + `userComics`) to share canonical comic data and cover images across accounts without duplication. In practice this caused a correctness bug: editing a canonical field (e.g. publisher) relinked a `userComics` row to a new `comicMetadata` row, silently orphaning the cover that was attached to the old one.
**Decision**: Replace the two-table design with a single `comics` collection (one row per account-owned issue, `userId` for isolation) plus a thin `coverAssets` collection (one row per unique cover, keyed by `identityKey`). Cover reuse across accounts is handled at write time — `addComic` looks up any existing `coverAsset` for the same identity before calling ComicVine. Replacing a cover uses copy-on-write semantics: only the editing account's row is repointed; other accounts are unaffected.
**Consequences**:
- ✅ Editing any field is always a simple local update — no relinking, no orphaned assets
- ✅ Flat queries, no `$lookup` joins needed for listing a collection
- ✅ Cross-account cover sharing still works (dedup at add-time, not via a live shared reference)
- ✅ Orphaned assets (from cover replacements/removals) are left in place and collected later (COM-45)
- ❌ Canonical text fields (series, publisher, year) are denormalised per-account row; fixing a typo only corrects one account's view

See `docs/architecture/MULTI_ACCOUNT_SCHEMA_DESIGN.md` for the full design discussion.

## Template for Future ADRs

```markdown
## ADR-XXX: [Decision Title]

**Date**: YYYY-MM-DD  
**Status**: [Proposed/Implemented/Deprecated]  
**Context**: [What situation led to this decision?]  
**Decision**: [What was decided?]  
**Consequences**: [What are the positive and negative outcomes?]
```