/**
 * TEMPORARY endpoint — runs the legacy-comics migration server-side, where
 * the real MONGODB_URI is available (it's a write-only/sensitive Vercel
 * env var that can't be pulled to run the script locally).
 *
 * Gated by a one-off secret (ADMIN_MIGRATE_SECRET), not Clerk auth, since
 * this is meant to be triggered directly, not from the browser. Remove
 * this file (and the env var) once the migration has been run and
 * verified.
 *
 * POST /api/admin/migrate?userId=<clerkUserId>&confirm=true
 * Header: x-admin-secret: <ADMIN_MIGRATE_SECRET>
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { migrateLegacyComics } from '../lib/migrateLegacyComics.js'

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
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const expectedSecret = process.env.ADMIN_MIGRATE_SECRET
  if (!expectedSecret || req.headers['x-admin-secret'] !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, confirm } = req.query

  if (!userId) {
    return res.status(400).json({ error: 'userId query param is required' })
  }

  try {
    const database = await connectToDatabase()
    const result = await migrateLegacyComics(database, { userId, confirm: confirm === 'true' })
    return res.status(200).json({ success: true, result })
  } catch (error) {
    console.error('Migration endpoint error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
