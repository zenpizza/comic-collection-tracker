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
│   ├── comics          — one row per account-owned issue; userId field
│   │                     isolates accounts. Each row has an identityKey
│   │                     (comicvine|<id> or manual|series|issue|...) and
│   │                     a coverAssetId pointing at the shared cover.
│   ├── coverAssets     — shared cover identity registry; keyed by
│   │                     identityKey so multiple accounts owning the same
│   │                     issue reuse one asset record.
│   ├── cover_images    — S3 references per cover, keyed by coverAsset _id.
│   └── accounts        — lazy account records created on first sign-in.
│
├── comic-collection-preview (Preview)
│   └── (same schema, test/preview data)
│
└── Total: < 1 MB (images in S3, MongoDB stores references only)
```

### Image Storage (S3 + CloudFront)

```
S3 Bucket: comic-collection-covers
│
├── production/covers/{coverAssetId}/
│   ├── thumbnail.jpg
│   ├── medium.jpg
│   └── full.jpg
│
├── preview/covers/{coverAssetId}/
│   └── (same structure)
│
└── development/covers/{coverAssetId}/
    └── (same structure)

CloudFront Distribution: d1o0pmmy3po4ug.cloudfront.net
└── Serves images; proxied through Vercel functions for authenticated
    requests (so the Authorization header never crosses to CloudFront)
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

### Current Architecture (Dec 2025)

- **MongoDB**: Metadata only (~75 KB for ~350 comics)
- **S3**: All cover images (3 sizes per comic)
- **CloudFront**: CDN delivery for images
- **Local**: Docker MongoDB for development

### Image Storage

Images are stored in S3 with environment-specific prefixes:
- `production/covers/{comicId}/{size}.jpg`
- `preview/covers/{comicId}/{size}.jpg`
- `development/covers/{comicId}/{size}.jpg`

MongoDB stores S3 references (key, url, contentType, size) instead of base64 data.

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
