/**
 * Statistics endpoint for comics collection
 * GET /api/comics/stats - Get collection statistics
 */

import { MongoClient } from 'mongodb'

let client
let db

async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    client = new MongoClient(process.env.MONGODB_URI)
    await client.connect()
    db = client.db('comic-collection')
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    const totalDocuments = await collection.countDocuments()
    const stats = await database.stats()
    
    // Get source breakdown
    const sourceBreakdown = await collection.aggregate([
      {
        $group: {
          _id: '$coverSource',
          count: { $sum: 1 }
        }
      }
    ]).toArray()
    
    const sourceBreakdownObj = sourceBreakdown.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count
      return acc
    }, {})
    
    // Get series breakdown
    const seriesBreakdown = await collection.aggregate([
      {
        $group: {
          _id: '$series',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]).toArray()
    
    // Get publisher breakdown
    const publisherBreakdown = await collection.aggregate([
      {
        $group: {
          _id: '$publisher',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray()
    
    // Get year range
    const yearStats = await collection.aggregate([
      {
        $match: {
          year: { $exists: true, $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: null,
          minYear: { $min: "$year" },
          maxYear: { $max: "$year" }
        }
      }
    ]).toArray()
    
    return res.status(200).json({
      success: true,
      stats: {
        totalDocuments,
        storageSize: stats.storageSize || 0,
        sourceBreakdown: sourceBreakdownObj,
        topSeries: seriesBreakdown.map(item => ({
          series: item._id,
          count: item.count
        })),
        publishers: publisherBreakdown.map(item => ({
          publisher: item._id,
          count: item.count
        })),
        yearRange: yearStats.length > 0 ? {
          earliest: yearStats[0].minYear,
          latest: yearStats[0].maxYear
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