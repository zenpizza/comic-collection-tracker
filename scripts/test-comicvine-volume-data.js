/**
 * Test script to explore ComicVine volume data
 * This will help us understand what volume information is available
 * 
 * Usage: node scripts/test-comicvine-volume-data.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY

if (!COMICVINE_API_KEY) {
  console.error('❌ COMICVINE_API_KEY not found in environment')
  console.error('Please add it to your .env.local file')
  process.exit(1)
}

/**
 * Test case: Firestorm with multiple title changes
 */
async function testFirestorm() {
  console.log('\n=== Testing Firestorm (multiple title changes) ===\n')
  
  const testCases = [
    { series: 'The Fury of Firestorm', issue: '1', year: '1982', publisher: 'DC' },
    { series: 'Firestorm, the Nuclear Man', issue: '65', year: '1987', publisher: 'DC' },
    { series: 'Firestorm the Nuclear Man', issue: '84', year: '1989', publisher: 'DC' },
    { series: 'Firestorm', issue: '93', year: '1990', publisher: 'DC' }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n--- Searching: "${testCase.series}" #${testCase.issue} (${testCase.year}) ---`)
    await searchAndDisplayVolumeInfo(testCase.series, testCase.issue, testCase.publisher, testCase.year)
  }
}

/**
 * Search ComicVine and display volume information
 */
async function searchAndDisplayVolumeInfo(series, issue, publisher, year) {
  try {
    // Step 1: Search for volumes
    const volumeSearchUrl = new URL('https://comicvine.gamespot.com/api/search/')
    volumeSearchUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    volumeSearchUrl.searchParams.set('format', 'json')
    volumeSearchUrl.searchParams.set('resources', 'volume')
    volumeSearchUrl.searchParams.set('query', series)
    volumeSearchUrl.searchParams.set('field_list', 'id,name,start_year,publisher,count_of_issues,description,site_detail_url')
    volumeSearchUrl.searchParams.set('limit', '5')

    const volumeResponse = await fetch(volumeSearchUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    const volumeData = await volumeResponse.json()
    
    if (volumeData.error !== 'OK') {
      console.error('❌ ComicVine API error:', volumeData.error)
      return
    }

    console.log(`\n📚 Found ${volumeData.results?.length || 0} volumes:`)
    
    if (!volumeData.results || volumeData.results.length === 0) {
      console.log('   No volumes found')
      return
    }

    // Display volume information
    volumeData.results.forEach((vol, index) => {
      console.log(`\n   ${index + 1}. Volume Information:`)
      console.log(`      ID: ${vol.id}`)
      console.log(`      Name: ${vol.name}`)
      console.log(`      Start Year: ${vol.start_year || 'N/A'}`)
      console.log(`      Publisher: ${vol.publisher?.name || 'N/A'}`)
      console.log(`      Issue Count: ${vol.count_of_issues || 'N/A'}`)
      console.log(`      URL: ${vol.site_detail_url || 'N/A'}`)
      if (vol.description) {
        const shortDesc = vol.description.replace(/<[^>]*>/g, '').substring(0, 100)
        console.log(`      Description: ${shortDesc}...`)
      }
    })

    // Step 2: Get specific issue from the first matching volume
    if (volumeData.results.length > 0) {
      const volumeId = volumeData.results[0].id
      console.log(`\n🔍 Searching for issue #${issue} in volume ${volumeId}...`)
      
      const issuesUrl = new URL('https://comicvine.gamespot.com/api/issues/')
      issuesUrl.searchParams.set('api_key', COMICVINE_API_KEY)
      issuesUrl.searchParams.set('format', 'json')
      issuesUrl.searchParams.set('filter', `volume:${volumeId},issue_number:${issue}`)
      issuesUrl.searchParams.set('field_list', 'id,name,issue_number,cover_date,volume,site_detail_url')
      issuesUrl.searchParams.set('limit', '1')

      const issuesResponse = await fetch(issuesUrl.toString(), {
        headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
      })

      const issuesData = await issuesResponse.json()
      
      if (issuesData.results && issuesData.results.length > 0) {
        const issueResult = issuesData.results[0]
        console.log(`\n   ✅ Found Issue:`)
        console.log(`      Issue ID: ${issueResult.id}`)
        console.log(`      Issue Number: ${issueResult.issue_number}`)
        console.log(`      Issue Name: ${issueResult.name || 'N/A'}`)
        console.log(`      Cover Date: ${issueResult.cover_date || 'N/A'}`)
        console.log(`      Volume ID: ${issueResult.volume?.id || 'N/A'}`)
        console.log(`      Volume Name: ${issueResult.volume?.name || 'N/A'}`)
        console.log(`      URL: ${issueResult.site_detail_url || 'N/A'}`)
      } else {
        console.log(`   ❌ Issue #${issue} not found in this volume`)
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

/**
 * Test getting detailed volume information by ID
 */
async function getVolumeDetails(volumeId) {
  console.log(`\n=== Getting detailed info for volume ${volumeId} ===\n`)
  
  try {
    const volumeUrl = new URL(`https://comicvine.gamespot.com/api/volume/4050-${volumeId}/`)
    volumeUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    volumeUrl.searchParams.set('format', 'json')
    volumeUrl.searchParams.set('field_list', 'id,name,start_year,publisher,count_of_issues,description,site_detail_url,aliases')

    const response = await fetch(volumeUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    const data = await response.json()
    
    if (data.error !== 'OK') {
      console.error('❌ ComicVine API error:', data.error)
      return
    }

    const vol = data.results
    console.log('📖 Volume Details:')
    console.log(`   ID: ${vol.id}`)
    console.log(`   Name: ${vol.name}`)
    console.log(`   Start Year: ${vol.start_year || 'N/A'}`)
    console.log(`   Publisher: ${vol.publisher?.name || 'N/A'}`)
    console.log(`   Issue Count: ${vol.count_of_issues || 'N/A'}`)
    console.log(`   Aliases: ${vol.aliases || 'N/A'}`)
    console.log(`   URL: ${vol.site_detail_url || 'N/A'}`)
    
    if (vol.description) {
      const shortDesc = vol.description.replace(/<[^>]*>/g, '').substring(0, 200)
      console.log(`   Description: ${shortDesc}...`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run tests
console.log('🚀 Testing ComicVine Volume Data Retrieval')
console.log('==========================================')

await testFirestorm()

// Test getting detailed info for Firestorm volume (ID: 3789)
await getVolumeDetails('3789')

console.log('\n✅ Test complete!')
console.log('\n💡 Key Findings:')
console.log('   - Volume ID can be used to group comics with different titles')
console.log('   - Volume includes: id, name, start_year, publisher, count_of_issues')
console.log('   - Each issue links back to its volume via volume.id and volume.name')
console.log('   - We can use volumeId to handle title changes within the same series run')
