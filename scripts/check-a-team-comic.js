/**
 * Check The A-Team #1 comic
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

async function checkComic() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    // Find by MongoDB ObjectId
    const { ObjectId } = await import('mongodb')
    const comic = await comicsCollection.findOne({ _id: new ObjectId('690e172661cc5c934381cd0c') })
    
    if (!comic) {
      console.log('❌ Comic not found')
      return
    }
    
    console.log('📚 Comic Document:')
    console.log(`  _id: ${comic._id}`)
    console.log(`  id: ${comic.id}`)
    console.log(`  Series: ${comic.series} #${comic.issueNumber}`)
    console.log(`  hasCover: ${comic.hasCover}`)
    console.log(`  Has coverData field: ${!!comic.coverData}`)
    
    if (comic.coverData) {
      console.log('\n📦 Old coverData structure found:')
      console.log(`  Has metadata: ${!!comic.coverData.metadata}`)
      console.log(`  Source: ${comic.coverData.metadata?.source}`)
      console.log(`  Provider: ${comic.coverData.metadata?.provider}`)
      console.log(`  Original URL: ${comic.coverData.metadata?.originalUrl}`)
    }
    
    // Check cover_images collection using the numeric id
    console.log('\n🔍 Checking cover_images collection:')
    const coverByNumericId = await coverImagesCollection.findOne({ comicId: comic.id })
    console.log(`  Lookup by id (${comic.id}): ${coverByNumericId ? '✅ Found' : '❌ Not found'}`)
    
    // Check using string version of _id
    const coverByStringId = await coverImagesCollection.findOne({ comicId: comic._id.toString() })
    console.log(`  Lookup by _id.toString() ("${comic._id.toString()}"): ${coverByStringId ? '✅ Found' : '❌ Not found'}`)
    
    // Check using ObjectId
    const coverByObjectId = await coverImagesCollection.findOne({ comicId: comic._id })
    console.log(`  Lookup by _id (ObjectId): ${coverByObjectId ? '✅ Found' : '❌ Not found'}`)
    
    // List all cover images to see what's there
    const allCovers = await coverImagesCollection.find({}).toArray()
    console.log(`\n📊 Total covers in collection: ${allCovers.length}`)
    
    // Check if any cover matches this comic
    const matchingCover = allCovers.find(c => 
      c.comicId === comic.id || 
      c.comicId === comic._id.toString() ||
      c.comicId?.toString() === comic._id.toString()
    )
    
    if (matchingCover) {
      console.log('✅ Found matching cover:')
      console.log(`  comicId: ${matchingCover.comicId} (type: ${typeof matchingCover.comicId})`)
    } else {
      console.log('❌ No matching cover found in cover_images collection')
      console.log('\n💡 This comic has old coverData but no entry in cover_images collection')
      console.log('   It needs to be migrated from coverData to cover_images')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

checkComic()
