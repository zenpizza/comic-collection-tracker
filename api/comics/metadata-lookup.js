/**
 * Shared comic metadata lookup endpoint
 * GET /api/comics/metadata-lookup?series=&issueNumber=&publisher=&variant=
 *
 * Lets the client check whether another account has already added this
 * issue (and cached its cover) before calling the ComicVine cover-search
 * API, avoiding a redundant external request.
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'
import { buildDedupeKey } from '../lib/comicMetadata.js'

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
    const dedupeKey = buildDedupeKey({ series, issueNumber, publisher, variant })
    const metadata = await database.collection('comicMetadata').findOne({ dedupeKey })

    if (!metadata) {
      return res.status(200).json({ success: true, metadata: null })
    }

    return res.status(200).json({
      success: true,
      metadata: {
        comicMetadataId: metadata._id.toString(),
        series: metadata.series,
        issueNumber: metadata.issueNumber,
        publisher: metadata.publisher,
        year: metadata.year,
        variant: metadata.variant,
        volumeId: metadata.volumeId,
        volumeName: metadata.volumeName,
        hasCover: metadata.hasCover,
        coverLastUpdated: metadata.coverLastUpdated
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
