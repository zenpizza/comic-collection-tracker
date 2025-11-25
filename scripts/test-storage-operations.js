#!/usr/bin/env node

/**
 * Focused test for storage operations to identify specific issues
 */

import dotenv from 'dotenv'
dotenv.config()

import {
  connectToDatabase,
  storeCoverImages,
  getCoverImages,
  deleteCoverImages
} from '../api/db-image-storage.js'

const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg=='
const TEST_COMIC_ID = 'test-comic-storage-' + Date.now()

const createTestImageData = () => ({
  thumbnail: {
    data: TEST_IMAGE_BASE64,
    mimeType: 'image/png',
    size: 95,
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

async function testStorageOperations() {
  console.log('🧪 Testing storage operations...\n')

  try {
    console.log('1️⃣ Connecting to database...')
    const db = await connectToDatabase()
    console.log('✅ Connected\n')

    console.log('2️⃣ Storing test image...')
    const testImages = createTestImageData()
    const testMetadata = {
      source: 'test',
      sourceDetails: { test: true }
    }
    
    console.log(`   Comic ID: ${TEST_COMIC_ID}`)
    const startTime = Date.now()
    
    const imageId = await storeCoverImages(TEST_COMIC_ID, testImages, testMetadata)
    const storeTime = Date.now() - startTime
    
    console.log(`✅ Stored in ${storeTime}ms`)
    console.log(`   Image ID: ${imageId}\n`)

    console.log('3️⃣ Retrieving stored image...')
    const retrieveStartTime = Date.now()
    
    const retrieved = await getCoverImages(TEST_COMIC_ID)
    const retrieveTime = Date.now() - retrieveStartTime
    
    console.log(`✅ Retrieved in ${retrieveTime}ms`)
    console.log(`   Comic ID: ${retrieved.comicId}`)
    console.log(`   Source: ${retrieved.source}`)
    console.log(`   Has thumbnail: ${!!retrieved.images.thumbnail}`)
    console.log(`   Has medium: ${!!retrieved.images.medium}`)
    console.log(`   Has full: ${!!retrieved.images.full}\n`)

    console.log('4️⃣ Cleaning up...')
    const deleteStartTime = Date.now()
    
    const deleted = await deleteCoverImages(TEST_COMIC_ID)
    const deleteTime = Date.now() - deleteStartTime
    
    console.log(`✅ Deleted in ${deleteTime}ms`)
    console.log(`   Result: ${deleted}\n`)

    console.log('🎉 All storage operations completed successfully!')
    console.log(`📊 Performance:`)
    console.log(`   Store: ${storeTime}ms`)
    console.log(`   Retrieve: ${retrieveTime}ms`)
    console.log(`   Delete: ${deleteTime}ms`)

  } catch (error) {
    console.error('❌ Storage operation failed:', error)
    console.error(`   Error type: ${error.constructor.name}`)
    console.error(`   Message: ${error.message}`)
    
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

testStorageOperations().catch(console.error)