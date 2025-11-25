#!/usr/bin/env node

/**
 * End-to-end test for cover replacement using ComicVine API
 * Tests the complete flow from ComicVine search through database updates
 * 
 * This test:
 * 1. Gets the current state of Crisis on Infinite Earths #2 (comicId: 1761160397668)
 * 2. Searches ComicVine API for covers
 * 3. Downloads the first result
 * 4. Replaces the existing cover
 * 5. Verifies all database changes
 */

import dotenv from 'dotenv'
import fetch from 'node-fetch'

// Load environment variables
dotenv.config()

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'https://comic-collection-tracker.vercel.app'
const TEST_COMIC_ID = 1761160397668 // Crisis on Infinite Earths #2

// Comic details for search
const COMIC_DETAILS = {
  series: 'Crisis on Infinite Earths',
  issueNumber: '2',
  publisher: 'DC',
  year: 1985
}

async function waitForServer(maxAttempts = 10, delay = 2000) {
  console.log('🔍 Checking if server is running...')
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/comics`, {
        method: 'GET',
        timeout: 5000
      })
      
      if (response.ok || response.status === 404) {
        console.log('✅ Server is responding\n')
        return true
      }
    } catch (error) {
      console.log(`   Attempt ${attempt}/${maxAttempts}: Server not ready (${error.message})`)
      
      if (attempt < maxAttempts) {
        console.log(`   Waiting ${delay/1000}s before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  return false
}

async function getCurrentComicState(comicId) {
  console.log('1️⃣ Getting current comic state...')
  
  const response = await fetch(`${API_BASE_URL}/api/comics/${comicId}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch comic: ${response.status}`)
  }
  
  const result = await response.json()
  const comic = result.comic
  
  console.log(`✅ Current state retrieved:`)
  console.log(`   Series: ${comic.series} #${comic.issueNumber}`)
  console.log(`   Publisher: ${comic.publisher}`)
  console.log(`   Year: ${comic.year}`)
  console.log(`   hasCover: ${comic.hasCover}`)
  console.log(`   coverId: ${comic.coverId}`)
  console.log(`   coverSource: ${comic.coverSource}`)
  console.log(`   coverSourceProvider: ${comic.coverSourceProvider}`)
  console.log(`   coverLastUpdated: ${comic.coverLastUpdated}`)
  console.log(`   coverAttribution: ${comic.coverAttribution}\n`)
  
  return comic
}

async function searchComicVineCovers(series, issue, publisher, year) {
  console.log('2️⃣ Searching ComicVine API for covers...')
  
  const searchUrl = new URL(`${API_BASE_URL}/api/cover-search`)
  searchUrl.searchParams.set('series', series)
  searchUrl.searchParams.set('issue', issue)
  searchUrl.searchParams.set('publisher', publisher)
  searchUrl.searchParams.set('year', year.toString())
  
  console.log(`   Search URL: ${searchUrl.toString()}`)
  
  const response = await fetch(searchUrl.toString())
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Cover search failed: ${response.status} - ${errorText}`)
  }
  
  const result = await response.json()
  
  if (!result.success) {
    throw new Error(`Cover search failed: ${result.error}`)
  }
  
  console.log(`✅ Found ${result.results.length} covers from ComicVine`)
  
  if (result.results.length === 0) {
    throw new Error('No covers found')
  }
  
  const firstResult = result.results[0]
  console.log(`   First result:`)
  console.log(`   - Image URL: ${firstResult.imageUrl}`)
  console.log(`   - Quality: ${firstResult.quality}`)
  console.log(`   - Provider: ${firstResult.provider}`)
  console.log(`   - Attribution: ${firstResult.attribution}`)
  console.log(`   - Dimensions: ${firstResult.dimensions.width}x${firstResult.dimensions.height}\n`)
  
  return result.results
}

async function downloadCoverImage(imageUrl) {
  console.log('3️⃣ Downloading cover image from ComicVine...')
  
  // Use the download proxy endpoint
  const proxyUrl = new URL(`${API_BASE_URL}/api/download`)
  proxyUrl.searchParams.set('url', imageUrl)
  
  console.log(`   Proxy URL: ${proxyUrl.toString()}`)
  
  const response = await fetch(proxyUrl.toString())
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to download image: ${response.status} - ${errorText}`)
  }
  
  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = buffer.toString('base64')
  
  console.log(`✅ Image downloaded successfully`)
  console.log(`   Size: ${blob.size} bytes`)
  console.log(`   Type: ${blob.type}`)
  console.log(`   Base64 length: ${base64.length} chars\n`)
  
  return {
    blob,
    base64,
    mimeType: blob.type
  }
}

async function uploadNewCover(comicId, imageData, metadata) {
  console.log('4️⃣ Uploading new cover to database...')
  
  const uploadData = {
    comicId: comicId,
    imageData: imageData.base64,
    mimeType: imageData.mimeType,
    metadata: {
      source: 'api',
      provider: metadata.provider,
      originalUrl: metadata.imageUrl,
      attribution: metadata.attribution,
      quality: metadata.quality
    }
  }
  
  const response = await fetch(`${API_BASE_URL}/api/images/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(uploadData)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to upload cover: ${response.status} - ${errorText}`)
  }
  
  const result = await response.json()
  
  console.log(`✅ Cover uploaded successfully`)
  console.log(`   Image ID: ${result.imageId}\n`)
  
  return result.imageId
}

async function updateComicMetadata(comicId, currentComic, newCoverId, coverMetadata) {
  console.log('5️⃣ Updating comic metadata...')
  
  const updatedComic = {
    ...currentComic,
    id: comicId,
    coverUrl: null,
    hasCover: true,
    coverId: newCoverId,
    coverSource: 'api',
    coverSourceProvider: coverMetadata.provider,
    coverOriginalUrl: coverMetadata.imageUrl,
    coverLastUpdated: new Date().toISOString(),
    coverAttribution: coverMetadata.attribution
  }
  
  const response = await fetch(`${API_BASE_URL}/api/comics/${comicId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedComic)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to update comic: ${response.status} - ${errorText}`)
  }
  
  const result = await response.json()
  
  console.log(`✅ Comic metadata updated`)
  console.log(`   coverId: ${result.comic.coverId}`)
  console.log(`   coverSource: ${result.comic.coverSource}`)
  console.log(`   coverSourceProvider: ${result.comic.coverSourceProvider}`)
  console.log(`   coverAttribution: ${result.comic.coverAttribution}\n`)
  
  return result.comic
}

async function verifyChanges(beforeState, afterState) {
  console.log('6️⃣ Verifying changes...')
  
  const changes = []
  const errors = []
  
  // Check fields that should change
  if (beforeState.coverId !== afterState.coverId) {
    changes.push(`✅ coverId changed: ${beforeState.coverId} → ${afterState.coverId}`)
  } else {
    errors.push('❌ coverId did not change')
  }
  
  if (beforeState.coverLastUpdated !== afterState.coverLastUpdated) {
    changes.push(`✅ coverLastUpdated changed`)
  } else {
    errors.push('❌ coverLastUpdated did not change')
  }
  
  if (afterState.coverSourceProvider === 'comicvine') {
    changes.push(`✅ coverSourceProvider set to: ${afterState.coverSourceProvider}`)
  } else {
    errors.push(`❌ coverSourceProvider not set correctly: ${afterState.coverSourceProvider}`)
  }
  
  if (afterState.coverAttribution && afterState.coverAttribution.includes('Comic Vine')) {
    changes.push(`✅ coverAttribution set correctly`)
  } else {
    errors.push(`❌ coverAttribution not set correctly: ${afterState.coverAttribution}`)
  }
  
  if (afterState.coverOriginalUrl && afterState.coverOriginalUrl.includes('comicvine')) {
    changes.push(`✅ coverOriginalUrl set to ComicVine URL`)
  } else {
    errors.push(`❌ coverOriginalUrl not set correctly: ${afterState.coverOriginalUrl}`)
  }
  
  // Check fields that should stay the same
  if (beforeState.id === afterState.id) {
    changes.push(`✅ Comic ID unchanged: ${afterState.id}`)
  } else {
    errors.push('❌ Comic ID changed unexpectedly')
  }
  
  if (afterState.hasCover === true) {
    changes.push(`✅ hasCover remains true`)
  } else {
    errors.push('❌ hasCover is not true')
  }
  
  if (afterState.coverSource === 'api') {
    changes.push(`✅ coverSource set to: api`)
  } else {
    errors.push(`❌ coverSource not set correctly: ${afterState.coverSource}`)
  }
  
  console.log('\n   Changes:')
  changes.forEach(change => console.log(`   ${change}`))
  
  if (errors.length > 0) {
    console.log('\n   Errors:')
    errors.forEach(error => console.log(`   ${error}`))
    throw new Error(`Verification failed with ${errors.length} errors`)
  }
  
  console.log('')
}

async function verifyCoverImageExists(comicId) {
  console.log('7️⃣ Verifying cover image exists in database...')
  
  const response = await fetch(`${API_BASE_URL}/api/images/${comicId}/metadata`)
  
  if (!response.ok) {
    throw new Error(`Cover image not found: ${response.status}`)
  }
  
  const metadata = await response.json()
  
  console.log(`✅ Cover image verified`)
  console.log(`   comicId: ${metadata.comicId}`)
  console.log(`   source: ${metadata.metadata?.source}`)
  console.log(`   provider: ${metadata.metadata?.provider}`)
  console.log(`   mimeType: ${metadata.metadata?.mimeType}\n`)
  
  return metadata
}

async function runTest() {
  console.log('🧪 Testing Cover Replacement with ComicVine API...\n')
  console.log(`📡 API Base URL: ${API_BASE_URL}`)
  console.log(`🧪 Test Comic ID: ${TEST_COMIC_ID}`)
  console.log(`📚 Comic: ${COMIC_DETAILS.series} #${COMIC_DETAILS.issueNumber}\n`)
  
  let beforeState
  let afterState
  
  try {
    // Check server
    const serverReady = await waitForServer()
    if (!serverReady) {
      throw new Error('Server is not running')
    }
    
    // Step 1: Get current state
    beforeState = await getCurrentComicState(TEST_COMIC_ID)
    
    // Step 2: Search ComicVine for covers
    const coverResults = await searchComicVineCovers(
      COMIC_DETAILS.series,
      COMIC_DETAILS.issueNumber,
      COMIC_DETAILS.publisher,
      COMIC_DETAILS.year
    )
    
    const selectedCover = coverResults[0]
    
    // Step 3: Download the cover image
    const imageData = await downloadCoverImage(selectedCover.imageUrl)
    
    // Step 4: Upload new cover
    const newCoverId = await uploadNewCover(TEST_COMIC_ID, imageData, selectedCover)
    
    // Step 5: Update comic metadata
    afterState = await updateComicMetadata(TEST_COMIC_ID, beforeState, newCoverId, selectedCover)
    
    // Step 6: Verify changes
    await verifyChanges(beforeState, afterState)
    
    // Step 7: Verify cover image exists
    await verifyCoverImageExists(TEST_COMIC_ID)
    
    // Success!
    console.log('🎉 ComicVine Cover Replacement Test PASSED!\n')
    console.log('✅ Test Results:')
    console.log('   ✅ Current state retrieval: PASSED')
    console.log('   ✅ ComicVine API search: PASSED')
    console.log('   ✅ Cover image download: PASSED')
    console.log('   ✅ Cover upload to database: PASSED')
    console.log('   ✅ Comic metadata update: PASSED')
    console.log('   ✅ Change verification: PASSED')
    console.log('   ✅ Cover image verification: PASSED')
    console.log('')
    
    console.log('📊 Summary:')
    console.log(`   Comic: ${COMIC_DETAILS.series} #${COMIC_DETAILS.issueNumber}`)
    console.log(`   Old coverId: ${beforeState.coverId}`)
    console.log(`   New coverId: ${afterState.coverId}`)
    console.log(`   Provider: ${afterState.coverSourceProvider}`)
    console.log(`   Source: ${afterState.coverSource}`)
    console.log(`   Image URL: ${afterState.coverOriginalUrl}`)
    console.log('')
    
  } catch (error) {
    console.error('❌ Test FAILED:', error.message)
    console.error('\n🔍 Error details:')
    console.error(`   ${error.stack}`)
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Troubleshooting:')
      console.error('   - Make sure the server is running')
      console.error('   - Check if the API_BASE_URL is correct')
    }
    
    if (error.message.includes('Cover search failed')) {
      console.error('\n💡 Troubleshooting:')
      console.error('   - Verify COMICVINE_API_KEY is set in environment')
      console.error('   - Check ComicVine API rate limits')
      console.error('   - Verify the comic details are correct')
    }
    
    process.exit(1)
  }
}

// Run the test
console.log('🚀 Starting ComicVine Cover Replacement Test...\n')
runTest().catch(console.error)
