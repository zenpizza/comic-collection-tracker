/**
 * Basic diagnostic test to verify database operations after legacyId removal
 * Run with: node scripts/test-basic-operations.js
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

async function runDiagnostics() {
  const client = new MongoClient(MONGODB_URI)

  try {
    console.log('🔍 Running basic diagnostics...\n')
    
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')

    // Test 1: Count total comics
    const totalComics = await comicsCollection.countDocuments()
    console.log(`\n📚 Total comics: ${totalComics}`)

    // Test 2: Verify no legacyId fields remain
    const comicsWithLegacyId = await comicsCollection.countDocuments({ legacyId: { $exists: true } })
    if (comicsWithLegacyId === 0) {
      console.log('✅ No legacyId fields found (cleanup successful)')
    } else {
      console.log(`⚠️  Warning: ${comicsWithLegacyId} comics still have legacyId field`)
    }

    // Test 3: Check ObjectId format
    const sampleComic = await comicsCollection.findOne()
    if (sampleComic) {
      console.log(`\n📋 Sample comic:`)
      console.log(`   Series: ${sampleComic.series} #${sampleComic.issueNumber}`)
      console.log(`   _id type: ${typeof sampleComic._id}`)
      console.log(`   _id value: ${sampleComic._id}`)
      console.log(`   Has legacyId: ${sampleComic.legacyId ? 'YES ⚠️' : 'NO ✅'}`)
    }

    // Test 4: Check cover images
    const totalCovers = await coverImagesCollection.countDocuments()
    console.log(`\n🖼️  Total cover images: ${totalCovers}`)

    // Test 5: Verify cover linking still works
    const comicWithCover = await comicsCollection.findOne({ hasCover: true })
    if (comicWithCover) {
      const linkedCover = await coverImagesCollection.findOne({ 
        comicId: comicWithCover._id.toString() 
      })
      if (linkedCover) {
        console.log('✅ Cover linking works correctly')
        console.log(`   Comic: ${comicWithCover.series} #${comicWithCover.issueNumber}`)
        console.log(`   Cover comicId: ${linkedCover.comicId}`)
      } else {
        console.log('⚠️  Warning: Found comic with hasCover=true but no linked cover image')
      }
    }

    // Test 6: Check for any unexpected fields
    const comicFields = Object.keys(sampleComic || {})
    console.log(`\n📝 Comic document fields (${comicFields.length}):`)
    console.log(`   ${comicFields.join(', ')}`)

    console.log('\n✅ All diagnostics complete!')

  } catch (error) {
    console.error('❌ Error during diagnostics:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n🔌 Database connection closed')
  }
}

runDiagnostics()
