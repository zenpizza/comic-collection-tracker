/**
 * Debug script to check how comicId is stored in cover_images
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
const TEST_COMIC_ID = 1760896532814 // The Amazing Spider-Man #276

async function debugLookup() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    // Get the comic
    const comic = await comicsCollection.findOne({ _id: TEST_COMIC_ID })
    console.log('📚 Comic Document:')
    console.log(`  _id: ${comic._id} (type: ${typeof comic._id})`)
    console.log(`  Series: ${comic.series} #${comic.issueNumber}`)
    console.log(`  hasCover: ${comic.hasCover}`)
    
    // Get a sample cover image to see the structure
    const sampleCover = await coverImagesCollection.findOne({})
    console.log('\n🖼️  Sample Cover Image Document:')
    console.log(`  _id: ${sampleCover._id}`)
    console.log(`  comicId: ${sampleCover.comicId} (type: ${typeof sampleCover.comicId})`)
    
    // Try different lookup methods
    console.log('\n🔍 Testing different lookup methods:')
    
    // Method 1: comicId as number
    const lookup1 = await coverImagesCollection.findOne({ comicId: TEST_COMIC_ID })
    console.log(`  1. comicId: ${TEST_COMIC_ID} (number) → ${lookup1 ? '✅ Found' : '❌ Not found'}`)
    
    // Method 2: comicId as string
    const lookup2 = await coverImagesCollection.findOne({ comicId: TEST_COMIC_ID.toString() })
    console.log(`  2. comicId: "${TEST_COMIC_ID}" (string) → ${lookup2 ? '✅ Found' : '❌ Not found'}`)
    
    // Method 3: Search for any cover with this comic ID in any format
    const allCovers = await coverImagesCollection.find({}).toArray()
    const matchingCover = allCovers.find(c => 
      c.comicId == TEST_COMIC_ID || 
      c.comicId === TEST_COMIC_ID.toString() ||
      parseFloat(c.comicId) === TEST_COMIC_ID
    )
    
    if (matchingCover) {
      console.log(`  3. Manual search → ✅ Found!`)
      console.log(`     comicId in DB: ${matchingCover.comicId} (type: ${typeof matchingCover.comicId})`)
      console.log(`     Comparison: ${matchingCover.comicId} == ${TEST_COMIC_ID} → ${matchingCover.comicId == TEST_COMIC_ID}`)
      console.log(`     Comparison: ${matchingCover.comicId} === ${TEST_COMIC_ID} → ${matchingCover.comicId === TEST_COMIC_ID}`)
    } else {
      console.log(`  3. Manual search → ❌ Not found`)
    }
    
    // Show all cover images for debugging
    console.log(`\n📊 Total cover images in collection: ${allCovers.length}`)
    console.log('\nFirst 5 cover images:')
    allCovers.slice(0, 5).forEach((cover, i) => {
      console.log(`  ${i + 1}. comicId: ${cover.comicId} (${typeof cover.comicId})`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

debugLookup()
