# Vercel Environment Setup Guide

## Quick Setup Checklist

- [ ] Clerk account created and application configured
- [ ] Production environment variables configured
- [ ] Preview environment variables configured  
- [ ] Preview database initialized in MongoDB Atlas
- [ ] Test preview deployment
- [ ] Verify database isolation

## Step-by-Step Setup

### 1. Access Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project: `comic-collection-tracker`
3. Click **Settings** → **Environment Variables**

### 2. Set Up Clerk Authentication

The app uses [Clerk](https://clerk.com) for user authentication.

1. Go to https://dashboard.clerk.com and create an account
2. Create a new application (choose "React" as your framework)
3. Go to **API Keys** in the Clerk dashboard
4. Copy the **Publishable key** and **Secret key**

### 3. Configure Production Environment

Click **Add New** and enter each variable:

**MONGODB_URI:**
```
Name: MONGODB_URI
Value: mongodb+srv://Vercel-Admin-comic-collection-tracker:<REDACTED-ROTATED-SECRET>@comic-collection-tracke.aufn0iz.mongodb.net/comic-collection?retryWrites=true&w=majority&appName=comic-collection-tracker
Environment: ✅ Production only
```

**COMICVINE_API_KEY:**
```
Name: COMICVINE_API_KEY
Value: <REDACTED-ROTATED-SECRET>
Environment: ✅ Production only
```

**VITE_CLERK_PUBLISHABLE_KEY:**
```
Name: VITE_CLERK_PUBLISHABLE_KEY
Value: pk_live_... (your Clerk publishable key)
Environment: ✅ Production only
```

**CLERK_SECRET_KEY:**
```
Name: CLERK_SECRET_KEY
Value: sk_live_... (your Clerk secret key)
Environment: ✅ Production only
```

### 4. Configure Preview Environment

Click **Add New** and enter each variable:

**MONGODB_URI:**
```
Name: MONGODB_URI
Value: mongodb+srv://Vercel-Admin-comic-collection-tracker:<REDACTED-ROTATED-SECRET>@comic-collection-tracke.aufn0iz.mongodb.net/comic-collection-preview?retryWrites=true&w=majority&appName=comic-collection-tracker
Environment: ✅ Preview only
```

**COMICVINE_API_KEY:**
```
Name: COMICVINE_API_KEY
Value: <REDACTED-ROTATED-SECRET>
Environment: ✅ Preview only
```

**VITE_CLERK_PUBLISHABLE_KEY:**
```
Name: VITE_CLERK_PUBLISHABLE_KEY
Value: pk_test_... (your Clerk test publishable key)
Environment: ✅ Preview only
```

**CLERK_SECRET_KEY:**
```
Name: CLERK_SECRET_KEY
Value: sk_test_... (your Clerk test secret key)
Environment: ✅ Preview only
```

**⚠️ Important**: The only difference between Production and Preview is the database name:
- Production: `/comic-collection?`
- Preview: `/comic-collection-preview?`

### 4. Initialize Preview Database

The preview database will be created automatically, but you should initialize it with proper indexes:

**Option A: Using MongoDB Atlas UI**

1. Go to https://cloud.mongodb.com/
2. Click **Browse Collections**
3. Click **Create Database**
   - Database name: `comic-collection-preview`
   - Collection name: `comics`
4. Create second collection: `cover_images`
5. Create indexes:
   - On `comics`: `{ series: 1, issueNumber: 1 }`
   - On `cover_images`: `{ comicId: 1 }`

**Option B: Using mongosh**

```bash
mongosh "mongodb+srv://comic-collection-tracke.aufn0iz.mongodb.net" \
  --username Vercel-Admin-comic-collection-tracker \
  --password <REDACTED-ROTATED-SECRET>

use comic-collection-preview
db.createCollection('comics')
db.createCollection('cover_images')
db.comics.createIndex({ series: 1, issueNumber: 1 })
db.cover_images.createIndex({ comicId: 1 })
```

### 5. Test Preview Deployment

**Create a test branch:**

```bash
git checkout -b test/preview-deployment
echo "# Test" >> README.md
git add README.md
git commit -m "Test preview deployment"
git push origin test/preview-deployment
```

**Verify deployment:**

1. Go to Vercel Dashboard → **Deployments**
2. Find the deployment for `test/preview-deployment`
3. Click **Visit** to open the preview URL
4. Open browser console and check:
   ```javascript
   // Should show preview database
   fetch('/api/comics').then(r => r.json()).then(console.log)
   ```

**Verify database isolation:**

1. Add a test comic in the preview deployment
2. Check production - the comic should NOT appear there
3. Check MongoDB Atlas - you should see data in `comic-collection-preview` only

### 6. Clean Up Test

```bash
git checkout main
git branch -D test/preview-deployment
git push origin --delete test/preview-deployment
```

## Environment Variable Summary

| Variable | Production | Preview | Development (Local) |
|----------|-----------|---------|---------------------|
| `MONGODB_URI` | `...comic-collection?...` | `...comic-collection-preview?...` | `mongodb://localhost:27017/...` |
| `COMICVINE_API_KEY` | Same for all | Same for all | Same for all |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | `pk_test_...` | `pk_test_...` |
| `CLERK_SECRET_KEY` | `sk_live_...` | `sk_test_...` | `sk_test_...` |
| `VERCEL_ENV` | `production` | `preview` | Not set |
| `NODE_ENV` | `production` | `production` | `development` |

> **Note**: `VITE_CLERK_PUBLISHABLE_KEY` is intentionally a frontend variable (prefixed `VITE_`). It is a public key by design — safe to embed in the browser bundle. `CLERK_SECRET_KEY` is server-only and never exposed to the frontend.

## Verification Commands

Test environment detection locally:

```bash
# Test local development
NODE_ENV=development node scripts/test-config.js

# Test local production
node scripts/test-config.js

# Simulate preview (won't connect to DB without real credentials)
VERCEL_ENV=preview \
  MONGODB_URI="mongodb+srv://...comic-collection-preview..." \
  COMICVINE_API_KEY="..." \
  node scripts/test-config.js
```

## Troubleshooting

### Preview uses production database

**Symptoms**: Changes in preview affect production

**Fix**:
1. Check Vercel environment variables
2. Ensure Preview scope is selected (not "All")
3. Verify database name in URI: `comic-collection-preview`
4. Redeploy preview branch

### Can't connect to preview database

**Symptoms**: `MongoServerSelectionError`

**Fix**:
1. Check MongoDB Atlas Network Access
2. Ensure `0.0.0.0/0` is in IP Access List
3. Verify credentials in environment variable
4. Check MongoDB Atlas cluster status

### Preview database not created

**Symptoms**: Database doesn't exist in Atlas

**Expected**: MongoDB creates databases on first write
**Fix**: Add a comic in preview deployment to trigger creation

## Best Practices

1. **Always test in preview first**
   - Create PR → automatic preview deployment
   - Test thoroughly before merging

2. **Keep preview data minimal**
   - Only add test data needed for the feature
   - Periodically clean up: `db.comics.deleteMany({})`

3. **Use preview for destructive testing**
   - Test delete operations
   - Test bulk updates
   - Test data migrations

4. **Monitor storage usage**
   - Production + Preview share 512 MB free tier
   - Check MongoDB Atlas dashboard regularly

## Next Steps

After setup:
- [ ] Document preview workflow for team
- [ ] Set up GitHub branch protection rules
- [ ] Configure automatic preview comments on PRs
- [ ] Set up monitoring/alerts for preview deployments
