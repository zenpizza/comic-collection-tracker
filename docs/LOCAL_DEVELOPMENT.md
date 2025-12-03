# Local Development Setup

This guide covers setting up a local development environment with Docker-based MongoDB.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose installed
- VPN disabled (ProtonVPN or similar can block MongoDB connections)

## Quick Start

### 1. Start Local MongoDB

```bash
npm run dev:db
```

This starts a MongoDB container with:
- Port: `27017`
- Username: `admin`
- Password: `devpassword`
- Database: `comic-collection`

### 2. Start Development Server

```bash
npm run dev:full
```

This runs both:
- Vite dev server (frontend) on port 5173
- Express API server (backend) on port 3000

### 3. Access the Application

Open http://localhost:5173 in your browser.

## Environment Configuration

The application automatically detects the environment:

- **Production**: Uses `.env.local` → MongoDB Atlas
- **Development**: Uses `.env.development` → Local Docker MongoDB

Set the environment with:
```bash
NODE_ENV=development npm run server:dev
```

## Available Scripts

### Database Management

```bash
# Start MongoDB container
npm run dev:db

# Stop MongoDB container
npm run dev:db:stop

# View MongoDB logs
npm run dev:db:logs

# Reset database (deletes all data)
npm run dev:db:reset
```

### Development

```bash
# Frontend only (Vite)
npm run dev

# Backend only (Express)
npm run server:dev

# Both frontend + backend
npm run dev:full
```

## Database Access

### Using MongoDB Compass

Connect to your local database with:
```
mongodb://admin:devpassword@localhost:27017/comic-collection?authSource=admin
```

### Using mongosh CLI

```bash
docker exec -it comic-tracker-mongodb mongosh -u admin -p devpassword comic-collection
```

## Data Seeding (Optional)

To copy data from production to local development:

```bash
# Coming soon - data migration script
npm run dev:seed
```

## Architecture

### Configuration Module

All database connections use `api/config.js` which:
- Detects environment (development vs production)
- Loads appropriate `.env` file
- Provides clean API for database configuration

### Database Connection

```javascript
import { getMongoDBUri, getDatabaseName } from './config.js'

const uri = getMongoDBUri()      // Auto-detects environment
const dbName = getDatabaseName()  // Extracts from URI
```

## Known Limitations

### Cover Downloads from ComicVine

**Issue**: Cover downloads from ComicVine fail with 403 Forbidden in local development.

**Why**: ComicVine's CDN actively blocks server-side requests, even with browser-like headers. This is an anti-scraping measure.

**Workaround**: Use manual file upload instead:
1. Click on a comic to open detail view
2. Use "Upload Cover" button
3. Select an image file from your computer

**Note**: This works fine in production/preview deployments on Vercel because Vercel's edge network has different characteristics.

## Troubleshooting

### MongoDB Connection Issues

**Problem**: `MongoServerSelectionError: Server selection timed out`

**Solutions**:
1. Ensure Docker is running: `docker ps`
2. Check if MongoDB container is up: `npm run dev:db:logs`
3. Disable VPN (ProtonVPN blocks MongoDB ports)
4. Verify port 27017 isn't in use: `lsof -i :27017`

### Container Won't Start

```bash
# Check Docker status
docker ps -a

# View container logs
docker logs comic-tracker-mongodb

# Reset everything
npm run dev:db:reset
```

### Port Already in Use

If port 27017 is already taken, edit `docker-compose.yml`:
```yaml
ports:
  - "27018:27017"  # Use different host port
```

Then update `.env.development`:
```
MONGODB_URI="mongodb://admin:devpassword@localhost:27018/comic-collection?authSource=admin"
```

## Production Deployment

Production uses MongoDB Atlas and is deployed to Vercel:
- Environment variables set in Vercel dashboard
- Automatic deployments from GitHub
- Uses `.env.local` configuration

## Notes

- Local MongoDB data persists in Docker volume `mongodb_data`
- Deleting the volume (`npm run dev:db:reset`) removes all local data
- Production database is never affected by local development
