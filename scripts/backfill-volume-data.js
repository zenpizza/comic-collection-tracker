/**
 * Backfill volume data for comics that have covers but no volume info
 * This can happen if covers were fetched before volume support was added
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { MongoClient } from 'mongodb'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const MONGODB_URI = process.env.MONGODB_URI
const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY

async function backfillVolumeData() {
  console.log('🔍 Finding comics with covers but no volume data...\n')
  
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db('comic-collection-preview') // Using preview database
    const comics = db.collection('comics')
    
    // Find comics that have covers but no volume data
    const comicsNeedingVolumes = await comics.find({
      hasCover: true,
      $or: [
        { volumeId: { $exists: false } },
        { volumeId: null },
        { volumeId: '' }
      ]
    }).toArray()
    
    console.log(`Found ${comicsNeedingVolumes.length} comics needing volume data\n`)
    
    for (const comic of comicsNeedingVolumes) {
      console.log(`Processing: ${comic.series} #${comic.issueNumber}`)
      
      try {
        // Search for the volume
        const volumeSearchUrl = new URL('https://comicvine.gamespot.com/api/search/')
        volumeSearchUrl.searchParams.set('api_key', COMICVINE_API_KEY)
        volumeSearchUrl.searchParams.set('format', 'json')
        volumeSearchUrl.searchParams.set('resources', 'volume')
        volumeSearchUrl.searchParams.set('query', comic.series)
        volumeSearchUrl.searchParams.set('field_list', 'id,name,start_year')
        volumeSearchUrl.searchParams.set('limit', '5')

        const volumeResponse = await fetch(volumeSearchUrl.toString(), {
          headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
        })

        const volumeData = await volumeResponse.json()
        
        if (volumeData.results && volumeData.results.length > 0) {
          // Try to find the best matching volume by year
          let bestVolume = volumeData.results[0]
          
          if (comic.year) {
            const targetYear = parseInt(comic.year)
            bestVolume = volumeData.results.reduce((best, vol) => {
              const bestDiff = Math.abs((best.start_year || 0) - targetYear)
              const volDiff = Math.abs((vol.start_year || 0) - targetYear)
              return volDiff < bestDiff ? vol : best
            })
          }
          
          console.log(`  ✅ Found volume: ${bestVolume.name} (ID: ${bestVolume.id})`)
          
          // Update the comic
          await comics.updateOne(
            { _id: comic._id },
            {
              $set: {
                volumeId: bestVolume.id.toString(),
                volumeName: bestVolume.name,
                updatedAt: new Date().toISOString()
              }
            }
          )
          
          console.log(`  💾 Updated database\n`)
        } else {
          console.log(`  ⚠️  No volumes found\n`)
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}\n`)
      }
    }
    
    console.log('✅ Backfill complete!')
    
  } finally {
    await client.close()
  }
}

backfillVolumeData().catch(console.error)
