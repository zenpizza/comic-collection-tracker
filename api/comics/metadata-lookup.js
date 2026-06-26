/**
 * Shared cover lookup endpoint
 * GET /api/comics/metadata-lookup?series=&issueNumber=&publisher=&variant=
 *
 * Lets the client check whether another account has already added this
 * issue (and cached its cover) before calling the ComicVine cover-search
 * API, avoiding a redundant external request.
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'
import { buildIdentityKey } from '../lib/comics.js'

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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { series, issueNumber, publisher, variant } = req.query

  if (!series || !issueNumber) {
    return res.status(400).json({
      success: false,
      error: 'series and issueNumber are required'
    })
  }

  try {
    const database = await connectToDatabase()
    const identityKey = buildIdentityKey({ series, issueNumber, publisher, variant })

    // Any existing comic (any account) with this identity and a cover
    // already attached — its coverAssetId is what a new add would reuse.
    const existing = await database.collection('comics').findOne({
      identityKey,
      coverAssetId: { $ne: null }
    })

    if (!existing) {
      return res.status(200).json({ success: true, metadata: null })
    }

    return res.status(200).json({
      success: true,
      metadata: {
        series: existing.series,
        issueNumber: existing.issueNumber,
        publisher: existing.publisher,
        year: existing.year,
        variant: existing.variant,
        volumeId: existing.volumeId,
        volumeName: existing.volumeName,
        hasCover: true
      }
    })
  } catch (error) {
    console.error('Metadata lookup error:', error)
    return res.status(500).json({
      success: false,
      error: 'Metadata lookup failed',
      details: error.message
    })
  }
}
