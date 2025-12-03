# Local Development Test Workflow

## Complete Test: Add a Comic Locally

This guide walks you through testing the entire local development setup by adding a comic.

---

## Step 1: Start Docker Desktop

1. Open **Docker Desktop** application
2. Wait for Docker to fully start (whale icon in menu bar should be steady)
3. Verify Docker is running:

```bash
docker --version
```

Expected output: `Docker version 24.x.x` (or similar)

---

## Step 2: Start Local MongoDB

```bash
npm run dev:db
```

**Expected output:**
```
✔ Container comic-tracker-mongodb  Started
```

**Verify it's running:**
```bash
docker ps
```

You should see `comic-tracker-mongodb` in the list.

---

## Step 3: Verify Setup

```bash
npm run dev:verify
```

**Expected output:**
```
✅ All checks passed! You're ready to develop.

Start development with:
  npm run dev:full
```

If any checks fail, fix them before continuing.

---

## Step 4: Check Current Environment

```bash
NODE_ENV=development npm run env
```

**Expected output:**
```
🟡 Local Development Mode

📊 Environment Variables:
   NODE_ENV:    development
   VERCEL_ENV:  (not set)

💾 Database Configuration:
   Database Name: comic-collection
   Type:          Local Docker
```

---

## Step 5: Start Development Servers

```bash
npm run dev:full
```

**Expected output:**
```
[0] VITE v7.x.x  ready in xxx ms
[0] ➜  Local:   http://localhost:5173/
[1] Server running on http://localhost:3000
```

**Keep this terminal open!** The servers are running.

---

## Step 6: Open the App

1. Open your browser
2. Go to: http://localhost:5173
3. You should see the Comic Collection Tracker app

---

## Step 7: Verify Empty Database

Open browser console (F12) and run:

```javascript
fetch('http://localhost:3000/api/comics')
  .then(r => r.json())
  .then(data => console.log('Comics:', data.comics.length))
```

**Expected output:** `Comics: 0` (empty database)

---

## Step 8: Add a Test Comic

1. Click **"Add Comic"** tab
2. Fill in the form:
   - **Series:** Amazing Spider-Man
   - **Issue Number:** 1
   - **Publisher:** Marvel
   - **Year:** 2023
3. Click **"Add Comic"**

**Expected:** Success message appears

---

## Step 9: Verify Comic Was Saved

In browser console:

```javascript
fetch('http://localhost:3000/api/comics')
  .then(r => r.json())
  .then(data => {
    console.log('Comics:', data.comics.length)
    console.log('First comic:', data.comics[0])
  })
```

**Expected output:**
```
Comics: 1
First comic: {
  series: "Amazing Spider-Man",
  issueNumber: "1",
  publisher: "Marvel",
  year: 2023,
  ...
}
```

---

## Step 10: Check Database Directly

Open a new terminal and run:

```bash
docker exec -it comic-tracker-mongodb mongosh -u admin -p devpassword comic-collection
```

In the MongoDB shell:

```javascript
db.comics.find().pretty()
```

**Expected:** You should see your comic in the database!

Type `exit` to leave MongoDB shell.

---

## Step 11: Test Cover Upload

1. In the app, click on your comic to open detail view
2. Click **"Add Cover"** or **"Search Covers"**
3. If searching:
   - Enter "Amazing Spider-Man"
   - Select a cover from results
   - Click to upload
4. If uploading:
   - Select an image file from your computer
   - Upload it

**Expected:** Cover image appears on the comic

---

## Step 12: Verify Cover in Database

In browser console:

```javascript
fetch('http://localhost:3000/api/comics')
  .then(r => r.json())
  .then(data => {
    const comic = data.comics[0]
    console.log('Has cover:', comic.hasCover)
    console.log('Cover ID:', comic.coverId)
  })
```

**Expected:**
```
Has cover: true
Cover ID: [some ObjectId]
```

---

## Step 13: Test Edit

1. Click the edit button (✏️) on your comic
2. Change the year to 2024
3. Save

**Expected:** Year updates in the UI

---

## Step 14: Test Delete

1. Click on the comic to open detail view
2. Click **"Delete Comic"**
3. Confirm deletion

**Expected:** Comic is removed from the list

---

## Step 15: Verify Database is Empty Again

In browser console:

```javascript
fetch('http://localhost:3000/api/comics')
  .then(r => r.json())
  .then(data => console.log('Comics:', data.comics.length))
```

**Expected:** `Comics: 0`

---

## Step 16: Stop Everything

1. In the terminal running `npm run dev:full`, press `Ctrl+C`
2. Stop MongoDB:

```bash
npm run dev:db:stop
```

**Expected:** `Container comic-tracker-mongodb  Stopped`

---

## Step 17: Verify Data Persists

1. Start MongoDB again: `npm run dev:db`
2. Start dev servers: `npm run dev:full`
3. Open http://localhost:5173

**Expected:** Database is still empty (because we deleted the comic)

---

## Step 18: Add Data and Test Persistence

1. Add a new comic (any comic)
2. Stop servers (`Ctrl+C`)
3. Stop MongoDB: `npm run dev:db:stop`
4. Start MongoDB: `npm run dev:db`
5. Start servers: `npm run dev:full`
6. Open http://localhost:5173

**Expected:** Your comic is still there! (Data persisted in Docker volume)

---

## Step 19: Reset Database (Optional)

To start completely fresh:

```bash
npm run dev:db:reset
```

**Warning:** This deletes ALL local data!

---

## Step 20: Compare with Production

1. Keep local dev running
2. Open production in another tab: https://comic-collection-tracker.vercel.app
3. Notice they have different data

**This proves:**
- ✅ Local development is isolated
- ✅ You can't accidentally affect production
- ✅ Safe to test destructive operations

---

## Known Limitations

### Cover Downloads Don't Work Locally

**Issue**: Downloading covers from ComicVine fails with 403 errors in local development.

**Why**: ComicVine blocks server-side requests as an anti-scraping measure.

**Solution**: Use manual file upload instead:
- Click "Upload Cover" button
- Select an image file from your computer
- Works perfectly in production/preview on Vercel

## Troubleshooting

### MongoDB won't start

```bash
# Check if port 27017 is in use
lsof -i :27017

# If something is using it, stop it or change port in docker-compose.yml
```

### Can't connect to MongoDB

```bash
# Check container status
docker ps -a

# View logs
npm run dev:db:logs

# Restart container
npm run dev:db:stop
npm run dev:db
```

### Frontend can't reach backend

- Verify backend is running on port 3000
- Check browser console for CORS errors
- Ensure both servers started with `npm run dev:full`

### VPN Issues

- Disable ProtonVPN or similar VPNs
- They block MongoDB port 27017

---

## Success Criteria

✅ Docker running
✅ MongoDB container started
✅ Dev servers running
✅ Can add comics
✅ Can upload covers
✅ Can edit comics
✅ Can delete comics
✅ Data persists after restart
✅ Isolated from production

---

## Next Steps

Once local development works:
1. Create a feature branch
2. Make changes
3. Test locally
4. Push to GitHub
5. Vercel creates preview deployment
6. Test in preview
7. Merge to main
8. Deploys to production

See [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) for the full workflow.
