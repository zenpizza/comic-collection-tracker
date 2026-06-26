/**
 * Temporary one-off endpoint to run the comicVineId backfill against
 * the production database. Gate by a shared secret — NOT Clerk auth.
 *
 * REMOVE THIS FILE once the production backfill has been run and verified.
 * Also remove the ADMIN_MIGRATE_SECRET Vercel env var.
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { backfillComicVineIds } from '../lib/backfillComicVineIds.js'

let client
let db

async function connectToDatabase() {
  if (db) return db
  client = new MongoClient(getMongoDBUri())
  await client.connect()
  db = client.db(getDatabaseName())
  return db
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = req.headers['x-admin-secret']
  if (!secret || secret !== process.env.ADMIN_MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { userId, confirm = false } = req.body || {}
    if (!userId) {
      return res.status(400).json({ error: 'userId is required in request body' })
    }

    const apiKey = process.env.COMIC_VINE_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'COMIC_VINE_API_KEY not set' })
    }

    const database = await connectToDatabase()
    const result = await backfillComicVineIds(database, { userId, confirm, apiKey, delayMs: 1500 })
    return res.status(200).json({ success: true, result })
  } catch (error) {
    console.error('Backfill error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
