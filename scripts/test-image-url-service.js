#!/usr/bin/env node

/**
 * Simple test script for ImageURLService
 * Tests core functionality without Jest
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Mock browser environment
global.indexedDB = {
  open: () => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null
  })
}

global.URL = {
  createObjectURL: (blob) => `blob:mock-${Date.now()}-${Math.random()}`
}

// Mock navigator if it doesn't exist
if (typeof navigator === 'undefined') {
  global.navigator = {
    onLine: true
  }
} else {
  // Override onLine property if navigator exists
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    writable: true
  })
}

global.window = {
  addEventListener: () => {}
}

global.fetch = async (url, options = {}) => {
  // Mock API responses
  if (url.includes('image-metadata')) {
    return {
      ok: false,
      status: 200,
      json: async () => ({
        success: false,
        error: 'Image storage not configured'
      })
    }
  }
  
  if (url.includes('image-get')) {
    return {
      ok: false,
      status: 200,
      json: async () => ({
        success: false,
        error: 'Image storage not configured'
      })
    }
  }
  
  return {
    ok: false,
    status: 404
  }
}

// Mock Blob
global.Blob = class Blob {
  constructor(parts, options = {}) {
    this.size = parts.reduce((size, part) => size + (part.length || 0), 0)
    this.type = options.type || ''
  }
}

// Import the service after setting up mocks
const ImageURLService = (await import('../src/utils/ImageURLService.js')).default

// Test functions
async function runTests() {
  console.log('🧪 Testing ImageURLService...\n')
  
  let passed = 0
  let failed = 0
  
  function test(name, testFn) {
    return async () => {
      try {
        await testFn()
        console.log(`✅ ${name}`)
        passed++
      } catch (error) {
        console.log(`❌ ${name}: ${error.message}`)
        failed++
      }
    }
  }
  
  // Test 1: Invalid inputs should return null
  await test('Invalid inputs return null', async () => {
    const result1 = await ImageURLService.getImageUrl(null, 'medium')
    const result2 = await ImageURLService.getImageUrl('comic1', 'invalid')
    const result3 = await ImageURLService.getImageUrl('', 'medium')
    
    if (result1 !== null || result2 !== null || result3 !== null) {
      throw new Error('Expected null for invalid inputs')
    }
  })()
  
  // Test 2: Memory cache functionality
  await test('Memory cache works correctly', async () => {
    const comicId = 'test-comic'
    const size = 'medium'
    const testUrl = 'blob:test-url'
    
    // Set in memory cache
    const cacheKey = ImageURLService.generateCacheKey(comicId, size)
    ImageURLService.setMemoryCache(cacheKey, testUrl)
    
    // Should retrieve from memory cache
    const result = await ImageURLService.getImageUrl(comicId, size)
    
    if (result !== testUrl) {
      throw new Error(`Expected ${testUrl}, got ${result}`)
    }
    
    if (ImageURLService.stats.memoryHits !== 1) {
      throw new Error('Memory hit not recorded')
    }
  })()
  
  // Test 3: Cache key generation
  await test('Cache key generation is consistent', async () => {
    const key1 = ImageURLService.generateCacheKey('comic1', 'medium')
    const key2 = ImageURLService.generateCacheKey('comic1', 'medium')
    const key3 = ImageURLService.generateCacheKey('comic2', 'medium')
    
    if (key1 !== key2) {
      throw new Error('Same inputs should generate same key')
    }
    
    if (key1 === key3) {
      throw new Error('Different inputs should generate different keys')
    }
  })()
  
  // Test 4: Configuration management
  await test('Configuration can be updated', async () => {
    const originalConfig = ImageURLService.getConfig()
    const newTTL = 60000
    
    ImageURLService.updateConfig({ defaultTTL: newTTL })
    const updatedConfig = ImageURLService.getConfig()
    
    if (updatedConfig.defaultTTL !== newTTL) {
      throw new Error('Configuration not updated correctly')
    }
    
    // Restore original config
    ImageURLService.updateConfig(originalConfig)
  })()
  
  // Test 5: Statistics tracking
  await test('Statistics are tracked correctly', async () => {
    ImageURLService.resetStats()
    
    const stats = await ImageURLService.getCacheStats()
    
    if (typeof stats.performance.hitRate !== 'string') {
      throw new Error('Hit rate should be a string percentage')
    }
    
    if (stats.performance.memoryHits !== 0) {
      throw new Error('Stats should be reset')
    }
  })()
  
  // Test 6: Memory cache expiration
  await test('Memory cache handles expiration', async () => {
    const cacheKey = 'expired-test'
    
    // Manually set expired entry
    ImageURLService.memoryCache.set(cacheKey, {
      url: 'expired-url',
      cachedAt: Date.now() - 60000,
      lastAccessed: Date.now() - 60000,
      expiresAt: Date.now() - 1000 // Expired 1 second ago
    })
    
    const result = ImageURLService.getFromMemoryCache(cacheKey)
    
    if (result !== null) {
      throw new Error('Expired cache entry should return null')
    }
    
    if (ImageURLService.memoryCache.has(cacheKey)) {
      throw new Error('Expired entry should be removed from cache')
    }
  })()
  
  // Test 7: Memory cache LRU eviction
  await test('Memory cache LRU eviction works', async () => {
    // Set low limit for testing
    ImageURLService.updateConfig({ maxMemoryItems: 2 })
    
    // Clear cache first
    ImageURLService.memoryCache.clear()
    
    // Add items
    ImageURLService.setMemoryCache('key1', 'url1')
    ImageURLService.setMemoryCache('key2', 'url2')
    
    // Access key1 to make it more recently used
    ImageURLService.getFromMemoryCache('key1')
    
    // Add third item, should evict key2
    ImageURLService.setMemoryCache('key3', 'url3')
    
    if (!ImageURLService.memoryCache.has('key1')) {
      throw new Error('Recently accessed item should not be evicted')
    }
    
    if (ImageURLService.memoryCache.has('key2')) {
      throw new Error('LRU item should be evicted')
    }
    
    if (!ImageURLService.memoryCache.has('key3')) {
      throw new Error('New item should be in cache')
    }
    
    // Restore default config
    ImageURLService.updateConfig({ maxMemoryItems: 50 })
  })()
  
  // Test 8: Clear cache functionality
  await test('Clear cache works correctly', async () => {
    // Set up some cache entries
    ImageURLService.setMemoryCache('clear-test-1', 'url1')
    ImageURLService.setMemoryCache('clear-test-2', 'url2')
    
    const sizeBefore = ImageURLService.memoryCache.size
    
    if (sizeBefore === 0) {
      throw new Error('Cache should have entries before clearing')
    }
    
    // Clear all cache
    await ImageURLService.clearCache()
    
    if (ImageURLService.memoryCache.size !== 0) {
      throw new Error('Memory cache should be empty after clearing')
    }
  })()
  
  // Test 9: Batch preload structure
  await test('Batch preload returns correct structure', async () => {
    const requests = [
      { comicId: 'batch1', size: 'thumbnail' },
      { comicId: 'batch2', size: 'medium' }
    ]
    
    const results = await ImageURLService.batchPreload(requests)
    
    if (typeof results.success !== 'number') {
      throw new Error('Results should have success count')
    }
    
    if (typeof results.failed !== 'number') {
      throw new Error('Results should have failed count')
    }
    
    if (typeof results.skipped !== 'number') {
      throw new Error('Results should have skipped count')
    }
    
    if (!Array.isArray(results.errors)) {
      throw new Error('Results should have errors array')
    }
  })()
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`)
  
  if (failed > 0) {
    process.exit(1)
  } else {
    console.log('🎉 All tests passed!')
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test runner error:', error)
  process.exit(1)
})