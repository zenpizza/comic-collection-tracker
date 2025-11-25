/**
 * Check what types of _id fields exist in the database
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function checkIdTypes() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const collection = db.collection('comics')
    
    // Get all comics
    const allComics = await collection.find({}).limit(10).toArray()
    
    console.log(`Total comics found: ${allComics.length}\n`)
    
    if (allComics.length > 0) {
      console.log('Sample comic IDs:')
      console.log('='.repeat(60))
      
      allComics.forEach((comic, index) => {
        console.log(`\nComic ${index + 1}:`)
        console.log(`  _id: ${comic._id}`)
        console.log(`  _id type: ${typeof comic._id}`)
        console.log(`  _id constructor: ${comic._id.constructor.name}`)
        console.log(`  Series: ${comic.series} #${comic.issueNumber}`)
      })
      
      // Count by type
      const numericCount = await collection.countDocuments({
        _id: { $type: 'number' }
      })
      
      const doubleCount = await collection.countDocuments({
        _id: { $type: 'double' }
      })
      
      const objectIdCount = await collection.countDocuments({
        _id: { $type: 'objectId' }
      })
      
      const stringCount = await collection.countDocuments({
        _id: { $type: 'string' }
      })
      
      console.log('\n\nID Type Counts:')
      console.log('='.repeat(60))
      console.log(`Numeric (int): ${numericCount}`)
      console.log(`Double (float): ${doubleCount}`)
      console.log(`ObjectId: ${objectIdCount}`)
      console.log(`String: ${stringCount}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

checkIdTypes()
