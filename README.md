# Comic Collection Tracker

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://comic-collection-tracker.vercel.app)

A comprehensive web app to track your comic book collection and find missing issues while browsing comic shops.

🚀 **[Live Demo](https://comic-collection-tracker.vercel.app)** | 📦 Built with React + Vite + MongoDB

## Features

- **📚 Collection Management**: Add, view, and organize your comics
- **🖼️ Comic Detail View**: Click any comic to view full details with large cover image
- **✏️ Edit & Update**: Modify comic details and manage cover images
- **🔍 Missing Issues Finder**: Instantly see which issues you need when browsing shops
- **📝 Bulk Import**: Add multiple comics at once via text import or issue ranges
- **💾 Persistent Storage**: Your data is saved to files, not just browser storage
- **📊 Data Management**: Export, import, and backup your collection
- **📱 Mobile-Friendly**: Optimized for use on your phone while out and about

## Setup & Installation

### Quick Start

```bash
# Install dependencies
npm install

# Start local MongoDB
npm run dev:db

# Start development
npm run dev:full
```

Access the app at http://localhost:5173

### Prerequisites
- Node.js 18+
- Docker Desktop (for local MongoDB)
- VPN disabled (ProtonVPN blocks MongoDB connections)

### Detailed Setup

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for complete setup guide.

### Documentation

- 📖 **[Development Guide](docs/setup/DEVELOPMENT.md)** - Quick start for developers
- 🏗️ **[Deployment Architecture](docs/DEPLOYMENT_ARCHITECTURE.md)** - Overview of all environments
- 🐳 **[Local Development](docs/LOCAL_DEVELOPMENT.md)** - Docker MongoDB setup
- ☁️ **[Vercel Environments](docs/VERCEL_ENVIRONMENTS.md)** - Preview & production setup
- ⚙️ **[Vercel Setup Guide](docs/VERCEL_SETUP_GUIDE.md)** - Step-by-step configuration

### Architecture

The app supports three deployment environments:

**🟡 Local Development**:
- Frontend: Vite dev server (port 5173)
- Backend: Express server (port 3000)
- Database: Docker MongoDB (localhost:27017)
- Purpose: Fast iteration, offline development

**🟣 Preview** (Vercel):
- Automatic deployments for PRs/branches
- Database: MongoDB Atlas (`comic-collection-preview`)
- Purpose: Testing before production

**🔴 Production** ([comic-collection-tracker.vercel.app](https://comic-collection-tracker.vercel.app)):
- Frontend: Vercel static hosting
- Backend: Vercel serverless functions
- Database: MongoDB Atlas (`comic-collection`)
- Images: MongoDB (base64 encoded, 3 sizes)

See [Deployment Architecture](docs/DEPLOYMENT_ARCHITECTURE.md) for details.

## Usage

### Adding Comics

**Single Comic**: Use the "Add Comic" tab to add individual comics with details like series, issue number, publisher, year, variant, and notes.

**Bulk Import**: Use the "Bulk Import" tab for multiple comics:
- **Text Import**: Paste a list of comics in various formats:
  - `Amazing Spider-Man #1`
  - `Amazing Spider-Man #1 (Marvel, 2023)`
  - `Amazing Spider-Man #1 - Variant A (Marvel, 2023)`
  - `Amazing Spider-Man, 1, Marvel, 2023`
- **Issue Range**: Perfect for complete runs (e.g., issues 1-50 of a series)

### Viewing & Editing Comics

**Detail View**: Click on any comic cover or card to open the detail view where you can:
- View a large version of the cover image
- See all comic details in an organized layout
- Edit any field (series, issue number, publisher, year, variant, notes)
- Add, replace, or delete cover images
- Delete the comic from your collection

**Quick Edit**: In the collection view, click the edit button (✏️) for inline editing without opening the detail view.

### Finding Missing Issues

1. Go to "Missing Issues" tab
2. Select a series from your collection
3. Set the range to check (e.g., issues 1-100)
4. See exactly which issues you're missing
5. Use this while browsing comic shops to know what to look for!

### Data Management

The "Data Manager" tab provides:
- **Collection Statistics**: Overview of your collection
- **Export/Backup**: Download your collection as JSON
- **Import/Restore**: Upload a previously exported collection
- **Data Clearing**: Reset your collection (with confirmation)

## Data Storage

**Production**: MongoDB Atlas (cloud database)
- Comics stored as individual documents
- Cover images stored as base64 encoded data
- Three image sizes: thumbnail, medium, full

**Local Development**: File-based storage
- JSON files in the `data/` directory
- Used only when running `npm run dev:full`
- Not used in production

## File Structure

```
comic-collection-tracker/
├── src/
│   ├── components/          # React components
│   ├── utils/              # Utility functions
│   └── App.jsx             # Main app component
├── data/                   # Persistent data storage
├── server.js               # Backend API server
└── package.json            # Dependencies and scripts
```

## API Endpoints

- `POST /api/save-data` - Save collection data
- `GET /api/load-data/:filename` - Load collection data
- `GET /api/backup-data/:filename` - Download backup
- `GET /api/stats` - Get storage statistics

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use and modify as needed.