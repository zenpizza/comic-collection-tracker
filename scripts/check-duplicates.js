/**
 * Check for duplicate comics that blocked migration
 */

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function checkDuplicates() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    
    // Check for remaining ObjectId comics
    const objectIdComics = await comicsCollection.find({ 
      _id: { $type: 'objectId' } 
    }).toArray()
    
    console.log(`Found ${objectIdComics.length} remaining ObjectId comics:\n`)
    
    for (const comic of objectIdComics) {
      console.log(`📚 ${comic.series} #${comic.issueNumber}`)
      console.log(`   ObjectId _id: ${comic._id}`)
      console.log(`   Numeric id: ${comic.id}`)
      
      // Find the numeric version
      const numericVersion = await comicsCollection.findOne({ _id: comic.id })
      
      if (numericVersion) {
        console.log(`   ⚠️  Numeric version exists:`)
        console.log(`      _id: ${numericVersion._id}`)
        console.log(`      series: ${numericVersion.series} #${numericVersion.issueNumber}`)
        console.log(`      hasCover: ${numericVersion.hasCover}`)
        console.log(`      dateAdded: ${numericVersion.dateAdded}`)
        console.log(`\n   📊 Comparison:`)
        console.log(`      Same series/issue: ${comic.series === numericVersion.series && comic.issueNumber === numericVersion.issueNumber}`)
        console.log(`      ObjectId has cover: ${comic.hasCover}`)
        console.log(`      Numeric has cover: ${numericVersion.hasCover}`)
        console.log(`\n   💡 Recommendation: Delete ObjectId version (duplicate)`)
      }
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

checkDuplicates()
