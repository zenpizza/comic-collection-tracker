/**
 * Migration script to convert numeric _id fields to MongoDB ObjectId
 * 
 * This script:
 * 1. Finds all comics with numeric _id fields
 * 2. Creates new documents with ObjectId _id
 * 3. Preserves old numeric ID in 'legacyId' field
 * 4. Deletes old documents
 */

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function migrateToObjectId() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('Connected to MongoDB')
    
    const db = client.db('comic-collection')
    const collection = db.collection('comics')
    
    // Find all comics with numeric _id
    const numericIdComics = await collection.find({
      _id: { $type: 'number' }
    }).toArray()
    
    console.log(`Found ${numericIdComics.length} comics with numeric _id`)
    
    if (numericIdComics.length === 0) {
      console.log('No comics to migrate')
      return
    }
    
    // Confirm migration
    console.log('\nThis will:')
    console.log('1. Create new documents with ObjectId _id')
    console.log('2. Preserve old numeric IDs in "legacyId" field')
    console.log('3. Delete old documents with numeric _id')
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...')
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    let migrated = 0
    let errors = 0
    
    for (const comic of numericIdComics) {
      try {
        const { _id: oldId, ...comicData } = comic
        
        // Create new document with ObjectId and preserve old ID
        const newComic = {
          ...comicData,
          legacyId: oldId,
          migratedAt: new Date().toISOString()
        }
        
        // Insert new document (MongoDB will auto-generate ObjectId)
        const result = await collection.insertOne(newComic)
        
        // Delete old document
        await collection.deleteOne({ _id: oldId })
        
        migrated++
        
        if (migrated % 100 === 0) {
          console.log(`Migrated ${migrated}/${numericIdComics.length} comics...`)
        }
      } catch (error) {
        console.error(`Error migrating comic ${comic._id}:`, error.message)
        errors++
      }
    }
    
    console.log(`\nMigration complete!`)
    console.log(`Successfully migrated: ${migrated}`)
    console.log(`Errors: ${errors}`)
    
    // Verify migration
    const remainingNumeric = await collection.countDocuments({
      _id: { $type: 'number' }
    })
    
    const objectIdCount = await collection.countDocuments({
      _id: { $type: 'objectId' }
    })
    
    console.log(`\nVerification:`)
    console.log(`Comics with numeric _id: ${remainingNumeric}`)
    console.log(`Comics with ObjectId _id: ${objectIdCount}`)
    
  } catch (error) {
    console.error('Migration error:', error)
    throw error
  } finally {
    await client.close()
    console.log('Disconnected from MongoDB')
  }
}

// Run migration
migrateToObjectId().catch(console.error)
