/**
 * Update year for The Avengers issues based on issue number ranges
 * - Issues 268-274 -> 1986
 * - Issues 275-286 -> 1987
 * - Issues 287-298 -> 1988
 * 
 * Run with: node scripts/update-avengers-years.js
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

async function updateAvengersYears() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Define the year ranges
    const ranges = [
      { min: 268, max: 274, year: 1986 },
      { min: 275, max: 286, year: 1987 },
      { min: 287, max: 298, year: 1988 }
    ]

    console.log('\nUpdating The Avengers issue years:\n')

    let totalUpdated = 0

    for (const range of ranges) {
      // Get all Avengers comics
      const allAvengers = await comicsCollection.find({
        series: 'The Avengers'
      }).toArray()

      // Filter by issue number (handle both string and number)
      const filtered = allAvengers.filter(comic => {
        const issueNum = parseInt(comic.issueNumber)
        return !isNaN(issueNum) && issueNum >= range.min && issueNum <= range.max
      })

      if (filtered.length === 0) {
        console.log(`Issues ${range.min}-${range.max} -> ${range.year}: No comics found`)
        continue
      }

      console.log(`Issues ${range.min}-${range.max} -> ${range.year}:`)
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
    const allAvengers = await comicsCollection
      .find({ series: 'The Avengers' })
      .sort({ issueNumber: 1 })
      .toArray()

    const byYear = {}
    allAvengers.forEach(comic => {
      const issueNum = parseInt(comic.issueNumber)
      if (!isNaN(issueNum) && issueNum >= 268) {
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

updateAvengersYears()
