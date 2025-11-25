/**
 * Update years for Web of Spider-Man issues
 * 
 * Issue ranges:
 * 1-9: 1985
 * 10-21: 1986
 * 22-33: 1987
 * 34-43: 1988
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

const yearRanges = [
  { start: 1, end: 9, year: 1985 },
  { start: 10, end: 21, year: 1986 },
  { start: 22, end: 33, year: 1987 },
  { start: 34, end: 43, year: 1988 }
]

async function updateWebOfSpiderManYears() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // First, check what series names exist
    const seriesNames = await comicsCollection.distinct('series', {
      series: { $regex: /web.*spider/i }
    })

    console.log('\nFound series matching "Web of Spider-Man":')
    seriesNames.forEach(name => console.log(`  - "${name}"`))

    if (seriesNames.length === 0) {
      console.log('\n❌ No Web of Spider-Man series found')
      return
    }

    // Use the first matching series (or you can specify exact name)
    const seriesName = seriesNames[0]
    console.log(`\nUsing series: "${seriesName}"`)

    let totalUpdated = 0

    for (const range of yearRanges) {
      console.log(`\nProcessing issues #${range.start}-${range.end} (year: ${range.year})`)

      // Update using $or to handle both string and numeric issue numbers
      const result = await comicsCollection.updateMany(
        {
          series: seriesName,
          $or: [
            { issueNumber: { $gte: range.start, $lte: range.end } },
            { 
              issueNumber: { 
                $in: Array.from(
                  { length: range.end - range.start + 1 }, 
                  (_, i) => String(range.start + i)
                )
              }
            }
          ]
        },
        {
          $set: { year: range.year }
        }
      )

      console.log(`  ✅ Updated ${result.modifiedCount} issues`)
      totalUpdated += result.modifiedCount
    }

    console.log(`\n✅ Total updated: ${totalUpdated} issues`)

    // Verify the changes
    console.log('\nVerifying changes:')
    for (const range of yearRanges) {
      const comics = await comicsCollection.find({
        series: seriesName,
        $or: [
          { issueNumber: { $gte: range.start, $lte: range.end } },
          { 
            issueNumber: { 
              $in: Array.from(
                { length: range.end - range.start + 1 }, 
                (_, i) => String(range.start + i)
              )
            }
          }
        ]
      }).sort({ issueNumber: 1 }).toArray()

      console.log(`\nIssues #${range.start}-${range.end} (expected year: ${range.year}):`)
      comics.forEach(comic => {
        const status = comic.year === range.year ? '✅' : '❌'
        console.log(`  ${status} #${comic.issueNumber}: year = ${comic.year}`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the script
updateWebOfSpiderManYears()
