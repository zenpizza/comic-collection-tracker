/**
 * Year cleanup endpoint - standardizes comicMetadata.year to numbers
 * POST /api/comics/cleanup-ids - Convert string years to numbers
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const database = await connectToDatabase()
    // Canonical comic data (and its year field) now lives in the shared
    // comicMetadata collection — there is no separate numeric `id` field
    // to clean up anymore; documents are identified by MongoDB ObjectId.
    const collection = database.collection('comicMetadata')

    const allComics = await collection.find({}).toArray()
    console.log(`Found ${allComics.length} total metadata records to check`)

    let convertedCount = 0
    const operations = []

    allComics.forEach(comic => {
      // Normalize year field to number
      if (comic.year !== undefined && comic.year !== null && comic.year !== '') {
        const currentYearType = typeof comic.year
        if (currentYearType === 'string' && !isNaN(comic.year) && !isNaN(parseFloat(comic.year))) {
          const numericYear = Number(comic.year)
          // Validate it's a reasonable year (1900-2100)
          if (Number.isInteger(numericYear) && numericYear >= 1900 && numericYear <= 2100 && numericYear !== comic.year) {
            operations.push({
              updateOne: {
                filter: { _id: comic._id },
                update: {
                  $set: {
                    year: numericYear,
                    updatedAt: new Date().toISOString()
                  }
                }
              }
            })
            convertedCount++
            console.log(`Converting year: "${comic.year}" (${currentYearType}) → ${numericYear} (number)`)
          }
        }
      }
    })

    console.log(`Found ${convertedCount} comics that need ID conversion`)

    // Execute bulk update if there are operations
    let updateResult = null
    if (operations.length > 0) {
      updateResult = await collection.bulkWrite(operations)
      console.log(`Updated ${updateResult.modifiedCount} records`)
    }

    // Get final statistics
    const finalComics = await collection.find({}).toArray()
    const yearTypes = {
      numbers: 0,
      strings: 0,
      empty: 0,
      other: 0
    }

    finalComics.forEach(comic => {
      if (comic.year === undefined || comic.year === null || comic.year === '') {
        yearTypes.empty++
      } else {
        const yearType = typeof comic.year
        if (yearType === 'number') {
          yearTypes.numbers++
        } else if (yearType === 'string') {
          yearTypes.strings++
        } else {
          yearTypes.other++
        }
      }
    })

    return res.status(200).json({
      success: true,
      message: `Year cleanup completed: ${convertedCount} records converted to numeric years`,
      stats: {
        totalComics: allComics.length,
        yearsConverted: convertedCount,
        finalYearTypes: yearTypes
      },
      updateDetails: updateResult ? {
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount
      } : null
    })

  } catch (error) {
    console.error('ID cleanup error:', error)
    return res.status(500).json({
      success: false,
      error: 'ID cleanup failed',
      details: error.message
    })
  }
}