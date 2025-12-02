# coverUrl Field Analysis

## Current Purpose

The `coverUrl` field is **DEPRECATED** and should be phased out. Here's why:

### Historical Context

Originally, `coverUrl` was used to store blob URLs or direct image URLs for covers. However, this approach had problems:
- Blob URLs are temporary and don't persist across sessions
- Storing URLs in the database is redundant when images are in MongoDB
- Creates confusion about the source of truth

### Current Implementation

**What it's supposed to be:**
- Always `null` in the database (see ComicDetailView.jsx comments: "Never persist blob URLs")
- Used only as a temporary runtime prop passed to CoverImage component

**What actually happens:**
1. Comics are saved with `coverUrl: null`
2. `CoverImage` component receives `coverUrl` prop (usually null)
3. If `coverUrl` is null, `CoverImage` fetches from API using `comicId`
4. `ImageURLService` creates blob URLs dynamically from MongoDB data

### The Problem

Some code still checks `coverUrl` to determine if a comic has a cover:
```javascript
// WRONG - coverUrl is always null in DB
const hasCover = comic.coverUrl && comic.coverUrl.trim() !== ''

// CORRECT - use hasCover field
const hasCover = comic.hasCover
```

## Correct Architecture

### Database (MongoDB)

**Comics Collection:**
```json
{
  "_id": ObjectId("..."),
  "series": "Amazing Spider-Man",
  "hasCover": true,           // ✅ Use this
  "coverId": "...",            // ✅ Use this
  "coverUrl": null,            // ❌ Always null, deprecated
  "coverSource": "comicvine"
}
```

**Cover_Images Collection:**
```json
{
  "_id": ObjectId("..."),
  "comicId": "691f6d2317b51b3fe52a6d05",  // Links to comic._id
  "images": {
    "thumbnail": { "data": "base64...", "mimeType": "image/jpeg" },
    "medium": { ... },
    "full": { ... }
  }
}
```

### Runtime Flow

1. **Component receives comic:**
   ```jsx
   <CoverImage comicId={comic.id} coverUrl={comic.coverUrl} />
   ```

2. **CoverImage checks coverUrl:**
   - If valid URL → use it (rare, only for external URLs)
   - If null → fetch from API using comicId

3. **ImageURLService:**
   - Fetches from `/api/images/{comicId}/{size}`
   - Creates blob URL from base64 data
   - Caches in memory + IndexedDB

4. **Display:**
   - Shows blob URL in `<img>` tag
   - Blob URL auto-revoked when component unmounts

## Recommendation: Remove coverUrl

### Phase 1: Stop Using It (Current)
- ✅ Always save as `null` in database
- ✅ Use `hasCover` field to check for covers
- ✅ Use `comicId` to fetch covers

### Phase 2: Remove from Code (Future)
1. Remove `coverUrl` prop from CoverImage component
2. Remove `coverUrl` field from Comic model
3. Remove `coverUrl` from database schema
4. Update all components to use only `hasCover` and `comicId`

### Phase 3: Database Cleanup (Future)
```javascript
// Remove coverUrl field from all comics
db.comics.updateMany(
  {},
  { $unset: { coverUrl: "" } }
)
```

## Why Keep It For Now?

1. **Backward compatibility** - Some old code might still reference it
2. **External URLs** - Theoretically could support external image URLs
3. **Gradual migration** - Safer to deprecate gradually

## Summary

**coverUrl field:**
- ❌ Should NOT be used to check if comic has cover
- ❌ Should NOT be stored in database (always null)
- ✅ Can be passed as prop for external URLs (rare)
- ✅ Will be removed in future cleanup

**Use instead:**
- `comic.hasCover` - Boolean flag indicating cover exists
- `comic.coverId` - ID of the cover image
- `comic.id` - Used by ImageURLService to fetch cover
