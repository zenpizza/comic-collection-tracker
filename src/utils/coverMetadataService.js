/**
 * Cover Metadata Service - Handles source tracking, attribution, and re-fetch capabilities
 * Manages cover source information and licensing requirements
 */

class CoverMetadataService {
  constructor() {
    this.metadataStore = new Map()
    this.sourceHistory = new Map()
  }

  /**
   * Store cover metadata with source tracking
   * @param {string} comicId - Comic identifier
   * @param {Object} metadata - Cover metadata
   * @returns {Promise<string>} Metadata ID
   */
  async storeCoverMetadata(comicId, metadata) {
    const metadataId = `metadata_${comicId}_${Date.now()}`
    
    const enrichedMetadata = {
      id: metadataId,
      comicId,
      source: metadata.source || 'unknown',
      sourceDetails: {
        provider: metadata.provider || null,
        providerName: metadata.providerName || null,
        originalUrl: metadata.originalUrl || null,
        apiId: metadata.apiId || null,
        downloadedAt: metadata.downloadedAt || new Date().toISOString(),
        attribution: metadata.attribution || null,
        licenseInfo: metadata.licenseInfo || null,
        variant: metadata.variant || null,
        quality: metadata.quality || 'unknown',
        dimensions: metadata.dimensions || { width: 0, height: 0 }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      refetchable: this.isRefetchable(metadata)
    }

    // Store in memory (in a real app, this would be persisted)
    this.metadataStore.set(metadataId, enrichedMetadata)
    
    // Track source history
    this.addToSourceHistory(comicId, enrichedMetadata)

    return metadataId
  }

  /**
   * Get cover metadata by comic ID
   * @param {string} comicId - Comic identifier
   * @returns {Promise<Object|null>} Cover metadata
   */
  async getCoverMetadata(comicId) {
    // Find the most recent metadata for this comic
    for (const [id, metadata] of this.metadataStore) {
      if (metadata.comicId === comicId) {
        return metadata
      }
    }
    return null
  }

  /**
   * Get cover metadata by metadata ID
   * @param {string} metadataId - Metadata identifier
   * @returns {Promise<Object|null>} Cover metadata
   */
  async getCoverMetadataById(metadataId) {
    return this.metadataStore.get(metadataId) || null
  }

  /**
   * Update cover metadata
   * @param {string} metadataId - Metadata identifier
   * @param {Object} updates - Metadata updates
   * @returns {Promise<boolean>} Success status
   */
  async updateCoverMetadata(metadataId, updates) {
    const existing = this.metadataStore.get(metadataId)
    if (!existing) return false

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1
    }

    this.metadataStore.set(metadataId, updated)
    this.addToSourceHistory(existing.comicId, updated)

    return true
  }

  /**
   * Get source history for a comic
   * @param {string} comicId - Comic identifier
   * @returns {Promise<Array>} Source history
   */
  async getSourceHistory(comicId) {
    return this.sourceHistory.get(comicId) || []
  }

  /**
   * Add entry to source history
   * @param {string} comicId - Comic identifier
   * @param {Object} metadata - Metadata entry
   */
  addToSourceHistory(comicId, metadata) {
    const history = this.sourceHistory.get(comicId) || []
    
    // Add new entry
    history.push({
      timestamp: new Date().toISOString(),
      source: metadata.source,
      provider: metadata.sourceDetails?.provider,
      providerName: metadata.sourceDetails?.providerName,
      originalUrl: metadata.sourceDetails?.originalUrl,
      version: metadata.version,
      action: metadata.version === 1 ? 'created' : 'updated'
    })

    // Keep only last 10 entries
    if (history.length > 10) {
      history.splice(0, history.length - 10)
    }

    this.sourceHistory.set(comicId, history)
  }

  /**
   * Generate attribution text for display
   * @param {Object} metadata - Cover metadata
   * @returns {string} Attribution text
   */
  generateAttributionText(metadata) {
    if (!metadata || !metadata.sourceDetails) {
      return ''
    }

    const { sourceDetails } = metadata
    
    switch (metadata.source) {
      case 'api':
        if (sourceDetails.attribution) {
          return sourceDetails.attribution
        }
        if (sourceDetails.providerName) {
          return `Cover image provided by ${sourceDetails.providerName}`
        }
        return 'Cover image from external source'

      case 'upload':
        return 'Cover image uploaded by user'

      case 'manual':
        if (sourceDetails.originalUrl) {
          try {
            const domain = new URL(sourceDetails.originalUrl).hostname
            return `Cover image from ${domain}`
          } catch {
            return 'Cover image from external URL'
          }
        }
        return 'Cover image manually added'

      default:
        return 'Cover image source unknown'
    }
  }

  /**
   * Generate license information text
   * @param {Object} metadata - Cover metadata
   * @returns {string} License information
   */
  generateLicenseText(metadata) {
    if (!metadata || !metadata.sourceDetails) {
      return ''
    }

    const { sourceDetails } = metadata

    if (sourceDetails.licenseInfo) {
      return sourceDetails.licenseInfo
    }

    switch (metadata.source) {
      case 'api':
        if (sourceDetails.providerName) {
          return `Used under ${sourceDetails.providerName} API terms`
        }
        return 'Used under API provider terms'

      case 'upload':
        return 'User-uploaded content'

      case 'manual':
        return 'External content - verify usage rights'

      default:
        return 'License information not available'
    }
  }

  /**
   * Check if a cover can be re-fetched
   * @param {Object} metadata - Cover metadata
   * @returns {boolean} Whether cover can be re-fetched
   */
  isRefetchable(metadata) {
    if (!metadata) return false

    // API sources with original URLs can be re-fetched
    if (metadata.source === 'api' && metadata.originalUrl) {
      return true
    }

    // Manual sources with URLs can be re-fetched
    if (metadata.source === 'manual' && metadata.originalUrl) {
      return true
    }

    return false
  }

  /**
   * Re-fetch cover from original source
   * @param {string} comicId - Comic identifier
   * @returns {Promise<Object|null>} Re-fetch result
   */
  async refetchCover(comicId) {
    const metadata = await this.getCoverMetadata(comicId)
    if (!metadata || !metadata.refetchable) {
      throw new Error('Cover cannot be re-fetched')
    }

    const { sourceDetails } = metadata

    try {
      let refetchResult = null

      if (metadata.source === 'api' && sourceDetails.provider) {
        // Re-fetch from API provider
        refetchResult = await this.refetchFromAPI(sourceDetails)
      } else if (sourceDetails.originalUrl) {
        // Re-fetch from URL
        refetchResult = await this.refetchFromURL(sourceDetails.originalUrl)
      }

      if (refetchResult) {
        // Update metadata with re-fetch information
        await this.updateCoverMetadata(metadata.id, {
          sourceDetails: {
            ...sourceDetails,
            lastRefetchAt: new Date().toISOString(),
            refetchCount: (sourceDetails.refetchCount || 0) + 1
          }
        })

        return {
          success: true,
          coverBlob: refetchResult.blob,
          metadata: refetchResult.metadata,
          wasUpdated: refetchResult.wasUpdated
        }
      }

      return null

    } catch (error) {
      console.error('Re-fetch error:', error)
      throw new Error(`Failed to re-fetch cover: ${error.message}`)
    }
  }

  /**
   * Re-fetch cover from API provider
   * @param {Object} sourceDetails - Source details
   * @returns {Promise<Object>} Re-fetch result
   */
  async refetchFromAPI(sourceDetails) {
    // Import cover API service dynamically to avoid circular dependencies
    const { default: coverAPIService } = await import('./coverAPIService')

    // Check if we have enough information to re-fetch
    if (!sourceDetails.apiId && !sourceDetails.originalUrl) {
      throw new Error('Insufficient information for API re-fetch')
    }

    // Try to get updated metadata first
    let updatedMetadata = null
    if (sourceDetails.apiId && sourceDetails.provider) {
      try {
        updatedMetadata = await coverAPIService.getCoverMetadata(sourceDetails.originalUrl)
      } catch (error) {
        console.warn('Could not get updated metadata:', error)
      }
    }

    // Download the cover
    const coverBlob = await coverAPIService.downloadCover(
      sourceDetails.originalUrl,
      `refetch_${Date.now()}`
    )

    // Check if the cover was actually updated
    const wasUpdated = updatedMetadata && 
      updatedMetadata.lastModified !== sourceDetails.lastModified

    return {
      blob: coverBlob,
      metadata: updatedMetadata,
      wasUpdated
    }
  }

  /**
   * Re-fetch cover from URL
   * @param {string} url - Cover URL
   * @returns {Promise<Object>} Re-fetch result
   */
  async refetchFromURL(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Comic Collection Tracker/1.0'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('Response is not an image')
      }

      const blob = await response.blob()

      // Note: No size limit here - imageUploadClient will compress before upload
      console.log(`Downloaded cover: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`)

      return {
        blob,
        metadata: {
          contentType,
          contentLength: blob.size,
          lastModified: response.headers.get('last-modified'),
          etag: response.headers.get('etag')
        },
        wasUpdated: true // Assume updated since we can't easily compare
      }

    } catch (error) {
      throw new Error(`Failed to fetch from URL: ${error.message}`)
    }
  }

  /**
   * Migrate cover source (e.g., from upload to API)
   * @param {string} comicId - Comic identifier
   * @param {Object} newMetadata - New source metadata
   * @returns {Promise<string>} New metadata ID
   */
  async migrateCoverSource(comicId, newMetadata) {
    const existingMetadata = await this.getCoverMetadata(comicId)
    
    // Store migration information
    const migrationMetadata = {
      ...newMetadata,
      migration: {
        fromSource: existingMetadata?.source || 'unknown',
        fromProvider: existingMetadata?.sourceDetails?.provider || null,
        migratedAt: new Date().toISOString(),
        reason: newMetadata.migrationReason || 'user_initiated'
      }
    }

    return this.storeCoverMetadata(comicId, migrationMetadata)
  }

  /**
   * Get covers by source type
   * @param {string} source - Source type ('api', 'upload', 'manual')
   * @returns {Promise<Array>} Covers from specified source
   */
  async getCoversBySource(source) {
    const results = []
    
    for (const [id, metadata] of this.metadataStore) {
      if (metadata.source === source) {
        results.push(metadata)
      }
    }

    return results.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  }

  /**
   * Get covers by provider
   * @param {string} provider - Provider identifier
   * @returns {Promise<Array>} Covers from specified provider
   */
  async getCoversByProvider(provider) {
    const results = []
    
    for (const [id, metadata] of this.metadataStore) {
      if (metadata.sourceDetails?.provider === provider) {
        results.push(metadata)
      }
    }

    return results.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  }

  /**
   * Get refetchable covers
   * @returns {Promise<Array>} Covers that can be re-fetched
   */
  async getRefetchableCovers() {
    const results = []
    
    for (const [id, metadata] of this.metadataStore) {
      if (metadata.refetchable) {
        results.push(metadata)
      }
    }

    return results.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  }

  /**
   * Clean up old metadata entries
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {Promise<number>} Number of entries cleaned up
   */
  async cleanupOldMetadata(maxAge = 90 * 24 * 60 * 60 * 1000) { // 90 days default
    const cutoffDate = new Date(Date.now() - maxAge)
    let cleanedCount = 0

    for (const [id, metadata] of this.metadataStore) {
      if (new Date(metadata.createdAt) < cutoffDate) {
        this.metadataStore.delete(id)
        cleanedCount++
      }
    }

    // Also clean up source history
    for (const [comicId, history] of this.sourceHistory) {
      const filteredHistory = history.filter(
        entry => new Date(entry.timestamp) >= cutoffDate
      )
      
      if (filteredHistory.length === 0) {
        this.sourceHistory.delete(comicId)
      } else if (filteredHistory.length !== history.length) {
        this.sourceHistory.set(comicId, filteredHistory)
      }
    }

    return cleanedCount
  }

  /**
   * Export metadata for backup
   * @returns {Promise<Object>} Exported metadata
   */
  async exportMetadata() {
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      metadata: Object.fromEntries(this.metadataStore),
      sourceHistory: Object.fromEntries(this.sourceHistory)
    }
  }

  /**
   * Import metadata from backup
   * @param {Object} exportedData - Exported metadata
   * @returns {Promise<number>} Number of entries imported
   */
  async importMetadata(exportedData) {
    if (!exportedData.metadata) {
      throw new Error('Invalid metadata export format')
    }

    let importedCount = 0

    // Import metadata
    for (const [id, metadata] of Object.entries(exportedData.metadata)) {
      this.metadataStore.set(id, metadata)
      importedCount++
    }

    // Import source history
    if (exportedData.sourceHistory) {
      for (const [comicId, history] of Object.entries(exportedData.sourceHistory)) {
        this.sourceHistory.set(comicId, history)
      }
    }

    return importedCount
  }

  /**
   * Get metadata statistics
   * @returns {Promise<Object>} Metadata statistics
   */
  async getMetadataStats() {
    const stats = {
      totalCovers: this.metadataStore.size,
      bySource: {},
      byProvider: {},
      refetchable: 0,
      withAttribution: 0,
      averageAge: 0
    }

    let totalAge = 0
    const now = Date.now()

    for (const [id, metadata] of this.metadataStore) {
      // Count by source
      stats.bySource[metadata.source] = (stats.bySource[metadata.source] || 0) + 1

      // Count by provider
      if (metadata.sourceDetails?.provider) {
        const provider = metadata.sourceDetails.provider
        stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1
      }

      // Count refetchable
      if (metadata.refetchable) {
        stats.refetchable++
      }

      // Count with attribution
      if (metadata.sourceDetails?.attribution) {
        stats.withAttribution++
      }

      // Calculate age
      const age = now - new Date(metadata.createdAt).getTime()
      totalAge += age
    }

    // Calculate average age in days
    if (stats.totalCovers > 0) {
      stats.averageAge = Math.round(totalAge / stats.totalCovers / (24 * 60 * 60 * 1000))
    }

    return stats
  }
}

export default new CoverMetadataService()