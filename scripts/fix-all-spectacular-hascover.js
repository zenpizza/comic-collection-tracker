/**
 * Fix hasCover flag for ALL The Spectacular Spider-Man issues
 * Run with: node scripts/fix-all-spectacular-hascover.js
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

async function fixAllSpectacularHasCover() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')

    // Find ALL The Spectacular Spider-Man comics
    const query = {
      series: 'The Spectacular Spider-Man'
    }

    const comics = await comicsCollection.find(query).sort({ issueNumber: 1 }).toArray()
    
    console.log(`\nFound ${comics.length} Spectacular Spider-Man comics to check\n`)

    if (comics.length === 0) {
      console.log('No comics found.')
      return
    }

    const updates = []
    const correct = []
    
    for (const comic of comics) {
      // Check if cover image exists in cover_images collection
      const coverImage = await coverImagesCollection.findOne({ comicId: comic._id.toString() })
      
      const shouldHaveCover = !!coverImage
      const currentHasCover = comic.hasCover || false
      
      if (shouldHaveCover !== currentHasCover) {
        updates.push({
          comicId: comic._id,
          issueNumber: comic.issueNumber,
          shouldHaveCover,
          currentHasCover
        })
      } else {
        correct.push({
          issueNumber: comic.issueNumber,
          hasCover: currentHasCover
        })
      }
    }

    console.log(`✓ ${correct.length} comics have correct hasCover flags`)
    console.log(`⚠️  ${updates.length} comics need fixing\n`)

    if (updates.length === 0) {
      console.log('All hasCover flags are correct!')
      return
    }

    console.log('Comics that need fixing:')
    updates.forEach(update => {
      console.log(`  Issue #${update.issueNumber}: hasCover=${update.currentHasCover} → ${update.shouldHaveCover}`)
    })

    console.log('\nUpdating...')

    let updatedCount = 0
    for (const update of updates) {
      const result = await comicsCollection.updateOne(
        { _id: update.comicId },
        { $set: { hasCover: update.shouldHaveCover } }
      )
      
      if (result.modifiedCount > 0) {
        updatedCount++
      }
    }

    console.log(`\n✅ Update complete! Fixed ${updatedCount} comics`)

    // Final verification
    console.log('\nFinal verification:')
    const verifiedComics = await comicsCollection.find(query).sort({ issueNumber: 1 }).toArray()
    
    let allCorrect = true
    for (const comic of verifiedComics) {
      const coverImage = await coverImagesCollection.findOne({ comicId: comic._id.toString() })
      const hasActualCover = !!coverImage
      const hasCoverFlag = comic.hasCover || false
      
      if (hasActualCover !== hasCoverFlag) {
        console.log(`  ✗ Issue #${comic.issueNumber}: STILL INCORRECT - hasCover=${hasCoverFlag}, actualCover=${hasActualCover}`)
        allCorrect = false
      }
    }
    
    if (allCorrect) {
      console.log(`  ✓ All ${verifiedComics.length} comics now have correct hasCover flags!`)
    }

  } catch (error) {
    console.error('Error fixing hasCover flags:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

fixAllSpectacularHasCover()
