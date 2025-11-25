/**
 * Data Cleanup Script: Sync Cover Flags
 * 
 * This script fixes comics that have cover images in the cover_images collection
 * but have incorrect hasCover flags or missing cover metadata in their comic documents.
 * 
 * Run with: node scripts/sync-cover-flags.js
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function syncCoverFlags() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    // Get all comics
    const comics = await comicsCollection.find({}).toArray()
    console.log(`\n📚 Found ${comics.length} comics to check`)
    
    let fixedCount = 0
    let alreadyCorrect = 0
    let missingCovers = 0
    
    for (const comic of comics) {
      // Handle both _id formats: numeric or ObjectId
      // Some comics have ObjectId _id but also have a numeric 'id' field
      const comicId = comic._id
      const numericId = comic.id || comicId
      
      // Check if cover image exists in cover_images collection
      // Note: comicId in cover_images is stored as a number
      // Try both the _id and the id field
      let coverImage = await coverImagesCollection.findOne({ comicId: comicId })
      if (!coverImage && comic.id) {
        coverImage = await coverImagesCollection.findOne({ comicId: comic.id })
      }
      
      if (coverImage) {
        // Comic has a cover image, check if flags are correct
        const needsUpdate = 
          !comic.hasCover || 
          !comic.coverId || 
          !comic.coverSource ||
          !comic.coverLastUpdated
        
        if (needsUpdate) {
          // Update the comic document with correct cover metadata
          // Use the numeric id that matches the cover_images.comicId
          const updateData = {
            coverId: coverImage.comicId, // Use the comicId from cover_images to ensure consistency
            coverUrl: null, // Never persist blob URLs
            hasCover: true,
            coverSource: coverImage.source || 'api',
            coverSourceProvider: coverImage.sourceDetails?.apiProvider || coverImage.sourceDetails?.provider || null,
            coverOriginalUrl: coverImage.originalUrl || null,
            coverLastUpdated: coverImage.lastUpdated || new Date().toISOString(),
            coverAttribution: coverImage.attribution || null
          }
          
          await comicsCollection.updateOne(
            { _id: comicId },
            { $set: updateData }
          )
          
          fixedCount++
          console.log(`✅ Fixed: ${comic.series} #${comic.issueNumber} (ID: ${comicId})`)
          console.log(`   - Set hasCover: true`)
          console.log(`   - Set coverSource: ${updateData.coverSource}`)
          if (updateData.coverSourceProvider) {
            console.log(`   - Set coverSourceProvider: ${updateData.coverSourceProvider}`)
          }
        } else {
          alreadyCorrect++
        }
      } else {
        // No cover image found
        if (comic.hasCover) {
          // Comic claims to have a cover but doesn't - fix it
          await comicsCollection.updateOne(
            { _id: comicId },
            { 
              $set: { 
                hasCover: false,
                coverId: null,
                coverUrl: null,
                coverSource: null,
                coverSourceProvider: null,
                coverOriginalUrl: null,
                coverLastUpdated: null,
                coverAttribution: null
              } 
            }
          )
          
          fixedCount++
          console.log(`🔧 Fixed false positive: ${comic.series} #${comic.issueNumber} (ID: ${comicId})`)
          console.log(`   - Set hasCover: false (no cover image found)`)
        } else {
          missingCovers++
        }
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 Sync Complete!')
    console.log('='.repeat(60))
    console.log(`✅ Fixed: ${fixedCount} comics`)
    console.log(`✓  Already correct: ${alreadyCorrect} comics`)
    console.log(`📄 Missing covers: ${missingCovers} comics`)
    console.log(`📚 Total processed: ${comics.length} comics`)
    
  } catch (error) {
    console.error('❌ Error syncing cover flags:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the script
syncCoverFlags()
