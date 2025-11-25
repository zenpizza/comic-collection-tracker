# MongoDB ID Migration Guide

## Overview
This project has been updated to use MongoDB's recommended ObjectId for `_id` fields instead of numeric timestamps.

## What Changed

### Backend Changes
All API endpoints now:
- Auto-generate ObjectId for new comics (MongoDB default)
- Accept both ObjectId and numeric IDs for backward compatibility
- Return `id` as string representation of ObjectId for frontend

**Updated Files:**
- `api/comics.js` - Main comics endpoint
- `api/comics/[id].js` - Individual comic operations
- `api/comics/bulk.js` - Bulk operations

### Frontend Changes
- `src/App.jsx` - Removed `Date.now()` ID generation
- Backend now generates all IDs automatically

## Migration Steps

### 1. Run the Migration Script
```bash
node scripts/migrate-to-objectid.js
```

This script will:
- Find all comics with numeric `_id` fields
- Create new documents with ObjectId `_id`
- Preserve old numeric IDs in `legacyId` field
- Delete old documents

### 2. Deploy Backend Changes
Deploy the updated API endpoints to Vercel.

### 3. Test the Migration
- Verify existing comics load correctly
- Test creating new comics
- Test updating existing comics
- Test deleting comics

## Backward Compatibility

The API endpoints support both:
- **ObjectId** (24-character hex string): `"6915006e034e164538394b42"`
- **Numeric ID** (legacy): `1761157092617`

This allows gradual migration without breaking existing functionality.

## Benefits of ObjectId

1. **Uniqueness**: Guaranteed unique across distributed systems
2. **Performance**: Optimized for MongoDB indexing
3. **Time-ordered**: Contains creation timestamp
4. **Standard**: MongoDB's recommended approach
5. **No collisions**: Unlike timestamps, no risk of simultaneous creation conflicts

## Technical Details

### ObjectId Structure (12 bytes)
- 4 bytes: Timestamp (seconds since epoch)
- 5 bytes: Random value
- 3 bytes: Incrementing counter

### API Response Format
```json
{
  "_id": { "$oid": "6915006e034e164538394b42" },
  "id": "6915006e034e164538394b42",
  "series": "Amazing Spider-Man",
  "issueNumber": "1"
}
```

The `id` field is a string representation of `_id` for frontend convenience.
