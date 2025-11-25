/**
 * Check how comics and cover_images are linked
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function checkLinking() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    // Get sample comics
    const sampleComics = await comicsCollection.find({}).limit(5).toArray()
    
    console.log('COMICS COLLECTION STRUCTURE:')
    console.log('='.repeat(70))
    
    sampleComics.forEach((comic, index) => {
      console.log(`\nComic ${index + 1}:`)
      console.log(`  _id: ${comic._id} (${typeof comic._id})`)
      console.log(`  id field: ${comic.id} (${typeof comic.id})`)
      console.log(`  Series: ${comic.series} #${comic.issueNumber}`)
      console.log(`  hasCover: ${comic.hasCover}`)
      console.log(`  coverSource: ${comic.coverSource}`)
    })
    
    // Get sample cover images
    const sampleCovers = await coverImagesCollection.find({}).limit(5).toArray()
    
    console.log('\n\nCOVER_IMAGES COLLECTION STRUCTURE:')
    console.log('='.repeat(70))
    
    if (sampleCovers.length === 0) {
      console.log('No cover images found in database')
    } else {
      sampleCovers.forEach((cover, index) => {
        console.log(`\nCover ${index + 1}:`)
        console.log(`  _id: ${cover._id}`)
        console.log(`  comicId: ${cover.comicId} (${typeof cover.comicId})`)
        console.log(`  Available sizes: ${Object.keys(cover.images || {})}`)
        console.log(`  Metadata: ${JSON.stringify(cover.metadata || {})}`)
      })
    }
    
    // Check for linking issues
    console.log('\n\nLINKING ANALYSIS:')
    console.log('='.repeat(70))
    
    const totalComics = await comicsCollection.countDocuments({})
    const totalCovers = await coverImagesCollection.countDocuments({})
    const comicsWithIdField = await comicsCollection.countDocuments({ id: { $exists: true } })
    
    console.log(`Total comics: ${totalComics}`)
    console.log(`Total cover images: ${totalCovers}`)
    console.log(`Comics with 'id' field: ${comicsWithIdField}`)
    
    // Try to find a comic with a cover
    const comicWithCover = await comicsCollection.findOne({ hasCover: true })
    
    if (comicWithCover) {
      console.log(`\n\nSample comic with cover:`)
      console.log(`  Comic _id: ${comicWithCover._id}`)
      console.log(`  Comic id: ${comicWithCover.id}`)
      console.log(`  Series: ${comicWithCover.series} #${comicWithCover.issueNumber}`)
      
      // Try to find its cover image using different strategies
      const coverByObjectId = await coverImagesCollection.findOne({ 
        comicId: comicWithCover._id.toString() 
      })
      const coverByNumericId = await coverImagesCollection.findOne({ 
        comicId: comicWithCover.id 
      })
      const coverByNumericIdString = await coverImagesCollection.findOne({ 
        comicId: String(comicWithCover.id) 
      })
      
      console.log(`\n  Cover lookup results:`)
      console.log(`    By ObjectId string: ${coverByObjectId ? '✅ Found' : '❌ Not found'}`)
      console.log(`    By numeric id: ${coverByNumericId ? '✅ Found' : '❌ Not found'}`)
      console.log(`    By numeric id (string): ${coverByNumericIdString ? '✅ Found' : '❌ Not found'}`)
      
      if (coverByNumericId || coverByNumericIdString) {
        const foundCover = coverByNumericId || coverByNumericIdString
        console.log(`\n  Found cover details:`)
        console.log(`    Cover comicId: ${foundCover.comicId} (${typeof foundCover.comicId})`)
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

checkLinking()
