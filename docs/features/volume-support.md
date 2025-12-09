# Volume Support Feature

## Overview

The Comic Collection Tracker now captures and stores volume information from ComicVine to improve cover search accuracy and enable future grouping features.

## Background

Comic publishers sometimes change the title of a series during its run. For example, DC's Firestorm series had multiple title changes:

- Issues #1-64: "The Fury of Firestorm" (1982)
- Issues #65-100: "Firestorm, the Nuclear Man" (1987)
- Issues #84-92: "Firestorm the Nuclear Man" [no comma] (1989)
- Issues #93-100: "Firestorm" (1990)

ComicVine tracks these as separate volumes, each with a unique volume ID. By storing this information, we can:

1. Make cover searches more accurate (search by volumeId when available)
2. Track the actual volume a comic belongs to
3. Enable future features to group related volumes together

## Implementation

### Data Model

Two new optional fields added to comics:

- `volumeId` (string): ComicVine volume ID (e.g., "3789")
- `volumeName` (string): ComicVine volume name (e.g., "Firestorm, the Nuclear Man")

### How It Works

1. **Cover Search**: When searching for covers via ComicVine, the API now returns `volumeId` and `volumeName` in the metadata
2. **Auto-Population**: When a cover is selected (either auto-selected or manually chosen), the volume fields are automatically populated in the form
3. **Storage**: Volume information is saved to MongoDB along with other comic metadata
4. **Display**: Volume info is shown as a read-only field in the Add Comic form when available

### API Changes

**api/cover-search.js**
- Added `volumeId` and `volumeName` to the metadata returned for each cover result

**src/utils/coverUpdateService.js**
- Updated metadata template to include `volumeId` and `volumeName`
- These fields are preserved when covers are added or replaced

### UI Changes

**src/components/ComicForm.jsx**
- Added `volumeId` and `volumeName` to form state
- Volume field displays automatically when populated from cover search
- Read-only field with helpful hint text
- Styled with subtle background to indicate it's auto-populated

## Usage

### For Users

When adding a comic:

1. Enter series, issue number, publisher, and year as usual
2. Search for or upload a cover
3. If a cover is found via ComicVine, the volume field will automatically appear showing the volume name
4. The volume information is saved with the comic

### For Developers

Volume metadata is automatically handled by the cover update service. When calling `coverUpdateService.addCover()`, include volume metadata if available:

```javascript
await coverUpdateService.addCover(comicId, imageBlob, {
  source: 'api',
  provider: 'comicvine',
  originalUrl: coverUrl,
  attribution: 'Cover image provided by Comic Vine',
  volumeId: '3789',
  volumeName: 'Firestorm, the Nuclear Man'
})
```

## Future Enhancements

Potential future features enabled by volume support:

1. **Volume-based grouping**: Group comics by volume in the collection view
2. **Smart search**: Use volumeId for more accurate cover searches
3. **Series aliases**: Map different volume names to a canonical series name
4. **Volume completion tracking**: Track which issues you have from a specific volume

## Testing

Test scripts are available to explore ComicVine volume data:

- `scripts/test-comicvine-volume-data.js` - Tests Firestorm title changes
- `scripts/test-volume-149680.js` - Tests specific volume lookup

Run with: `node scripts/test-comicvine-volume-data.js`

## Edge Cases

- **Manual uploads**: Volume fields remain empty for manually uploaded covers (no ComicVine data)
- **Multiple volumes**: If a series has multiple volumes with the same name, the volumeId distinguishes them
- **Missing data**: Volume fields are optional and won't break existing functionality if not present

## Related Issues

- GitHub Issue #6: Handle grouping comics together in same volume but different title
