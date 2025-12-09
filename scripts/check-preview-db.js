/**
 * Quick check of preview database
 * Run with: node scripts/check-preview-db.js
 */

import { MongoClient } from 'mongodb'

// Preview database URI
const PREVIEW_URI = "mongodb+srv://Vercel-Admin-comic-collection-tracker:<REDACTED-ROTATED-SECRET>@comic-collection-tracke.aufn0iz.mongodb.net/comic-collection-preview?retryWrites=true&w=majority&appName=comic-collection-tracker"

async function check() {
  console.log('🔍 Checking preview database...\n')
  
  let client
  
  try {
    client = new MongoClient(PREVIEW_URI)
    await client.connect()
    console.log('✅ Connected to comic-collection-preview\n')
    
    const db = client.db('comic-collection-preview')
    
    // List collections
    const collections = await db.listCollections().toArray()
    console.log('📁 Collections:')
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments()
      console.log(`   - ${col.name}: ${count} documents`)
    }
    
    // Check for cover_images specifically
    const hasCoverImages = collections.some(c => c.name === 'cover_images')
    console.log(`\n🖼️  cover_images collection exists: ${hasCoverImages ? '✅ YES' : '❌ NO'}`)
    
    // Check comics with hasCover flag
    const comicsCollection = db.collection('comics')
    const comicsWithCover = await comicsCollection.countDocuments({ hasCover: true })
    console.log(`📚 Comics with hasCover=true: ${comicsWithCover}`)
    
    if (comicsWithCover > 0) {
      console.log('\n   Sample comics with hasCover=true:')
      const samples = await comicsCollection.find({ hasCover: true }).limit(3).toArray()
      samples.forEach(c => {
        console.log(`   - ${c.series} #${c.issueNumber} (ID: ${c._id})`)
      })
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('CONCLUSION:')
    if (!hasCoverImages && comicsWithCover > 0) {
      console.log('❌ ISSUE CONFIRMED: Comics have hasCover=true but no cover_images collection')
      console.log('   This means covers cannot be displayed in preview environment.')
    } else if (hasCoverImages) {
      console.log('✅ cover_images collection exists')
    } else {
      console.log('ℹ️  No comics with covers in preview database')
    }
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    if (client) await client.close()
  }
}

check()
