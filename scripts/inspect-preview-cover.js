/**
 * Inspect the cover image in preview database
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.preview' })

const PREVIEW_URI = process.env.MONGODB_URI

async function inspect() {
  console.log('🔍 Inspecting preview database cover image...\n')
  
  let client
  
  try {
    client = new MongoClient(PREVIEW_URI)
    await client.connect()
    
    const db = client.db('comic-collection-preview')
    
    // Get the comic
    const comic = await db.collection('comics').findOne({ hasCover: true })
    console.log('📚 Comic:')
    console.log(`   Series: ${comic.series}`)
    console.log(`   Issue: #${comic.issueNumber}`)
    console.log(`   ID: ${comic._id}`)
    console.log(`   hasCover: ${comic.hasCover}`)
    console.log(`   coverId: ${comic.coverId || 'not set'}`)
    console.log(`   coverSource: ${comic.coverSource || 'not set'}`)
    
    // Get the cover image
    const coverImage = await db.collection('cover_images').findOne({})
    console.log('\n🖼️  Cover Image Document:')
    console.log(`   comicId: ${coverImage.comicId}`)
    console.log(`   comicId type: ${typeof coverImage.comicId}`)
    console.log(`   Comic _id: ${comic._id}`)
    console.log(`   Comic _id type: ${typeof comic._id}`)
    console.log(`   IDs match: ${coverImage.comicId === comic._id.toString() ? '✅ YES' : '❌ NO'}`)
    
    if (coverImage.images) {
      console.log(`\n   Available sizes:`)
      Object.keys(coverImage.images).forEach(size => {
        const img = coverImage.images[size]
        const dataLength = img.data ? img.data.length : 0
        console.log(`   - ${size}: ${img.mimeType}, ${dataLength} chars base64`)
      })
    }
    
    console.log(`\n   Metadata:`)
    if (coverImage.metadata) {
      Object.entries(coverImage.metadata).forEach(([key, value]) => {
        console.log(`   - ${key}: ${value}`)
      })
    }
    
    console.log(`\n   Created: ${coverImage.createdAt}`)
    console.log(`   Updated: ${coverImage.updatedAt}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    if (client) await client.close()
  }
}

inspect()
