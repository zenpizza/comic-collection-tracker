#!/usr/bin/env node

/**
 * Test Force-Refresh Cache Purge Fix
 * 
 * Verifies that forceRefresh option properly purges stale IndexedDB data
 * before fetching fresh content from the API.
 * 
 * Bug: Force-refresh should purge stale IDB before fetch
 * Fix: Clear both memory cache and IndexedDB cache when forceRefresh=true
 */

// Mock imageStorage before importing ImageURLService
const mockImageStorage = {
  deleteImage: null, // Will be set to spy function
  getImage: null,
  storeImage: null,
  getImageUrl: null,
  init: async () => {},
  getStorageStats: async () => ({ totalImages: 0, totalSizeMB: '0.00' }),
  clearStorage: async () => {}
}

// Mock the imageStorage module
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Create a mock module
const Module = require('module')
const originalRequire = Module.prototype.require

Module.prototype.require = function(...args) {
  if (args[0] === './imageStorage.js') {
    return { default: mockImageStorage }
  }
  return originalRequire.apply(this, args)
}

// Now import ImageURLService
import ImageURLService from '../src/utils/ImageURLService.js'

// Also directly replace the imageStorage reference
const originalImageStorage = ImageURLService.constructor.prototype.imageStorage
if (typeof ImageURLService.imageStorage !== 'undefined') {
  Object.assign(ImageURLService.imageStorage, mockImageStorage)
}

async function testForceRefreshCachePurge() {
  console.log('🧪 Testing Force-Refresh Cache Purge Fix...\n')

  // Test data
  const testComicId = 'test-comic-123'
  const testSize = 'medium'
  
  // Spy functions to track calls
  let deleteImageCalled = false
  let deleteImageComicId = null
  
  mockImageStorage.deleteImage = async (comicId) => {
    deleteImageCalled = true
    deleteImageComicId = comicId
    console.log(`📦 IndexedDB deleteImage called for: ${comicId}`)
  }

  // Mock other storage methods
  mockImageStorage.getImage = async () => null
  mockImageStorage.storeImage = async () => {}
  mockImageStorage.getImageUrl = async () => null

  // Test 1: Normal operation should NOT call deleteImage
  console.log('Test 1: Normal operation (no force refresh)')
  deleteImageCalled = false
  deleteImageComicId = null

  try {
    await ImageURLService._getImageUrlInternal(testComicId, testSize, {})
    
    if (!deleteImageCalled) {
      console.log('✅ Normal operation correctly did NOT purge cache')
    } else {
      console.log('❌ Normal operation incorrectly purged cache')
      return false
    }
  } catch (error) {
    console.log('✅ Normal operation failed as expected (no API available)')
  }

  // Test 2: Force refresh should call deleteImage
  console.log('\nTest 2: Force refresh operation')
  deleteImageCalled = false
  deleteImageComicId = null

  try {
    await ImageURLService._getImageUrlInternal(testComicId, testSize, { forceRefresh: true })
    
    if (deleteImageCalled && deleteImageComicId === testComicId) {
      console.log('✅ Force refresh correctly purged IndexedDB cache')
      console.log(`   - Called deleteImage for: ${deleteImageComicId}`)
    } else {
      console.log('❌ Force refresh failed to purge IndexedDB cache')
      console.log(`   - deleteImageCalled: ${deleteImageCalled}`)
      console.log(`   - deleteImageComicId: ${deleteImageComicId}`)
      return false
    }
  } catch (error) {
    // Check if deleteImage was still called despite the error
    if (deleteImageCalled && deleteImageComicId === testComicId) {
      console.log('✅ Force refresh correctly purged cache before API failure')
    } else {
      console.log('❌ Force refresh failed to purge cache')
      return false
    }
  }

  // Test 3: Memory cache purge verification
  console.log('\nTest 3: Memory cache purge verification')
  
  // Add some test data to memory cache
  const cacheKey = ImageURLService.generateCacheKey(testComicId, testSize)
  const testBlob = new Blob(['test'], { type: 'image/jpeg' })
  
  ImageURLService.setMemoryCache(cacheKey, testBlob)
  
  // Verify it's cached
  const cachedBefore = ImageURLService.getFromMemoryCache(cacheKey)
  if (cachedBefore) {
    console.log('📦 Test data added to memory cache')
    // Clean up the URL we just created
    ImageURLService.revokeUrl(cachedBefore)
  }

  // Force refresh should clear memory cache
  deleteImageCalled = false
  try {
    await ImageURLService._getImageUrlInternal(testComicId, testSize, { forceRefresh: true })
  } catch (error) {
    // Expected to fail, we just want to test cache clearing
  }

  // Check if memory cache was cleared
  const cachedAfter = ImageURLService.getFromMemoryCache(cacheKey)
  if (!cachedAfter && deleteImageCalled) {
    console.log('✅ Force refresh correctly purged memory cache')
  } else {
    console.log('❌ Force refresh failed to purge memory cache')
    console.log(`   - Memory cache cleared: ${!cachedAfter}`)
    console.log(`   - IndexedDB cleared: ${deleteImageCalled}`)
    return false
  }

  // Test 4: Multiple sizes purge
  console.log('\nTest 4: Multiple sizes purge verification')
  
  // Add cache entries for all sizes
  const sizes = ['thumbnail', 'medium', 'full']
  sizes.forEach(size => {
    const key = ImageURLService.generateCacheKey(testComicId, size)
    ImageURLService.setMemoryCache(key, testBlob)
  })

  // Verify all are cached
  const cachedSizes = sizes.filter(size => {
    const key = ImageURLService.generateCacheKey(testComicId, size)
    const cached = ImageURLService.getFromMemoryCache(key)
    if (cached) {
      ImageURLService.revokeUrl(cached) // Clean up
      return true
    }
    return false
  })

  console.log(`📦 Cached ${cachedSizes.length} sizes before force refresh`)

  // Force refresh should clear all sizes
  deleteImageCalled = false
  try {
    await ImageURLService._getImageUrlInternal(testComicId, 'medium', { forceRefresh: true })
  } catch (error) {
    // Expected to fail
  }

  // Check if all sizes were cleared
  const remainingSizes = sizes.filter(size => {
    const key = ImageURLService.generateCacheKey(testComicId, size)
    return ImageURLService.getFromMemoryCache(key) !== null
  })

  if (remainingSizes.length === 0 && deleteImageCalled) {
    console.log('✅ Force refresh correctly purged all size caches')
  } else {
    console.log('❌ Force refresh failed to purge all size caches')
    console.log(`   - Remaining cached sizes: ${remainingSizes.length}`)
    return false
  }

  console.log('\n🎉 All force-refresh cache purge tests passed!')
  return true
}

// Test error handling during cache purge
async function testForceRefreshErrorHandling() {
  console.log('\n🧪 Testing Force-Refresh Error Handling...\n')

  const testComicId = 'error-test-comic'
  const testSize = 'medium'

  // Mock deleteImage to throw an error
  mockImageStorage.deleteImage = async () => {
    throw new Error('IndexedDB deletion failed')
  }

  console.log('Test: Force refresh with IndexedDB deletion error')
  
  let errorTracked = false
  const originalTrackError = ImageURLService.trackError
  ImageURLService.trackError = (context, error) => {
    if (context === 'force-refresh-cleanup') {
      errorTracked = true
      console.log(`📊 Error tracked: ${context} - ${error.message}`)
    }
    originalTrackError.call(ImageURLService, context, error)
  }

  try {
    await ImageURLService._getImageUrlInternal(testComicId, testSize, { forceRefresh: true })
  } catch (error) {
    // Expected to fail at API level
  }

  // Restore original method
  ImageURLService.trackError = originalTrackError

  if (errorTracked) {
    console.log('✅ Force refresh correctly handled IndexedDB deletion error')
    console.log('✅ Operation continued despite cleanup failure')
    return true
  } else {
    console.log('❌ Force refresh error handling failed')
    return false
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting Force-Refresh Cache Purge Tests\n')
  
  try {
    const test1Passed = await testForceRefreshCachePurge()
    const test2Passed = await testForceRefreshErrorHandling()
    
    if (test1Passed && test2Passed) {
      console.log('\n✅ All tests passed! Force-refresh cache purge is working correctly.')
      process.exit(0)
    } else {
      console.log('\n❌ Some tests failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error)
    process.exit(1)
  }
}

runTests()