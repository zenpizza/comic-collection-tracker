/**
 * Fix hasCover flag for The Spectacular Spider-Man issues 118-122
 * Run with: node scripts/fix-spectacular-hascover.js
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

async function fixHasCoverFlags() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')

    // Find The Spectacular Spider-Man issues 124-137
    const issueNumbers = []
    for (let i = 124; i <= 137; i++) {
      issueNumbers.push(i, i.toString())
    }
    
    const query = {
      series: 'The Spectacular Spider-Man',
      issueNumber: { $in: issueNumbers }
    }

    const comics = await comicsCollection.find(query).sort({ issueNumber: 1 }).toArray()
    
    console.log(`\nFound ${comics.length} comics to check`)

    if (comics.length === 0) {
      console.log('No comics found.')
      return
    }

    console.log('\nChecking cover status for each comic:')
    
    const updates = []
    
    for (const comic of comics) {
      // Check if cover image exists in cover_images collection
      const coverImage = await coverImagesCollection.findOne({ comicId: comic._id.toString() })
      
      const shouldHaveCover = !!coverImage
      const currentHasCover = comic.hasCover || false
      
      console.log(`  Issue #${comic.issueNumber}:`)
      console.log(`    - Current hasCover: ${currentHasCover}`)
      console.log(`    - Cover exists in DB: ${shouldHaveCover}`)
      console.log(`    - Comic ID: ${comic._id}`)
      
      if (shouldHaveCover !== currentHasCover) {
        console.log(`    ⚠️  MISMATCH - Will update hasCover to ${shouldHaveCover}`)
        updates.push({
          comicId: comic._id,
          issueNumber: comic.issueNumber,
          shouldHaveCover
        })
      } else {
        console.log(`    ✓ Correct`)
      }
    }

    if (updates.length === 0) {
      console.log('\n✅ All hasCover flags are correct. No updates needed.')
      return
    }

    console.log(`\n\nFound ${updates.length} comics with incorrect hasCover flags`)
    console.log('Updating...')

    let updatedCount = 0
    for (const update of updates) {
      const result = await comicsCollection.updateOne(
        { _id: update.comicId },
        { $set: { hasCover: update.shouldHaveCover } }
      )
      
      if (result.modifiedCount > 0) {
        console.log(`  ✓ Updated issue #${update.issueNumber} - hasCover set to ${update.shouldHaveCover}`)
        updatedCount++
      }
    }

    console.log(`\n✅ Update complete! Fixed ${updatedCount} comics`)

    // Verify the updates
    console.log('\nVerification:')
    const verifiedComics = await comicsCollection.find(query).sort({ issueNumber: 1 }).toArray()
    
    for (const comic of verifiedComics) {
      const coverImage = await coverImagesCollection.findOne({ comicId: comic._id.toString() })
      const hasActualCover = !!coverImage
      const hasCoverFlag = comic.hasCover || false
      const status = hasActualCover === hasCoverFlag ? '✓' : '✗'
      
      console.log(`  ${status} Issue #${comic.issueNumber}: hasCover=${hasCoverFlag}, actualCover=${hasActualCover}`)
    }

  } catch (error) {
    console.error('Error fixing hasCover flags:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

fixHasCoverFlags()
