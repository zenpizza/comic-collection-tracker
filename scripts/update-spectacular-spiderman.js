/**
 * Update series name from "Spectacular Spider-Man" to "The Spectacular Spider-Man"
 * Run with: node scripts/update-spectacular-spiderman.js
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

async function updateSpectacularSpiderMan() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')

    // Find all comics with "Spectacular Spider-Man" (without "The")
    const query = { series: 'Spectacular Spider-Man' }
    
    // First, count how many will be updated
    const count = await comicsCollection.countDocuments(query)
    console.log(`\nFound ${count} comics with series "Spectacular Spider-Man"`)

    if (count === 0) {
      console.log('No comics to update.')
      return
    }

    // Show the comics that will be updated
    const comicsToUpdate = await comicsCollection.find(query).toArray()
    console.log('\nComics to be updated:')
    comicsToUpdate.forEach((comic, index) => {
      console.log(`  ${index + 1}. Issue #${comic.issueNumber} (ID: ${comic._id})`)
    })

    // Perform the update
    console.log('\nUpdating series name...')
    const result = await comicsCollection.updateMany(
      query,
      { $set: { series: 'The Spectacular Spider-Man' } }
    )

    console.log(`\n✅ Update complete!`)
    console.log(`   Matched: ${result.matchedCount}`)
    console.log(`   Modified: ${result.modifiedCount}`)

    // Verify the update
    const verifyCount = await comicsCollection.countDocuments({ 
      series: 'The Spectacular Spider-Man' 
    })
    console.log(`\nVerification: ${verifyCount} comics now have series "The Spectacular Spider-Man"`)

  } catch (error) {
    console.error('Error updating comics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

updateSpectacularSpiderMan()
