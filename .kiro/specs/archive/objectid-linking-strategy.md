# ObjectId Linking Strategy

## Current Problem

**Comics Collection:**
- `_id`: ObjectId (e.g., `691f6d2317b51b3fe52a6d05`)
- `id`: undefined (only 1 comic has this field)

**Cover_Images Collection:**
- `comicId`: numeric or string (old format)
- Cannot find comics because linking is broken

## Correct Design

### Single Source of Truth: `_id`
MongoDB's `_id` field (ObjectId) should be the ONLY identifier.

### Linking Strategy

**Comics Collection:**
```json
{
  "_id": ObjectId("691f6d2317b51b3fe52a6d05"),
  "series": "Amazing Spider-Man",
  "issueNumber": "274"
}
```

**Cover_Images Collection:**
```json
{
  "_id": ObjectId("..."),
  "comicId": "691f6d2317b51b3fe52a6d05",  // String representation of comic's _id
  "images": { ... }
}
```

### API Response Format

Frontend receives:
```json
{
  "_id": "691f6d2317b51b3fe52a6d05",  // String for JSON serialization
  "id": "691f6d2317b51b3fe52a6d05",   // Convenience field (same as _id)
  "series": "Amazing Spider-Man"
}
```

## Implementation Changes

### 1. Remove `id` Field Generation
- ✅ Already done in `src/App.jsx`
- Backend auto-generates ObjectId

### 2. API Returns `id` as String
- ✅ Already done in `api/comics.js`
- Converts `_id` to string for frontend

### 3. Cover Image Storage
- Store `comicId` as `_id.toString()`
- Update `storeCoverImages()` to accept ObjectId string

### 4. Cover Image Retrieval
- Query by `comicId` (string)
- Already handles multiple formats in `getCoverImages()`

### 5. Migration Script
- Update existing cover_images to use ObjectId strings
- Match old numeric IDs to new ObjectIds

## Files to Update

1. **api/db-image-storage.js** - Already handles multiple formats ✅
2. **Cover upload/search code** - Must pass `_id.toString()` as comicId
3. **Migration script** - Update cover_images.comicId to match new ObjectIds
