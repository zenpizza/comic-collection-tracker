/**
 * Cleanup duplicate comics (ObjectId versions)
 */

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function cleanupDuplicates() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    
    const objectIdComics = await comicsCollection.find({ 
      _id: { $type: 'objectId' } 
    }).toArray()
    
    console.log(`Found ${objectIdComics.length} ObjectId comics to clean up\n`)
    
    let deleted = 0
    
    for (const comic of objectIdComics) {
      // Verify numeric version exists
      const numericVersion = await comicsCollection.findOne({ _id: comic.id })
      
      if (numericVersion && 
          comic.series === numericVersion.series && 
          comic.issueNumber === numericVersion.issueNumber) {
        
        // Delete the ObjectId version
        await comicsCollection.deleteOne({ _id: comic._id })
        
        console.log(`✅ Deleted duplicate: ${comic.series} #${comic.issueNumber}`)
        console.log(`   Removed ObjectId: ${comic._id}`)
        console.log(`   Kept numeric: ${numericVersion._id}`)
        
        deleted++
      } else {
        console.log(`⚠️  Skipped ${comic.series} #${comic.issueNumber} - no matching numeric version`)
      }
    }
    
    console.log(`\n✅ Deleted ${deleted} duplicate comics`)
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

cleanupDuplicates()
