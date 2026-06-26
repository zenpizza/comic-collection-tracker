/**
 * Temporary one-off endpoint to run the legacy comics migration against
 * the production database. Gate by a shared secret — NOT Clerk auth,
 * since this is meant to be triggered directly before regular users sign in.
 *
 * REMOVE THIS FILE once the production migration has been run and verified.
 * Also remove the ADMIN_MIGRATE_SECRET Vercel env var.
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { migrateLegacyComics } from '../lib/migrateLegacyComics.js'

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

    const database = await connectToDatabase()
    const result = await migrateLegacyComics(database, { userId, confirm })
    return res.status(200).json({ success: true, result })
  } catch (error) {
    console.error('Migration error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
