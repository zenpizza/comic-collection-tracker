/**
 * Tests for ImageURLService
 * Focuses on core functionality and fallback chain behavior
 */

import ImageURLService from '../ImageURLService.js'

// Mock the dependencies
jest.mock('../imageStorage.js', () => ({
  getImage: jest.fn(),
  getImageUrl: jest.fn(),
  storeImage: jest.fn(),
  deleteImage: jest.fn(),
  clearStorage: jest.fn(),
  getStorageStats: jest.fn(() => Promise.resolve({ totalImages: 0, totalSizeMB: '0.00' }))
}))

jest.mock('../imageCache.js', () => ({
  setCachedImage: jest.fn(),
  removeCachedImage: jest.fn(),
  clearCache: jest.fn(),
  getCacheStats: jest.fn(() => Promise.resolve({ 
    memory: { items: 0 }, 
    persistent: { items: 0 } 
  }))
}))

// Mock fetch globally
global.fetch = jest.fn()

describe('ImageURLService', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()
    
    // Reset service state
    ImageURLService.memoryCache.clear()
    ImageURLService.resetStats()
  })

  describe('getImageUrl', () => {
    test('should return null for invalid inputs', async () => {
      expect(await ImageURLService.getImageUrl(null, 'medium')).toBeNull()
      expect(await ImageURLService.getImageUrl('comic1', 'invalid')).toBeNull()
      expect(await ImageURLService.getImageUrl('', 'medium')).toBeNull()
    })

    test('should return URL from memory cache when available', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      const expectedUrl = 'blob:test-url'
      
      // Set up memory cache
      const cacheKey = ImageURLService.generateCacheKey(comicId, size)
      ImageURLService.setMemoryCache(cacheKey, expectedUrl)
      
      const result = await ImageURLService.getImageUrl(comicId, size)
      
      expect(result).toBe(expectedUrl)
      expect(ImageURLService.stats.memoryHits).toBe(1)
    })

    test('should fall back to IndexedDB when memory cache misses', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      const expectedUrl = 'blob:indexeddb-url'
      
      // Mock imageStorage to return a URL
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue({
        metadata: { cachedAt: Date.now() }
      })
      imageStorage.getImageUrl.mockResolvedValue(expectedUrl)
      
      const result = await ImageURLService.getImageUrl(comicId, size)
      
      expect(result).toBe(expectedUrl)
      expect(ImageURLService.stats.indexedDBHits).toBe(1)
      expect(imageStorage.getImage).toHaveBeenCalledWith(comicId)
      expect(imageStorage.getImageUrl).toHaveBeenCalledWith(comicId, size)
    })

    test('should fall back to API when IndexedDB misses', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      
      // Mock imageStorage to return null (cache miss)
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue(null)
      
      // Mock successful API responses
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, metadata: {} })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'image/jpeg' },
          blob: () => Promise.resolve(mockBlob)
        })
      
      // Mock URL.createObjectURL
      const expectedUrl = 'blob:api-url'
      global.URL = { createObjectURL: jest.fn(() => expectedUrl) }
      
      const result = await ImageURLService.getImageUrl(comicId, size)
      
      expect(result).toBe(expectedUrl)
      expect(ImageURLService.stats.apiHits).toBe(1)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    test('should return null when all fallbacks fail', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      
      // Mock all fallbacks to fail
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue(null)
      
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404
      })
      
      const result = await ImageURLService.getImageUrl(comicId, size)
      
      expect(result).toBeNull()
      expect(ImageURLService.stats.misses).toBe(1)
    })

    test('should skip cache levels when options are provided', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      
      // Set up memory cache
      const cacheKey = ImageURLService.generateCacheKey(comicId, size)
      ImageURLService.setMemoryCache(cacheKey, 'memory-url')
      
      // Mock IndexedDB to return a URL
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue({
        metadata: { cachedAt: Date.now() }
      })
      imageStorage.getImageUrl.mockResolvedValue('indexeddb-url')
      
      const result = await ImageURLService.getImageUrl(comicId, size, { skipMemory: true })
      
      expect(result).toBe('indexeddb-url')
      expect(ImageURLService.stats.memoryHits).toBe(0)
      expect(ImageURLService.stats.indexedDBHits).toBe(1)
    })
  })

  describe('preloadImage', () => {
    test('should return true if image is already cached', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      
      // Set up memory cache
      const cacheKey = ImageURLService.generateCacheKey(comicId, size)
      ImageURLService.setMemoryCache(cacheKey, 'cached-url')
      
      const result = await ImageURLService.preloadImage(comicId, size)
      
      expect(result).toBe(true)
    })

    test('should fetch and cache from API if not cached', async () => {
      const comicId = 'comic1'
      const size = 'medium'
      
      // Mock cache miss
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue(null)
      
      // Mock successful API response
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, metadata: {} })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'image/jpeg' },
          blob: () => Promise.resolve(mockBlob)
        })
      
      global.URL = { createObjectURL: jest.fn(() => 'preload-url') }
      
      const result = await ImageURLService.preloadImage(comicId, size)
      
      expect(result).toBe(true)
    })
  })

  describe('clearCache', () => {
    test('should clear specific comic from all cache levels', async () => {
      const comicId = 'comic1'
      
      // Set up memory cache
      const cacheKey = ImageURLService.generateCacheKey(comicId, 'medium')
      ImageURLService.setMemoryCache(cacheKey, 'test-url')
      
      const imageStorage = require('../imageStorage.js')
      const imageCache = require('../imageCache.js')
      
      await ImageURLService.clearCache(comicId)
      
      expect(ImageURLService.memoryCache.has(cacheKey)).toBe(false)
      expect(imageStorage.deleteImage).toHaveBeenCalledWith(comicId)
      expect(imageCache.removeCachedImage).toHaveBeenCalledWith(comicId)
    })

    test('should clear all caches when no comicId provided', async () => {
      // Set up memory cache
      ImageURLService.setMemoryCache('test_key', 'test-url')
      
      const imageStorage = require('../imageStorage.js')
      const imageCache = require('../imageCache.js')
      
      await ImageURLService.clearCache()
      
      expect(ImageURLService.memoryCache.size).toBe(0)
      expect(imageStorage.clearStorage).toHaveBeenCalled()
      expect(imageCache.clearCache).toHaveBeenCalled()
    })
  })

  describe('getCacheStats', () => {
    test('should return comprehensive cache statistics', async () => {
      // Set up some stats
      ImageURLService.stats.memoryHits = 10
      ImageURLService.stats.indexedDBHits = 5
      ImageURLService.stats.apiHits = 3
      ImageURLService.stats.misses = 2
      
      const stats = await ImageURLService.getCacheStats()
      
      expect(stats).toHaveProperty('memory')
      expect(stats).toHaveProperty('indexedDB')
      expect(stats).toHaveProperty('imageCache')
      expect(stats).toHaveProperty('performance')
      expect(stats.performance.memoryHits).toBe(10)
      expect(stats.performance.indexedDBHits).toBe(5)
      expect(stats.performance.apiHits).toBe(3)
      expect(stats.performance.misses).toBe(2)
      expect(stats.performance.totalRequests).toBe(20)
    })
  })

  describe('invalidateCache', () => {
    test('should invalidate cache when data is stale', async () => {
      const comicId = 'comic1'
      const oldDate = new Date('2023-01-01')
      const newDate = new Date('2023-01-02')
      
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue({
        metadata: { cachedAt: oldDate.getTime() }
      })
      
      const result = await ImageURLService.invalidateCache(comicId, newDate)
      
      expect(result).toBe(true)
    })

    test('should not invalidate cache when data is fresh', async () => {
      const comicId = 'comic1'
      const newDate = new Date('2023-01-02')
      const oldDate = new Date('2023-01-01')
      
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue({
        metadata: { cachedAt: newDate.getTime() }
      })
      
      const result = await ImageURLService.invalidateCache(comicId, oldDate)
      
      expect(result).toBe(false)
    })
  })

  describe('batchPreload', () => {
    test('should process multiple preload requests', async () => {
      const requests = [
        { comicId: 'comic1', size: 'thumbnail' },
        { comicId: 'comic2', size: 'medium' },
        { comicId: 'comic3', size: 'full' }
      ]
      
      // Mock all as cache misses that succeed via API
      const imageStorage = require('../imageStorage.js')
      imageStorage.getImage.mockResolvedValue(null)
      
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, metadata: {} }),
        headers: { get: () => 'image/jpeg' },
        blob: () => Promise.resolve(mockBlob)
      })
      
      global.URL = { createObjectURL: jest.fn(() => 'batch-url') }
      
      const results = await ImageURLService.batchPreload(requests)
      
      expect(results.success).toBe(3)
      expect(results.failed).toBe(0)
      expect(results.skipped).toBe(0)
    })
  })

  describe('memory cache management', () => {
    test('should evict LRU items when memory limit is reached', () => {
      // Set a low memory limit for testing
      ImageURLService.updateConfig({ maxMemoryItems: 2 })
      
      // Add items to fill cache
      ImageURLService.setMemoryCache('key1', 'url1')
      ImageURLService.setMemoryCache('key2', 'url2')
      
      // Access key1 to make it more recently used
      ImageURLService.getFromMemoryCache('key1')
      
      // Add third item, should evict key2 (LRU)
      ImageURLService.setMemoryCache('key3', 'url3')
      
      expect(ImageURLService.memoryCache.has('key1')).toBe(true)
      expect(ImageURLService.memoryCache.has('key2')).toBe(false)
      expect(ImageURLService.memoryCache.has('key3')).toBe(true)
    })

    test('should handle expired memory cache entries', () => {
      const cacheKey = 'expired_key'
      
      // Manually set an expired entry
      ImageURLService.memoryCache.set(cacheKey, {
        url: 'expired-url',
        cachedAt: Date.now() - 60000,
        lastAccessed: Date.now() - 60000,
        expiresAt: Date.now() - 1000 // Expired 1 second ago
      })
      
      const result = ImageURLService.getFromMemoryCache(cacheKey)
      
      expect(result).toBeNull()
      expect(ImageURLService.memoryCache.has(cacheKey)).toBe(false)
    })
  })
})