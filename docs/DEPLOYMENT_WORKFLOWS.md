# Deployment Workflows

Quick reference for common deployment tasks.

---

## Daily Development Workflow

### 1. Start Local Development

```bash
# Start MongoDB
npm run dev:db

# Verify setup
npm run dev:verify

# Check environment
NODE_ENV=development npm run env

# Start dev servers
npm run dev:full
```

Access at: http://localhost:3000

### 2. Stop Local Development

```bash
# Stop dev servers (Ctrl+C in terminal)

# Stop MongoDB
npm run dev:db:stop
```

---

## Feature Development Workflow

### 1. Create Feature Branch

```bash
# Create and switch to new branch
git checkout -b feature/my-new-feature

# Or for bug fixes
git checkout -b fix/bug-description
```

### 2. Develop Locally

```bash
# Make changes
# Test locally with npm run dev:full

# Stage changes
git add .

# Commit changes
git commit -m "feat: Add new feature description"
```

### 3. Push to GitHub (Creates Preview)

```bash
# Push branch to GitHub
git push origin feature/my-new-feature
```

**Result**: Vercel automatically creates a preview deployment

### 4. Test in Preview

- Go to Vercel Dashboard → Deployments
- Find your branch deployment
- Click "Visit" to test
- Preview uses `comic-collection-preview` database

### 5. Deploy to Production

```bash
# Switch to main
git checkout main

# Pull latest changes
git pull origin main

# Merge your feature branch
git merge feature/my-new-feature

# Push to main (triggers production deployment)
git push origin main
```

**Result**: Vercel automatically deploys to production

### 6. Clean Up

```bash
# Delete local branch
git branch -d feature/my-new-feature

# Delete remote branch
git push origin --delete feature/my-new-feature
```

---

## Quick Commands Reference

### Git Basics

```bash
# Check current branch
git branch

# Check status
git status

# See recent commits
git log --oneline -5

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard local changes
git restore <file>
```

### Branch Management

```bash
# List all branches
git branch -a

# Switch to existing branch
git checkout <branch-name>

# Create and switch to new branch
git checkout -b <branch-name>

# Delete local branch
git branch -d <branch-name>

# Delete remote branch
git push origin --delete <branch-name>
```

### Syncing with Remote

```bash
# Pull latest from main
git pull origin main

# Push current branch
git push origin <branch-name>

# Force push (use carefully!)
git push origin <branch-name> --force
```

---

## Environment Commands

### Check Environment

```bash
# Show current environment
npm run env

# With NODE_ENV set
NODE_ENV=development npm run env
```

### Database Management

```bash
# Start local MongoDB
npm run dev:db

# Stop local MongoDB
npm run dev:db:stop

# View MongoDB logs
npm run dev:db:logs

# Reset local database (deletes all data!)
npm run dev:db:reset

# Verify setup
npm run dev:verify
```

---

## Deployment Scenarios

### Scenario 1: Regular Feature

```bash
# 1. Create branch
git checkout -b feature/new-thing

# 2. Develop and commit
git add .
git commit -m "feat: Add new thing"

# 3. Push (creates preview)
git push origin feature/new-thing

# 4. Test in preview, then merge to main
git checkout main
git merge feature/new-thing
git push origin main

# 5. Clean up
git branch -d feature/new-thing
git push origin --delete feature/new-thing
```

### Scenario 2: Hotfix

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 2. Fix and commit
git add .
git commit -m "fix: Critical bug description"

# 3. Push and test in preview
git push origin hotfix/critical-bug

# 4. Merge to main immediately
git checkout main
git merge hotfix/critical-bug
git push origin main

# 5. Clean up
git branch -d hotfix/critical-bug
git push origin --delete hotfix/critical-bug
```

### Scenario 3: Multiple Commits

```bash
# Working on feature with multiple commits
git add .
git commit -m "feat: Part 1"

git add .
git commit -m "feat: Part 2"

git add .
git commit -m "feat: Part 3"

# Push all commits
git push origin feature/my-feature

# Merge to main
git checkout main
git merge feature/my-feature
git push origin main
```

---

## Vercel-Specific Commands

### Using Vercel CLI (Optional)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy current directory to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs

# List deployments
vercel ls
```

---

## Troubleshooting

### Preview Deployment Not Created

```bash
# Check if branch was pushed
git branch -r

# Force push
git push origin <branch-name> --force

# Check Vercel dashboard for errors
```

### Production Deployment Failed

```bash
# Check Vercel logs in dashboard
# Verify environment variables are set
# Check build logs for errors

# Rollback to previous deployment in Vercel dashboard
```

### Local Development Issues

```bash
# Reset everything
npm run dev:db:stop
npm run dev:db:reset
npm run dev:db
npm run dev:verify
npm run dev:full
```

### Git Conflicts

```bash
# Pull latest main
git checkout main
git pull origin main

# Rebase your branch
git checkout feature/my-feature
git rebase main

# Resolve conflicts, then
git add .
git rebase --continue

# Force push (since history changed)
git push origin feature/my-feature --force
```

---

## Best Practices

### Commit Messages

```bash
# Feature
git commit -m "feat: Add user authentication"

# Bug fix
git commit -m "fix: Resolve cover download issue"

# Documentation
git commit -m "docs: Update deployment guide"

# Refactor
git commit -m "refactor: Simplify API configuration"

# Style
git commit -m "style: Format code with prettier"

# Test
git commit -m "test: Add unit tests for API"
```

### Branch Naming

```bash
# Features
feature/user-auth
feature/bulk-import

# Bug fixes
fix/cover-download
fix/database-connection

# Hotfixes
hotfix/critical-security-issue

# Experiments
experiment/new-ui-design

# Documentation
docs/deployment-guide
```

### Before Merging to Main

- ✅ Test in preview deployment
- ✅ Verify no console errors
- ✅ Check mobile responsiveness
- ✅ Confirm database operations work
- ✅ Review code changes
- ✅ Update documentation if needed

---

## Quick Reference Card

```bash
# Daily workflow
npm run dev:db && npm run dev:full

# Create feature
git checkout -b feature/name

# Save work
git add . && git commit -m "feat: description"

# Create preview
git push origin feature/name

# Deploy to production
git checkout main && git merge feature/name && git push origin main

# Clean up
git branch -d feature/name && git push origin --delete feature/name

# Check environment
npm run env

# Reset local DB
npm run dev:db:reset
```

---

## Emergency Procedures

### Rollback Production

1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### Revert Git Commit

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Revert a specific commit (creates new commit)
git revert <commit-hash>
```

### Database Issues

```bash
# Local: Reset database
npm run dev:db:reset

# Preview: Clear via MongoDB Atlas
# Production: Contact admin or use backup
```

---

## Resources

- **Vercel Dashboard**: https://vercel.com/davds-projects-f6b20bc7/comic-collection-tracker
- **GitHub Repo**: https://github.com/zenpizza/comic-collection-tracker
- **MongoDB Atlas**: https://cloud.mongodb.com/
- **Local Dev Guide**: [docs/setup/DEVELOPMENT.md](./setup/DEVELOPMENT.md)
- **Architecture**: [docs/DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md)
