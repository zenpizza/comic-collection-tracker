#!/usr/bin/env node

/**
 * End-to-end test for the cover replacement flow
 * Tests the complete flow from cover selection/upload through database updates
 * 
 * Flow tested:
 * 1. Create a test comic
 * 2. Upload initial cover
 * 3. Replace cover with new image
 * 4. Verify database changes
 * 5. Cleanup
 */

import dotenv from 'dotenv'
import fetch from 'node-fetch'
import { MongoClient } from 'mongodb'

// Load environment variables
dotenv.config()

// Test configuration
// Use production Vercel URL by default, or override with API_BASE_URL env var
const API_BASE_URL = process.env.API_BASE_URL || 'https://comic-collection-tracker.vercel.app'
const MONGODB_URI = process.env.MONGODB_URI

// Test data
const TEST_COMIC_ID = Date.now()
const TEST_COMIC = {
  id: TEST_COMIC_ID,
  series: 'Test Series',
  issueNumber: '1',
  publisher: 'Test Publisher',
  year: 2025,
  variant: '',
  notes: 'Test comic for cover replacement',
  dateAdded: new Date().toISOString()
}

// Test images (1x1 pixel PNGs in base64 - different colors)
const INITIAL_COVER_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg==' // Red
const REPLACEMENT_COVER_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==' // Blue

let mongoClient
let db

async function connectToMongoDB() {
  if (!MONGODB_URI) {
    console.log('⚠️  MONGODB_URI not set - skipping direct database verification')
    console.log('   (Test will still verify via API calls)\n')
    return null
  }
  
  try {
    mongoClient = new MongoClient(MONGODB_URI)
    await mongoClient.connect()
    db = mongoClient.db('comic-collection')
    console.log('✅ Connected to MongoDB for direct verification\n')
    return db
  } catch (error) {
    console.log('⚠️  Could not connect to MongoDB - skipping direct database verification')
    console.log(`   Error: ${error.message}`)
    console.log('   (Test will still verify via API calls)\n')
    return null
  }
}

async function disconnectFromMongoDB() {
  if (mongoClient) {
    await mongoClient.close()
    console.log('✅ Disconnected from MongoDB')
  }
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

async function createTestComic() {
  console.log('1️⃣ Creating test comic...')
  
  const response = await fetch(`${API_BASE_URL}/api/comics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(TEST_COMIC)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create comic: ${response.status} - ${errorText}`)
  }
  
  const result = await response.json()
  console.log(`✅ Test comic created: ${result.comic.series} #${result.comic.issueNumber}`)
  console.log(`   Comic ID: ${result.comic.id}\n`)
  
  return result.comic
}

async function uploadInitialCover(comicId) {
  console.log('2️⃣ Uploading initial cover...')
  
  const uploadData = {
    comicId: comicId,
    imageData: INITIAL_COVER_BASE64,
    mimeType: 'image/png',
    metadata: {
      source: 'upload',
      provider: null,
      originalUrl: null,
      attribution: null
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
    throw new Error(`Failed to upload initial cover: ${response.status} - ${errorText}`)
  }
  
  const result = await response.json()
  console.log(`✅ Initial cover uploaded`)
  console.log(`   Image ID: ${result.imageId}\n`)
  
  return result.imageId
}

async function updateComicWithCoverMetadata(comicId, coverId, metadata = {}) {
  console.log('3️⃣ Updating comic with cover metadata...')
  
  const updatedComic = {
    ...TEST_COMIC,
    id: comicId,
    coverUrl: null,
    hasCover: true,
    coverId: coverId,
    coverSource: metadata.source || 'upload',
    coverSourceProvider: metadata.provider || null,
    coverOriginalUrl: metadata.originalUrl || null,
    coverLastUpdated: new Date().toISOString(),
    coverAttribution: metadata.attribution || null
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
  console.log(`   hasCover: ${result.comic.hasCover}`)
  console.log(`   coverId: ${result.comic.coverId}`)
  console.log(`   coverSource: ${result.comic.coverSource}\n`)
  
  return result.comic
}

async function verifyDatabaseState(comicId, expectedCoverId, phase) {
  console.log(`4️⃣ Verifying database state (${phase})...`)
  
  if (!db) {
    console.log('   ⚠️  Skipping direct database verification (no MongoDB connection)')
    console.log('   Verifying via API instead...')
    
    // Verify via API
    const comicResponse = await fetch(`${API_BASE_URL}/api/comics/${comicId}`)
    if (!comicResponse.ok) {
      throw new Error(`Failed to fetch comic via API: ${comicResponse.status}`)
    }
    const comicData = await comicResponse.json()
    const comic = comicData.comic
    
    console.log(`   Comics Collection (via API):`)
    console.log(`   - hasCover: ${comic.hasCover}`)
    console.log(`   - coverId: ${comic.coverId}`)
    console.log(`   - coverSource: ${comic.coverSource}`)
    console.log(`   - coverSourceProvider: ${comic.coverSourceProvider}`)
    console.log(`   - coverLastUpdated: ${comic.coverLastUpdated}`)
    console.log(`   - coverAttribution: ${comic.coverAttribution}`)
    
    // Verify cover image exists via metadata endpoint
    const metadataResponse = await fetch(`${API_BASE_URL}/api/images/${comicId}/metadata`)
    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch cover metadata via API: ${metadataResponse.status}`)
    }
    const coverImage = await metadataResponse.json()
    
    console.log(`   Cover Images Collection (via API):`)
    console.log(`   - comicId: ${coverImage.comicId}`)
    console.log(`   - metadata.source: ${coverImage.metadata?.source}`)
    console.log(`   - metadata.provider: ${coverImage.metadata?.provider}`)
    console.log(`   - metadata.mimeType: ${coverImage.metadata?.mimeType}`)
    console.log(`   - uploadedAt: ${coverImage.uploadedAt}`)
    console.log(`   - updatedAt: ${coverImage.updatedAt}`)
    
    // Verify coverId matches
    if (comic.coverId !== expectedCoverId) {
      throw new Error(`Cover ID mismatch: expected ${expectedCoverId}, got ${comic.coverId}`)
    }
    
    console.log(`✅ Database state verified for ${phase}\n`)
    return { comic, coverImage }
  }
  
  // Direct MongoDB verification
  const comicsCollection = db.collection('comics')
  const comic = await comicsCollection.findOne({ id: comicId })
  
  if (!comic) {
    throw new Error('Comic not found in database')
  }
  
  console.log(`   Comics Collection:`)
  console.log(`   - hasCover: ${comic.hasCover}`)
  console.log(`   - coverId: ${comic.coverId}`)
  console.log(`   - coverSource: ${comic.coverSource}`)
  console.log(`   - coverSourceProvider: ${comic.coverSourceProvider}`)
  console.log(`   - coverLastUpdated: ${comic.coverLastUpdated}`)
  console.log(`   - coverAttribution: ${comic.coverAttribution}`)
  
  // Check cover images collection
  const coverImagesCollection = db.collection('cover-images')
  const coverImage = await coverImagesCollection.findOne({ comicId: comicId })
  
  if (!coverImage) {
    throw new Error('Cover image not found in database')
  }
  
  console.log(`   Cover Images Collection:`)
  console.log(`   - comicId: ${coverImage.comicId}`)
  console.log(`   - metadata.source: ${coverImage.metadata?.source}`)
  console.log(`   - metadata.provider: ${coverImage.metadata?.provider}`)
  console.log(`   - metadata.mimeType: ${coverImage.metadata?.mimeType}`)
  console.log(`   - uploadedAt: ${coverImage.uploadedAt}`)
  console.log(`   - updatedAt: ${coverImage.updatedAt}`)
  
  // Verify coverId matches
  if (comic.coverId !== expectedCoverId) {
    throw new Error(`Cover ID mismatch: expected ${expectedCoverId}, got ${comic.coverId}`)
  }
  
  console.log(`✅ Database state verified for ${phase}\n`)
  
  return { comic, coverImage }
}

async function replaceCover(comicId, oldCoverId) {
  console.log('5️⃣ Replacing cover with new image...')
  
  // Upload new cover
  const newCoverId = Date.now().toString()
  const uploadData = {
    comicId: comicId,
    imageData: REPLACEMENT_COVER_BASE64,
    mimeType: 'image/png',
    metadata: {
      source: 'api',
      provider: 'comicvine',
      originalUrl: 'https://example.com/cover.jpg',
      attribution: 'Cover image provided by Comic Vine'
    }
  }
  
  const uploadResponse = await fetch(`${API_BASE_URL}/api/images/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(uploadData)
  })
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    throw new Error(`Failed to upload replacement cover: ${uploadResponse.status} - ${errorText}`)
  }
  
  const uploadResult = await uploadResponse.json()
  console.log(`✅ Replacement cover uploaded`)
  console.log(`   New Image ID: ${uploadResult.imageId}`)
  
  // Update comic metadata with new cover info
  const updatedComic = {
    ...TEST_COMIC,
    id: comicId,
    coverUrl: null,
    hasCover: true,
    coverId: uploadResult.imageId || newCoverId,
    coverSource: 'api',
    coverSourceProvider: 'comicvine',
    coverOriginalUrl: 'https://example.com/cover.jpg',
    coverLastUpdated: new Date().toISOString(),
    coverAttribution: 'Cover image provided by Comic Vine'
  }
  
  const updateResponse = await fetch(`${API_BASE_URL}/api/comics/${comicId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedComic)
  })
  
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text()
    throw new Error(`Failed to update comic with new cover: ${updateResponse.status} - ${errorText}`)
  }
  
  const updateResult = await updateResponse.json()
  console.log(`✅ Comic updated with new cover metadata`)
  console.log(`   Old coverId: ${oldCoverId}`)
  console.log(`   New coverId: ${updateResult.comic.coverId}`)
  console.log(`   coverSourceProvider: ${updateResult.comic.coverSourceProvider}`)
  console.log(`   coverAttribution: ${updateResult.comic.coverAttribution}\n`)
  
  return {
    newCoverId: updateResult.comic.coverId,
    updatedComic: updateResult.comic
  }
}

async function verifyFieldChanges(beforeState, afterState) {
  console.log('6️⃣ Verifying field changes...')
  
  const changes = []
  
  // Check comic fields that should change
  if (beforeState.comic.coverId !== afterState.comic.coverId) {
    changes.push(`✅ coverId changed: ${beforeState.comic.coverId} → ${afterState.comic.coverId}`)
  } else {
    throw new Error('coverId did not change')
  }
  
  if (beforeState.comic.coverLastUpdated !== afterState.comic.coverLastUpdated) {
    changes.push(`✅ coverLastUpdated changed`)
  } else {
    throw new Error('coverLastUpdated did not change')
  }
  
  if (beforeState.comic.coverSourceProvider !== afterState.comic.coverSourceProvider) {
    changes.push(`✅ coverSourceProvider changed: ${beforeState.comic.coverSourceProvider} → ${afterState.comic.coverSourceProvider}`)
  } else {
    throw new Error('coverSourceProvider did not change')
  }
  
  if (beforeState.comic.coverAttribution !== afterState.comic.coverAttribution) {
    changes.push(`✅ coverAttribution changed: ${beforeState.comic.coverAttribution} → ${afterState.comic.coverAttribution}`)
  } else {
    throw new Error('coverAttribution did not change')
  }
  
  // Check cover image document
  if (beforeState.coverImage.updatedAt !== afterState.coverImage.updatedAt) {
    changes.push(`✅ Cover image updatedAt changed`)
  }
  
  // Fields that should stay the same
  if (beforeState.comic.id === afterState.comic.id) {
    changes.push(`✅ Comic ID unchanged: ${afterState.comic.id}`)
  } else {
    throw new Error('Comic ID changed unexpectedly')
  }
  
  if (beforeState.comic.hasCover === afterState.comic.hasCover && afterState.comic.hasCover === true) {
    changes.push(`✅ hasCover remains true`)
  } else {
    throw new Error('hasCover changed unexpectedly')
  }
  
  console.log('\n   Field Changes:')
  changes.forEach(change => console.log(`   ${change}`))
  console.log('')
}

async function cleanup(comicId) {
  console.log('7️⃣ Cleaning up test data...')
  
  try {
    // Delete cover image
    const imageResponse = await fetch(`${API_BASE_URL}/api/images/${comicId}`, {
      method: 'DELETE'
    })
    
    if (imageResponse.ok) {
      console.log('✅ Cover image deleted')
    }
    
    // Delete comic
    const comicResponse = await fetch(`${API_BASE_URL}/api/comics/${comicId}`, {
      method: 'DELETE'
    })
    
    if (comicResponse.ok) {
      console.log('✅ Test comic deleted')
    }
    
    console.log('')
  } catch (error) {
    console.warn('⚠️ Cleanup failed:', error.message)
  }
}

async function runTest() {
  console.log('🧪 Testing Cover Replacement Flow...\n')
  console.log(`📡 API Base URL: ${API_BASE_URL}`)
  console.log(`🗄️  MongoDB URI: ${MONGODB_URI ? '✓ Set' : '✗ Not set'}`)
  console.log(`🧪 Test Comic ID: ${TEST_COMIC_ID}\n`)
  
  let comicId = TEST_COMIC_ID
  let initialCoverId
  let beforeState
  let afterState
  
  try {
    // Check server
    const serverReady = await waitForServer()
    if (!serverReady) {
      throw new Error('Server is not running. Please start with: npm run server')
    }
    
    // Connect to MongoDB
    await connectToMongoDB()
    
    // Step 1: Create test comic
    const comic = await createTestComic()
    comicId = comic.id
    
    // Step 2: Upload initial cover
    initialCoverId = await uploadInitialCover(comicId)
    
    // Step 3: Update comic with initial cover metadata
    await updateComicWithCoverMetadata(comicId, initialCoverId, {
      source: 'upload',
      provider: null,
      originalUrl: null,
      attribution: null
    })
    
    // Step 4: Verify initial state
    beforeState = await verifyDatabaseState(comicId, initialCoverId, 'BEFORE replacement')
    
    // Step 5: Replace cover
    const { newCoverId } = await replaceCover(comicId, initialCoverId)
    
    // Step 6: Verify state after replacement
    afterState = await verifyDatabaseState(comicId, newCoverId, 'AFTER replacement')
    
    // Step 7: Verify field changes
    await verifyFieldChanges(beforeState, afterState)
    
    // Success!
    console.log('🎉 Cover Replacement Flow Test PASSED!\n')
    console.log('✅ Test Results:')
    console.log('   ✅ Comic creation: PASSED')
    console.log('   ✅ Initial cover upload: PASSED')
    console.log('   ✅ Comic metadata update: PASSED')
    console.log('   ✅ Database state verification (before): PASSED')
    console.log('   ✅ Cover replacement: PASSED')
    console.log('   ✅ Database state verification (after): PASSED')
    console.log('   ✅ Field change verification: PASSED')
    console.log('')
    
  } catch (error) {
    console.error('❌ Test FAILED:', error.message)
    console.error('\n🔍 Error details:')
    console.error(`   ${error.stack}`)
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Troubleshooting:')
      console.error('   - Make sure the server is running: npm run server')
      console.error('   - Check if the correct port is configured')
      console.error('   - Verify MongoDB connection string is correct')
    }
    
    process.exit(1)
  } finally {
    // Cleanup
    await cleanup(comicId)
    await disconnectFromMongoDB()
  }
}

// Run the test
console.log('🚀 Starting Cover Replacement Flow Test...\n')
runTest().catch(console.error)
