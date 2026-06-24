/**
 * Image storage utilities for managing cover images
 * Handles both local storage (IndexedDB) and remote storage (MongoDB) with hybrid sync
 */

import { apiFetch } from './apiClient.js'

class ImageStorageService {
  constructor() {
    this.dbName = 'ComicCoverStorage'
    this.dbVersion = 1
    this.storeName = 'covers'
    this.db = null
  }

  /**
   * Initialize the IndexedDB database
   */
  async init() {
    if (this.db) return this.db

    // Check if IndexedDB is available (browser environment)
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB not available in this environment')
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        
        // Create object store for cover images
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' })
          store.createIndex('comicId', 'comicId', { unique: false })
          store.createIndex('uploadedAt', 'uploadedAt', { unique: false })
        }
      }
    })
  }

  /**
   * Store an image blob in IndexedDB
   */
  async storeImage(id, imageData, metadata = {}) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      let data
      if (imageData instanceof Blob) {
        // Legacy blob storage
        data = {
          id,
          blob: imageData,
          metadata,
          cachedAt: Date.now(),
          size: imageData.size,
          type: imageData.type
        }
      } else {
        // New multi-size image data format
        data = {
          id,
          comicId: id,
          imageData,
          metadata,
          cachedAt: Date.now(),
          type: 'multi-size'
        }
      }

      const request = store.put(data)

      request.onsuccess = () => {
        resolve({ id, url: this.generateLocalUrl(id) })
      }

      request.onerror = () => {
        reject(new Error(`Failed to store image: ${request.error}`))
      }
    })
  }

  /**
   * Retrieve an image blob from IndexedDB
   */
  async getImage(id) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(id)

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result)
        } else {
          resolve(null)
        }
      }

      request.onerror = () => {
        reject(new Error(`Failed to retrieve image: ${request.error}`))
      }
    })
  }

  /**
   * Delete an image from IndexedDB
   */
  async deleteImage(id) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(id)

      request.onsuccess = () => {
        resolve(true)
      }

      request.onerror = () => {
        reject(new Error(`Failed to delete image: ${request.error}`))
      }
    })
  }

  /**
   * Get all images for a specific comic
   */
  async getImagesByComicId(comicId) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('comicId')
      const request = index.getAll(comicId)

      request.onsuccess = () => {
        resolve(request.result || [])
      }

      request.onerror = () => {
        reject(new Error(`Failed to retrieve images: ${request.error}`))
      }
    })
  }

  /**
   * Generate a blob URL for an image
   */
  async getImageUrl(id, size = 'medium') {
    const imageData = await this.getImage(id)
    if (!imageData) return null

    if (imageData.blob) {
      // Legacy blob format
      return URL.createObjectURL(imageData.blob)
    } else if (imageData.imageData && imageData.imageData[size]) {
      // New multi-size format
      const sizeData = imageData.imageData[size]
      const blob = this.base64ToBlob(sizeData.data, sizeData.mimeType)
      return URL.createObjectURL(blob)
    }

    return null
  }

  /**
   * Store multiple image sizes (thumbnail, medium, full)
   */
  async storeImageSizes(baseId, images) {
    const results = {}
    
    for (const [size, blob] of Object.entries(images)) {
      const id = `${baseId}_${size}`
      await this.storeImage(id, blob, { size, baseId })
      results[size] = id
    }
    
    return results
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats() {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const images = request.result || []
        const totalSize = images.reduce((sum, img) => sum + (img.size || 0), 0)
        const totalCount = images.length

        resolve({
          totalImages: totalCount,
          totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
          oldestImage: images.length > 0 ? 
            images.reduce((oldest, img) => 
              (img.cachedAt || 0) < (oldest.cachedAt || 0) ? img : oldest
            ).cachedAt : null
        })
      }

      request.onerror = () => {
        reject(new Error(`Failed to get storage stats: ${request.error}`))
      }
    })
  }

  /**
   * Clear all stored images
   */
  async clearStorage() {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.clear()

      request.onsuccess = () => {
        resolve(true)
      }

      request.onerror = () => {
        reject(new Error(`Failed to clear storage: ${request.error}`))
      }
    })
  }

  /**
   * Clean up old images based on age
   */
  async cleanupOldImages(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('uploadedAt')
      const request = index.openCursor()

      const cutoffTime = Date.now() - maxAge
      let deletedCount = 0

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          const image = cursor.value
          if ((image.cachedAt || 0) < cutoffTime) {
            cursor.delete()
            deletedCount++
          }
          cursor.continue()
        } else {
          resolve(deletedCount)
        }
      }

      request.onerror = () => {
        reject(new Error(`Failed to cleanup old images: ${request.error}`))
      }
    })
  }

  /**
   * Check if storage quota is available
   */
  async checkStorageQuota() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return {
        available: estimate.quota - estimate.usage,
        used: estimate.usage,
        quota: estimate.quota,
        usagePercentage: ((estimate.usage / estimate.quota) * 100).toFixed(2)
      }
    }
    return null
  }

  /**
   * Get all images with metadata
   */
  async getAllImages() {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }

      request.onerror = () => {
        reject(new Error(`Failed to get all images: ${request.error}`))
      }
    })
  }

  /**
   * Get image data (base64) for upload
   */
  async getImageData(comicId) {
    const imageData = await this.getImage(comicId)
    if (!imageData) return null

    if (imageData.imageData) {
      // Multi-size format
      return {
        data: imageData.imageData,
        metadata: imageData.metadata,
        mimeType: imageData.imageData.full?.mimeType || 'image/jpeg'
      }
    } else if (imageData.blob) {
      // Legacy blob format
      const base64 = await this.blobToBase64(imageData.blob)
      return {
        data: base64,
        metadata: imageData.metadata,
        mimeType: imageData.type
      }
    }

    return null
  }

  /**
   * Update metadata for an image
   */
  async updateMetadata(id, newMetadata) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      
      const getRequest = store.get(id)
      
      getRequest.onsuccess = () => {
        const imageData = getRequest.result
        if (imageData) {
          imageData.metadata = { ...imageData.metadata, ...newMetadata }
          
          const putRequest = store.put(imageData)
          putRequest.onsuccess = () => resolve(true)
          putRequest.onerror = () => reject(new Error(`Failed to update metadata: ${putRequest.error}`))
        } else {
          reject(new Error('Image not found'))
        }
      }

      getRequest.onerror = () => {
        reject(new Error(`Failed to get image for update: ${getRequest.error}`))
      }
    })
  }

  /**
   * Get metadata for an image
   */
  async getMetadata(id) {
    const imageData = await this.getImage(id)
    return imageData?.metadata || null
  }

  /**
   * Clear all images
   */
  async clearAll() {
    return this.clearStorage()
  }

  /**
   * Convert base64 to blob
   */
  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: mimeType })
  }

  /**
   * Convert blob to base64
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Generate local URL for image
   */
  generateLocalUrl(id) {
    return `local://${id}`
  }

  // ========================================
  // BACKEND STORAGE METHODS
  // ========================================

  /**
   * Upload image to backend server
   * @param {File|Blob} file - Image file to upload
   * @param {string} comicId - Comic identifier
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Upload result with URLs
   */
  async uploadImageRemote(file, comicId, metadata = {}) {
    try {
      const { default: imageUploadClient } = await import('./imageUploadClient.js')
      
      return await imageUploadClient.uploadImage(comicId, file, {
        source: 'upload',
        ...metadata
      })
    } catch (error) {
      console.error('Remote upload error:', error)
      throw new Error(`Failed to upload to backend: ${error.message}`)
    }
  }

  /**
   * Get image data from backend server
   * @param {string} comicId - Comic identifier
   * @param {string} size - Image size (thumbnail, medium, full)
   * @returns {Promise<Blob>} - Image blob
   */
  async getImageDataRemote(comicId, size = 'medium') {
    try {
      const response = await apiFetch(`/api/images/${comicId}/${size}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`Failed to fetch image: ${response.status}`)
      }

      return await response.blob()
    } catch (error) {
      console.error('Remote image fetch error:', error)
      throw new Error(`Failed to fetch remote image: ${error.message}`)
    }
  }

  /**
   * Get image metadata from backend server
   * @param {string} comicId - Comic identifier
   * @returns {Promise<Object>} - Image metadata
   */
  async getImageMetadataRemote(comicId) {
    try {
      const response = await apiFetch(`/api/images/${comicId}/metadata`)
      
      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`Failed to fetch metadata: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Remote metadata fetch error:', error)
      throw new Error(`Failed to fetch remote metadata: ${error.message}`)
    }
  }

  /**
   * Delete image from backend server
   * @param {string} comicId - Comic identifier
   * @returns {Promise<boolean>} - Success status
   */
  async deleteImageRemote(comicId) {
    try {
      const response = await apiFetch(`/api/images/${comicId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        if (response.status === 404) {
          return true // Already deleted
        }
        const errorData = await response.json()
        throw new Error(errorData.error || `Delete failed: ${response.status}`)
      }

      const result = await response.json()
      return result.success
    } catch (error) {
      console.error('Remote delete error:', error)
      throw new Error(`Failed to delete from backend: ${error.message}`)
    }
  }

  /**
   * Sync images between local and remote storage
   * @returns {Promise<Object>} - Sync results
   */
  async syncImages() {
    try {
      // Get all local images with metadata
      const localImages = await this.getAllImages()
      
      // Prepare sync data
      const syncData = {
        localImages: localImages.map(img => ({
          comicId: img.comicId || img.id,
          localVersion: this.generateVersionHash(img),
          lastModified: img.cachedAt || img.metadata?.cachedAt
        }))
      }

      // Call sync API
      const response = await apiFetch('/api/images/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(syncData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Sync failed: ${response.status}`)
      }

      const syncResult = await response.json()
      
      // Process sync results
      const results = {
        uploaded: 0,
        downloaded: 0,
        conflicts: syncResult.conflicts || [],
        errors: []
      }

      // Upload images that need to be uploaded
      for (const comicId of syncResult.toUpload || []) {
        try {
          const localImage = localImages.find(img => 
            (img.comicId || img.id) === comicId
          )
          
          if (localImage && localImage.blob) {
            await this.uploadImageRemote(localImage.blob, comicId, localImage.metadata)
            results.uploaded++
          }
        } catch (error) {
          results.errors.push({
            comicId,
            operation: 'upload',
            error: error.message
          })
        }
      }

      // Download images that need to be downloaded
      for (const downloadInfo of syncResult.toDownload || []) {
        try {
          const imageBlob = await this.getImageDataRemote(downloadInfo.comicId, 'full')
          if (imageBlob) {
            const metadata = await this.getImageMetadataRemote(downloadInfo.comicId)
            await this.storeImage(downloadInfo.comicId, imageBlob, metadata)
            results.downloaded++
          }
        } catch (error) {
          results.errors.push({
            comicId: downloadInfo.comicId,
            operation: 'download',
            error: error.message
          })
        }
      }

      return results
    } catch (error) {
      console.error('Sync error:', error)
      throw new Error(`Failed to sync images: ${error.message}`)
    }
  }

  /**
   * Hybrid storage method - automatically chooses best storage strategy
   * @param {File|Blob} file - Image file
   * @param {string} comicId - Comic identifier
   * @param {string} strategy - Storage strategy ('local', 'remote', 'hybrid')
   * @returns {Promise<Object>} - Upload result
   */
  async uploadImage(file, comicId, strategy = 'hybrid') {
    try {
      switch (strategy) {
        case 'local':
          const localResult = await this.storeImage(comicId, file)
          return {
            success: true,
            storage: 'local',
            id: localResult.id,
            url: localResult.url
          }

        case 'remote':
          return await this.uploadImageRemote(file, comicId)

        case 'hybrid':
          // Try remote first, fallback to local
          try {
            const remoteResult = await this.uploadImageRemote(file, comicId)
            
            // Also store locally for offline access
            try {
              await this.storeImage(comicId, file)
            } catch (localError) {
              console.warn('Failed to store locally after remote upload:', localError)
            }
            
            return {
              ...remoteResult,
              storage: 'hybrid'
            }
          } catch (remoteError) {
            console.warn('Remote upload failed, falling back to local:', remoteError)
            
            const localResult = await this.storeImage(comicId, file)
            return {
              success: true,
              storage: 'local_fallback',
              id: localResult.id,
              url: localResult.url,
              fallbackReason: remoteError.message
            }
          }

        default:
          throw new Error(`Unknown storage strategy: ${strategy}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      throw new Error(`Failed to upload image: ${error.message}`)
    }
  }

  /**
   * Delete image from both local and remote storage
   * @param {string} comicId - Comic identifier
   * @returns {Promise<Object>} - Deletion results
   */
  async deleteImageHybrid(comicId) {
    const results = {
      local: false,
      remote: false,
      errors: []
    }

    // Delete from local storage
    try {
      results.local = await this.deleteImage(comicId)
    } catch (error) {
      results.errors.push({
        storage: 'local',
        error: error.message
      })
    }

    // Delete from remote storage
    try {
      results.remote = await this.deleteImageRemote(comicId)
    } catch (error) {
      results.errors.push({
        storage: 'remote',
        error: error.message
      })
    }

    return results
  }

  /**
   * Generate version hash for sync operations
   * @param {Object} imageData - Image data object
   * @returns {string} - Version hash
   */
  generateVersionHash(imageData) {
    const hashData = {
      size: imageData.size || 0,
      type: imageData.type || imageData.metadata?.mimeType || 'unknown',
      cachedAt: imageData.cachedAt || imageData.metadata?.cachedAt || Date.now()
    }
    
    const hashString = JSON.stringify(hashData)
    // Use a simple hash instead of btoa to avoid InvalidCharacterError
    let hash = 0
    for (let i = 0; i < hashString.length; i++) {
      const char = hashString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 16)
  }
}

export default new ImageStorageService()