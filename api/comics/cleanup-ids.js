/**
 * ID cleanup endpoint - standardizes all comic IDs to numbers
 * POST /api/comics/cleanup-ids - Convert all string IDs to numbers
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const database = await connectToDatabase()
    const collection = database.collection('comics')

    // Find all comics with string IDs that can be converted to numbers
    const allComics = await collection.find({}).toArray()
    console.log(`Found ${allComics.length} total comics to check`)

    let convertedCount = 0
    const operations = []

    allComics.forEach(comic => {
      if (comic.id !== undefined && comic.id !== null) {
        const currentId = comic.id
        const currentType = typeof currentId

        // Try to convert to number if it's a string that represents a valid number
        if (currentType === 'string' && !isNaN(currentId) && !isNaN(parseFloat(currentId))) {
          const numericId = Number(currentId)

          // Only convert if it's a safe integer and different from current value
          if (Number.isSafeInteger(numericId) && numericId !== currentId) {
            operations.push({
              updateOne: {
                filter: { _id: comic._id },
                update: {
                  $set: {
                    id: numericId,
                    updatedAt: new Date().toISOString()
                  }
                }
              }
            })
            convertedCount++
            console.log(`Converting ID: "${currentId}" (${currentType}) → ${numericId} (number)`)
          }
        }
        // Convert numbers stored as strings back to numbers
        else if (currentType === 'number' && String(currentId) !== currentId) {
          // This handles cases where numbers might have been stored inconsistently
          operations.push({
            updateOne: {
              filter: { _id: comic._id },
              update: {
                $set: {
                  id: Number(currentId),
                  updatedAt: new Date().toISOString()
                }
              }
            }
          })
          convertedCount++
        }
      }

      // Also normalize year field to number
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
    const idTypes = {
      numbers: 0,
      strings: 0,
      other: 0
    }
    const yearTypes = {
      numbers: 0,
      strings: 0,
      empty: 0,
      other: 0
    }

    finalComics.forEach(comic => {
      // Count ID types
      if (comic.id !== undefined && comic.id !== null) {
        const type = typeof comic.id
        if (type === 'number') {
          idTypes.numbers++
        } else if (type === 'string') {
          idTypes.strings++
        } else {
          idTypes.other++
        }
      }

      // Count year types
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
      message: `ID cleanup completed: ${convertedCount} IDs converted to numbers`,
      stats: {
        totalComics: allComics.length,
        idsConverted: convertedCount,
        finalIdTypes: idTypes,
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