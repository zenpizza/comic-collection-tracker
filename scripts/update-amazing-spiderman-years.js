/**
 * Update year for The Amazing Spider-Man issues based on issue number ranges
 * - Issues 274-283 -> 1986
 * - Issues 284-295 -> 1987
 * - Issues 296+ -> 1988
 * 
 * Run with: node scripts/update-amazing-spiderman-years.js
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

// Load .env.local for production MongoDB Atlas connection
dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function updateAmazingSpiderManYears() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Define the year ranges
    const ranges = [
      { min: 274, max: 283, year: 1986 },
      { min: 284, max: 295, year: 1987 },
      { min: 296, max: 9999, year: 1988 } // Using 9999 as "and up"
    ]

    console.log('\nUpdating The Amazing Spider-Man issue years:\n')

    let totalUpdated = 0

    for (const range of ranges) {
      // Find comics in this range
      // Handle both string and number issue numbers
      const query = {
        series: 'The Amazing Spider-Man',
        $or: [
          { issueNumber: { $gte: range.min, $lte: range.max } },
          { issueNumber: { $gte: String(range.min), $lte: String(range.max) } }
        ]
      }

      // Get comics to show what will be updated
      const comicsInRange = await comicsCollection.find({
        series: 'The Amazing Spider-Man'
      }).toArray()

      // Filter by issue number (handle both string and number)
      const filtered = comicsInRange.filter(comic => {
        const issueNum = parseInt(comic.issueNumber)
        return !isNaN(issueNum) && issueNum >= range.min && issueNum <= range.max
      })

      if (filtered.length === 0) {
        console.log(`Issues ${range.min}-${range.max === 9999 ? 'up' : range.max} -> ${range.year}: No comics found`)
        continue
      }

      console.log(`Issues ${range.min}-${range.max === 9999 ? 'up' : range.max} -> ${range.year}:`)
      console.log(`  Found ${filtered.length} comics`)
      
      // Show first few examples
      const examples = filtered.slice(0, 5)
      examples.forEach(comic => {
        console.log(`    - Issue #${comic.issueNumber} (current year: ${comic.year || 'not set'})`)
      })
      if (filtered.length > 5) {
        console.log(`    ... and ${filtered.length - 5} more`)
      }

      // Update all comics in this range
      const comicIds = filtered.map(c => c._id)
      const result = await comicsCollection.updateMany(
        { _id: { $in: comicIds } },
        { 
          $set: { 
            year: range.year,
            updatedAt: new Date().toISOString()
          } 
        }
      )

      console.log(`  ✓ Updated ${result.modifiedCount} comics\n`)
      totalUpdated += result.modifiedCount
    }

    console.log(`\n✅ Total updated: ${totalUpdated} comics`)

    // Verification
    console.log('\nVerification:')
    const allAmazingSpiderMan = await comicsCollection
      .find({ series: 'The Amazing Spider-Man' })
      .sort({ issueNumber: 1 })
      .toArray()

    const byYear = {}
    allAmazingSpiderMan.forEach(comic => {
      const issueNum = parseInt(comic.issueNumber)
      if (!isNaN(issueNum) && issueNum >= 274) {
        const year = comic.year || 'not set'
        if (!byYear[year]) byYear[year] = []
        byYear[year].push(issueNum)
      }
    })

    Object.keys(byYear).sort().forEach(year => {
      const issues = byYear[year].sort((a, b) => a - b)
      console.log(`  ${year}: ${issues.length} issues (${issues[0]}-${issues[issues.length - 1]})`)
    })

  } catch (error) {
    console.error('Error updating comics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

updateAmazingSpiderManYears()
