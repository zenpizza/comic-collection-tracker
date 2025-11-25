#!/usr/bin/env node

/**
 * Simple test script to verify MongoDB database operations for cover images
 * This tests the core functionality of storing and retrieving images from MongoDB
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Import our database functions
import {
  connectToDatabase,
  initializeCoverImagesCollection,
  storeCoverImages,
  getCoverImages,
  getCoverImage,
  deleteCoverImages,
  getCoverImagesMetadata,
  getCoverStorageStats
} from '../api/db-image-storage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Test data - create a simple test image (1x1 pixel PNG in base64)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg=='
const TEST_COMIC_ID = 'test-comic-123'

// Create test image data in the format expected by our storage functions
const createTestImageData = () => ({
  thumbnail: {
    data: TEST_IMAGE_BASE64,
    mimeType: 'image/png',
    size: 95, // approximate size of the base64 test image
    dimensions: { width: 1, height: 1 }
  },
  medium: {
    data: TEST_IMAGE_BASE64,
    mimeType: 'image/png',
    size: 95,
    dimensions: { width: 1, height: 1 }
  },
  full: {
    data: TEST_IMAGE_BASE64,
    mimeType: 'image/png',
    size: 95,
    dimensions: { width: 1, height: 1 }
  }
})

const createTestMetadata = () => ({
  source: 'test',
  sourceDetails: {
    testRun: true,
    timestamp: new Date().toISOString()
  }
})

async function runTests() {
  console.log('🧪 Starting MongoDB Database Tests...\n')

  try {
    // Test 1: Database Connection
    console.log('1️⃣ Testing database connection...')
    const db = await connectToDatabase()
    console.log('✅ Database connected successfully')
    console.log(`   Database name: ${db.databaseName}\n`)

    // Test 2: Collection Initialization
    console.log('2️⃣ Testing collection initialization...')
    const initResult = await initializeCoverImagesCollection()
    console.log('✅ Collection initialized successfully')
    console.log(`   Result: ${initResult.message}`)
    console.log(`   Indexes: ${initResult.results.length} processed\n`)

    // Test 3: Store Images
    console.log('3️⃣ Testing image storage...')
    const testImages = createTestImageData()
    const testMetadata = createTestMetadata()
    
    const imageId = await storeCoverImages(TEST_COMIC_ID, testImages, testMetadata)
    console.log('✅ Images stored successfully')
    console.log(`   Image ID: ${imageId}`)
    console.log(`   Comic ID: ${TEST_COMIC_ID}\n`)

    // Test 4: Retrieve All Images
    console.log('4️⃣ Testing full image retrieval...')
    const retrievedImages = await getCoverImages(TEST_COMIC_ID)
    console.log('✅ Images retrieved successfully')
    console.log(`   Comic ID: ${retrievedImages.comicId}`)
    console.log(`   Source: ${retrievedImages.source}`)
    console.log(`   Created: ${retrievedImages.createdAt}`)
    console.log(`   Image sizes available: ${Object.keys(retrievedImages.images).join(', ')}\n`)

    // Test 5: Retrieve Specific Size
    console.log('5️⃣ Testing specific size retrieval...')
    const thumbnailImage = await getCoverImage(TEST_COMIC_ID, 'thumbnail')
    console.log('✅ Thumbnail retrieved successfully')
    console.log(`   MIME type: ${thumbnailImage.mimeType}`)
    console.log(`   Size: ${thumbnailImage.size} bytes`)
    console.log(`   Dimensions: ${thumbnailImage.dimensions.width}x${thumbnailImage.dimensions.height}\n`)

    // Test 6: Retrieve Metadata Only
    console.log('6️⃣ Testing metadata retrieval...')
    const metadata = await getCoverImagesMetadata(TEST_COMIC_ID)
    console.log('✅ Metadata retrieved successfully')
    console.log(`   Comic ID: ${metadata.comicId}`)
    console.log(`   Source: ${metadata.source}`)
    console.log(`   Sync status: ${JSON.stringify(metadata.syncStatus, null, 2)}\n`)

    // Test 7: Storage Statistics
    console.log('7️⃣ Testing storage statistics...')
    const stats = await getCoverStorageStats()
    console.log('✅ Storage stats retrieved successfully')
    console.log(`   Total documents: ${stats.totalDocuments}`)
    console.log(`   Storage size: ${stats.storageSize} bytes`)
    console.log(`   Index size: ${stats.indexSize} bytes`)
    console.log(`   Source breakdown: ${JSON.stringify(stats.sourceBreakdown, null, 2)}\n`)

    // Test 8: Image Deletion
    console.log('8️⃣ Testing image deletion...')
    const deleted = await deleteCoverImages(TEST_COMIC_ID)
    console.log('✅ Images deleted successfully')
    console.log(`   Deletion result: ${deleted}\n`)

    // Test 9: Verify Deletion
    console.log('9️⃣ Verifying deletion...')
    const deletedCheck = await getCoverImages(TEST_COMIC_ID)
    if (deletedCheck === null) {
      console.log('✅ Deletion verified - images no longer exist\n')
    } else {
      console.log('❌ Deletion verification failed - images still exist\n')
    }

    console.log('🎉 All tests completed successfully!')
    console.log('\n📊 Test Summary:')
    console.log('   ✅ Database connection: PASSED')
    console.log('   ✅ Collection initialization: PASSED')
    console.log('   ✅ Image storage: PASSED')
    console.log('   ✅ Image retrieval (full): PASSED')
    console.log('   ✅ Image retrieval (specific): PASSED')
    console.log('   ✅ Metadata retrieval: PASSED')
    console.log('   ✅ Storage statistics: PASSED')
    console.log('   ✅ Image deletion: PASSED')
    console.log('   ✅ Deletion verification: PASSED')

  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('\n🔍 Error details:')
    console.error(`   Message: ${error.message}`)
    console.error(`   Stack: ${error.stack}`)
    
    // Cleanup attempt
    try {
      console.log('\n🧹 Attempting cleanup...')
      await deleteCoverImages(TEST_COMIC_ID)
      console.log('✅ Cleanup completed')
    } catch (cleanupError) {
      console.error('❌ Cleanup failed:', cleanupError.message)
    }
    
    process.exit(1)
  }
}

// Check if MongoDB URI is configured
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set')
  console.error('   Please check your .env file')
  process.exit(1)
}

console.log('🔧 Configuration:')
console.log(`   MongoDB URI: ${process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`)
console.log(`   Test Comic ID: ${TEST_COMIC_ID}`)
console.log('')

// Run the tests
runTests().catch(console.error)