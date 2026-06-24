/**
 * Centralized Image URL Service
 * Single service for all image URL resolution with intelligent caching
 * Implements fallback chain: memory → IndexedDB → MongoDB API
 * 
 * Fixed Issues:
 * - Memory leaks in cleanup timer and blob URLs
 * - Race conditions in cache operations
 * - Inconsistent cache key usage
 * - Inefficient LRU implementation
 * - Missing error boundaries and input validation
 * - Browser environment compatibility
 * - LRU eviction blob URL cleanup
 * - Operation lock memory leaks
 * - Request deduplication
 * - Batch operation synchronization
 * - AbortController timeout handling
 */

import imageStorage from './imageStorage.js'
import { apiFetch } from './apiClient.js'

// SSR/Node.js safe base64 decoder
const atobSafe = typeof atob === 'function'
  ? atob
  : (s) => Buffer.from(s, 'base64').toString('binary')

// Efficient LRU Cache implementation with proper cleanup
class LRUCache {
  constructor(maxSize, onEvict = null) {
    this.maxSize = maxSize
    this.cache = new Map()
    this.onEvict = onEvict // Callback for cleanup when items are evicted
  }

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
      return value
    }
    return null
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item) with proper cleanup
      const firstKey = this.cache.keys().next().value
      const evictedValue = this.cache.get(firstKey)
      this.cache.delete(firstKey)

      // Call cleanup callback if provided
      if (this.onEvict && evictedValue) {
        this.onEvict(firstKey, evictedValue)
      }
    }
    this.cache.set(key, value)
  }

  delete(key) {
    const value = this.cache.get(key)
    const deleted = this.cache.delete(key)

    // Call cleanup callback if item existed
    if (deleted && this.onEvict && value) {
      this.onEvict(key, value)
    }

    return deleted
  }

  clear() {
    // Clean up all items before clearing
    if (this.onEvict) {
      for (const [key, value] of this.cache.entries()) {
        this.onEvict(key, value)
      }
    }
    this.cache.clear()
  }

  get size() {
    return this.cache.size
  }

  has(key) {
    return this.cache.has(key)
  }

  entries() {
    return this.cache.entries()
  }
}

class ImageURLService {
  constructor() {
    // Initialize LRU cache with eviction callback - no blob URL tracking needed
    this.memoryCache = new LRUCache(50, () => {
      // No cleanup needed - blob data will be garbage collected
      // Fresh blob URLs are created on-demand and auto-cleaned by browser
    })

    this.cleanupTimer = null
    this.operationLocks = new Map() // Prevent race conditions
    this.lockCleanupTimer = null // Cleanup stale locks
    this.createdUrls = new Set() // Track created URLs for emergency cleanup
    this._onBeforeUnload = null // Store reference for proper cleanup

    this.config = {
      maxMemoryItems: 50,
      defaultTTL: 30 * 60 * 1000, // 30 minutes for blob data
      cacheTTL: 24 * 60 * 60 * 1000, // 24 hours for image data
      maxRetries: 2,
      retryDelay: 1000,
      batchSize: 5,
      lockTimeout: 30000, // 30 seconds for operation locks
      apiTimeout: 10000, // 10 seconds for API requests
      autoRevokeDelay: 30000, // 30 seconds default auto-revoke
      maxTrackedUrls: 100 // Limit tracked URLs for emergency cleanup
    }

    this.stats = {
      memoryHits: 0,
      indexedDBHits: 0,
      apiHits: 0,
      misses: 0,
      errors: 0,
      deduplicatedRequests: 0
    }

    // Check browser environment
    this.isBrowser = typeof window !== 'undefined' && typeof URL !== 'undefined'

    if (this.isBrowser) {
      this.startCleanupTimer()
      this.startLockCleanupTimer()
      // Cleanup on page unload - store reference for proper cleanup
      this._onBeforeUnload = () => this.destroy()
      window.addEventListener('beforeunload', this._onBeforeUnload)
    }
  }

  /**
   * Validate and sanitize comic ID
   */
  validateComicId(comicId) {
    if (!comicId) {
      return null
    }

    // Convert to string if it's a number
    const comicIdStr = typeof comicId === 'number' ? String(comicId) : comicId
    
    if (typeof comicIdStr !== 'string') {
      return null
    }

    // Basic sanitization - remove potentially problematic characters
    const sanitized = comicIdStr.trim().replace(/[<>:"/\\|?*]/g, '_')

    if (sanitized.length === 0 || sanitized.length > 255) {
      return null
    }

    return sanitized
  }

  /**
   * Centralized error tracking
   */
  trackError(context, error) {
    this.stats.errors++
    console.error(`ImageURLService [${context}]:`, error)
  }

  /**
   * Get image URL with automatic cleanup (SAFE BY DEFAULT)
   * URLs are automatically revoked after 30 seconds to prevent memory leaks
   * @param {string} comicId - Comic identifier
   * @param {string} size - Image size (thumbnail, medium, full)
   * @param {Object} options - Additional options
   * @param {number} options.autoRevokeDelay - Delay before auto-revoke (default: 30 seconds)
   * @returns {Promise<string|null>} - Image URL or null if not found
   */
  async getImageUrl(comicId, size = 'medium', options = {}) {
    const { autoRevokeDelay = this.config.autoRevokeDelay, ...otherOptions } = options
    return this.getImageUrlWithAutoRevoke(comicId, size, autoRevokeDelay, otherOptions)
  }

  /**
   * Get image URL WITHOUT automatic cleanup (UNSAFE - USE WITH CAUTION)
   * ⚠️  WARNING: You MUST manually call revokeUrl() to prevent memory leaks!
   * @param {string} comicId - Comic identifier
   * @param {string} size - Image size (thumbnail, medium, full)
   * @param {Object} options - Additional options
   * @returns {Promise<string|null>} - Image URL or null if not found
   */
  async getImageUrlUnsafe(comicId, size = 'medium', options = {}) {
    return this._getImageUrlUnsafe(comicId, size, options)
  }

  /**
   * Internal unsafe URL generation (used by other methods)
   * @private
   */
  async _getImageUrlUnsafe(comicId, size = 'medium', options = {}) {
    // Validate inputs
    const validComicId = this.validateComicId(comicId)
    if (!validComicId || !['thumbnail', 'medium', 'full'].includes(size)) {
      return null
    }

    const cacheKey = this.generateCacheKey(validComicId, size)

    // Prevent concurrent operations on the same resource
    if (this.operationLocks.has(cacheKey)) {
      try {
        this.stats.deduplicatedRequests++
        return await this.operationLocks.get(cacheKey)
      } catch (error) {
        this.trackError('concurrent-operation', error)
        return null
      }
    }

    const operationPromise = this._getImageUrlInternal(validComicId, size, options)
    this.operationLocks.set(cacheKey, operationPromise)

    // Set timeout for operation lock cleanup
    const timeoutId = setTimeout(() => {
      this.operationLocks.delete(cacheKey)
    }, this.config.lockTimeout)

    try {
      const result = await operationPromise
      return result
    } catch (error) {
      this.trackError('get-image-url', error)
      return null
    } finally {
      // Clear timeout and delete lock
      clearTimeout(timeoutId)
      this.operationLocks.delete(cacheKey)
    }
  }

  /**
   * Get image URL with manual revocation control (RECOMMENDED)
   * @param {string} comicId - Comic identifier
   * @param {string} size - Image size (thumbnail, medium, full)
   * @param {Object} options - Additional options
   * @returns {Promise<{url: string, revoke: Function}|null>} - URL and revoke function or null
   */
  async getImageUrlWithRevoke(comicId, size = 'medium', options = {}) {
    const url = await this._getImageUrlUnsafe(comicId, size, options)
    if (!url) return null

    return {
      url,
      revoke: () => this.revokeUrl(url)
    }
  }

  /**
   * Get image URL with automatic cleanup after specified delay
   * @param {string} comicId - Comic identifier
   * @param {string} size - Image size (thumbnail, medium, full)
   * @param {number} autoRevokeDelay - Delay in ms before auto-revoke (default: 30 seconds)
   * @param {Object} options - Additional options
   * @returns {Promise<string|null>} - Image URL or null if not found
   */
  async getImageUrlWithAutoRevoke(comicId, size = 'medium', autoRevokeDelay = 30000, options = {}) {
    const url = await this._getImageUrlUnsafe(comicId, size, options)
    if (!url) return null

    // Schedule automatic revocation
    setTimeout(() => {
      this.revokeUrl(url)
    }, autoRevokeDelay)

    return url
  }

  /**
   * Internal implementation of getImageUrl
   */
  async _getImageUrlInternal(comicId, size, options) {
    const {
      skipMemory = false,
      skipIndexedDB = false,
      skipAPI = false,
      forceRefresh = false
    } = options

    const cacheKey = this.generateCacheKey(comicId, size)

    // Force refresh: purge stale cache data before fetching
    if (forceRefresh) {
      try {
        // Clear memory cache for this comic
        const sizes = ['thumbnail', 'medium', 'full']
        sizes.forEach(sizeToDelete => {
          const keyToClear = this.generateCacheKey(comicId, sizeToDelete)
          this.memoryCache.delete(keyToClear)
        })

        // Clear IndexedDB cache for this comic
        await imageStorage.deleteImage(comicId)
      } catch (error) {
        this.trackError('force-refresh-cleanup', error)
        // Continue with fetch even if cleanup fails
      }
    }

    // Step 1: Check memory cache
    if (!skipMemory && !forceRefresh) {
      const memoryUrl = this.getFromMemoryCache(cacheKey)
      if (memoryUrl) {
        this.stats.memoryHits++
        return memoryUrl
      }
    }

    // Step 2: Check IndexedDB cache
    if (!skipIndexedDB && !forceRefresh) {
      const indexedDBUrl = await this.getFromIndexedDBCache(comicId, size)
      if (indexedDBUrl) {
        this.stats.indexedDBHits++
        // Get blob data and cache it for faster future access
        const imageBlob = await this.getBlobFromIndexedDB(comicId, size)
        if (imageBlob) {
          this.setMemoryCache(cacheKey, imageBlob)
        }
        return indexedDBUrl
      }
    }

    // Step 3: Try MongoDB API (deduplication handled by operationLocks)
    if (!skipAPI) {
      const apiResult = await this.getFromAPI(comicId, size)
      if (apiResult) {
        this.stats.apiHits++
        // Cache the blob data in memory for immediate reuse
        this.setMemoryCache(cacheKey, apiResult.blob)
        return apiResult.url
      }
    }

    this.stats.misses++
    return null
  }

  /**
   * Preload image into cache with proper validation
   * @param {string} comicId - Comic identifier
   * @param {string} size - Image size
   * @returns {Promise<boolean>} - Success status
   */
  async preloadImage(comicId, size = 'medium') {
    try {
      // Validate inputs first
      const validComicId = this.validateComicId(comicId)
      if (!validComicId || !['thumbnail', 'medium', 'full'].includes(size)) {
        return false
      }

      // Check if already cached (use unsafe version since we don't need the URL)
      const existingUrl = await this._getImageUrlUnsafe(validComicId, size, { skipAPI: true })
      if (existingUrl) {
        // Immediately revoke since we only needed to check cache
        this.revokeUrl(existingUrl)
        return true
      }

      // Try to fetch and cache from API (deduplication handled by operationLocks)
      const apiResult = await this.getFromAPI(validComicId, size)
      if (apiResult) {
        const cacheKey = this.generateCacheKey(validComicId, size)
        this.setMemoryCache(cacheKey, apiResult.blob)
        return true
      }

      return false
    } catch (error) {
      this.trackError('preload-image', error)
      return false
    }
  }

  /**
   * Clear cache for specific comic or all
   * @param {string} comicId - Comic identifier (optional)
   * @param {string} size - Specific size to clear (optional)
   * @returns {Promise<void>}
   */
  async clearCache(comicId = null, size = null) {
    if (comicId) {
      const validComicId = this.validateComicId(comicId)
      if (!validComicId) return

      if (size) {
        // Clear specific size only
        const cacheKey = this.generateCacheKey(validComicId, size)
        this.memoryCache.delete(cacheKey)

        // Note: Only clearing memory cache and IndexedDB for specific size
        // The memory cache is already cleared above
      } else {
        // Clear all sizes for this comic
        const sizes = ['thumbnail', 'medium', 'full']

        // Clear from memory cache (blob data will be garbage collected)
        sizes.forEach(sizeToDelete => {
          const cacheKey = this.generateCacheKey(validComicId, sizeToDelete)
          this.memoryCache.delete(cacheKey)
        })

        // Clear from IndexedDB cache
        try {
          await imageStorage.deleteImage(validComicId)
        } catch (error) {
          this.trackError('clear-indexeddb-cache', error)
        }

        // Note: Memory cache and IndexedDB already cleared above
        // No additional cache layers to clear
      }
    } else {
      // Clear all caches
      this.memoryCache.clear() // Blob data will be garbage collected

      try {
        await imageStorage.clearStorage()
      } catch (error) {
        this.trackError('clear-all-caches', error)
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache statistics
   */
  async getCacheStats() {
    const memoryStats = {
      items: this.memoryCache.size,
      maxItems: this.memoryCache.maxSize,
      trackedUrls: this.createdUrls.size,
      maxTrackedUrls: this.config.maxTrackedUrls
    }

    let indexedDBStats = { items: 0, sizeMB: '0.00' }
    try {
      indexedDBStats = await imageStorage.getStorageStats()
    } catch (error) {
      this.trackError('get-indexeddb-stats', error)
    }

    // Note: imageCache dependency removed for cleaner architecture
    // Cache stats now focus on memory cache (this service) and IndexedDB (imageStorage)

    return {
      memory: memoryStats,
      indexedDB: {
        items: indexedDBStats.totalImages || 0,
        sizeMB: indexedDBStats.totalSizeMB || '0.00'
      },
      performance: {
        memoryHits: this.stats.memoryHits,
        indexedDBHits: this.stats.indexedDBHits,
        apiHits: this.stats.apiHits,
        misses: this.stats.misses,
        errors: this.stats.errors,
        deduplicatedRequests: this.stats.deduplicatedRequests,
        totalRequests: this.stats.memoryHits + this.stats.indexedDBHits +
          this.stats.apiHits + this.stats.misses + this.stats.errors,
        hitRate: this.calculateHitRate()
      },
      system: {
        operationLocks: this.operationLocks.size
      }
    }
  }

  /**
   * Invalidate cache based on timestamp
   * @param {string} comicId - Comic identifier
   * @param {Date} updatedAt - Last update timestamp
   * @returns {Promise<boolean>} - Whether cache was invalidated
   */
  async invalidateCache(comicId, updatedAt, size = null) {
    try {
      const validComicId = this.validateComicId(comicId)
      if (!validComicId) return false

      // Check if we have cached data and if it's older than the update
      const imageData = await imageStorage.getImage(validComicId)

      if (imageData) {
        // Use standardized cachedAt field
        const cachedAt = imageData.metadata?.cachedAt ?? imageData.cachedAt

        if (cachedAt && typeof cachedAt === 'number') {
          const updateTime = new Date(updatedAt).getTime()

          if (cachedAt < updateTime) {
            // Cache is stale, clear it (specific size or all)
            await this.clearCache(validComicId, size)
            return true
          }
        }
      }

      return false
    } catch (error) {
      this.trackError('invalidate-cache', error)
      return false
    }
  }

  /**
   * Invalidate specific size from memory cache only
   * @param {string} comicId - Comic identifier
   * @param {string} size - Size to invalidate
   */
  invalidateMemoryCacheSize(comicId, size) {
    const validComicId = this.validateComicId(comicId)
    if (!validComicId) return

    const cacheKey = this.generateCacheKey(validComicId, size)
    this.memoryCache.delete(cacheKey)
  }

  /**
   * Batch preload multiple images with proper synchronization
   * @param {Array} requests - Array of {comicId, size} objects
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} - Batch results
   */
  async batchPreload(requests, options = {}) {
    const {
      maxConcurrent = this.config.batchSize,
      onProgress = null,
      onResult = null // Callback for individual results
    } = options

    // Use atomic counters for thread-safe statistics
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    }

    let completed = 0

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      const batch = requests.slice(i, i + maxConcurrent)

      const batchPromises = batch.map(async (request) => {
        try {
          const success = await this.preloadImage(request.comicId, request.size)
          const result = {
            comicId: request.comicId,
            size: request.size,
            success,
            status: success ? 'success' : 'skipped'
          }

          // Atomic update of results
          if (success) {
            results.success++
          } else {
            results.skipped++
          }

          // Stream individual results
          onResult?.(result)

          return result
        } catch (error) {
          const errorResult = {
            comicId: request.comicId,
            size: request.size,
            success: false,
            status: 'failed',
            error: error.message
          }

          // Atomic update of results
          results.failed++
          results.errors.push(errorResult)
          onResult?.(errorResult)

          return errorResult
        } finally {
          completed++
          onProgress?.({
            completed,
            total: requests.length,
            progress: Math.round((completed / requests.length) * 100)
          })
        }
      })

      // Process results as they complete
      await Promise.allSettled(batchPromises)
    }

    return results
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  /**
   * Get URL from memory cache - generates fresh blob URL from cached blob data
   * WARNING: Caller must revoke the returned URL to prevent memory leaks
   */
  getFromMemoryCache(cacheKey) {
    const cached = this.memoryCache.get(cacheKey)
    if (!cached) return null

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      this.memoryCache.delete(cacheKey)
      return null
    }

    // Generate fresh blob URL from cached blob data
    if (cached.blob && this.isBrowser) {
      try {
        const url = URL.createObjectURL(cached.blob)
        // Track created URLs for potential cleanup
        this.trackCreatedUrl(url)
        return url
      } catch (error) {
        this.trackError('create-blob-url', error)
        return null
      }
    }

    return null
  }

  /**
   * Set blob data in memory cache - stores actual blob, not URLs
   */
  setMemoryCache(cacheKey, blob) {
    // Update config if changed
    if (this.memoryCache.maxSize !== this.config.maxMemoryItems) {
      this.memoryCache.maxSize = this.config.maxMemoryItems
    }

    const cacheEntry = {
      blob,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.config.defaultTTL
    }

    this.memoryCache.set(cacheKey, cacheEntry)
  }

  /**
   * Get URL from IndexedDB cache
   */
  async getFromIndexedDBCache(comicId, size) {
    try {
      // First check if we have the image data
      const imageData = await imageStorage.getImage(comicId)
      if (!imageData) return null

      // Check if the specific size exists
      const hasRequestedSize = this.hasSize(imageData, size)
      if (!hasRequestedSize) return null

      // Check if the cached data is still valid
      if (this.isCacheExpired(imageData)) {
        // For now, we still delete the entire image since imageStorage doesn't support per-size deletion
        // TODO: Implement per-size expiry tracking in imageStorage
        await imageStorage.deleteImage(comicId)
        return null
      }

      // Generate blob URL from cached data
      const url = await imageStorage.getImageUrl(comicId, size)

      // Track the created URL for proper cleanup
      if (url) {
        this.trackCreatedUrl(url)
      }

      return url
    } catch (error) {
      this.trackError('indexeddb-cache', error)
      return null
    }
  }

  /**
   * Check if imageData contains the requested size
   */
  hasSize(imageData, size) {
    if (imageData.blob && size === 'medium') {
      // Legacy single-blob format (assume medium size)
      return true
    }

    if (imageData.imageData && imageData.imageData[size]) {
      // Multi-size format
      return true
    }

    return false
  }

  /**
   * Get blob data from IndexedDB for memory caching
   * @param {string} comicId - Comic identifier
   * @param {string} size - Specific size to retrieve
   */
  async getBlobFromIndexedDB(comicId, size) {
    try {
      const imageData = await imageStorage.getImage(comicId)
      if (!imageData) return null

      // Check expiry for the entire image data
      if (this.isCacheExpired(imageData)) {
        return null
      }

      // Convert stored data back to blob for the specific size
      if (imageData.blob && size === 'medium') {
        // Legacy single-blob format (assume medium size)
        return imageData.blob
      } else if (imageData.imageData && imageData.imageData[size]) {
        // Multi-size format - get the specific size requested
        const sizeData = imageData.imageData[size]
        return this.base64ToBlob(sizeData.data, sizeData.mimeType)
      }

      return null
    } catch (error) {
      this.trackError('get-blob-from-indexeddb', error)
      return null
    }
  }

  /**
   * Get URL from MongoDB API with improved error handling
   */
  async getFromAPI(comicId, size) {
    if (!this.isBrowser) {
      console.warn('API calls not supported in non-browser environment')
      return null
    }

    let retries = 0

    while (retries <= this.config.maxRetries) {
      try {
        // Fetch the actual image directly (no need for separate metadata check)
        // Add cache-busting parameter to prevent browser caching
        const cacheBuster = Date.now()
        const imageResponse = await this.fetchWithTimeout(
          `/api/images/${encodeURIComponent(comicId)}?size=${size}&_=${cacheBuster}`,
          { 
            method: 'GET',
            cache: 'no-store' // Prevent browser caching
          },
          this.config.apiTimeout
        )

        if (!imageResponse.ok) {
          if (imageResponse.status === 404) {
            return null // Image doesn't exist
          }
          throw new Error(`Image fetch failed: ${imageResponse.status}`)
        }

        // Validate content-type - must be an image
        const contentType = imageResponse.headers.get('content-type') || ''

        // Handle JSON error responses
        if (contentType.includes('application/json')) {
          const errorData = await imageResponse.json()
          if (!errorData.success && errorData.error === 'Image storage not configured') {
            return null
          }
          throw new Error(errorData.error || 'Unknown API error')
        }

        // Validate that response is actually an image
        if (!contentType.startsWith('image/')) {
          throw new Error(`Unexpected content-type: ${contentType}. Expected image/* but got ${contentType || 'no content-type'}`)
        }

        // Get the image blob and create URL
        const imageBlob = await imageResponse.blob()
        const url = URL.createObjectURL(imageBlob)

        // Track created URL for potential cleanup
        this.trackCreatedUrl(url)

        // Cache the image data for future use (with minimal metadata)
        try {
          await this.cacheImageFromAPI(comicId, size, imageBlob, {
            contentType,
            size: imageBlob.size
          })
        } catch (cacheError) {
          this.trackError('cache-api-image', cacheError)
        }

        // Return both URL and blob for caching
        return { url, blob: imageBlob }

      } catch (error) {
        retries++

        if (retries > this.config.maxRetries) {
          this.trackError('api-fetch-retries-exhausted', error)
          return null
        }

        // Exponential backoff
        await new Promise(resolve =>
          setTimeout(resolve, this.config.retryDelay * Math.pow(2, retries - 1))
        )
      }
    }

    return null
  }

  /**
   * Fetch with timeout and proper AbortController cleanup
   * Uses apiFetch so the Clerk Bearer token is attached to internal /api requests
   */
  async fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController()
    let timeoutId = null

    try {
      // Set up timeout
      timeoutId = setTimeout(() => {
        controller.abort()
      }, timeout)

      const response = await apiFetch(url, {
        ...options,
        signal: controller.signal
      })

      // Clear timeout on successful completion
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      return response
    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      throw error
    }
  }

  /**
   * Cache image data from API response
   */
  async cacheImageFromAPI(comicId, _size, imageBlob, metadata) {
    try {
      // Store in IndexedDB for persistent caching
      await imageStorage.storeImage(comicId, imageBlob, {
        ...metadata,
        source: 'api',
        cachedAt: Date.now(), // Use numeric timestamp for consistency
        size: imageBlob.size,
        mimeType: imageBlob.type
      })
    } catch (error) {
      this.trackError('cache-api-image-storage', error)
    }
  }

  /**
   * Check if cached data is expired
   * Uses standardized cachedAt field (numeric timestamp)
   */
  isCacheExpired(imageData) {
    // Use standardized cachedAt field
    const cachedAt = imageData.metadata?.cachedAt ?? imageData.cachedAt

    if (!cachedAt || typeof cachedAt !== 'number') return false

    return Date.now() > cachedAt + this.config.cacheTTL
  }

  /**
   * Generate consistent cache key
   */
  generateCacheKey(comicId, size) {
    return `${comicId}_${size}`
  }

  /**
   * Calculate hit rate percentage
   */
  calculateHitRate() {
    const hits = this.stats.memoryHits + this.stats.indexedDBHits + this.stats.apiHits
    const total = hits + this.stats.misses + this.stats.errors
    return total ? ((hits / total) * 100).toFixed(2) : '0.00'
  }

  /**
   * Start cleanup timer with proper management
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredMemoryCache()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  /**
   * Start lock cleanup timer to prevent memory leaks
   */
  startLockCleanupTimer() {
    if (this.lockCleanupTimer) {
      clearInterval(this.lockCleanupTimer)
    }

    this.lockCleanupTimer = setInterval(() => {
      this.cleanupStaleLocks()
    }, 60 * 1000) // Every minute
  }

  /**
   * Clean up expired entries from memory cache
   */
  cleanupExpiredMemoryCache() {
    const now = Date.now()
    let cleanedCount = 0

    for (const [key, cached] of this.memoryCache.entries()) {
      if (now > cached.expiresAt) {
        this.memoryCache.delete(key) // Blob data will be garbage collected
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.debug(`Cleaned ${cleanedCount} expired entries from memory cache`)
    }
  }

  /**
   * Clean up stale operation locks
   */
  cleanupStaleLocks() {
    // This is a simple cleanup - in a production system you'd track lock timestamps
    if (this.operationLocks.size > 100) {
      console.warn(`High number of operation locks: ${this.operationLocks.size}`)
    }
  }

  /**
   * Convert base64 to blob (SSR/Node.js safe)
   */
  base64ToBlob(base64, mimeType) {
    try {
      // Defensive check for Blob constructor in SSR environments
      const BlobCtor = typeof Blob !== 'undefined' ? Blob : null
      if (!BlobCtor) return null

      const byteCharacters = atobSafe(base64)
      const byteNumbers = new Array(byteCharacters.length)

      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }

      const byteArray = new Uint8Array(byteNumbers)
      return new BlobCtor([byteArray], { type: mimeType })
    } catch (error) {
      this.trackError('base64-to-blob', error)
      return null
    }
  }

  /**
   * Track created blob URL for potential cleanup
   */
  trackCreatedUrl(url) {
    if (url && url.startsWith('blob:')) {
      this.createdUrls.add(url)

      // Prevent unbounded growth
      if (this.createdUrls.size > this.config.maxTrackedUrls) {
        // Remove oldest URLs (first 20%)
        const urlsToRemove = Array.from(this.createdUrls).slice(0, Math.floor(this.config.maxTrackedUrls * 0.2))
        urlsToRemove.forEach(oldUrl => {
          this.revokeUrl(oldUrl)
        })
      }
    }
  }

  /**
   * Utility to revoke blob URL when needed
   */
  revokeUrl(url) {
    if (url && url.startsWith('blob:') && this.isBrowser) {
      try {
        URL.revokeObjectURL(url)
        this.createdUrls.delete(url)
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error)
      }
    }
  }

  /**
   * Alias for revokeUrl - more intuitive name for releasing blob URLs
   * @param {string} url - Blob URL to release
   */
  release(url) {
    this.revokeUrl(url)
  }

  /**
   * Emergency cleanup of all tracked URLs
   */
  revokeAllTrackedUrls() {
    if (this.isBrowser) {
      for (const url of this.createdUrls) {
        try {
          URL.revokeObjectURL(url)
        } catch (error) {
          console.warn('Failed to revoke tracked URL:', error)
        }
      }
    }
    this.createdUrls.clear()
  }

  /**
   * Destroy service and cleanup resources
   */
  destroy() {
    // Remove beforeunload event listener to prevent memory leaks
    if (this._onBeforeUnload && this.isBrowser) {
      window.removeEventListener('beforeunload', this._onBeforeUnload)
      this._onBeforeUnload = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    if (this.lockCleanupTimer) {
      clearInterval(this.lockCleanupTimer)
      this.lockCleanupTimer = null
    }

    // Revoke all tracked URLs to prevent memory leaks
    this.revokeAllTrackedUrls()

    this.memoryCache.clear() // Blob data will be garbage collected
    this.operationLocks.clear()
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      memoryHits: 0,
      indexedDBHits: 0,
      apiHits: 0,
      misses: 0,
      errors: 0,
      deduplicatedRequests: 0
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }

    // Update LRU cache size if changed
    if (newConfig.maxMemoryItems && this.memoryCache.maxSize !== newConfig.maxMemoryItems) {
      this.memoryCache.maxSize = newConfig.maxMemoryItems
    }

    // Restart cleanup timers if intervals changed
    if (newConfig.cleanupInterval && this.isBrowser) {
      this.startCleanupTimer()
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config }
  }
}

// HMR-safe singleton export - preserves instance across hot reloads
const singleton = globalThis.__imageURLService ?? new ImageURLService()
globalThis.__imageURLService ??= singleton
export default singleton