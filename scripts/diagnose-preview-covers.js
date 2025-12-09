/**
 * Diagnostic script to investigate preview environment cover issue
 * Checks:
 * 1. Which database is being used
 * 2. Comics with hasCover=true
 * 3. Actual cover_images collection contents
 * 4. Potential data inconsistencies
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment')
  process.exit(1)
}

async function diagnose() {
  console.log('🔍 Preview Cover Diagnostic Tool\n')
  console.log('=' .repeat(60))
  
  let client
  
  try {
    // Extract database name from URI
    const dbMatch = MONGODB_URI.match(/\/([^/?]+)(\?|$)/)
    const dbName = dbMatch ? dbMatch[1] : 'unknown'
    
    console.log(`\n📊 Connection Info:`)
    console.log(`   Database: ${dbName}`)
    console.log(`   URI: ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`)
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    console.log(`   ✅ Connected successfully`)
    
    const db = client.db(dbName)
    
    // List all collections
    console.log(`\n📁 Collections in ${dbName}:`)
    const collections = await db.listCollections().toArray()
    collections.forEach(col => {
      console.log(`   - ${col.name}`)
    })
    
    // Check comics collection
    console.log(`\n📚 Comics Collection:`)
    const comicsCollection = db.collection('comics')
    const totalComics = await comicsCollection.countDocuments()
    const comicsWithCover = await comicsCollection.countDocuments({ hasCover: true })
    const comicsWithoutCover = await comicsCollection.countDocuments({ hasCover: { $ne: true } })
    
    console.log(`   Total comics: ${totalComics}`)
    console.log(`   With hasCover=true: ${comicsWithCover}`)
    console.log(`   Without hasCover: ${comicsWithoutCover}`)
    
    // Sample comics with hasCover=true
    if (comicsWithCover > 0) {
      console.log(`\n   Sample comics with hasCover=true:`)
      const sampleComics = await comicsCollection
        .find({ hasCover: true })
        .limit(5)
        .toArray()
      
      sampleComics.forEach(comic => {
        console.log(`   - ${comic.series} #${comic.issueNumber} (ID: ${comic._id})`)
        console.log(`     hasCover: ${comic.hasCover}`)
        console.log(`     coverId: ${comic.coverId || 'not set'}`)
        console.log(`     coverSource: ${comic.coverSource || 'not set'}`)
      })
    }
    
    // Check cover_images collection
    console.log(`\n🖼️  Cover Images Collection:`)
    const coverImagesExists = collections.some(col => col.name === 'cover_images')
    
    if (coverImagesExists) {
      const coverImagesCollection = db.collection('cover_images')
      const totalCoverImages = await coverImagesCollection.countDocuments()
      console.log(`   ✅ Collection exists`)
      console.log(`   Total cover images: ${totalCoverImages}`)
      
      if (totalCoverImages > 0) {
        console.log(`\n   Sample cover images:`)
        const sampleCovers = await coverImagesCollection
          .find({})
          .limit(5)
          .toArray()
        
        sampleCovers.forEach(cover => {
          const sizes = cover.images ? Object.keys(cover.images) : []
          console.log(`   - comicId: ${cover.comicId}`)
          console.log(`     sizes: ${sizes.join(', ')}`)
          console.log(`     createdAt: ${cover.createdAt}`)
        })
      }
    } else {
      console.log(`   ❌ Collection does NOT exist`)
    }
    
    // Check for mismatches
    console.log(`\n⚠️  Potential Issues:`)
    
    if (comicsWithCover > 0 && !coverImagesExists) {
      console.log(`   ❌ ${comicsWithCover} comics have hasCover=true but cover_images collection doesn't exist`)
    } else if (comicsWithCover > 0 && coverImagesExists) {
      const coverImagesCollection = db.collection('cover_images')
      const totalCoverImages = await coverImagesCollection.countDocuments()
      
      if (comicsWithCover !== totalCoverImages) {
        console.log(`   ⚠️  Mismatch: ${comicsWithCover} comics with hasCover=true but ${totalCoverImages} cover images`)
        
        // Find comics with hasCover=true but no cover image
        const comicsWithCoverFlag = await comicsCollection
          .find({ hasCover: true })
          .toArray()
        
        const coverImageIds = await coverImagesCollection
          .find({})
          .project({ comicId: 1 })
          .toArray()
        
        const coverImageIdSet = new Set(coverImageIds.map(c => c.comicId.toString()))
        
        const orphanedComics = comicsWithCoverFlag.filter(comic => 
          !coverImageIdSet.has(comic._id.toString())
        )
        
        if (orphanedComics.length > 0) {
          console.log(`\n   Comics with hasCover=true but no cover image (${orphanedComics.length}):`)
          orphanedComics.slice(0, 10).forEach(comic => {
            console.log(`   - ${comic.series} #${comic.issueNumber} (ID: ${comic._id})`)
          })
          if (orphanedComics.length > 10) {
            console.log(`   ... and ${orphanedComics.length - 10} more`)
          }
        }
      } else {
        console.log(`   ✅ No obvious mismatches detected`)
      }
    }
    
    console.log(`\n${'='.repeat(60)}`)
    console.log('✅ Diagnostic complete\n')
    
  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error)
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
    }
  }
}

diagnose()
