/**
 * TEMPORARY endpoint — one-time backfill of comicVineId/identityKey for
 * comics that don't have one yet (e.g. just migrated from the legacy
 * schema). Calls the real ComicVine API per comic, so it can take a
 * while for a large batch (rate-limited with a delay between calls).
 *
 * Gated by the same one-off secret as api/admin/migrate.js. Remove this
 * file (and ADMIN_MIGRATE_SECRET) once the backfill has been run and
 * verified.
 *
 * POST /api/admin/backfill-comicvine-ids?userId=<clerkUserId>&confirm=true
 * Header: x-admin-secret: <ADMIN_MIGRATE_SECRET>
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { backfillComicVineIds } from '../lib/backfillComicVineIds.js'

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

export const config = {
  maxDuration: 120,
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
  const apiKey = process.env.COMICVINE_API_KEY

  if (!userId) {
    return res.status(400).json({ error: 'userId query param is required' })
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'COMICVINE_API_KEY is not configured' })
  }

  try {
    const database = await connectToDatabase()
    const result = await backfillComicVineIds(database, { userId, confirm: confirm === 'true', apiKey })
    return res.status(200).json({ success: true, result })
  } catch (error) {
    console.error('Backfill endpoint error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
