/**
 * Image Storage Manager
 * Provides a unified interface for image storage operations
 * Manages both local and hybrid storage strategies
 */

import imageStorage from './imageStorage.js'
import { hybridImageStorage } from './hybridImageStorage.js'
import imageCache from './imageCache.js'

class ImageStorageManager {
  constructor() {
    this.strategy = 'hybrid' // 'local', 'hybrid' - restored hybrid storage
    this.autoSync = true
    this.syncInterval = 5 * 60 * 1000 // 5 minutes
    this.syncTimer = null
    
    this.init()
  }

  /**
   * Initialize the storage manager
   */
  async init() {
    // Start periodic sync if auto-sync is enabled
    if (this.autoSync && this.strategy === 'hybrid') {
      this.startPeriodicSync()
    }

    // Listen for visibility changes to sync when app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.strategy === 'hybrid') {
        this.syncInBackground()
      }
    })
  }

  /**
   * Set storage strategy
   */
  setStrategy(strategy) {
    if (['local', 'hybrid'].includes(strategy)) {
      this.strategy = strategy
      
      if (strategy === 'hybrid' && this.autoSync) {
        this.startPeriodicSync()
      } else {
        this.stopPeriodicSync()
      }
    }
  }

  /**
   * Store image using current strategy
   */
  async storeImage(comicId, imageData, metadata = {}) {
    try {
      if (this.strategy === 'hybrid') {
        return await hybridImageStorage.storeImage(comicId, imageData, metadata)
      } else {
        return await imageStorage.storeImage(comicId, imageData, metadata)
      }
    } catch (error) {
      console.error('Image storage failed:', error)
      throw error
    }
  }

  /**
   * Get image using current strategy
   */
  async getImage(comicId, size = 'medium') {
    try {
      // Check cache first
      const cachedUrl = await imageCache.getCachedImage(`${comicId}_${size}`)
      if (cachedUrl) {
        return {
          url: cachedUrl,
          source: 'cache',
          cached: true
        }
      }

      let result
      if (this.strategy === 'hybrid') {
        result = await hybridImageStorage.getImage(comicId, size)
      } else {
        const url = await imageStorage.getImageUrl(comicId, size)
        result = url ? { url, source: 'local', cached: false } : null
      }

      // Cache the result if found
      if (result && result.url) {
        await imageCache.setCachedImage(`${comicId}_${size}`, result.url)
      }

      return result
    } catch (error) {
      console.error('Image retrieval failed:', error)
      throw error
    }
  }

  /**
   * Delete image using current strategy
   */
  async deleteImage(comicId) {
    try {
      // Clear from cache
      const sizes = ['thumbnail', 'medium', 'full']
      for (const size of sizes) {
        await imageCache.clearCachedImage(`${comicId}_${size}`)
      }

      if (this.strategy === 'hybrid') {
        return await hybridImageStorage.deleteImage(comicId)
      } else {
        await imageStorage.deleteImage(comicId)
        return { local: true, remote: false }
      }
    } catch (error) {
      console.error('Image deletion failed:', error)
      throw error
    }
  }

  /**
   * Sync images (hybrid strategy only)
   */
  async syncImages() {
    if (this.strategy !== 'hybrid') {
      return { skipped: true, reason: 'not_hybrid_strategy' }
    }

    try {
      return await hybridImageStorage.syncAll()
    } catch (error) {
      console.error('Image sync failed:', error)
      throw error
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      if (this.strategy === 'hybrid') {
        return await hybridImageStorage.getStorageStats()
      } else {
        const localStats = await imageStorage.getStorageStats()
        return {
          local: localStats,
          remote: null,
          sync: { queueLength: 0, inProgress: false, offline: false }
        }
      }
    } catch (error) {
      console.error('Failed to get storage stats:', error)
      throw error
    }
  }

  /**
   * Clear all cached images
   */
  async clearCache() {
    try {
      await imageCache.clearCache()
      
      if (this.strategy === 'hybrid') {
        await hybridImageStorage.clearLocalCache()
      } else {
        await imageStorage.clearAll()
      }
    } catch (error) {
      console.error('Failed to clear cache:', error)
      throw error
    }
  }

  /**
   * Process and store image from file upload
   */
  async processAndStoreImage(comicId, file, metadata = {}) {
    try {
      // Convert file to base64 for processing
      const base64Data = await this.fileToBase64(file)
      
      // For local strategy, we'll do basic processing
      if (this.strategy === 'local') {
        // Create different sizes locally (simplified)
        const imageData = {
          full: {
            data: base64Data,
            mimeType: file.type,
            size: file.size,
            dimensions: { width: 0, height: 0 } // Would need image processing library
          }
        }
        
        return await this.storeImage(comicId, imageData, {
          ...metadata,
          source: 'upload',
          originalFileName: file.name
        })
      } else {
        // Hybrid strategy - let the backend process the image
        return await this.storeImage(comicId, {
          full: {
            data: base64Data,
            mimeType: file.type,
            size: file.size
          }
        }, {
          ...metadata,
          source: 'upload',
          originalFileName: file.name
        })
      }
    } catch (error) {
      console.error('Image processing and storage failed:', error)
      throw error
    }
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }

    this.syncTimer = setInterval(() => {
      this.syncInBackground()
    }, this.syncInterval)
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  /**
   * Sync in background (non-blocking)
   */
  async syncInBackground() {
    if (this.strategy === 'hybrid') {
      try {
        await hybridImageStorage.backgroundSync()
      } catch (error) {
        console.debug('Background sync failed:', error)
      }
    }
  }

  /**
   * Set conflict resolver for hybrid storage
   */
  setConflictResolver(resolver) {
    if (this.strategy === 'hybrid') {
      hybridImageStorage.setConflictResolver(resolver)
    }
  }

  /**
   * Check if image exists
   */
  async hasImage(comicId) {
    try {
      const result = await this.getImage(comicId, 'thumbnail')
      return !!result
    } catch (error) {
      return false
    }
  }

  /**
   * Get image metadata
   */
  async getImageMetadata(comicId) {
    try {
      if (this.strategy === 'hybrid') {
        // Try to get from local storage first
        return await imageStorage.getMetadata(comicId)
      } else {
        return await imageStorage.getMetadata(comicId)
      }
    } catch (error) {
      console.error('Failed to get image metadata:', error)
      return null
    }
  }

  /**
   * Convert file to base64
   */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * Enable/disable auto-sync
   */
  setAutoSync(enabled) {
    this.autoSync = enabled
    
    if (enabled && this.strategy === 'hybrid') {
      this.startPeriodicSync()
    } else {
      this.stopPeriodicSync()
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      strategy: this.strategy,
      autoSync: this.autoSync,
      syncInterval: this.syncInterval,
      isOnline: navigator.onLine
    }
  }
}

// Create singleton instance
export const imageStorageManager = new ImageStorageManager()

// Export class for testing
export { ImageStorageManager }