/**
 * Update year for The Spectacular Spider-Man issues 139-143 to 1988
 * Run with: node scripts/update-spectacular-year.js
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

async function updateSpectacularYears() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Find The Spectacular Spider-Man issues 139-143
    // Try both string and number formats since issueNumber can be either
    const query = {
      series: 'The Spectacular Spider-Man',
      issueNumber: { $in: [139, 140, 141, 142, 143, '139', '140', '141', '142', '143'] }
    }

    // First, count and show what will be updated
    const count = await comicsCollection.countDocuments(query)
    console.log(`\nFound ${count} issues to update`)

    if (count === 0) {
      console.log('No comics to update.')
      return
    }

    // Show the comics that will be updated
    const comicsToUpdate = await comicsCollection.find(query).sort({ issueNumber: 1 }).toArray()
    console.log('\nComics to be updated:')
    comicsToUpdate.forEach((comic, index) => {
      console.log(`  ${index + 1}. Issue #${comic.issueNumber} - Current year: ${comic.year || 'not set'}`)
    })

    // Perform the update
    console.log('\nUpdating year to 1988...')
    const result = await comicsCollection.updateMany(
      query,
      { $set: { year: 1988 } }
    )

    console.log(`\n✅ Update complete!`)
    console.log(`   Matched: ${result.matchedCount}`)
    console.log(`   Modified: ${result.modifiedCount}`)

    // Verify the update
    const verifiedComics = await comicsCollection
      .find(query)
      .sort({ issueNumber: 1 })
      .toArray()

    console.log('\nVerification - Updated comics:')
    verifiedComics.forEach((comic, index) => {
      console.log(`  ${index + 1}. Issue #${comic.issueNumber} - Year: ${comic.year}`)
    })

  } catch (error) {
    console.error('Error updating comics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

updateSpectacularYears()
