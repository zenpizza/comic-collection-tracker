/**
 * Remove legacyId field from all comics
 * This field was used during ObjectId migration and is no longer needed
 * Run with: node scripts/remove-legacy-id.js
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

async function removeLegacyId() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Find all comics with legacyId field
    const query = { legacyId: { $exists: true } }

    // First, count how many will be updated
    const count = await comicsCollection.countDocuments(query)
    console.log(`\nFound ${count} comics with legacyId field`)

    if (count === 0) {
      console.log('No comics to update.')
      return
    }

    // Show some examples of comics that will be updated
    const examples = await comicsCollection.find(query).limit(5).toArray()
    console.log('\nExamples of comics with legacyId:')
    examples.forEach((comic, index) => {
      console.log(`  ${index + 1}. ${comic.series} #${comic.issueNumber} - legacyId: ${comic.legacyId}`)
    })

    // Perform the update
    console.log('\nRemoving legacyId field...')
    const result = await comicsCollection.updateMany(
      query,
      { 
        $unset: { legacyId: '' },
        $set: { updatedAt: new Date().toISOString() }
      }
    )

    console.log(`\n✅ Update complete!`)
    console.log(`   Matched: ${result.matchedCount}`)
    console.log(`   Modified: ${result.modifiedCount}`)

    // Verify the update
    const remainingCount = await comicsCollection.countDocuments(query)
    if (remainingCount > 0) {
      console.log(`\n⚠️  Warning: ${remainingCount} comics still have legacyId field`)
    } else {
      console.log('\n✓ All legacyId fields have been removed')
    }

  } catch (error) {
    console.error('Error updating comics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

removeLegacyId()
