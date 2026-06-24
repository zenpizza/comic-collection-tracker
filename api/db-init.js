import { initializeIndexes, getPerformanceStats } from './db-setup.js'
import { requireAuth } from './auth.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  try {
    if (req.method === 'POST') {
      // Initialize database indexes
      const result = await initializeIndexes()
      
      if (result.success) {
        return res.status(200).json(result)
      } else {
        return res.status(500).json(result)
      }
    }

    if (req.method === 'GET') {
      // Get performance statistics
      const result = await getPerformanceStats()
      
      if (result.success) {
        return res.status(200).json(result)
      } else {
        return res.status(500).json(result)
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (error) {
    console.error('Database initialization API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    })
  }
}