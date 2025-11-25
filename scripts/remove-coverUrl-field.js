/**
 * Remove deprecated coverUrl field from comics collection
 * 
 * The coverUrl field is deprecated and always null.
 * Use hasCover field instead to check if a comic has a cover.
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function removeCoverUrlField() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const collection = db.collection('comics')
    
    // Check how many comics have the coverUrl field
    const totalComics = await collection.countDocuments({})
    const withCoverUrl = await collection.countDocuments({ coverUrl: { $exists: true } })
    
    console.log(`Total comics: ${totalComics}`)
    console.log(`Comics with coverUrl field: ${withCoverUrl}\n`)
    
    if (withCoverUrl === 0) {
      console.log('No comics have coverUrl field. Nothing to clean up.')
      return
    }
    
    // Show sample values
    const samples = await collection.find({ coverUrl: { $exists: true } }).limit(5).toArray()
    console.log('Sample coverUrl values:')
    samples.forEach((comic, i) => {
      console.log(`  ${i + 1}. ${comic.series} #${comic.issueNumber}: coverUrl = ${JSON.stringify(comic.coverUrl)}`)
    })
    
    console.log('\nRemoving coverUrl field from all comics...')
    
    // Remove the coverUrl field
    const result = await collection.updateMany(
      { coverUrl: { $exists: true } },
      { $unset: { coverUrl: "" } }
    )
    
    console.log(`\n✅ Successfully removed coverUrl field from ${result.modifiedCount} comics`)
    
    // Verify
    const remaining = await collection.countDocuments({ coverUrl: { $exists: true } })
    console.log(`Remaining comics with coverUrl field: ${remaining}`)
    
  } catch (error) {
    console.error('Error:', error)
    throw error
  } finally {
    await client.close()
    console.log('\nDisconnected from MongoDB')
  }
}

removeCoverUrlField().catch(console.error)
