# Project Summary

This is a Comic Collection Tracker application with the following key features:

## Architecture

- **Frontend**: React + Vite
- **Backend**: Express.js + MongoDB Atlas
- **Storage**: MongoDB for comics and cover images
- **Deployment**: Vercel (Pro version - unlimited endpoints)

## Key Features Implemented

### 1. Comic Management
Individual document-per-comic in MongoDB (migrated from single-document model)

### Cover Images
- MongoDB storage with base64 encoding
- Three sizes: thumbnail (150x225), medium (300x450), full (300x450)
- Unidirectional data flow: MongoDB → Cache → UI
- ImageURLService with LRU memory cache + IndexedDB cache
- Safe-by-default blob URL management
- Use `hasCover` field to check cover status (NOT coverUrl - that field was removed)
- **hasCover flag management**: Automatically maintained by image upload/delete APIs
  - Set to `true` when cover is uploaded (`/api/images/upload`)
  - Set to `false` when cover is deleted (`/api/images/[comicId]` DELETE)
  - Always reflects actual cover existence in database

### Cover Sources
Upload files or search external APIs (ComicVine, etc.)
**IMPORTANT**: All cover searches MUST use `issueParser` to handle annuals/specials
See `docs/COVER_SEARCH_SYSTEM.md` for complete documentation

**Cover Search Improvements**:
- Year parameter now included in cover searches for better accuracy
- Backend prioritizes volumes by proximity to target year (not hard filtering)
- Helps disambiguate between different series runs with same name

### Volume Support (Dec 2025)
- **Feature**: Capture and store ComicVine volume metadata
- **Fields**: `volumeId` and `volumeName` stored with each comic
- **Auto-population**: Volume fields automatically filled when covers are fetched from ComicVine
- **Purpose**: Improves cover search accuracy and enables future grouping of title-changed series
- **Example**: DC's Firestorm had multiple title changes but same volume run
- **Details**: See `docs/features/volume-support.md`

### Cover Upload System
- Centralized upload client (`imageUploadClient.js`) - single source of truth
- Uses multipart/form-data for efficient uploads (no base64 overhead)
- Server-side image processing with sharp (thumbnail, medium, full sizes)
- Avoids Vercel 413 payload limits by sending raw binary data
- Built-in retry logic and batch upload support
- See `COVER_UPLOAD_FIX.md` for technical details

### Bulk Import with Cover Fetch
- Import multiple comics via text or issue range
- Post-import prompt to fetch covers immediately
- BulkCoverManager opens pre-filtered to newly imported comics
- Toast notification with "View Collection" action
- Collection view filters to show only newly imported comics
- Seamless workflow: Import → Fetch Covers → View Results
- See `docs/features/bulk-import-cover-prompt.md` for details

### View Modes
List view and grid view for browsing collection

## Important Context

- **Vercel Pro with unlimited endpoints** - All APIs use individual REST endpoints
- **ImageURLService is the standard** - All image URL resolution should go through this service
- **Local development with Docker** - Use `npm run dev:db` to start local MongoDB
- **Environment-based configuration** - `api/config.js` handles dev/prod automatically
- **No testing framework** - Test scripts are in scripts/ directory
- **Git repository** - Connected to GitHub at https://github.com/zenpizza/comic-collection-tracker
- **Database migration completed** - System uses individual document-per-comic architecture
- **MongoDB ObjectId standard** - Uses MongoDB's recommended ObjectId for _id fields
- **Cover linking via ObjectId** - cover_images.comicId stores ObjectId string to link to comics._id
- **Read COVER_SEARCH_FIX.md** to understand comic book cover api search design
- **VPN Issues** - ProtonVPN blocks MongoDB connections, disable for local development

## Data Maintenance Scripts

Located in `scripts/` directory for database maintenance:
- `fix-spectacular-hascover.js` - Fix hasCover flags for specific issues
- `fix-all-spectacular-hascover.js` - Verify and fix hasCover flags for all Spectacular Spider-Man
- `set-default-publisher.js` - Set default publisher for comics without one
- `update-spectacular-spiderman.js` - Rename series (e.g., add "The" prefix)
- `update-spectacular-year.js` - Set year for specific issue ranges
- `update-amazing-spiderman-years.js` - Bulk update years by issue number ranges
- `update-avengers-years.js` - Bulk update years by issue number ranges

All scripts use `.env.local` for MongoDB Atlas connection.

## Recent Features & Bug Fixes (Dec 2025)

### Bulk Import Cover Prompt (Dec 8, 2025)
- **Feature**: Post-import workflow for fetching covers
- **Implementation**: Toast notifications, collection filtering, visual feedback
- **Impact**: Seamless user experience from import to viewing results
- **Details**: See `docs/features/bulk-import-cover-prompt.md`

### Image Upload Endpoint Routing Fix (Dec 8, 2025)
- **Issue**: Local dev server routing `/api/images/upload` to wrong handler
- **Fix**: Updated `server.js` to use dedicated `imageUploadHandler` from `/api/images/upload.js`
- **Impact**: Cover uploads now work correctly in local development

## Bug Fixes (Nov 2025)

### Cover Search Year Parameter
- **Issue**: Cover search API wasn't including year parameter from Add Comic form
- **Fix**: Updated `ComicForm.jsx` to pass `formData.year` to `coverAPIService.searchCovers()`
- **Impact**: Better search accuracy, especially for series with multiple runs

### Cover Search Year Filtering
- **Issue**: Backend was hard-filtering volumes by year (±2 years), causing zero results
- **Fix**: Changed to prioritize/sort by year proximity instead of filtering
- **Impact**: Always returns results, with best year matches first

### Bulk Cover Selection Count
- **Issue**: Selected count didn't decrease after bulk operations completed
- **Fix**: Added `actualSelectedCount` computed value and auto-cleanup of stale selections
- **Impact**: Accurate selection counts in Bulk Cover Operations UI

### hasCover Flag Persistence
- **Issue**: hasCover flag getting unset/corrupted in database
- **Fix**: Image upload/delete APIs now automatically set hasCover flag
- **Impact**: hasCover always reflects actual cover existence, no manual fixes needed

### Bulk Cover Metadata Persistence
- **Issue**: Bulk operations weren't saving cover metadata to database
- **Fix**: `DataManager.handleCoverUpdate` now saves to database, not just local state
- **Impact**: All cover metadata fields properly persisted after bulk operations

## Code Standards

- **Environment Configuration** - All database connections use `api/config.js`
  - Automatically detects development vs production
  - Loads appropriate `.env` file
  - Provides clean API: `getMongoDBUri()`, `getDatabaseName()`, `getEnvironment()`
  - Never hardcode database names or connection strings

- **DRY Principle for REST APIs** - All REST API communication should use centralized client utilities
  - Example: `imageUploadClient.js` for image uploads
  - Avoid duplicating fetch calls, FormData creation, or error handling
  - Create dedicated API clients when multiple files need the same endpoint
  - Benefits: Single source of truth, consistent error handling, easier maintenance

- **DRY Principle for Cover Operations** - All cover update operations use `coverUpdateService.js`
  - Single source of truth for adding, removing, and replacing covers
  - Handles: image upload, metadata construction, cache invalidation
  - Used by: ComicDetailView, BulkCoverManager, and any component updating covers
  - Ensures consistent metadata fields across all operations
  - **Metadata persistence**: BulkCoverManager now saves metadata to database (not just local state)
  - Cover metadata fields: `hasCover`, `coverId`, `coverSource`, `coverSourceProvider`, `coverOriginalUrl`, `coverAttribution`, `coverLastUpdated`

## Local Development

See `docs/LOCAL_DEVELOPMENT.md` for complete setup guide.

**Quick Start:**
```bash
npm run dev:db        # Start local MongoDB
npm run dev:full      # Start frontend + backend
```

**Requirements:**
- Docker installed and running
- VPN disabled (ProtonVPN blocks MongoDB)
- Node.js 18+

**Known Limitations:**
- Cover downloads from ComicVine fail locally (403 Forbidden)
- Use manual file upload instead
- Works fine in production/preview on Vercel

## Vercel Deployments

The app supports three deployment environments:

- **Production** (`main` branch) → `comic-collection` database
- **Preview** (PRs/branches) → `comic-collection-preview` database  
- **Development** (local) → Docker MongoDB

See `docs/VERCEL_ENVIRONMENTS.md` for architecture details.
See `docs/VERCEL_SETUP_GUIDE.md` for configuration steps.
