/**
 * Statistics endpoint for comics collection
 * GET /api/comics/stats - Get collection statistics
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'
import { listCollection } from '../lib/userComics.js'

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
  // Set CORS headers
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

  try {
    const database = await connectToDatabase()

    // Scoped to this account's collection only — shared metadata is not
    // aggregated across accounts.
    const comics = await listCollection(database, req.userId)

    const countBy = (key) => comics.reduce((acc, comic) => {
      const value = comic[key] || 'unknown'
      acc[value] = (acc[value] || 0) + 1
      return acc
    }, {})

    const seriesBreakdown = countBy('series')
    const publisherBreakdown = countBy('publisher')

    const years = comics
      .map(comic => comic.year)
      .filter(year => year !== undefined && year !== null && year !== '')

    return res.status(200).json({
      success: true,
      stats: {
        totalDocuments: comics.length,
        topSeries: Object.entries(seriesBreakdown)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([series, count]) => ({ series, count })),
        publishers: Object.entries(publisherBreakdown)
          .sort((a, b) => b[1] - a[1])
          .map(([publisher, count]) => ({ publisher, count })),
        yearRange: years.length > 0 ? {
          earliest: Math.min(...years),
          latest: Math.max(...years)
        } : {
          earliest: null,
          latest: null
        }
      }
    })
  } catch (error) {
    console.error('Error getting stats:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      details: error.message
    })
  }
}