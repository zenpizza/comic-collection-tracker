/**
 * TEMPORARY — drops the now-unused comicMetadata and userComics
 * collections left over from the two-table design. Remove after use.
 *
 * POST /api/admin/cleanup-legacy-collections?confirm=true
 * Header: x-admin-secret: <ADMIN_CLEANUP_SECRET>
 */
import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'

let client, db
async function connectToDatabase() {
  if (db) return db
  client = new MongoClient(getMongoDBUri())
  await client.connect()
  db = client.db(getDatabaseName())
  return db
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const expectedSecret = process.env.ADMIN_CLEANUP_SECRET
  if (!expectedSecret || req.headers['x-admin-secret'] !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { confirm } = req.query
  const collections = ['comicMetadata', 'userComics']

  try {
    const database = await connectToDatabase()
    const existing = (await database.listCollections().toArray()).map(c => c.name)
    const toDropExists = collections.filter(c => existing.includes(c))
    const toDropMissing = collections.filter(c => !existing.includes(c))

    if (confirm !== 'true') {
      return res.status(200).json({
        dryRun: true,
        wouldDrop: toDropExists,
        alreadyAbsent: toDropMissing
      })
    }

    const dropped = []
    for (const name of toDropExists) {
      await database.collection(name).drop()
      dropped.push(name)
    }

    return res.status(200).json({ success: true, dropped, alreadyAbsent: toDropMissing })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
