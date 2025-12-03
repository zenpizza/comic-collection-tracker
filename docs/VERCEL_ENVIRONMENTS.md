# Vercel Environment Configuration

## Overview

Vercel supports three deployment environments, each with its own environment variables and database configuration.

## Environment Types

### 1. Production
- **Trigger**: Push to `main` branch
- **URL**: `comic-collection-tracker.vercel.app`
- **Database**: `comic-collection` (MongoDB Atlas)
- **Env Vars**: Set in Vercel Dashboard → Production

### 2. Preview
- **Trigger**: Pull requests or branch pushes
- **URL**: `comic-collection-tracker-git-[branch]-[team].vercel.app`
- **Database**: `comic-collection-preview` (MongoDB Atlas)
- **Env Vars**: Set in Vercel Dashboard → Preview

### 3. Development (Local)
- **Trigger**: `vercel dev` or `npm run dev:full`
- **URL**: `localhost:3000`
- **Database**: Local Docker MongoDB
- **Env Vars**: `.env.development` file

## Database Strategy

We use **one MongoDB Atlas cluster** with **multiple databases**:

```
MongoDB Atlas Cluster
├── comic-collection          (Production)
├── comic-collection-preview  (Preview deployments)
└── comic-collection-dev      (Optional: Vercel dev command)
```

This approach:
- ✅ Shares storage quota efficiently
- ✅ Isolates data between environments
- ✅ Uses single connection string
- ✅ No additional cost

## Vercel Dashboard Setup

### Step 1: Set Environment Variables

Go to: **Vercel Dashboard → Project → Settings → Environment Variables**

#### For Production:
```bash
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/comic-collection?retryWrites=true&w=majority
COMICVINE_API_KEY = your_api_key_here
```
**Scope**: ✅ Production

#### For Preview:
```bash
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/comic-collection-preview?retryWrites=true&w=majority
COMICVINE_API_KEY = your_api_key_here
```
**Scope**: ✅ Preview

#### For Development (Optional):
```bash
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/comic-collection-dev?retryWrites=true&w=majority
COMICVINE_API_KEY = your_api_key_here
```
**Scope**: ✅ Development

**Note**: The only difference is the database name in the URI!

### Step 2: Initialize Preview Database

The preview database will be created automatically on first use, but you can initialize it manually:

```bash
# Connect to MongoDB Atlas
mongosh "mongodb+srv://cluster.mongodb.net" --username your_user

# Switch to preview database
use comic-collection-preview

# Create collections
db.createCollection('comics')
db.createCollection('cover_images')

# Create indexes
db.comics.createIndex({ series: 1, issueNumber: 1 })
db.cover_images.createIndex({ comicId: 1 })
```

Or use the setup script:
```bash
MONGODB_URI="mongodb+srv://...comic-collection-preview..." node scripts/setup-dev-db.js
```

## How It Works

The `api/config.js` module automatically detects the environment:

```javascript
// Vercel sets VERCEL_ENV automatically
const vercelEnv = process.env.VERCEL_ENV;
// Values: 'production', 'preview', 'development', or undefined (local)

if (vercelEnv === 'preview') {
  // Use preview database
} else if (vercelEnv === 'production') {
  // Use production database
} else {
  // Use local database
}
```

## Testing Preview Deployments

### Create a Preview Deployment

```bash
# Create a new branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "Add new feature"

# Push to GitHub
git push origin feature/my-feature
```

Vercel automatically:
1. Detects the push
2. Creates a preview deployment
3. Uses preview environment variables
4. Connects to `comic-collection-preview` database

### View Preview Deployment

1. Go to Vercel Dashboard → Deployments
2. Find your branch deployment
3. Click "Visit" to see the preview
4. Test your changes safely!

## Environment Detection

You can check which environment you're in:

```javascript
import { getEnvironment } from './api/config.js';

const env = getEnvironment();

console.log(env.vercelEnv);      // 'production', 'preview', 'development', or undefined
console.log(env.isProduction);   // true/false
console.log(env.isPreview);      // true/false
console.log(env.isDevelopment);  // true/false
console.log(env.isLocal);        // true if running locally
console.log(env.databaseName);   // 'comic-collection', 'comic-collection-preview', etc.
```

## Storage Considerations

### Current Usage
- Production: ~330 MB
- Preview: ~0 MB (empty initially)
- Free Tier: 512 MB total

### Recommendations

**Option 1: Shared Atlas Cluster (Current)**
- Use different database names
- Share 512 MB quota
- Preview database stays small (test data only)
- ✅ No additional cost

**Option 2: Separate Preview Cluster**
- Create second free M0 cluster for preview
- Full 512 MB for each
- Complete isolation
- ⚠️ Requires second MongoDB Atlas project

**Option 3: Preview Uses Production Data (Read-Only)**
- Preview connects to production database
- Add read-only user for preview
- No storage overhead
- ⚠️ Can't test write operations safely

## Best Practices

### For Preview Deployments

1. **Keep preview database small**
   - Only add test data needed for the feature
   - Periodically clean up old test data

2. **Test destructive operations**
   - Preview is perfect for testing deletes, updates
   - Won't affect production data

3. **Share preview URLs**
   - Send to team members for review
   - Test on different devices

### For Production

1. **Never test in production**
   - Always use preview for testing
   - Only merge after preview testing

2. **Monitor storage**
   - Check MongoDB Atlas dashboard
   - Set up alerts for storage limits

## Troubleshooting

### Preview deployment uses production database

**Problem**: Preview changes affect production data

**Solution**: 
1. Check Vercel environment variables
2. Ensure Preview scope has correct `MONGODB_URI`
3. Verify database name in URI is `comic-collection-preview`

### Preview deployment fails to connect

**Problem**: `MongoServerSelectionError`

**Solution**:
1. Check MongoDB Atlas Network Access
2. Ensure `0.0.0.0/0` is whitelisted (or add Vercel IPs)
3. Verify credentials in environment variables

### Preview database is empty

**Expected**: Preview database starts empty
**Solution**: Add test data or run initialization script

## Migration Checklist

- [ ] Set up Preview environment variables in Vercel
- [ ] Update `MONGODB_URI` to use `comic-collection-preview`
- [ ] Test preview deployment with a branch
- [ ] Verify preview uses separate database
- [ ] Document for team members
- [ ] Set up monitoring/alerts

## Additional Resources

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [MongoDB Atlas Multi-Environment Setup](https://www.mongodb.com/docs/atlas/tutorial/manage-multiple-environments/)
- [Vercel Preview Deployments](https://vercel.com/docs/concepts/deployments/preview-deployments)
