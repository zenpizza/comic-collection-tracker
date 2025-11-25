/**
 * Update year for Fantastic Four issues based on issue number ranges
 * - Issues 295-297 -> 1986
 * - Issues 298-309 -> 1987
 * - Issues 310-321 -> 1988
 * - Issues 322-334 -> 1989
 * - Issues 335-347 -> 1990
 * - Issues 348-359 -> 1991
 * 
 * Run with: node scripts/update-fantastic-four-years.js
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

async function updateFantasticFourYears() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Define the year ranges
    const ranges = [
      { min: 295, max: 297, year: 1986 },
      { min: 298, max: 309, year: 1987 },
      { min: 310, max: 321, year: 1988 },
      { min: 322, max: 334, year: 1989 },
      { min: 335, max: 347, year: 1990 },
      { min: 348, max: 359, year: 1991 }
    ]

    console.log('\nUpdating Fantastic Four issue years:\n')

    let totalUpdated = 0

    for (const range of ranges) {
      // Get all Fantastic Four comics
      const comicsInRange = await comicsCollection.find({
        series: 'Fantastic Four'
      }).toArray()

      // Filter by issue number (handle both string and number)
      const filtered = comicsInRange.filter(comic => {
        const issueNum = parseInt(comic.issueNumber)
        return !isNaN(issueNum) && issueNum >= range.min && issueNum <= range.max
      })

      if (filtered.length === 0) {
        console.log(`Issues ${range.min}-${range.max} -> ${range.year}: No comics found`)
        continue
      }

      console.log(`Issues ${range.min}-${range.max} -> ${range.year}:`)
      console.log(`  Found ${filtered.length} comics`)
      
      // Show all examples (likely small numbers)
      filtered.forEach(comic => {
        console.log(`    - Issue #${comic.issueNumber} (current year: ${comic.year || 'not set'})`)
      })

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
    console.log('\nVerification - All Fantastic Four comics with years:')
    const allFantasticFour = await comicsCollection
      .find({ series: 'Fantastic Four' })
      .sort({ issueNumber: 1 })
      .toArray()

    const byYear = {}
    allFantasticFour.forEach(comic => {
      const issueNum = parseInt(comic.issueNumber)
      if (!isNaN(issueNum)) {
        const year = comic.year || 'not set'
        if (!byYear[year]) byYear[year] = []
        byYear[year].push(issueNum)
      }
    })

    Object.keys(byYear).sort().forEach(year => {
      const issues = byYear[year].sort((a, b) => a - b)
      console.log(`  ${year}: ${issues.length} issues (${issues.join(', ')})`)
    })

  } catch (error) {
    console.error('Error updating comics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

updateFantasticFourYears()
