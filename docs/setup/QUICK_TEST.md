# Quick Local Development Test

## 5-Minute Test

### 1. Start Everything
```bash
# Open Docker Desktop first!

npm run dev:db          # Start MongoDB
npm run dev:verify      # Check setup
npm run dev:full        # Start dev servers
```

### 2. Open App
http://localhost:5173

### 3. Add a Comic
- Click "Add Comic"
- Series: `Amazing Spider-Man`
- Issue: `1`
- Publisher: `Marvel`
- Year: `2023`
- Click "Add Comic"

### 4. Verify in Console (F12)
```javascript
fetch('http://localhost:3000/api/comics')
  .then(r => r.json())
  .then(d => console.log('Comics:', d.comics.length))
// Should show: Comics: 1
```

### 5. Check Environment
```bash
NODE_ENV=development npm run env
```
Should show: `🟡 Local Development Mode`

### 6. Test Persistence
```bash
# Stop servers (Ctrl+C in terminal)
npm run dev:db:stop
npm run dev:db
npm run dev:full
```
Open http://localhost:5173 - comic should still be there!

### 7. Clean Up
```bash
# Stop everything
Ctrl+C  # in dev:full terminal
npm run dev:db:stop
```

---

## Troubleshooting

**MongoDB won't connect?**
- Is Docker Desktop running?
- Is VPN disabled?
- Run: `docker ps` to check container

**Port conflicts?**
- MongoDB: 27017
- Backend: 3000
- Frontend: 5173

**Cover downloads don't work?**
ComicVine blocks local downloads. Use manual file upload instead.

**Need help?**
See [docs/LOCAL_DEV_TEST.md](docs/LOCAL_DEV_TEST.md) for detailed guide.
