/**
 * Test volume 149680 which appears to be the "Firestorm" volume for issues #93-100
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY

async function testVolume149680() {
  console.log('\n=== Testing Volume 149680 (Firestorm #93-100) ===\n')
  
  try {
    // Get volume details
    const volumeUrl = new URL('https://comicvine.gamespot.com/api/volume/4050-149680/')
    volumeUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    volumeUrl.searchParams.set('format', 'json')

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
    console.log(`   URL: ${vol.site_detail_url || 'N/A'}`)
    
    if (vol.description) {
      console.log(`\n   Description:`)
      console.log(`   ${vol.description.replace(/<[^>]*>/g, '')}`)
    }
    
    // Now search for issue #93
    console.log('\n🔍 Searching for issue #93 in this volume...')
    
    const issuesUrl = new URL('https://comicvine.gamespot.com/api/issues/')
    issuesUrl.searchParams.set('api_key', COMICVINE_API_KEY)
    issuesUrl.searchParams.set('format', 'json')
    issuesUrl.searchParams.set('filter', `volume:149680,issue_number:93`)
    issuesUrl.searchParams.set('field_list', 'id,name,issue_number,cover_date,volume')

    const issuesResponse = await fetch(issuesUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    const issuesData = await issuesResponse.json()
    
    if (issuesData.results && issuesData.results.length > 0) {
      const issue = issuesData.results[0]
      console.log(`\n   ✅ Found Issue #93:`)
      console.log(`      Issue ID: ${issue.id}`)
      console.log(`      Issue Number: ${issue.issue_number}`)
      console.log(`      Issue Name: ${issue.name || 'N/A'}`)
      console.log(`      Cover Date: ${issue.cover_date || 'N/A'}`)
      console.log(`      Volume ID: ${issue.volume?.id || 'N/A'}`)
      console.log(`      Volume Name: ${issue.volume?.name || 'N/A'}`)
    } else {
      console.log(`   ❌ Issue #93 not found`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

await testVolume149680()

console.log('\n\n=== Summary ===')
console.log('ComicVine has SEPARATE volumes for the different Firestorm title changes:')
console.log('  - Volume 3115: "The Fury of Firestorm" (#1-64)')
console.log('  - Volume 3789: "Firestorm, the Nuclear Man" (#65-100) - but only has 28 issues?')
console.log('  - Volume 149680: "Firestorm" (#93-100)')
console.log('\nThis means ComicVine DOES split them by title, not by continuous volume!')
