/**
 * Image caching service for performance optimization
 * Handles in-memory and persistent caching with expiration and cleanup policies
 */

import imageStorage from './imageStorage.js'

class ImageCacheService {
  constructor() {
    this.memoryCache = new Map()
    this.cacheConfig = {
      maxMemorySize: 50 * 1024 * 1024, // 50MB in memory
      maxMemoryItems: 100,
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      persistentCacheTTL: 7 * 24 * 60 * 60 * 1000 // 7 days for persistent cache
    }
    this.currentMemorySize = 0
    this.cleanupTimer = null
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      cleanups: 0
    }
    
    this.init()
  }

  /**
   * Initialize the cache service
   */
  init() {
    // Only initialize in browser environments
    if (typeof window !== 'undefined') {
      // Start periodic cleanup
      this.startCleanupTimer()
      
      // Listen for memory pressure events
      if ('memory' in performance) {
        this.setupMemoryPressureHandling()
      }
    }
  }

  /**
   * Get cached image with fallback to storage
   */
  async getCachedImage(key, options = {}) {
    const {
      size = 'full',
      fallbackToStorage = true,
      updateTTL = true
    } = options

    const cacheKey = this.generateCacheKey(key, size)
    
    // Check memory cache first
    const memoryCached = this.getFromMemoryCache(cacheKey, updateTTL)
    if (memoryCached) {
      this.cacheStats.hits++
      return memoryCached
    }

    // Check persistent cache (IndexedDB)
    if (fallbackToStorage) {
      const persistentCached = await this.getFromPersistentCache(cacheKey, updateTTL)
      if (persistentCached) {
        // Add to memory cache for faster future access
        this.setMemoryCache(cacheKey, persistentCached.data, persistentCached.metadata)
        this.cacheStats.hits++
        return persistentCached.data
      }
    }

    this.cacheStats.misses++
    return null
  }

  /**
   * Set cached image in both memory and persistent storage
   */
  async setCachedImage(key, imageData, options = {}) {
    const {
      size = 'full',
      ttl = this.cacheConfig.defaultTTL,
      metadata = {},
      skipMemory = false,
      skipPersistent = false
    } = options

    const cacheKey = this.generateCacheKey(key, size)
    const cacheMetadata = {
      ...metadata,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl,
      size: this.getDataSize(imageData),
      key: cacheKey,
      originalKey: key,
      imageSize: size
    }

    // Set in memory cache
    if (!skipMemory) {
      this.setMemoryCache(cacheKey, imageData, cacheMetadata)
    }

    // Set in persistent cache
    if (!skipPersistent) {
      await this.setPersistentCache(cacheKey, imageData, cacheMetadata)
    }

    return cacheKey
  }

  /**
   * Get image from memory cache
   */
  getFromMemoryCache(cacheKey, updateTTL = true) {
    const cached = this.memoryCache.get(cacheKey)
    if (!cached) return null

    // Check expiration
    if (Date.now() > cached.metadata.expiresAt) {
      this.memoryCache.delete(cacheKey)
      this.currentMemorySize -= cached.metadata.size
      return null
    }

    // Update TTL if requested
    if (updateTTL) {
      cached.metadata.lastAccessed = Date.now()
      cached.metadata.accessCount = (cached.metadata.accessCount || 0) + 1
    }

    return cached.data
  }

  /**
   * Set image in memory cache with LRU eviction
   */
  setMemoryCache(cacheKey, data, metadata) {
    const dataSize = metadata.size || this.getDataSize(data)
    
    // Check if we need to make space
    this.ensureMemorySpace(dataSize)

    // Add to cache
    this.memoryCache.set(cacheKey, {
      data,
      metadata: {
        ...metadata,
        size: dataSize,
        lastAccessed: Date.now(),
        accessCount: 1
      }
    })

    this.currentMemorySize += dataSize
  }

  /**
   * Get image from persistent cache (IndexedDB)
   */
  async getFromPersistentCache(cacheKey, updateTTL = true) {
    try {
      const cached = await imageStorage.getImage(`cache_${cacheKey}`)
      if (!cached) return null

      // Check expiration
      const metadata = cached.metadata || {}
      if (metadata.expiresAt && Date.now() > metadata.expiresAt) {
        // Remove expired item
        await imageStorage.deleteImage(`cache_${cacheKey}`)
        return null
      }

      // Update access info if requested
      if (updateTTL && metadata.expiresAt) {
        metadata.lastAccessed = Date.now()
        metadata.accessCount = (metadata.accessCount || 0) + 1
        
        // Update the stored metadata
        await imageStorage.storeImage(`cache_${cacheKey}`, cached.blob, metadata)
      }

      return {
        data: cached.blob,
        metadata
      }
    } catch (error) {
      console.warn('Failed to get from persistent cache:', error)
      return null
    }
  }

  /**
   * Set image in persistent cache
   */
  async setPersistentCache(cacheKey, data, metadata) {
    try {
      await imageStorage.storeImage(`cache_${cacheKey}`, data, {
        ...metadata,
        cacheType: 'image',
        cacheKey
      })
    } catch (error) {
      console.warn('Failed to set persistent cache:', error)
    }
  }

  /**
   * Remove item from cache
   */
  async removeCachedImage(key, size = 'full') {
    const cacheKey = this.generateCacheKey(key, size)
    
    // Remove from memory cache
    const memoryCached = this.memoryCache.get(cacheKey)
    if (memoryCached) {
      this.memoryCache.delete(cacheKey)
      this.currentMemorySize -= memoryCached.metadata.size
    }

    // Remove from persistent cache
    try {
      await imageStorage.deleteImage(`cache_${cacheKey}`)
    } catch (error) {
      console.warn('Failed to remove from persistent cache:', error)
    }
  }

  /**
   * Clear all cached images
   */
  async clearCache(options = {}) {
    const {
      clearMemory = true,
      clearPersistent = true,
      olderThan = null
    } = options

    let clearedCount = 0

    if (clearMemory) {
      if (olderThan) {
        // Clear memory items older than specified time
        for (const [key, cached] of this.memoryCache.entries()) {
          if (cached.metadata.cachedAt < olderThan) {
            this.memoryCache.delete(key)
            this.currentMemorySize -= cached.metadata.size
            clearedCount++
          }
        }
      } else {
        // Clear all memory cache
        clearedCount += this.memoryCache.size
        this.memoryCache.clear()
        this.currentMemorySize = 0
      }
    }

    if (clearPersistent) {
      try {
        // Get all cached items from storage
        const stats = await imageStorage.getStorageStats()
        
        if (olderThan) {
          // This would require iterating through all items - simplified for now
          console.warn('Selective persistent cache clearing not fully implemented')
        } else {
          // Clear all cache items (items with cache_ prefix)
          // This is a simplified approach - in a full implementation,
          // we'd iterate through items and delete only cache items
          await this.cleanupExpiredPersistentCache()
        }
      } catch (error) {
        console.warn('Failed to clear persistent cache:', error)
      }
    }

    this.cacheStats.cleanups++
    return clearedCount
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const memoryStats = {
      items: this.memoryCache.size,
      size: this.currentMemorySize,
      sizeMB: (this.currentMemorySize / (1024 * 1024)).toFixed(2),
      maxSize: this.cacheConfig.maxMemorySize,
      maxSizeMB: (this.cacheConfig.maxMemorySize / (1024 * 1024)).toFixed(2),
      utilization: (this.currentMemorySize / this.cacheConfig.maxMemorySize * 100).toFixed(2)
    }

    let persistentStats = { items: 0, size: 0, sizeMB: '0.00' }
    try {
      const storageStats = await imageStorage.getStorageStats()
      // This is approximate since we're mixing cache and regular storage
      persistentStats = {
        items: storageStats.totalImages,
        size: storageStats.totalSize,
        sizeMB: storageStats.totalSizeMB
      }
    } catch (error) {
      console.warn('Failed to get persistent cache stats:', error)
    }

    return {
      memory: memoryStats,
      persistent: persistentStats,
      performance: {
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
        hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 
          ? ((this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100).toFixed(2)
          : '0.00',
        evictions: this.cacheStats.evictions,
        cleanups: this.cacheStats.cleanups
      }
    }
  }

  /**
   * Preload images into cache
   */
  async preloadImages(imageKeys, options = {}) {
    const {
      sizes = ['thumbnail'],
      priority = 'low',
      onProgress = null
    } = options

    const results = []
    let completed = 0

    for (const key of imageKeys) {
      for (const size of sizes) {
        try {
          // Check if already cached
          const cached = await this.getCachedImage(key, { size, fallbackToStorage: false })
          if (cached) {
            results.push({ key, size, status: 'already_cached' })
          } else {
            // Try to load from storage and cache
            const imageData = await imageStorage.getImage(this.generateImageId(key, size))
            if (imageData) {
              await this.setCachedImage(key, imageData.blob, { size })
              results.push({ key, size, status: 'preloaded' })
            } else {
              results.push({ key, size, status: 'not_found' })
            }
          }
        } catch (error) {
          results.push({ key, size, status: 'error', error: error.message })
        }

        completed++
        onProgress?.({
          completed,
          total: imageKeys.length * sizes.length,
          progress: Math.round((completed / (imageKeys.length * sizes.length)) * 100)
        })
      }
    }

    return results
  }

  /**
   * Ensure memory space is available for new item
   */
  ensureMemorySpace(requiredSize) {
    // Check if we have enough space
    if (this.currentMemorySize + requiredSize <= this.cacheConfig.maxMemorySize &&
        this.memoryCache.size < this.cacheConfig.maxMemoryItems) {
      return
    }

    // Use intelligent eviction that considers backend availability
    this.performIntelligentEviction(requiredSize)
  }

  /**
   * Calculate eviction score for LRU policy
   */
  calculateEvictionScore(metadata) {
    const now = Date.now()
    const age = now - (metadata.lastAccessed || metadata.cachedAt)
    const accessCount = metadata.accessCount || 1
    const size = metadata.size || 0

    // Lower score = more likely to evict
    // Factors: age (older = lower score), access count (less used = lower score), size (larger = lower score)
    return (accessCount * 1000) - (age / 1000) - (size / 1024)
  }

  /**
   * Start periodic cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      this.performPeriodicCleanup()
    }, this.cacheConfig.cleanupInterval)
  }

  /**
   * Perform periodic cleanup of expired items
   */
  async performPeriodicCleanup() {
    const now = Date.now()
    let cleanedCount = 0

    // Clean memory cache
    for (const [key, cached] of this.memoryCache.entries()) {
      if (now > cached.metadata.expiresAt) {
        this.memoryCache.delete(key)
        this.currentMemorySize -= cached.metadata.size
        cleanedCount++
      }
    }

    // Clean persistent cache (less frequently)
    if (Math.random() < 0.1) { // 10% chance each cleanup cycle
      await this.cleanupExpiredPersistentCache()
    }

    if (cleanedCount > 0) {
      this.cacheStats.cleanups++
    }
  }

  /**
   * Cleanup expired items from persistent cache
   */
  async cleanupExpiredPersistentCache() {
    try {
      // Check if we're in a browser environment
      if (typeof indexedDB === 'undefined') {
        return // Skip cleanup in non-browser environments
      }
      
      // This is a simplified implementation
      // In a full implementation, we'd iterate through cache items and check expiration
      await imageStorage.cleanupOldImages(this.cacheConfig.persistentCacheTTL)
    } catch (error) {
      console.warn('Failed to cleanup expired persistent cache:', error)
    }
  }

  /**
   * Setup memory pressure handling
   */
  setupMemoryPressureHandling() {
    // Listen for memory pressure events if available
    if ('memory' in performance && 'addEventListener' in performance.memory) {
      performance.memory.addEventListener('memorypressure', () => {
        this.handleMemoryPressure()
      })
    }
  }

  /**
   * Handle memory pressure by aggressively cleaning cache
   */
  async handleMemoryPressure() {
    // Clear 50% of memory cache, starting with least recently used
    const targetSize = Math.floor(this.memoryCache.size * 0.5)
    const items = Array.from(this.memoryCache.entries())
      .map(([key, cached]) => ({
        key,
        score: this.calculateEvictionScore(cached.metadata),
        size: cached.metadata.size
      }))
      .sort((a, b) => a.score - b.score)

    let removedCount = 0
    let freedSpace = 0

    for (const item of items) {
      if (removedCount >= targetSize) break

      const cached = this.memoryCache.get(item.key)
      if (cached) {
        this.memoryCache.delete(item.key)
        freedSpace += cached.metadata.size
        removedCount++
      }
    }

    this.currentMemorySize -= freedSpace
    console.log(`Memory pressure: cleared ${removedCount} items, freed ${(freedSpace / (1024 * 1024)).toFixed(2)}MB`)
  }

  /**
   * Generate cache key
   */
  generateCacheKey(key, size) {
    return `${key}_${size}`
  }

  /**
   * Generate image ID for storage
   */
  generateImageId(key, size) {
    return `${key}_${size}`
  }

  /**
   * Get data size in bytes
   */
  getDataSize(data) {
    if (data instanceof Blob) {
      return data.size
    }
    if (typeof data === 'string') {
      return new Blob([data]).size
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength
    }
    return 0
  }

  /**
   * Destroy cache service
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    
    this.memoryCache.clear()
    this.currentMemorySize = 0
  }

  /**
   * Get cache configuration
   */
  getConfig() {
    return { ...this.cacheConfig }
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig) {
    this.cacheConfig = { ...this.cacheConfig, ...newConfig }
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval) {
      this.startCleanupTimer()
    }

    // Ensure memory limits are respected
    if (newConfig.maxMemorySize && this.currentMemorySize > newConfig.maxMemorySize) {
      this.ensureMemorySpace(0)
    }
  }

  // ========================================
  // BACKEND INTEGRATION METHODS
  // ========================================

  /**
   * Cache warming from backend storage
   * Preloads frequently accessed images from backend into local cache
   */
  async warmCacheFromBackend(comicIds, options = {}) {
    const {
      sizes = ['thumbnail', 'medium'],
      priority = 'low',
      onProgress = null,
      maxConcurrent = 3
    } = options

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    }

    let completed = 0
    const total = comicIds.length * sizes.length

    // Process in batches to avoid overwhelming the server
    const batches = []
    for (let i = 0; i < comicIds.length; i += maxConcurrent) {
      batches.push(comicIds.slice(i, i + maxConcurrent))
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (comicId) => {
        for (const size of sizes) {
          try {
            // Check if already cached
            const cached = await this.getCachedImage(comicId, { 
              size, 
              fallbackToStorage: false 
            })
            
            if (cached) {
              results.skipped++
            } else {
              // Fetch from backend and cache
              const imageBlob = await this.fetchRemoteImage(comicId, size)
              if (imageBlob) {
                await this.setCachedImage(comicId, imageBlob, {
                  size,
                  metadata: {
                    source: 'backend_warmup',
                    warmedAt: Date.now()
                  }
                })
                results.success++
              } else {
                results.failed++
              }
            }
          } catch (error) {
            results.failed++
            results.errors.push({
              comicId,
              size,
              error: error.message
            })
          }

          completed++
          onProgress?.({
            completed,
            total,
            progress: Math.round((completed / total) * 100),
            currentComic: comicId,
            currentSize: size
          })
        }
      })

      // Wait for current batch to complete before starting next
      await Promise.all(batchPromises)
    }

    return results
  }

  /**
   * Intelligent caching for remote images
   * Implements smart caching strategies based on usage patterns
   */
  async cacheRemoteImage(comicId, size, options = {}) {
    const {
      priority = 'normal',
      preloadRelated = false,
      updateExisting = false
    } = options

    try {
      // Check if already cached and fresh
      const existing = await this.getCachedImage(comicId, { 
        size, 
        fallbackToStorage: false 
      })
      
      if (existing && !updateExisting) {
        return {
          success: true,
          cached: true,
          source: 'existing_cache'
        }
      }

      // Fetch from backend
      const imageBlob = await this.fetchRemoteImage(comicId, size)
      if (!imageBlob) {
        return {
          success: false,
          error: 'Image not found on backend'
        }
      }

      // Cache with appropriate TTL based on priority
      const ttl = this.getTTLForPriority(priority)
      await this.setCachedImage(comicId, imageBlob, {
        size,
        ttl,
        metadata: {
          source: 'remote_cache',
          priority,
          cachedAt: Date.now(),
          remoteSource: true
        }
      })

      // Preload related sizes if requested
      if (preloadRelated) {
        this.preloadRelatedSizes(comicId, size, priority)
      }

      return {
        success: true,
        cached: false,
        source: 'remote_fetch'
      }
    } catch (error) {
      console.error('Remote image caching error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Fetch image from remote backend
   */
  async fetchRemoteImage(comicId, size) {
    try {
      const response = await fetch(`/api/images/${comicId}/${size}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`Backend fetch failed: ${response.status}`)
      }

      return await response.blob()
    } catch (error) {
      console.error('Remote image fetch error:', error)
      throw error
    }
  }

  /**
   * Preload related image sizes in background
   */
  async preloadRelatedSizes(comicId, currentSize, priority = 'low') {
    const sizeHierarchy = ['thumbnail', 'medium', 'full']
    const currentIndex = sizeHierarchy.indexOf(currentSize)
    
    if (currentIndex === -1) return

    // Preload adjacent sizes
    const sizesToPreload = []
    
    if (currentIndex > 0) {
      sizesToPreload.push(sizeHierarchy[currentIndex - 1])
    }
    if (currentIndex < sizeHierarchy.length - 1) {
      sizesToPreload.push(sizeHierarchy[currentIndex + 1])
    }

    // Preload in background (don't await)
    sizesToPreload.forEach(size => {
      this.cacheRemoteImage(comicId, size, { 
        priority: 'low',
        preloadRelated: false 
      }).catch(error => {
        console.warn(`Background preload failed for ${comicId}/${size}:`, error)
      })
    })
  }

  /**
   * Get TTL based on priority
   */
  getTTLForPriority(priority) {
    switch (priority) {
      case 'high':
        return 7 * 24 * 60 * 60 * 1000 // 7 days
      case 'normal':
        return 3 * 24 * 60 * 60 * 1000 // 3 days
      case 'low':
        return 24 * 60 * 60 * 1000 // 1 day
      default:
        return this.cacheConfig.defaultTTL
    }
  }

  /**
   * Enhanced cache retrieval with backend fallback
   */
  async getCachedImageWithBackend(key, options = {}) {
    const {
      size = 'medium',
      fallbackToBackend = true,
      cacheBackendResult = true
    } = options

    // First try normal cache retrieval
    const cached = await this.getCachedImage(key, {
      size,
      fallbackToStorage: true,
      updateTTL: true
    })

    if (cached) {
      return cached
    }

    // If not cached and backend fallback is enabled, try backend
    if (fallbackToBackend) {
      try {
        const backendImage = await this.fetchRemoteImage(key, size)
        
        if (backendImage && cacheBackendResult) {
          // Cache the backend result for future use
          await this.setCachedImage(key, backendImage, {
            size,
            metadata: {
              source: 'backend_fallback',
              fetchedAt: Date.now()
            }
          })
        }

        return backendImage
      } catch (error) {
        console.warn('Backend fallback failed:', error)
      }
    }

    return null
  }

  /**
   * Intelligent cache eviction based on usage patterns and source
   */
  performIntelligentEviction(requiredSpace) {
    const items = Array.from(this.memoryCache.entries())
      .map(([key, cached]) => ({
        key,
        ...cached,
        score: this.calculateIntelligentEvictionScore(cached.metadata)
      }))
      .sort((a, b) => a.score - b.score) // Lower score = more likely to evict

    let freedSpace = 0
    let evictedCount = 0

    for (const item of items) {
      if (freedSpace >= requiredSpace) {
        break
      }

      this.memoryCache.delete(item.key)
      freedSpace += item.metadata.size
      evictedCount++
      this.cacheStats.evictions++
    }

    this.currentMemorySize -= freedSpace
    return { freedSpace, evictedCount }
  }

  /**
   * Calculate intelligent eviction score considering backend availability
   */
  calculateIntelligentEvictionScore(metadata) {
    const now = Date.now()
    const age = now - (metadata.lastAccessed || metadata.cachedAt)
    const accessCount = metadata.accessCount || 1
    const size = metadata.size || 0
    
    // Base score calculation
    let score = (accessCount * 1000) - (age / 1000) - (size / 1024)
    
    // Adjust score based on source and availability
    if (metadata.source === 'remote_cache' || metadata.remoteSource) {
      // Remote images are easier to re-fetch, lower priority to keep
      score *= 0.8
    } else if (metadata.source === 'upload' || metadata.source === 'local_only') {
      // Local-only images are harder to replace, higher priority to keep
      score *= 1.2
    }
    
    // Adjust based on image size priority
    if (metadata.imageSize === 'thumbnail') {
      // Thumbnails are frequently accessed, higher priority
      score *= 1.1
    } else if (metadata.imageSize === 'full') {
      // Full images are large and less frequently accessed
      score *= 0.9
    }
    
    return score
  }

  /**
   * Batch cache operations for multiple images
   */
  async batchCacheImages(imageRequests, options = {}) {
    const {
      maxConcurrent = 5,
      onProgress = null,
      failFast = false
    } = options

    const results = []
    let completed = 0

    // Process in batches
    for (let i = 0; i < imageRequests.length; i += maxConcurrent) {
      const batch = imageRequests.slice(i, i + maxConcurrent)
      
      const batchPromises = batch.map(async (request) => {
        try {
          const result = await this.cacheRemoteImage(
            request.comicId, 
            request.size, 
            request.options
          )
          
          results.push({
            comicId: request.comicId,
            size: request.size,
            ...result
          })
        } catch (error) {
          const errorResult = {
            comicId: request.comicId,
            size: request.size,
            success: false,
            error: error.message
          }
          
          results.push(errorResult)
          
          if (failFast) {
            throw error
          }
        }

        completed++
        onProgress?.({
          completed,
          total: imageRequests.length,
          progress: Math.round((completed / imageRequests.length) * 100)
        })
      })

      if (failFast) {
        await Promise.all(batchPromises)
      } else {
        await Promise.allSettled(batchPromises)
      }
    }

    return {
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }

  /**
   * Cache health check and optimization
   */
  async performCacheHealthCheck() {
    const health = {
      memory: {
        utilization: (this.currentMemorySize / this.cacheConfig.maxMemorySize * 100).toFixed(2),
        items: this.memoryCache.size,
        avgItemSize: this.memoryCache.size > 0 ? 
          Math.round(this.currentMemorySize / this.memoryCache.size) : 0
      },
      performance: {
        hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 ? 
          ((this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100).toFixed(2) : '0.00',
        evictionRate: this.cacheStats.evictions / Math.max(this.cacheStats.hits + this.cacheStats.misses, 1)
      },
      recommendations: []
    }

    // Generate recommendations
    if (parseFloat(health.memory.utilization) > 90) {
      health.recommendations.push('Memory utilization high - consider increasing cache size or reducing TTL')
    }
    
    if (parseFloat(health.performance.hitRate) < 70) {
      health.recommendations.push('Low hit rate - consider cache warming or longer TTL')
    }
    
    if (health.performance.evictionRate > 0.1) {
      health.recommendations.push('High eviction rate - consider increasing cache size')
    }

    return health
  }
}

export default new ImageCacheService()