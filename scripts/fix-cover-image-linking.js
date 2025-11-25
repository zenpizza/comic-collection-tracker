/**
 * Fix cover_images collection to link properly with comics using ObjectId
 * 
 * Problem: Comics now have ObjectId _id, but cover_images still reference old numeric IDs
 * Solution: Update cover_images.comicId to use ObjectId string representation
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function fixCoverImageLinking() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    // Get all cover images
    const coverImages = await coverImagesCollection.find({}).toArray()
    console.log(`Found ${coverImages.length} cover images\n`)
    
    if (coverImages.length === 0) {
      console.log('No cover images to migrate')
      return
    }
    
    let updated = 0
    let notFound = 0
    let alreadyCorrect = 0
    
    for (const coverImage of coverImages) {
      const oldComicId = coverImage.comicId
      
      // Check if comicId is already an ObjectId string (24 hex characters)
      if (typeof oldComicId === 'string' && /^[0-9a-f]{24}$/i.test(oldComicId)) {
        console.log(`✓ Cover image ${coverImage._id} already has ObjectId format`)
        alreadyCorrect++
        continue
      }
      
      // Try to find the comic by legacyId (most likely match)
      let comic = await comicsCollection.findOne({ legacyId: oldComicId })
      
      // If not found, try by 'id' field
      if (!comic) {
        comic = await comicsCollection.findOne({ id: oldComicId })
      }
      
      // If not found, try by _id (in case it's numeric)
      if (!comic && typeof oldComicId === 'number') {
        comic = await comicsCollection.findOne({ _id: oldComicId })
      }
      
      // If still not found, try string version as number
      if (!comic && typeof oldComicId === 'string') {
        const numericId = parseFloat(oldComicId)
        if (!isNaN(numericId)) {
          comic = await comicsCollection.findOne({ 
            $or: [
              { legacyId: numericId },
              { id: numericId },
              { _id: numericId }
            ]
          })
        }
      }
      
      if (!comic) {
        console.log(`✗ Could not find comic for cover image ${coverImage._id} (comicId: ${oldComicId})`)
        notFound++
        continue
      }
      
      // Update cover image with new ObjectId string
      const newComicId = comic._id.toString()
      
      await coverImagesCollection.updateOne(
        { _id: coverImage._id },
        { $set: { comicId: newComicId } }
      )
      
      console.log(`✓ Updated cover ${coverImage._id}: ${oldComicId} → ${newComicId}`)
      updated++
    }
    
    console.log(`\n${'='.repeat(70)}`)
    console.log('Migration Complete!')
    console.log(`${'='.repeat(70)}`)
    console.log(`Updated: ${updated}`)
    console.log(`Already correct: ${alreadyCorrect}`)
    console.log(`Not found: ${notFound}`)
    console.log(`Total: ${coverImages.length}`)
    
  } catch (error) {
    console.error('Migration error:', error)
    throw error
  } finally {
    await client.close()
    console.log('\nDisconnected from MongoDB')
  }
}

fixCoverImageLinking().catch(console.error)
