/**
 * CoverImage data model with source tracking fields
 * Represents a comic book cover image with metadata and source information
 */

export class CoverImage {
  constructor(data = {}) {
    this.id = data.id || this.generateId()
    this.comicId = data.comicId || null
    this.originalUrl = data.originalUrl || null
    this.thumbnailUrl = data.thumbnailUrl || null
    this.mediumUrl = data.mediumUrl || null
    this.fullUrl = data.fullUrl || null
    this.fileSize = data.fileSize || 0
    this.dimensions = data.dimensions || { width: 0, height: 0 }
    this.format = data.format || 'jpeg' // 'jpeg' | 'png' | 'webp'
    this.source = data.source || 'upload' // 'upload' | 'api' | 'manual'
    this.sourceDetails = data.sourceDetails || {}
    this.uploadedAt = data.uploadedAt || new Date().toISOString()
    this.lastUpdated = data.lastUpdated || new Date().toISOString()
    this.metadata = data.metadata || {}
  }

  /**
   * Generate a unique ID for the cover image
   */
  generateId() {
    return `cover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Update the last updated timestamp
   */
  touch() {
    this.lastUpdated = new Date().toISOString()
  }

  /**
   * Set source details for uploaded images
   */
  setUploadSource(originalFilename, fileSize) {
    this.source = 'upload'
    this.sourceDetails = {
      originalFilename,
      uploadedBy: 'user',
      uploadedAt: new Date().toISOString()
    }
    this.fileSize = fileSize
    this.touch()
  }

  /**
   * Set source details for API-fetched images
   */
  setAPISource(provider, originalUrl, apiId, attribution, licenseInfo) {
    this.source = 'api'
    this.sourceDetails = {
      apiProvider: provider,
      originalDownloadUrl: originalUrl,
      downloadedAt: new Date().toISOString(),
      apiId,
      attribution,
      licenseInfo
    }
    this.touch()
  }

  /**
   * Set source details for manually entered URLs
   */
  setManualSource(sourceUrl, description) {
    this.source = 'manual'
    this.sourceDetails = {
      sourceUrl,
      description,
      enteredAt: new Date().toISOString()
    }
    this.touch()
  }

  /**
   * Update image URLs after processing
   */
  setImageUrls(urls) {
    if (urls.original) this.originalUrl = urls.original
    if (urls.thumbnail) this.thumbnailUrl = urls.thumbnail
    if (urls.medium) this.mediumUrl = urls.medium
    if (urls.full) this.fullUrl = urls.full
    this.touch()
  }

  /**
   * Set image dimensions
   */
  setDimensions(width, height) {
    this.dimensions = { width, height }
    this.touch()
  }

  /**
   * Set image format
   */
  setFormat(format) {
    this.format = format
    this.touch()
  }

  /**
   * Add metadata
   */
  addMetadata(key, value) {
    this.metadata[key] = value
    this.touch()
  }

  /**
   * Get attribution text for display
   */
  getAttributionText() {
    if (this.source === 'api' && this.sourceDetails.attribution) {
      return this.sourceDetails.attribution
    }
    return null
  }



  /**
   * Convert to plain object for storage
   */
  toJSON() {
    return {
      id: this.id,
      comicId: this.comicId,
      originalUrl: this.originalUrl,
      thumbnailUrl: this.thumbnailUrl,
      mediumUrl: this.mediumUrl,
      fullUrl: this.fullUrl,
      fileSize: this.fileSize,
      dimensions: this.dimensions,
      format: this.format,
      source: this.source,
      sourceDetails: this.sourceDetails,
      uploadedAt: this.uploadedAt,
      lastUpdated: this.lastUpdated,
      metadata: this.metadata
    }
  }

  /**
   * Create CoverImage instance from plain object
   */
  static fromJSON(data) {
    return new CoverImage(data)
  }

  /**
   * Validate cover image data
   */
  validate() {
    const errors = []

    if (!this.comicId) {
      errors.push('comicId is required')
    }

    if (!this.source || !['upload', 'api', 'manual'].includes(this.source)) {
      errors.push('source must be one of: upload, api, manual')
    }

    if (!this.format || !['jpeg', 'png', 'webp'].includes(this.format)) {
      errors.push('format must be one of: jpeg, png, webp')
    }

    if (this.dimensions.width <= 0 || this.dimensions.height <= 0) {
      errors.push('dimensions must be positive numbers')
    }

    return errors
  }

  /**
   * Check if the cover image is valid
   */
  isValid() {
    return this.validate().length === 0
  }
}

export default CoverImage