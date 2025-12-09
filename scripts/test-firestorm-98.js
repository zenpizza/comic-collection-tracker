/**
 * Test searching for Firestorm #98 specifically
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY

async function testFirestorm98() {
  console.log('\n=== Testing Firestorm, the Nuclear Man #98 ===\n')
  
  const series = 'Firestorm, the Nuclear Man'
  const issue = '98'
  const publisher = 'DC'
  const year = '1990'
  
  try {
    // Step 1: Search for volumes
    console.log('Step 1: Searching for volumes matching:', series)
    const volumeSearchUrl = new URL('https://comicvine.gamespot.com/api/search/')
    volumeSearchUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    volumeSearchUrl.searchParams.set('format', 'json')
    volumeSearchUrl.searchParams.set('resources', 'volume')
    volumeSearchUrl.searchParams.set('query', series)
    volumeSearchUrl.searchParams.set('field_list', 'id,name,start_year,publisher,count_of_issues')
    volumeSearchUrl.searchParams.set('limit', '10')

    const volumeResponse = await fetch(volumeSearchUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    const volumeData = await volumeResponse.json()
    
    console.log(`\nFound ${volumeData.results?.length || 0} volumes:`)
    volumeData.results?.forEach((vol, i) => {
      console.log(`  ${i + 1}. ${vol.name} (${vol.start_year}) - ID: ${vol.id} - ${vol.count_of_issues} issues`)
    })
    
    if (!volumeData.results || volumeData.results.length === 0) {
      console.log('\n❌ No volumes found!')
      return
    }
    
    // Step 2: Search for issue #98 in the volumes
    console.log(`\nStep 2: Searching for issue #${issue} in these volumes...`)
    
    const volumeIds = volumeData.results.map(v => v.id).join('|')
    
    const issuesUrl = new URL('https://comicvine.gamespot.com/api/issues/')
    issuesUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    issuesUrl.searchParams.set('format', 'json')
    issuesUrl.searchParams.set('filter', `volume:${volumeIds},issue_number:${issue}`)
    issuesUrl.searchParams.set('field_list', 'id,name,issue_number,cover_date,volume,image')
    issuesUrl.searchParams.set('limit', '20')

    const issuesResponse = await fetch(issuesUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    const issuesData = await issuesResponse.json()
    
    console.log(`\nFound ${issuesData.results?.length || 0} issues:`)
    issuesData.results?.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue.volume?.name} #${issue.issue_number} - ${issue.name || 'Untitled'}`)
      console.log(`      Cover Date: ${issue.cover_date || 'N/A'}`)
      console.log(`      Has Image: ${!!issue.image?.original_url}`)
      console.log(`      Volume ID: ${issue.volume?.id}`)
    })
    
    if (!issuesData.results || issuesData.results.length === 0) {
      console.log('\n❌ No issues found!')
      console.log('\nPossible reasons:')
      console.log('  - Issue #98 might not exist in ComicVine for this volume')
      console.log('  - The volume might have ended before issue #98')
      console.log('  - Issue #98 might be in a different volume')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

await testFirestorm98()

console.log('\n=== Checking which volume has issue #98 ===\n')

// Let's check the Firestorm volume (149680) that we know has issues #93-100
async function checkVolume149680() {
  try {
    const issuesUrl = new URL('https://comicvine.gamespot.com/api/issues/')
    issuesUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    issuesUrl.searchParams.set('format', 'json')
    issuesUrl.searchParams.set('filter', `volume:149680,issue_number:98`)
    issuesUrl.searchParams.set('field_list', 'id,name,issue_number,cover_date,volume')

    const response = await fetch(issuesUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    const data = await response.json()
    
    if (data.results && data.results.length > 0) {
      console.log('✅ Found issue #98 in volume 149680 (Firestorm):')
      console.log(`   Volume: ${data.results[0].volume?.name}`)
      console.log(`   Issue: #${data.results[0].issue_number}`)
      console.log(`   Name: ${data.results[0].name || 'Untitled'}`)
      console.log(`   Date: ${data.results[0].cover_date}`)
    } else {
      console.log('❌ Issue #98 not found in volume 149680')
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

await checkVolume149680()
