/**
 * Delete cover information for Transformers issues #30-43
 */

import dotenv from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'

// Load from .env.local
dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function deleteTransformerCovers() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')

    // Find Transformers issues #32-33
    // Note: issueNumber can be stored as string or number, so we need to check both
    const comics = await comicsCollection.find({
      series: 'Transformers',
      $or: [
        { issueNumber: { $gte: 32, $lte: 33 } }, // numeric
        { issueNumber: { $in: ['32', '33'] } } // string
      ]
    }).sort({ issueNumber: 1 }).toArray()

    console.log(`\nFound ${comics.length} Transformers issues #32-33`)

    if (comics.length === 0) {
      console.log('No comics found to process')
      return
    }

    console.log('\nDeleting covers for:')
    comics.forEach(comic => {
      console.log(`  - Transformers #${comic.issueNumber}`)
    })

    // Delete cover images from cover_images collection
    const comicIds = comics.map(c => c._id.toString())
    const deleteImagesResult = await coverImagesCollection.deleteMany({
      comicId: { $in: comicIds }
    })

    console.log(`\n✅ Deleted ${deleteImagesResult.deletedCount} cover images from cover_images collection`)

    // Update comics to remove cover metadata
    const updateResult = await comicsCollection.updateMany(
      {
        series: 'Transformers',
        $or: [
          { issueNumber: { $gte: 32, $lte: 33 } },
          { issueNumber: { $in: ['32', '33'] } }
        ]
      },
      {
        $set: {
          hasCover: false
        },
        $unset: {
          coverId: '',
          coverSource: '',
          coverSourceProvider: '',
          coverOriginalUrl: '',
          coverAttribution: '',
          coverLastUpdated: ''
        }
      }
    )

    console.log(`✅ Updated ${updateResult.modifiedCount} comics to remove cover metadata`)

    // Verify the changes
    console.log('\nVerifying changes:')
    const verifyComics = await comicsCollection.find({
      series: 'Transformers',
      $or: [
        { issueNumber: { $gte: 32, $lte: 33 } },
        { issueNumber: { $in: ['32', '33'] } }
      ]
    }).sort({ issueNumber: 1 }).toArray()

    verifyComics.forEach(comic => {
      const status = comic.hasCover ? '❌ STILL HAS COVER' : '✅ No cover'
      console.log(`  #${comic.issueNumber}: ${status}`)
    })

    console.log('\n✅ Cover deletion complete!')

  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the script
deleteTransformerCovers()
