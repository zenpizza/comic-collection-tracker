/**
 * Check what Transformers series exist in the database
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

async function checkTransformersSeries() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    // List all databases
    const adminDb = client.db().admin()
    const { databases } = await adminDb.listDatabases()
    console.log('\nAvailable databases:')
    databases.forEach(db => console.log(`  - ${db.name}`))

    const db = client.db('comic-collection-tracker')
    console.log('\nUsing database: comic-collection-tracker')
    
    // List all collections
    const collections = await db.listCollections().toArray()
    console.log('\nCollections in this database:')
    collections.forEach(coll => console.log(`  - ${coll.name}`))
    
    const comicsCollection = db.collection('comics')

    // Get total count
    const totalCount = await comicsCollection.countDocuments()
    console.log(`\nTotal comics in database: ${totalCount}`)

    // Find all unique series that contain "Transformers"
    const series = await comicsCollection.distinct('series', {
      series: { $regex: /transform/i }
    })

    console.log(`\nSeries containing "transform": ${series.length}`)
    series.forEach(s => console.log(`  - "${s}"`))

    // If no Transformers found, show all series
    if (series.length === 0) {
      console.log('\nShowing all series in database:')
      const allSeries = await comicsCollection.distinct('series')
      allSeries.slice(0, 20).forEach(s => console.log(`  - "${s}"`))
      if (allSeries.length > 20) {
        console.log(`  ... and ${allSeries.length - 20} more`)
      }
    } else {
      // Get sample comics for each series
      for (const seriesName of series) {
        const comics = await comicsCollection.find({
          series: seriesName,
          issueNumber: { $gte: 30, $lte: 43 }
        }).sort({ issueNumber: 1 }).toArray()

        console.log(`\n"${seriesName}" issues #30-43: ${comics.length} found`)
        comics.forEach(comic => {
          console.log(`  #${comic.issueNumber} - hasCover: ${comic.hasCover}`)
        })
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

checkTransformersSeries()
