/**
 * Centralized Cover Update Service
 * Single source of truth for all cover update operations
 * 
 * This service ensures DRY principle by providing consistent:
 * - Cover upload/storage
 * - Metadata construction
 * - Cache invalidation
 * - Error handling
 * 
 * Used by:
 * - ComicDetailView (individual cover updates)
 * - BulkCoverManager (bulk operations)
 * - Any other component that needs to update covers
 */

import ImageURLService from './ImageURLService.js'
import imageUploadClient from './imageUploadClient.js'

class CoverUpdateService {
  /**
   * Add or replace a cover for a comic
   * @param {string} comicId - Comic identifier
   * @param {Blob} imageBlob - Image blob data
   * @param {Object} metadata - Cover metadata
   * @param {string} metadata.source - Source type ('api', 'upload')
   * @param {string} metadata.provider - Provider name (e.g., 'comicvine')
   * @param {string} metadata.originalUrl - Original image URL
   * @param {string} metadata.attribution - Attribution text
   * @param {string} metadata.quality - Quality level
   * @param {Object} metadata.dimensions - Image dimensions
   * @returns {Promise<Object>} Updated comic metadata fields
   */
  async addCover(comicId, imageBlob, metadata = {}) {
    try {
      console.log('[CoverUpdateService] Adding cover for comic:', comicId)
      
      // Upload the image using centralized upload client
      const uploadResult = await imageUploadClient.uploadImage(
        comicId,
        imageBlob,
        {
          source: metadata.source || 'api',
          provider: metadata.provider,
          originalUrl: metadata.originalUrl,
          attribution: metadata.attribution,
          quality: metadata.quality,
          dimensions: metadata.dimensions
          // Note: Volume metadata is stored on comic record, not cover image record
        }
      )
      
      console.log('[CoverUpdateService] Upload successful:', uploadResult)
      
      // Construct standardized metadata object
      const coverMetadata = {
        hasCover: true,
        coverId: uploadResult.imageId || Date.now().toString(),
        coverSource: metadata.source || 'api',
        coverSourceProvider: metadata.provider || 'unknown',
        coverOriginalUrl: metadata.originalUrl || null,
        coverAttribution: metadata.attribution || null,
        coverLastUpdated: new Date().toISOString(),
        // Volume information from ComicVine (if available)
        volumeId: metadata.volumeId || null,
        volumeName: metadata.volumeName || null
      }
      
      // Clear cache to ensure fresh image is loaded
      console.log('[CoverUpdateService] Clearing cache for comic:', comicId)
      await ImageURLService.clearCache(comicId)
      
      return {
        success: true,
        metadata: coverMetadata,
        uploadResult
      }
      
    } catch (error) {
      console.error('[CoverUpdateService] Failed to add cover:', error)
      throw new Error(`Failed to add cover: ${error.message}`)
    }
  }
  
  /**
   * Remove a cover from a comic
   * @param {string} comicId - Comic identifier
   * @returns {Promise<Object>} Updated comic metadata fields
   */
  async removeCover(comicId) {
    try {
      console.log('[CoverUpdateService] Removing cover for comic:', comicId)
      
      // Note: Image deletion is handled by the API endpoint
      // We just need to update the metadata and clear cache
      
      // Construct metadata for cover removal
      const coverMetadata = {
        hasCover: false,
        coverId: null,
        coverSource: null,
        coverSourceProvider: null,
        coverOriginalUrl: null,
        coverAttribution: null,
        coverLastUpdated: new Date().toISOString(),
        // Note: We keep volumeId/volumeName when removing cover
        // as they're still valid metadata about the comic
      }
      
      // Clear cache
      console.log('[CoverUpdateService] Clearing cache for comic:', comicId)
      await ImageURLService.clearCache(comicId)
      
      return {
        success: true,
        metadata: coverMetadata
      }
      
    } catch (error) {
      console.error('[CoverUpdateService] Failed to remove cover:', error)
      throw new Error(`Failed to remove cover: ${error.message}`)
    }
  }
  
  /**
   * Replace an existing cover with a new one
   * @param {string} comicId - Comic identifier
   * @param {Blob} imageBlob - New image blob data
   * @param {Object} metadata - Cover metadata
   * @returns {Promise<Object>} Updated comic metadata fields
   */
  async replaceCover(comicId, imageBlob, metadata = {}) {
    try {
      console.log('[CoverUpdateService] Replacing cover for comic:', comicId)
      
      // Clear cache first to ensure old image is removed
      await ImageURLService.clearCache(comicId)
      
      // Add the new cover (which will overwrite the old one)
      return await this.addCover(comicId, imageBlob, metadata)
      
    } catch (error) {
      console.error('[CoverUpdateService] Failed to replace cover:', error)
      throw new Error(`Failed to replace cover: ${error.message}`)
    }
  }
  
  /**
   * Batch add covers for multiple comics
   * @param {Array} operations - Array of {comicId, imageBlob, metadata}
   * @param {Object} options - Batch options
   * @param {Function} options.onProgress - Progress callback
   * @param {Function} options.onResult - Individual result callback
   * @returns {Promise<Object>} Batch results
   */
  async batchAddCovers(operations, options = {}) {
    const { onProgress, onResult } = options
    const results = {
      success: [],
      failed: [],
      total: operations.length
    }
    
    let completed = 0
    
    for (const operation of operations) {
      try {
        const result = await this.addCover(
          operation.comicId,
          operation.imageBlob,
          operation.metadata
        )
        
        results.success.push({
          comicId: operation.comicId,
          ...result
        })
        
        onResult?.({
          comicId: operation.comicId,
          success: true,
          metadata: result.metadata
        })
        
      } catch (error) {
        results.failed.push({
          comicId: operation.comicId,
          error: error.message
        })
        
        onResult?.({
          comicId: operation.comicId,
          success: false,
          error: error.message
        })
      }
      
      completed++
      onProgress?.({
        completed,
        total: operations.length,
        progress: Math.round((completed / operations.length) * 100)
      })
    }
    
    return results
  }
  
  /**
   * Validate cover metadata
   * @param {Object} metadata - Metadata to validate
   * @returns {boolean} Whether metadata is valid
   */
  validateMetadata(metadata) {
    if (!metadata) return false
    
    // At minimum, we need a source
    if (!metadata.source) return false
    
    return true
  }
  
  /**
   * Get standardized metadata template
   * @param {Object} overrides - Fields to override
   * @returns {Object} Metadata template
   */
  getMetadataTemplate(overrides = {}) {
    return {
      hasCover: false,
      coverId: null,
      coverSource: null,
      coverSourceProvider: null,
      coverOriginalUrl: null,
      coverAttribution: null,
      coverLastUpdated: null,
      volumeId: null,
      volumeName: null,
      ...overrides
    }
  }
}

// Export singleton instance
const coverUpdateService = new CoverUpdateService()
export default coverUpdateService
