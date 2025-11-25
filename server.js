import 'dotenv/config'
import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// Import API handlers
import comicsHandler from './api/comics.js'
import imagesHandler from './api/images.js'
import coverProxyHandler from './api/cover-proxy.js'
import downloadHandler from './api/download.js'
import coverSearchHandler from './api/cover-search.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3001
const DATA_DIR = path.join(__dirname, 'data')

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.static('dist'))

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
}

// API Routes
app.post('/api/save-data', async (req, res) => {
  try {
    const { filename, data } = req.body
    
    if (!filename || !data) {
      return res.status(400).json({ error: 'Filename and data are required' })
    }

    // Sanitize filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = path.join(DATA_DIR, safeFilename)
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    
    res.json({ 
      success: true, 
      message: `Data saved to ${safeFilename}`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error saving data:', error)
    res.status(500).json({ error: 'Failed to save data' })
  }
})

app.get('/api/load-data/:filename', async (req, res) => {
  try {
    const { filename } = req.params
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = path.join(DATA_DIR, safeFilename)
    
    const data = await fs.readFile(filePath, 'utf8')
    res.json(JSON.parse(data))
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Data file not found' })
    } else {
      console.error('Error loading data:', error)
      res.status(500).json({ error: 'Failed to load data' })
    }
  }
})

app.get('/api/backup-data/:filename', async (req, res) => {
  try {
    const { filename } = req.params
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = path.join(DATA_DIR, safeFilename)
    
    const data = await fs.readFile(filePath, 'utf8')
    const parsedData = JSON.parse(data)
    
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify(parsedData, null, 2))
  } catch (error) {
    console.error('Error creating backup:', error)
    res.status(500).json({ error: 'Failed to create backup' })
  }
})

app.get('/api/stats', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR)
    const dataFiles = files.filter(f => f.endsWith('.json'))
    
    const stats = {
      dataFiles: dataFiles.length,
      lastModified: null,
      totalSize: 0
    }
    
    for (const file of dataFiles) {
      const filePath = path.join(DATA_DIR, file)
      const stat = await fs.stat(filePath)
      stats.totalSize += stat.size
      
      if (!stats.lastModified || stat.mtime > new Date(stats.lastModified)) {
        stats.lastModified = stat.mtime.toISOString()
      }
    }
    
    res.json(stats)
  } catch (error) {
    console.error('Error getting stats:', error)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

// Comics endpoint
app.get('/api/comics', comicsHandler)
app.post('/api/comics', comicsHandler)
app.options('/api/comics', comicsHandler)

// Images endpoint
app.post('/api/images/upload', imagesHandler)
app.post('/api/images/sync', imagesHandler)
app.get('/api/images/stats', imagesHandler)
app.get('/api/images/:comicId/:size', imagesHandler)
app.get('/api/images/:comicId/metadata', imagesHandler)
app.delete('/api/images/:comicId', imagesHandler)
app.options('/api/images/*', imagesHandler)

// Cover search endpoint
app.get('/api/cover-search', coverSearchHandler)
app.options('/api/cover-search', coverSearchHandler)

// Cover proxy endpoints
app.get('/api/cover-proxy/comicvine/search', coverProxyHandler)
app.get('/api/cover-proxy/download', coverProxyHandler)
app.options('/api/cover-proxy/*', coverProxyHandler)

// Direct download endpoint (fallback)
app.get('/api/download', downloadHandler)
app.options('/api/download', downloadHandler)

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// Start server
async function startServer() {
  await ensureDataDir()
  app.listen(PORT, () => {
    console.log(`🚀 Comic Collection Server running on http://localhost:${PORT}`)
    console.log(`📁 Data directory: ${DATA_DIR}`)
  })
}

startServer().catch(console.error)