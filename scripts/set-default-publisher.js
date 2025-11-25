/**
 * Set publisher to "Marvel" for all comics without a publisher
 * Run with: node scripts/set-default-publisher.js
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

async function setDefaultPublisher() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Find all comics without a publisher (null, undefined, or empty string)
    const query = {
      $or: [
        { publisher: { $exists: false } },
        { publisher: null },
        { publisher: '' }
      ]
    }

    // First, count how many will be updated
    const count = await comicsCollection.countDocuments(query)
    console.log(`\nFound ${count} comics without a publisher`)

    if (count === 0) {
      console.log('No comics to update.')
      return
    }

    // Show some examples of comics that will be updated
    const examples = await comicsCollection.find(query).limit(10).toArray()
    console.log('\nExamples of comics to be updated:')
    examples.forEach((comic, index) => {
      console.log(`  ${index + 1}. ${comic.series} #${comic.issueNumber} - Publisher: ${comic.publisher || '(not set)'}`)
    })

    // Perform the update
    console.log('\nUpdating publisher to "Marvel"...')
    const result = await comicsCollection.updateMany(
      query,
      { 
        $set: { 
          publisher: 'Marvel',
          updatedAt: new Date().toISOString()
        } 
      }
    )

    console.log(`\n✅ Update complete!`)
    console.log(`   Matched: ${result.matchedCount}`)
    console.log(`   Modified: ${result.modifiedCount}`)

    // Verify the update
    const verifyCount = await comicsCollection.countDocuments({ publisher: 'Marvel' })
    console.log(`\nVerification: ${verifyCount} comics now have publisher "Marvel"`)

    // Check if any comics still don't have a publisher
    const remainingWithoutPublisher = await comicsCollection.countDocuments(query)
    if (remainingWithoutPublisher > 0) {
      console.log(`\n⚠️  Warning: ${remainingWithoutPublisher} comics still don't have a publisher`)
    } else {
      console.log('\n✓ All comics now have a publisher set')
    }

  } catch (error) {
    console.error('Error updating comics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

setDefaultPublisher()
