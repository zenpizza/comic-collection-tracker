# MongoDB ID Field Migration

## Problem
Currently using numeric timestamps (`Date.now()`) for `_id` fields, which MongoDB stores as `$numberDouble`. This is not MongoDB's recommended approach.

## MongoDB's Recommendation
Use ObjectId (automatically generated) for `_id` fields because:
- Guaranteed uniqueness in distributed systems
- Time-ordered
- Small size (12 bytes)
- Fast to generate
- No coordination needed between servers

## Current Implementation Issues
1. **Frontend** (`src/App.jsx`): Generates `id: Date.now()` 
2. **Backend** (`api/comics/[id].js`): Uses numeric `_id` fields
3. **Risk**: Timestamp collisions if multiple comics created simultaneously
4. **Performance**: Custom IDs require managing two indexes

## Migration Strategy

### Phase 1: Update Backend to Use ObjectId
- Let MongoDB auto-generate `_id` as ObjectId
- Keep application `id` field for backward compatibility during transition
- Update all API endpoints to accept both ObjectId and numeric IDs

### Phase 2: Update Frontend
- Remove `Date.now()` ID generation
- Let backend generate IDs
- Use MongoDB's `_id` (ObjectId) as the primary identifier

### Phase 3: Data Migration
- Create migration script to convert existing numeric `_id` to ObjectId
- Preserve old IDs in a separate field if needed for reference

## Files to Update

### Backend
- `api/comics.js` - Create comic endpoint
- `api/comics/[id].js` - Get/Update/Delete by ID
- `api/comics/bulk.js` - Bulk operations
- `api/comics/dedupe.js` - Deduplication
- `api/comics/normalize.js` - Normalization
- `api/comics/cleanup-ids.js` - ID cleanup

### Frontend
- `src/App.jsx` - Remove Date.now() ID generation
- `src/services/DataStore.js` - Update ID handling

### Migration Scripts
- Create `scripts/migrate-to-objectid.js` - Convert existing data
