/**
 * Comic data model extended with cover-related fields
 * Represents a comic book entry with cover image support
 */

export class Comic {
  constructor(data = {}) {
    // Existing comic fields
    this.id = data.id || this.generateId()
    this.series = data.series || ''
    this.issueNumber = data.issueNumber || ''
    this.publisher = data.publisher || ''
    this.year = data.year || ''
    this.variant = data.variant || ''
    this.notes = data.notes || ''
    this.dateAdded = data.dateAdded || new Date().toISOString()
    
    // Cover-related fields
    this.coverId = data.coverId || null
    this.hasCover = data.hasCover || false
    this.coverSource = data.coverSource || null // 'upload' | 'api' | 'manual'
    this.coverSourceProvider = data.coverSourceProvider || null
    this.coverOriginalUrl = data.coverOriginalUrl || null
    this.coverLastUpdated = data.coverLastUpdated || null
    this.coverAttribution = data.coverAttribution || null
  }

  /**
   * Generate a unique ID for the comic
   */
  generateId() {
    return `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Set cover information from a CoverImage instance
   */
  setCover(coverImage) {
    this.coverId = coverImage.id
    this.hasCover = true
    this.coverSource = coverImage.source
    this.coverSourceProvider = coverImage.sourceDetails.apiProvider || null
    this.coverOriginalUrl = coverImage.originalUrl
    this.coverLastUpdated = coverImage.lastUpdated
    this.coverAttribution = coverImage.getAttributionText()
  }

  /**
   * Remove cover information
   */
  removeCover() {
    this.coverId = null
    this.hasCover = false
    this.coverSource = null
    this.coverSourceProvider = null
    this.coverOriginalUrl = null
    this.coverLastUpdated = null
    this.coverAttribution = null
  }





  /**
   * Get display title for the comic
   */
  getDisplayTitle() {
    let title = `${this.series} #${this.issueNumber}`
    if (this.variant) {
      title += ` (${this.variant})`
    }
    return title
  }

  /**
   * Get search key for duplicate detection
   */
  getSearchKey() {
    return `${this.series}|${this.issueNumber}`.toLowerCase()
  }

  /**
   * Convert to plain object for storage
   */
  toJSON() {
    return {
      id: this.id,
      series: this.series,
      issueNumber: this.issueNumber,
      publisher: this.publisher,
      year: this.year,
      variant: this.variant,
      notes: this.notes,
      dateAdded: this.dateAdded,
      coverId: this.coverId,
      hasCover: this.hasCover,
      coverSource: this.coverSource,
      coverSourceProvider: this.coverSourceProvider,
      coverOriginalUrl: this.coverOriginalUrl,
      coverLastUpdated: this.coverLastUpdated,
      coverAttribution: this.coverAttribution
    }
  }

  /**
   * Create Comic instance from plain object
   */
  static fromJSON(data) {
    return new Comic(data)
  }

  /**
   * Validate comic data
   */
  validate() {
    const errors = []
    
    if (!this.series || this.series.trim() === '') {
      errors.push('series is required')
    }
    
    if (!this.issueNumber || this.issueNumber.toString().trim() === '') {
      errors.push('issueNumber is required')
    }
    
    if (this.year && (isNaN(this.year) || this.year < 1900 || this.year > 2030)) {
      errors.push('year must be a valid year between 1900 and 2030')
    }
    
    if (this.coverSource && !['upload', 'api', 'manual'].includes(this.coverSource)) {
      errors.push('coverSource must be one of: upload, api, manual')
    }
    
    return errors
  }

  /**
   * Check if the comic is valid
   */
  isValid() {
    return this.validate().length === 0
  }

  /**
   * Create a copy of the comic
   */
  clone() {
    return new Comic(this.toJSON())
  }
}

export default Comic