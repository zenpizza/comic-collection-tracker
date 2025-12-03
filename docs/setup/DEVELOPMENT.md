# Development Quick Start

## Prerequisites

1. **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop)
2. **Node.js 18+** - [Download here](https://nodejs.org/)
3. **Disable VPN** - ProtonVPN and similar VPNs block MongoDB connections

## Setup (First Time)

```bash
# 1. Install dependencies
npm install

# 2. Start local MongoDB
npm run dev:db

# 3. Verify setup
npm run dev:verify

# 4. Start development
npm run dev:full
```

## Daily Development

```bash
# Start everything
npm run dev:db && npm run dev:full
```

Access the app at: http://localhost:5173

## Useful Commands

```bash
# Database
npm run dev:db          # Start MongoDB
npm run dev:db:stop     # Stop MongoDB
npm run dev:db:logs     # View logs
npm run dev:db:reset    # Reset database (deletes all data)

# Development
npm run dev             # Frontend only
npm run server:dev      # Backend only
npm run dev:full        # Both frontend + backend

# Verification
npm run dev:verify      # Check if everything is set up correctly
```

## Environment

- **Development**: Uses local Docker MongoDB (`.env.development`)
- **Production**: Uses MongoDB Atlas (`.env.local`)

The app automatically detects which environment to use based on `NODE_ENV`.

## Troubleshooting

### MongoDB won't connect
- Ensure Docker is running
- Disable VPN (especially ProtonVPN)
- Check if container is running: `docker ps`

### Port conflicts
- MongoDB uses port 27017
- Vite uses port 5173
- Express uses port 3000

### Need help?
See detailed guide: `docs/LOCAL_DEVELOPMENT.md`
