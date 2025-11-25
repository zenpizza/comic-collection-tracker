/**
 * Check a specific comic's cover status
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
const COMIC_ID = '1761160397667'

async function checkComic() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    // Find the comic
    const comic = await comicsCollection.findOne({ _id: parseFloat(COMIC_ID) })
    
    if (!comic) {
      console.log(`❌ Comic with ID ${COMIC_ID} not found`)
      return
    }
    
    console.log('📚 Comic Document:')
    console.log('='.repeat(60))
    console.log(`Series: ${comic.series}`)
    console.log(`Issue: ${comic.issueNumber}`)
    console.log(`Publisher: ${comic.publisher}`)
    console.log(`\nCover Fields:`)
    console.log(`  coverId: ${comic.coverId}`)
    console.log(`  coverUrl: ${comic.coverUrl}`)
    console.log(`  hasCover: ${comic.hasCover}`)
    console.log(`  coverSource: ${comic.coverSource}`)
    console.log(`  coverSourceProvider: ${comic.coverSourceProvider}`)
    console.log(`  coverLastUpdated: ${comic.coverLastUpdated}`)
    
    // Check for cover image
    console.log('\n🖼️  Cover Image Document:')
    console.log('='.repeat(60))
    
    const coverImage = await coverImagesCollection.findOne({ comicId: COMIC_ID })
    
    if (coverImage) {
      console.log(`✅ Found cover image!`)
      console.log(`  _id: ${coverImage._id}`)
      console.log(`  comicId: ${coverImage.comicId}`)
      console.log(`  source: ${coverImage.source}`)
      console.log(`  provider: ${coverImage.sourceDetails?.apiProvider || coverImage.sourceDetails?.provider}`)
      console.log(`  originalUrl: ${coverImage.originalUrl}`)
      console.log(`  lastUpdated: ${coverImage.lastUpdated}`)
      console.log(`  Has thumbnail: ${!!coverImage.thumbnailUrl}`)
      console.log(`  Has medium: ${!!coverImage.mediumUrl}`)
      console.log(`  Has full: ${!!coverImage.fullUrl}`)
    } else {
      console.log(`❌ No cover image found`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

checkComic()
