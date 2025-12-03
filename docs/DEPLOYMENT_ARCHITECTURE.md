# Deployment Architecture Overview

## Three-Environment Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     Comic Collection Tracker                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  🟡 Local Dev │    │  🟣 Preview   │    │ 🔴 Production │
│               │    │               │    │               │
│  Developer    │    │  PR Testing   │    │  Live Users   │
│  Machine      │    │  Vercel       │    │  Vercel       │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Docker        │    │ MongoDB Atlas │    │ MongoDB Atlas │
│ MongoDB       │    │               │    │               │
│ localhost     │    │ comic-        │    │ comic-        │
│               │    │ collection-   │    │ collection    │
│               │    │ preview       │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Environment Comparison

| Aspect | Local Dev | Preview | Production |
|--------|-----------|---------|------------|
| **Trigger** | Manual | PR/Branch Push | Main Branch Push |
| **URL** | localhost:5173 | `*-git-[branch]-*.vercel.app` | `comic-collection-tracker.vercel.app` |
| **Database** | Docker MongoDB | Atlas Preview DB | Atlas Production DB |
| **Data** | Test data | Test data | Real user data |
| **Purpose** | Development | Testing | Live application |
| **Cost** | Free (local) | Free (shared Atlas) | Free (shared Atlas) |

## Configuration Flow

### Local Development

```javascript
NODE_ENV=development
↓
Loads .env.development
↓
MONGODB_URI="mongodb://localhost:27017/..."
↓
Connects to Docker MongoDB
```

### Vercel Preview

```javascript
VERCEL_ENV=preview (set by Vercel)
↓
Uses Vercel Environment Variables (Preview scope)
↓
MONGODB_URI="mongodb+srv://.../comic-collection-preview?..."
↓
Connects to Atlas Preview Database
```

### Vercel Production

```javascript
VERCEL_ENV=production (set by Vercel)
↓
Uses Vercel Environment Variables (Production scope)
↓
MONGODB_URI="mongodb+srv://.../comic-collection?..."
↓
Connects to Atlas Production Database
```

## Database Architecture

### MongoDB Atlas Cluster (Shared)

```
comic-collection-tracke.aufn0iz.mongodb.net
│
├── comic-collection (Production)
│   ├── comics (241 documents)
│   └── cover_images (246 documents)
│   └── ~330 MB
│
├── comic-collection-preview (Preview)
│   ├── comics (test data)
│   └── cover_images (test data)
│   └── ~minimal MB
│
└── Total: ~330 MB / 512 MB (64.6% used)
```

### Local Docker MongoDB

```
localhost:27017
│
└── comic-collection (Development)
    ├── comics (empty or test data)
    └── cover_images (empty or test data)
    └── Unlimited (local disk)
```

## Deployment Workflow

### Feature Development

```
1. Developer creates feature branch
   git checkout -b feature/new-feature

2. Start local development
   npm run dev:db && npm run dev:full
   
3. Develop and test locally
   - Uses Docker MongoDB
   - Fast iteration
   - No network latency

4. Push to GitHub
   git push origin feature/new-feature

5. Vercel creates preview deployment
   - Automatic on push
   - Uses preview database
   - Shareable URL for review

6. Test in preview
   - Real Vercel environment
   - Isolated from production
   - Safe for destructive testing

7. Create Pull Request
   - Preview URL in PR comments
   - Team reviews changes
   - CI/CD checks pass

8. Merge to main
   - Automatic production deployment
   - Uses production database
   - Live for users
```

## Environment Detection

The `api/config.js` module handles all environment detection:

```javascript
import { getEnvironment } from './api/config.js';

const env = getEnvironment();

// Check environment
if (env.isLocal && env.isDevelopment) {
  // Local development with Docker
}

if (env.isPreview) {
  // Vercel preview deployment
}

if (env.isProduction && env.isVercel) {
  // Vercel production deployment
}

// Get database info
console.log(env.databaseName);  // Auto-detected
console.log(env.mongoUri);      // Auto-configured
```

## Storage Management

### Current Usage (Dec 2024)

- **Production**: 330 MB (241 comics, 246 covers)
- **Preview**: ~0 MB (empty, test data only)
- **Local**: Unlimited (Docker volume)
- **Total Atlas**: 330 MB / 512 MB free tier

### Scaling Strategy

**When approaching 512 MB limit:**

1. **Optimize images** (Current: ~675 KB per comic)
   - Reduce thumbnail quality
   - Use more aggressive compression
   - Consider external CDN for covers

2. **Upgrade Atlas tier**
   - M2 Shared: 2 GB for $9/month
   - M10 Dedicated: 10 GB for $57/month

3. **Separate preview cluster**
   - Create second free M0 cluster
   - Full isolation
   - 512 MB for each environment

## Security Considerations

### Environment Variables

- ✅ Never commit `.env*` files to git
- ✅ Use Vercel dashboard for cloud env vars
- ✅ Rotate credentials periodically
- ✅ Use read-only users for preview (future)

### Database Access

- ✅ IP whitelist configured (0.0.0.0/0 for Vercel)
- ✅ Strong passwords
- ✅ Separate databases per environment
- ⚠️ Consider read-only preview user

### API Keys

- ✅ ComicVine API key shared across environments
- ✅ Rate limiting on external APIs
- ⚠️ Consider separate keys per environment

## Monitoring

### What to Monitor

1. **Storage Usage**
   - MongoDB Atlas dashboard
   - Alert at 80% (410 MB)

2. **Deployment Status**
   - Vercel dashboard
   - GitHub Actions (if configured)

3. **Error Rates**
   - Vercel logs
   - MongoDB Atlas logs

4. **Performance**
   - Response times
   - Database query performance

### Useful Commands

```bash
# Check current environment
npm run env

# Verify local setup
npm run dev:verify

# Check database size
node scripts/check-db-size.js

# Test configuration
node scripts/test-config.js
```

## Troubleshooting

### Preview uses production database

**Cause**: Environment variables not scoped correctly

**Fix**:
1. Vercel Dashboard → Environment Variables
2. Check Preview scope is selected
3. Verify database name in URI

### Local can't connect to MongoDB

**Cause**: Docker not running or VPN blocking

**Fix**:
1. Check Docker: `docker ps`
2. Disable VPN (ProtonVPN blocks port 27017)
3. Start MongoDB: `npm run dev:db`

### Preview deployment fails

**Cause**: Missing environment variables

**Fix**:
1. Check Vercel logs
2. Verify all required env vars set
3. Check MongoDB Atlas network access

## Best Practices

### Development

- ✅ Always use local Docker for development
- ✅ Never connect to production from local
- ✅ Use `npm run env` to verify configuration
- ✅ Keep local data minimal

### Preview

- ✅ Test all changes in preview first
- ✅ Share preview URLs for review
- ✅ Test destructive operations safely
- ✅ Clean up preview data periodically

### Production

- ✅ Only deploy from main branch
- ✅ Require PR reviews
- ✅ Monitor after deployment
- ✅ Have rollback plan

## Documentation

- `docs/LOCAL_DEVELOPMENT.md` - Local setup guide
- `docs/VERCEL_ENVIRONMENTS.md` - Environment details
- `docs/VERCEL_SETUP_GUIDE.md` - Vercel configuration
- `docs/architecture/LOCAL_DEV_ARCHITECTURE.md` - Technical architecture
- `DEVELOPMENT.md` - Quick start guide
