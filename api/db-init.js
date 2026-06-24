import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from './config.js'
import { requireAuth } from './auth.js'
import { ensureIndexes as ensureComicsIndexes } from './lib/comics.js'
import { ensureIndexes as ensureCoverAssetIndexes } from './lib/coverAssets.js'

let client
let db

async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    client = new MongoClient(getMongoDBUri())
    await client.connect()
    db = client.db(getDatabaseName())
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

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
    const database = await connectToDatabase()

    if (req.method === 'POST') {
      // Initialize database indexes (idempotent — safe to call repeatedly)
      await ensureComicsIndexes(database)
      await ensureCoverAssetIndexes(database)

      return res.status(200).json({
        success: true,
        message: 'Indexes ensured: comics{userId,identityKey} unique, coverAssets{identityKey} unique'
      })
    }

    if (req.method === 'GET') {
      const [comicsCount, coverAssetsCount, accountsCount] = await Promise.all([
        database.collection('comics').countDocuments(),
        database.collection('coverAssets').countDocuments(),
        database.collection('accounts').countDocuments(),
      ])

      return res.status(200).json({
        success: true,
        stats: { comicsCount, coverAssetsCount, accountsCount }
      })
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
