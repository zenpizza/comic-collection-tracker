/**
 * Update year for Transformers issues based on issue number ranges
 * - Issues 7-11 -> 1985
 * - Issues 12-23 -> 1986
 * - Issues 24-35 -> 1987
 * - Issues 36-47 -> 1988
 * - Issues 48-60 -> 1989
 * - Issues 62-73 -> 1990
 * 
 * Run with: node scripts/update-transformers-years.js
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

async function updateTransformersYears() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Define the year ranges
    const ranges = [
      { min: 7, max: 11, year: 1985 },
      { min: 12, max: 23, year: 1986 },
      { min: 24, max: 35, year: 1987 },
      { min: 36, max: 47, year: 1988 },
      { min: 48, max: 60, year: 1989 },
      { min: 62, max: 73, year: 1990 }
    ]

    console.log('\nUpdating Transformers issue years:\n')

    let totalUpdated = 0

    for (const range of ranges) {
      // Get all Transformers comics
      const comicsInRange = await comicsCollection.find({
        series: 'Transformers'
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
    console.log('\nVerification - All Transformers comics with years:')
    const allTransformers = await comicsCollection
      .find({ series: 'Transformers' })
      .sort({ issueNumber: 1 })
      .toArray()

    const byYear = {}
    allTransformers.forEach(comic => {
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

updateTransformersYears()
