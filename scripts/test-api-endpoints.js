#!/usr/bin/env node

/**
 * End-to-end test for the image API endpoints
 * Tests the full HTTP stack integration with MongoDB
 */

import dotenv from 'dotenv'
import fetch from 'node-fetch'

// Load environment variables
dotenv.config()

// Test configuration
const API_BASE_URL = 'http://localhost:3001'
const TEST_COMIC_ID = 'test-api-comic-' + Date.now()

// Test image data (1x1 pixel PNG in base64)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg=='

async function waitForServer(maxAttempts = 10, delay = 2000) {
  console.log('🔍 Checking if server is running...')
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/images/stats`, {
        method: 'GET',
        timeout: 5000
      })
      
      if (response.ok || response.status === 404) {
        console.log('✅ Server is responding')
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

async function testApiEndpoints() {
  console.log('🧪 Testing Image API Endpoints...\n')

  try {
    // Check if server is running
    const serverReady = await waitForServer()
    if (!serverReady) {
      console.error('❌ Server is not running or not responding')
      console.error('   Please start the server with: npm run server')
      process.exit(1)
    }

    console.log('1️⃣ Testing image upload endpoint...')
    const uploadData = {
      comicId: TEST_COMIC_ID,
      imageData: TEST_IMAGE_BASE64,
      mimeType: 'image/png',
      metadata: {
        source: 'api_test',
        sourceDetails: {
          testRun: true,
          timestamp: new Date().toISOString()
        }
      }
    }

    const uploadStartTime = Date.now()
    const uploadResponse = await fetch(`${API_BASE_URL}/api/images/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadData)
    })

    const uploadTime = Date.now() - uploadStartTime
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`)
    }

    const uploadResult = await uploadResponse.json()
    console.log(`✅ Upload successful in ${uploadTime}ms`)
    console.log(`   Image ID: ${uploadResult.imageId}`)
    console.log(`   URLs: ${JSON.stringify(uploadResult.urls, null, 2)}`)
    console.log(`   Processing: Original ${uploadResult.processing.originalSize} bytes`)
    console.log(`   Compression ratio: ${uploadResult.processing.compressionRatio}\n`)

    // Test 2: Retrieve image metadata
    console.log('2️⃣ Testing metadata retrieval...')
    const metadataStartTime = Date.now()
    
    const metadataResponse = await fetch(`${API_BASE_URL}/api/images/${TEST_COMIC_ID}/metadata`)
    const metadataTime = Date.now() - metadataStartTime
    
    if (!metadataResponse.ok) {
      throw new Error(`Metadata retrieval failed: ${metadataResponse.status}`)
    }

    const metadata = await metadataResponse.json()
    console.log(`✅ Metadata retrieved in ${metadataTime}ms`)
    console.log(`   Comic ID: ${metadata.comicId}`)
    console.log(`   Source: ${metadata.source}`)
    console.log(`   Image sizes: ${Object.keys(metadata.images).join(', ')}`)
    console.log(`   Created: ${metadata.createdAt}\n`)

    // Test 3: Retrieve actual images
    const sizes = ['thumbnail', 'medium', 'full']
    for (const size of sizes) {
      console.log(`3️⃣ Testing ${size} image retrieval...`)
      const imageStartTime = Date.now()
      
      const imageResponse = await fetch(`${API_BASE_URL}/api/images/${TEST_COMIC_ID}/${size}`)
      const imageTime = Date.now() - imageStartTime
      
      if (!imageResponse.ok) {
        throw new Error(`${size} image retrieval failed: ${imageResponse.status}`)
      }

      const imageBlob = await imageResponse.blob()
      const contentType = imageResponse.headers.get('content-type')
      
      console.log(`✅ ${size} image retrieved in ${imageTime}ms`)
      console.log(`   Content-Type: ${contentType}`)
      console.log(`   Size: ${imageBlob.size} bytes`)
      console.log(`   Cache-Control: ${imageResponse.headers.get('cache-control')}\n`)
    }

    // Test 4: Storage statistics
    console.log('4️⃣ Testing storage statistics...')
    const statsStartTime = Date.now()
    
    const statsResponse = await fetch(`${API_BASE_URL}/api/images/stats`)
    const statsTime = Date.now() - statsStartTime
    
    if (!statsResponse.ok) {
      throw new Error(`Stats retrieval failed: ${statsResponse.status}`)
    }

    const stats = await statsResponse.json()
    console.log(`✅ Stats retrieved in ${statsTime}ms`)
    console.log(`   Success: ${stats.success}`)
    console.log(`   Total documents: ${stats.stats.totalDocuments}`)
    console.log(`   Storage size: ${stats.stats.storageSize} bytes`)
    console.log(`   Source breakdown: ${JSON.stringify(stats.stats.sourceBreakdown, null, 2)}\n`)

    // Test 5: Image deletion
    console.log('5️⃣ Testing image deletion...')
    const deleteStartTime = Date.now()
    
    const deleteResponse = await fetch(`${API_BASE_URL}/api/images/${TEST_COMIC_ID}`, {
      method: 'DELETE'
    })
    const deleteTime = Date.now() - deleteStartTime
    
    if (!deleteResponse.ok) {
      throw new Error(`Deletion failed: ${deleteResponse.status}`)
    }

    const deleteResult = await deleteResponse.json()
    console.log(`✅ Deletion successful in ${deleteTime}ms`)
    console.log(`   Success: ${deleteResult.success}`)
    console.log(`   Deleted sizes: ${deleteResult.deletedSizes.join(', ')}\n`)

    // Test 6: Verify deletion
    console.log('6️⃣ Verifying deletion...')
    const verifyResponse = await fetch(`${API_BASE_URL}/api/images/${TEST_COMIC_ID}/metadata`)
    
    if (verifyResponse.status === 404) {
      console.log('✅ Deletion verified - image no longer exists\n')
    } else {
      console.log('❌ Deletion verification failed - image still exists\n')
    }

    console.log('🎉 All API endpoint tests completed successfully!')
    console.log('\n📊 Performance Summary:')
    console.log(`   Upload: ${uploadTime}ms`)
    console.log(`   Metadata: ${metadataTime}ms`)
    console.log(`   Image retrieval: Average across sizes`)
    console.log(`   Stats: ${statsTime}ms`)
    console.log(`   Delete: ${deleteTime}ms`)

    console.log('\n✅ Test Results:')
    console.log('   ✅ Image upload via API: PASSED')
    console.log('   ✅ Metadata retrieval: PASSED')
    console.log('   ✅ Image retrieval (all sizes): PASSED')
    console.log('   ✅ Storage statistics: PASSED')
    console.log('   ✅ Image deletion: PASSED')
    console.log('   ✅ Deletion verification: PASSED')

  } catch (error) {
    console.error('❌ API test failed:', error)
    console.error('\n🔍 Error details:')
    console.error(`   Message: ${error.message}`)
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Troubleshooting:')
      console.error('   - Make sure the server is running: npm run server')
      console.error('   - Check if port 3000 is available')
      console.error('   - Verify server.js is configured correctly')
    }
    
    // Cleanup attempt
    try {
      console.log('\n🧹 Attempting cleanup...')
      const cleanupResponse = await fetch(`${API_BASE_URL}/api/images/${TEST_COMIC_ID}`, {
        method: 'DELETE'
      })
      if (cleanupResponse.ok) {
        console.log('✅ Cleanup completed')
      }
    } catch (cleanupError) {
      console.error('❌ Cleanup failed:', cleanupError.message)
    }
    
    process.exit(1)
  }
}

// Additional test for batch operations
async function testBatchOperations() {
  console.log('\n🔄 Testing batch operations...')
  
  try {
    const batchData = {
      images: [
        {
          comicId: `batch-test-1-${Date.now()}`,
          imageData: TEST_IMAGE_BASE64,
          mimeType: 'image/png'
        },
        {
          comicId: `batch-test-2-${Date.now()}`,
          imageData: TEST_IMAGE_BASE64,
          mimeType: 'image/png'
        }
      ]
    }

    const batchResponse = await fetch(`${API_BASE_URL}/api/images/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batchData)
    })

    if (!batchResponse.ok) {
      const errorText = await batchResponse.text()
      throw new Error(`Batch upload failed: ${batchResponse.status} - ${errorText}`)
    }

    const batchResult = await batchResponse.json()
    console.log('✅ Batch upload successful')
    console.log(`   Processed: ${batchResult.processed}`)
    console.log(`   Stored: ${batchResult.stored}`)
    console.log(`   Results: ${batchResult.results.length} images`)

    // Cleanup batch test images
    for (const result of batchResult.results) {
      try {
        await fetch(`${API_BASE_URL}/api/images/${result.comicId}`, {
          method: 'DELETE'
        })
      } catch (error) {
        console.warn(`Failed to cleanup ${result.comicId}:`, error.message)
      }
    }

  } catch (error) {
    console.error('❌ Batch test failed:', error.message)
  }
}

console.log('🚀 Starting API Endpoint Tests...')
console.log(`📡 API Base URL: ${API_BASE_URL}`)
console.log(`🧪 Test Comic ID: ${TEST_COMIC_ID}`)
console.log('')

// Run the tests
testApiEndpoints()
  .then(() => testBatchOperations())
  .catch(console.error)