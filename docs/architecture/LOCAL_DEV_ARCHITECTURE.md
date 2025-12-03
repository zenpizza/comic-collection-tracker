# Local Development Architecture

## Overview

Clean separation between local development and production environments using Docker and environment-based configuration.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Application Code                      │
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │   Frontend     │         │   Backend APIs   │       │
│  │   (Vite)       │────────▶│   (Express)      │       │
│  │   Port 5173    │         │   Port 3000      │       │
│  └────────────────┘         └──────────────────┘       │
│                                      │                   │
│                                      ▼                   │
│                             ┌─────────────────┐         │
│                             │  api/config.js  │         │
│                             │  (Auto-detect)  │         │
│                             └─────────────────┘         │
│                                      │                   │
└──────────────────────────────────────┼──────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                      │
         ┌──────────▼──────────┐              ┌──────────▼──────────┐
         │   Development       │              │    Production       │
         │                     │              │                     │
         │  Docker MongoDB     │              │  MongoDB Atlas      │
         │  localhost:27017    │              │  (Cloud)            │
         │  .env.development   │              │  .env.local         │
         └─────────────────────┘              └─────────────────────┘
```

## Key Components

### 1. Configuration Module (`api/config.js`)

Central configuration that automatically detects environment:

```javascript
import { getMongoDBUri, getDatabaseName } from './config.js'

// Automatically uses correct environment
const uri = getMongoDBUri()
const dbName = getDatabaseName()
```

**Features:**
- Auto-detects `NODE_ENV`
- Loads appropriate `.env` file
- Provides clean API for all configuration
- No hardcoded values

### 2. Environment Files

**`.env.development`** (Local)
```bash
NODE_ENV="development"
MONGODB_URI="mongodb://admin:devpassword@localhost:27017/comic-collection?authSource=admin"
COMICVINE_API_KEY="..."
```

**`.env.local`** (Production)
```bash
MONGODB_URI="mongodb+srv://...@cluster.mongodb.net/..."
COMICVINE_API_KEY="..."
```

### 3. Docker Setup (`docker-compose.yml`)

Provides isolated local MongoDB:
- MongoDB 7.0
- Persistent data volume
- Health checks
- Auto-initialization script

### 4. Database Initialization (`scripts/mongo-init.js`)

Runs automatically on first container start:
- Creates collections
- Sets up indexes
- Ensures consistent schema

## Data Flow

### Development Mode

```
User Request → Vite (5173) → Express (3000) → config.js
                                                  ↓
                                          NODE_ENV=development
                                                  ↓
                                          .env.development
                                                  ↓
                                          Docker MongoDB
```

### Production Mode

```
User Request → Vercel Edge → Serverless Function → config.js
                                                       ↓
                                                NODE_ENV=production
                                                       ↓
                                                   .env.local
                                                       ↓
                                                  MongoDB Atlas
```

## Benefits

### Clean Code
- Single source of truth for configuration
- No environment-specific code in business logic
- Easy to test and maintain

### Isolation
- Local development never touches production
- Can reset local database without fear
- Test destructive operations safely

### Flexibility
- Easy to switch between environments
- Can run multiple local instances
- Simple CI/CD integration

### Developer Experience
- One command to start: `npm run dev:full`
- Automatic environment detection
- Clear error messages

## Migration Path

All database connections were updated to use the config module:

**Before:**
```javascript
client = new MongoClient(process.env.MONGODB_URI)
db = client.db('comic-collection')  // Hardcoded!
```

**After:**
```javascript
import { getMongoDBUri, getDatabaseName } from './config.js'

client = new MongoClient(getMongoDBUri())
db = client.db(getDatabaseName())  // Dynamic!
```

## Files Modified

- `api/config.js` - New configuration module
- `api/comics.js` - Updated to use config
- `api/db-image-storage.js` - Updated to use config
- `.env.development` - New development environment
- `docker-compose.yml` - New Docker setup
- `package.json` - New dev scripts

## Testing

Verification script checks entire setup:
```bash
npm run dev:verify
```

Checks:
- ✅ Docker installed and running
- ✅ MongoDB container status
- ✅ Environment files exist
- ✅ Database connection works
- ✅ Dependencies installed

## Future Enhancements

- Data seeding script to copy production data
- Multiple environment support (staging, preview)
- Automated backup/restore
- Performance profiling tools
