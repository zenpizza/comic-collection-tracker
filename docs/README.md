# Comic Collection Tracker Documentation

## Table of Contents

- [Setup](#setup)
- [Architecture](#architecture)
- [Features](#features)
- [Cover Search System](#cover-search-system)
- [Migrations](#migrations)
- [Bug Fixes & Improvements](#bug-fixes--improvements)
- [Project History](#project-history)
- [Documentation Organization](#documentation-organization)

## Setup

- [setup/](./setup/) - Project setup and development guides
  - [DEVELOPMENT.md](./setup/DEVELOPMENT.md) - Quick start guide for local development
  - [QUICK_TEST.md](./setup/QUICK_TEST.md) - 5-minute test workflow
  - [clone-app-prompt.md](./setup/clone-app-prompt.md) - Original project vision and requirements

## Architecture

- [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) - System architecture and design decisions

## Features

- [COMIC_COVERS_COMPLETE.md](./features/COMIC_COVERS_COMPLETE.md) - Complete cover management system
- [FEATURE_COMIC_DETAIL_VIEW.md](./features/FEATURE_COMIC_DETAIL_VIEW.md) - Comic detail view feature documentation

## Cover Search System

- [cover-search/](./cover-search/) - Complete cover search system documentation
  - [SYSTEM.md](./cover-search/SYSTEM.md) - Complete system documentation and architecture
  - [QUICK_REFERENCE.md](./cover-search/QUICK_REFERENCE.md) - Quick reference with code examples
  - [CHECKLIST.md](./cover-search/CHECKLIST.md) - Integration checklist
  - [FIXES_2024-11-24.md](./cover-search/FIXES_2024-11-24.md) - Recent fixes and improvements

## Migrations

- [MONGODB_ID_MIGRATION_GUIDE.md](./migrations/MONGODB_ID_MIGRATION_GUIDE.md) - MongoDB ObjectId migration guide
- [OBJECTID_MIGRATION_COMPLETE.md](./migrations/OBJECTID_MIGRATION_COMPLETE.md) - ObjectId migration completion report
- [DATABASE_MIGRATION_CLEANUP.md](./migrations/DATABASE_MIGRATION_CLEANUP.md) - Database cleanup after migration

## Bug Fixes & Improvements

- [COVER_REPLACEMENT_FIX.md](./fixes/COVER_REPLACEMENT_FIX.md) - Cover replacement functionality fixes
- [COVER_SEARCH_FIX.md](./fixes/COVER_SEARCH_FIX.md) - Cover search improvements
- [COVER_SELECTION_DRY_ANALYSIS.md](./fixes/COVER_SELECTION_DRY_ANALYSIS.md) - DRY principle analysis for cover selection
- [COVER_UPDATE_SERVICE.md](./fixes/COVER_UPDATE_SERVICE.md) - Cover update service documentation
- [COVER_UPLOAD_FIX.md](./fixes/COVER_UPLOAD_FIX.md) - Cover upload system improvements
- [COVERURL_REMOVAL_COMPLETE.md](./fixes/COVERURL_REMOVAL_COMPLETE.md) - CoverUrl field removal

## Project History

- [history/](./history/) - Historical records of cleanups, refactors, and deployments
  - [cleanups/](./history/cleanups/) - Code cleanup operations
  - [refactors/](./history/refactors/) - Refactoring work
  - [deployments/](./history/deployments/) - Deployment records

## Documentation Organization

This project uses two documentation systems:

### `/docs` - Completed Documentation
Historical records, completed features, bug fixes, and architecture decisions. This is where you'll find:
- Implementation documentation
- Post-mortem reports
- Architecture decisions
- Migration guides

### `/.kiro/specs` - Active Specifications
Living documents for feature development using Kiro's spec system. Contains:
- [prompt-initializer.md](../.kiro/specs/prompt-initializer.md) - Project context and overview
- [comic-covers/](../.kiro/specs/comic-covers/) - Active cover search feature spec (requirements, design, tasks)
- Migration specs - Historical specs for completed migrations

The relationship: Specs in `/.kiro/specs` drive development, then get documented in `/docs` once complete.

## Quick Links

### For Developers
- [Development Guide](./setup/DEVELOPMENT.md) - Quick start for local development
- [Quick Test](./setup/QUICK_TEST.md) - 5-minute test workflow
- [Local Development](./LOCAL_DEVELOPMENT.md) - Complete Docker setup guide
- [Deployment Architecture](./DEPLOYMENT_ARCHITECTURE.md) - Environment overview
- [Architecture](./architecture/ARCHITECTURE.md) - System design
- [Cover Search Quick Reference](./cover-search/QUICK_REFERENCE.md) - Code examples

### For Kiro AI
- [Prompt Initializer](../.kiro/specs/prompt-initializer.md) - Project context
- [Archived Specs](../.kiro/specs/archive/) - Completed specifications
