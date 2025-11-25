/**
 * Cover API Service - External cover image fetching with provider abstraction
 * Handles rate limiting, error handling, and cover search result processing
 * 
 * NOTE: Marvel API has been deprecated due to the Marvel Developer Portal shutdown.
 * The service now prioritizes Comic Vine API and includes placeholders for 
 * alternative providers like League of Comic Geeks and Grand Comics Database.
 */

class CoverAPIService {
  constructor() {
    this.providers = new Map()
    this.rateLimiter = new RateLimiter()
    this.cache = new Map()
    this.defaultTimeout = 10000 // 10 seconds
    
    // Initialize default providers
    this.initializeProviders()
    
    // Load API keys from localStorage
    this.loadAPIKeysFromStorage()
  }

  /**
   * Initialize available cover API providers
   */
  initializeProviders() {
    // Comic Vine API provider (via backend proxy)
    this.providers.set('comicvine', {
      name: 'Comic Vine',
      baseUrl: '/api/cover-proxy/comicvine', // Use backend proxy
      rateLimit: { requests: 200, window: 3600000 }, // 200 requests per hour
      searchEndpoint: '/search',
      enabled: true, // Enabled via backend proxy
      attribution: 'Cover image provided by Comic Vine',
      licenseInfo: 'Used under Comic Vine API terms',
      usesProxy: true,
      proxyEndpoint: '/api/cover-proxy/comicvine/search'
    })

    // Marvel API provider - DEPRECATED (API shutting down)
    this.providers.set('marvel', {
      name: 'Marvel API (Deprecated)',
      baseUrl: 'https://gateway.marvel.com/v1/public',
      apiKey: import.meta.env.VITE_MARVEL_PUBLIC_KEY || '',
      privateKey: import.meta.env.VITE_MARVEL_PRIVATE_KEY || '',
      rateLimit: { requests: 3000, window: 86400000 }, // 3000 requests per day
      searchEndpoint: '/comics',
      enabled: false, // Disabled due to API shutdown
      attribution: 'Cover image provided by Marvel',
      licenseInfo: 'Used under Marvel API terms',
      deprecated: true,
      deprecationReason: 'Marvel Developer Portal shutting down'
    })

    // League of Comic Geeks API (alternative)
    this.providers.set('lcg', {
      name: 'League of Comic Geeks',
      baseUrl: 'https://leagueofcomicgeeks.com/api',
      rateLimit: { requests: 100, window: 3600000 }, // 100 requests per hour
      enabled: true,
      attribution: 'Cover image from League of Comic Geeks',
      licenseInfo: 'Used under fair use for personal collection tracking'
    })

    // Grand Comics Database (GCD) - community driven
    this.providers.set('gcd', {
      name: 'Grand Comics Database',
      baseUrl: 'https://www.comics.org/api',
      rateLimit: { requests: 200, window: 3600000 }, // 200 requests per hour
      enabled: true,
      attribution: 'Cover image from Grand Comics Database',
      licenseInfo: 'Community contributed content'
    })

    // OpenLibrary covers (free, no API key required)
    this.providers.set('openlibrary', {
      name: 'Open Library',
      baseUrl: 'https://covers.openlibrary.org',
      rateLimit: { requests: 100, window: 60000 }, // 100 requests per minute
      enabled: true,
      attribution: 'Cover image from Open Library',
      licenseInfo: 'Public domain or fair use'
    })
  }

  /**
   * Search for cover images across all enabled providers
   * @param {string} series - Comic series name
   * @param {string} issue - Issue number
   * @param {string} publisher - Publisher name (optional)
   * @param {string|number} year - Publication year (optional)
   * @returns {Promise<CoverResult[]>} Array of cover search results
   */
  async searchCovers(series, issue, publisher = '', year = null) {
    if (!series || !issue) {
      throw new Error('Series and issue are required for cover search')
    }

    const searchKey = `${series}-${issue}-${publisher}-${year || ''}`.toLowerCase()
    
    // Check cache first
    if (this.cache.has(searchKey)) {
      const cached = this.cache.get(searchKey)
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        console.log(`Returning cached results for: ${searchKey} (${cached.results.length} results)`)
        return cached.results
      } else {
        console.log(`Cache expired for: ${searchKey}`)
        this.cache.delete(searchKey)
      }
    }
    
    console.log(`No cache found for: ${searchKey}, fetching from API...`)

    const allResults = []
    const searchPromises = []

    // Search across all enabled providers
    console.log('Available providers:', Array.from(this.providers.entries()).map(([id, p]) => ({ id, enabled: p.enabled, usesProxy: p.usesProxy })))
    
    for (const [providerId, provider] of this.providers) {
      if (!provider.enabled) {
        continue
      }
      
      console.log(`Using provider: ${providerId}`)

      // Check rate limiting
      if (!this.rateLimiter.canMakeRequest(providerId)) {
        console.warn(`Rate limit exceeded for provider: ${provider.name}`)
        continue
      }

      const searchPromise = this.searchProvider(providerId, series, issue, publisher, year)
        .then(results => {
          this.rateLimiter.recordRequest(providerId)
          return results.map(result => ({
            ...result,
            provider: providerId,
            providerName: provider.name,
            attribution: provider.attribution,
            licenseInfo: provider.licenseInfo
          }))
        })
        .catch(error => {
          console.error(`Search failed for provider ${provider.name}:`, error)
          return []
        })

      searchPromises.push(searchPromise)
    }

    // Wait for all provider searches to complete
    const providerResults = await Promise.all(searchPromises)
    
    // Flatten and deduplicate results
    for (const results of providerResults) {
      allResults.push(...results)
    }

    // Sort by quality and relevance
    let sortedResults = this.sortCoverResults(allResults, series, issue, year)

    // If no results found, try fallback searches
    // This handles Comic Vine naming inconsistencies (e.g., "Uncanny X-Men" vs "X-Men")
    // See docs/COVER_SEARCH_SYSTEM.md for details
    if (sortedResults.length === 0) {
      console.log('No results found, trying fallback searches...')
      const { generateSearchFallbacks } = await import('./issueParser.js')
      const fallbacks = generateSearchFallbacks(series, issue)
      
      for (const fallback of fallbacks) {
        console.log(`Trying fallback: "${fallback.series}" #${fallback.issue} (${fallback.reason})`)
        
        // Recursively search with fallback (but don't cache to avoid infinite loops)
        const fallbackResults = await this.searchCoversWithoutCache(fallback.series, fallback.issue, publisher, year)
        
        if (fallbackResults.length > 0) {
          console.log(`✓ Fallback search succeeded with ${fallbackResults.length} results`)
          sortedResults = fallbackResults
          break
        }
      }
    }

    // Cache results
    this.cache.set(searchKey, {
      results: sortedResults,
      timestamp: Date.now()
    })

    return sortedResults
  }
  
  /**
   * Search without using cache (for fallback searches)
   */
  async searchCoversWithoutCache(series, issue, publisher = '', year = null) {
    const allResults = []
    const searchPromises = []

    for (const [providerId, provider] of this.providers) {
      if (!provider.enabled) continue
      if (!this.rateLimiter.canMakeRequest(providerId)) continue

      const searchPromise = this.searchProvider(providerId, series, issue, publisher, year)
        .then(results => {
          this.rateLimiter.recordRequest(providerId)
          return results.map(result => ({
            ...result,
            provider: providerId,
            providerName: provider.name,
            attribution: provider.attribution,
            licenseInfo: provider.licenseInfo
          }))
        })
        .catch(error => {
          console.error(`Search failed for provider ${provider.name}:`, error)
          return []
        })

      searchPromises.push(searchPromise)
    }

    const providerResults = await Promise.all(searchPromises)
    for (const results of providerResults) {
      allResults.push(...results)
    }

    return this.sortCoverResults(allResults, series, issue, year)
  }

  /**
   * Search a specific provider for covers
   * @param {string} providerId - Provider identifier
   * @param {string} series - Comic series name
   * @param {string} issue - Issue number
   * @param {string} publisher - Publisher name
   * @returns {Promise<CoverResult[]>} Provider-specific results
   */
  async searchProvider(providerId, series, issue, publisher, year = null) {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`)
    }

    switch (providerId) {
      case 'comicvine':
        return this.searchComicVine(series, issue, publisher, year)
      case 'marvel':
        // Marvel API is deprecated but keep for backward compatibility
        console.warn('Marvel API is deprecated and will be removed soon')
        return this.searchMarvel(series, issue, publisher, year)
      case 'lcg':
        return this.searchLeagueOfComicGeeks(series, issue, publisher, year)
      case 'gcd':
        return this.searchGrandComicsDatabase(series, issue, publisher, year)
      case 'openlibrary':
        return this.searchOpenLibrary(series, issue, publisher, year)
      default:
        throw new Error(`Provider ${providerId} not implemented`)
    }
  }

  /**
   * Search Comic Vine API for covers (via backend proxy)
   */
  async searchComicVine(series, issue, publisher, year = null) {
    try {
      // Use simplified cover search endpoint
      const searchUrl = new URL('/api/cover-search', window.location.origin)
      searchUrl.searchParams.set('series', series)
      searchUrl.searchParams.set('issue', issue)
      if (publisher) {
        searchUrl.searchParams.set('publisher', publisher)
      }
      if (year) {
        searchUrl.searchParams.set('year', year.toString())
      }

      console.log('Using cover search API:', searchUrl.toString())

      const response = await this.makeRequest(searchUrl.toString())
      const data = await response.json()

      console.log('Cover search response:', data)
      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))

      if (!data.success) {
        console.error('Cover search failed:', data)
        throw new Error(data.error || 'Cover search failed')
      }

      console.log(`Found ${data.results?.length || 0} covers from Comic Vine`)
      console.log('First result:', data.results?.[0])
      return data.results || []
    } catch (error) {
      console.error('Comic Vine search error:', error)
      
      // Check if it's a network error or API not available
      if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
        throw new Error('Cover search service is not available. Please ensure the backend server is running.')
      }
      
      throw error
    }
  }

  /**
   * Search Marvel API for covers
   */
  async searchMarvel(series, issue, publisher) {
    const provider = this.providers.get('marvel')
    if (!provider.apiKey || !provider.privateKey) {
      console.warn('Marvel API keys not configured')
      return []
    }

    try {
      const timestamp = Date.now()
      const hash = this.generateMarvelHash(timestamp, provider.privateKey, provider.apiKey)
      
      const url = new URL(provider.baseUrl + provider.searchEndpoint)
      url.searchParams.set('apikey', provider.apiKey)
      url.searchParams.set('ts', timestamp.toString())
      url.searchParams.set('hash', hash)
      url.searchParams.set('title', series)
      url.searchParams.set('issueNumber', issue)
      url.searchParams.set('limit', '10')

      const response = await this.makeRequest(url.toString())
      const data = await response.json()

      if (data.code !== 200) {
        throw new Error(`Marvel API error: ${data.status}`)
      }

      return this.processMarvelResults(data.data.results, series, issue)
    } catch (error) {
      console.error('Marvel search error:', error)
      return []
    }
  }

  /**
   * Search League of Comic Geeks for covers
   */
  async searchLeagueOfComicGeeks(series, issue, publisher) {
    try {
      // Note: This is a placeholder implementation
      // League of Comic Geeks doesn't have a public API, but this shows the structure
      console.warn('League of Comic Geeks API integration not yet implemented')
      return []
    } catch (error) {
      console.error('League of Comic Geeks search error:', error)
      return []
    }
  }

  /**
   * Search Grand Comics Database for covers
   */
  async searchGrandComicsDatabase(series, issue, publisher) {
    try {
      // Note: This is a placeholder implementation
      // GCD has limited API access, but this shows the structure
      console.warn('Grand Comics Database API integration not yet implemented')
      return []
    } catch (error) {
      console.error('Grand Comics Database search error:', error)
      return []
    }
  }

  /**
   * Search Open Library for covers (fallback provider)
   */
  async searchOpenLibrary(series, issue, publisher) {
    try {
      // Open Library doesn't have comic-specific search, so this is a placeholder
      // In a real implementation, you might search for graphic novels or use ISBN
      const searchQuery = `${series} ${issue}`
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}&limit=5`

      const response = await this.makeRequest(url)
      const data = await response.json()

      return this.processOpenLibraryResults(data.docs, series, issue)
    } catch (error) {
      console.error('Open Library search error:', error)
      return []
    }
  }



  /**
   * Process Marvel API results
   */
  processMarvelResults(results, series, issue) {
    return results
      .filter(result => result.thumbnail && result.thumbnail.path)
      .map(result => {
        const imageUrl = `${result.thumbnail.path}.${result.thumbnail.extension}`
        return {
          id: result.id.toString(),
          imageUrl: imageUrl,
          thumbnailUrl: imageUrl.replace('/standard_', '/portrait_medium.'),
          quality: this.determineImageQuality({ original_url: imageUrl }),
          dimensions: {
            width: 0, // Marvel API doesn't provide dimensions
            height: 0
          },
          variant: result.variantDescription || '',
          metadata: {
            title: result.series?.name || series,
            issueNumber: result.issueNumber || issue,
            publisher: 'Marvel Comics',
            description: result.description || '',
            apiId: result.id.toString(),
            originalUrl: result.urls?.find(url => url.type === 'detail')?.url
          }
        }
      })
  }

  /**
   * Process Open Library results (placeholder implementation)
   */
  processOpenLibraryResults(results, series, issue) {
    return results
      .filter(result => result.cover_i)
      .slice(0, 3) // Limit to 3 results since this is a fallback
      .map(result => ({
        id: result.cover_i.toString(),
        imageUrl: `https://covers.openlibrary.org/b/id/${result.cover_i}-L.jpg`,
        thumbnailUrl: `https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg`,
        quality: 'medium',
        dimensions: {
          width: 0,
          height: 0
        },
        variant: 'Book cover',
        metadata: {
          title: result.title || series,
          issueNumber: issue,
          publisher: result.publisher?.[0] || '',
          description: '',
          apiId: result.cover_i.toString(),
          originalUrl: `https://openlibrary.org${result.key}`
        }
      }))
  }

  /**
   * Download cover image from URL (via backend proxy)
   * @param {string} coverUrl - URL of the cover image
   * @param {string} comicId - Comic identifier for storage
   * @returns {Promise<Blob>} Downloaded image blob
   */
  async downloadCover(coverUrl, comicId) {
    if (!coverUrl) {
      throw new Error('Cover URL is required')
    }

    try {
      // Use backend proxy for downloading images to avoid CORS issues
      const proxyUrl = new URL('/api/download', window.location.origin)
      proxyUrl.searchParams.set('url', coverUrl)

      console.log('Using cover download proxy for:', coverUrl)

      const response = await this.makeRequest(proxyUrl.toString(), {
        headers: {
          'Accept': 'image/*'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to download cover: ${response.status} ${response.statusText}`)
      }

      const blob = await response.blob()
      
      // Note: No size limit here - imageUploadClient will compress before upload
      console.log(`Downloaded cover: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`)

      return blob
    } catch (error) {
      console.error('Cover download error:', error)
      throw new Error(`Failed to download cover: ${error.message}`)
    }
  }

  /**
   * Get metadata for a cover URL
   * @param {string} coverUrl - URL of the cover image
   * @returns {Promise<Object>} Cover metadata
   */
  async getCoverMetadata(coverUrl) {
    try {
      const response = await this.makeRequest(coverUrl, { method: 'HEAD' })
      
      return {
        url: coverUrl,
        contentType: response.headers.get('content-type'),
        contentLength: parseInt(response.headers.get('content-length') || '0'),
        lastModified: response.headers.get('last-modified'),
        etag: response.headers.get('etag')
      }
    } catch (error) {
      console.error('Metadata fetch error:', error)
      return null
    }
  }

  /**
   * Sort cover results by quality and relevance
   */
  sortCoverResults(results, series, issue, year = null) {
    return results.sort((a, b) => {
      // FIRST: Prioritize exact issue number matches
      const aIssueMatch = this.normalizeIssueNumber(a.metadata.issueNumber) === this.normalizeIssueNumber(issue)
      const bIssueMatch = this.normalizeIssueNumber(b.metadata.issueNumber) === this.normalizeIssueNumber(issue)
      if (aIssueMatch && !bIssueMatch) return -1
      if (!aIssueMatch && bIssueMatch) return 1

      // SECOND: If year is provided, prioritize year matches
      if (year) {
        const aYearMatch = this.matchesYear(a.metadata.coverDate, year)
        const bYearMatch = this.matchesYear(b.metadata.coverDate, year)
        if (aYearMatch && !bYearMatch) return -1
        if (!aYearMatch && bYearMatch) return 1
      }

      // THIRD: Prioritize by title relevance (exact series match)
      const aRelevance = this.calculateRelevance(a.metadata.title, series)
      const bRelevance = this.calculateRelevance(b.metadata.title, series)
      const relevanceDiff = bRelevance - aRelevance
      if (relevanceDiff !== 0) return relevanceDiff

      // FOURTH: Prioritize by quality
      const qualityOrder = { 'high': 3, 'medium': 2, 'low': 1 }
      const qualityDiff = (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0)
      if (qualityDiff !== 0) return qualityDiff

      // FINALLY: By provider preference (Comic Vine > LCG > GCD > others)
      const providerOrder = { 'comicvine': 4, 'lcg': 3, 'gcd': 2, 'marvel': 1 }
      return (providerOrder[b.provider] || 0) - (providerOrder[a.provider] || 0)
    })
  }

  /**
   * Normalize issue number for comparison (handles strings like "1", "001", etc.)
   */
  normalizeIssueNumber(issueNum) {
    if (!issueNum) return ''
    const str = String(issueNum).toLowerCase().trim()
    // Extract numeric part for comparison
    const match = str.match(/^(\d+)/)
    return match ? parseInt(match[1], 10).toString() : str
  }

  /**
   * Check if a cover date matches the target year
   */
  matchesYear(coverDate, targetYear) {
    if (!coverDate || !targetYear) return false
    const coverYear = new Date(coverDate).getFullYear()
    return coverYear === parseInt(targetYear, 10)
  }

  /**
   * Calculate title relevance score
   */
  calculateRelevance(title, targetSeries) {
    if (!title || !targetSeries) return 0
    
    const titleLower = title.toLowerCase()
    const seriesLower = targetSeries.toLowerCase()
    
    if (titleLower === seriesLower) return 100
    if (titleLower.includes(seriesLower)) return 80
    if (seriesLower.includes(titleLower)) return 60
    
    // Calculate word overlap
    const titleWords = titleLower.split(/\s+/)
    const seriesWords = seriesLower.split(/\s+/)
    const overlap = titleWords.filter(word => seriesWords.includes(word)).length
    
    return (overlap / Math.max(titleWords.length, seriesWords.length)) * 40
  }

  /**
   * Determine image quality based on URL or metadata
   */
  determineImageQuality(imageData) {
    if (!imageData || !imageData.original_url) return 'low'
    
    const url = imageData.original_url.toLowerCase()
    
    // Check for high-quality indicators
    if (url.includes('original') || url.includes('super') || url.includes('large')) {
      return 'high'
    }
    
    // Check dimensions if available
    const width = imageData.original_width || 0
    const height = imageData.original_height || 0
    
    if (width >= 800 || height >= 1200) return 'high'
    if (width >= 400 || height >= 600) return 'medium'
    
    return 'low'
  }

  /**
   * Generate Marvel API hash
   */
  generateMarvelHash(timestamp, privateKey, publicKey) {
    // In a real implementation, you'd use crypto.createHash('md5')
    // For now, return a placeholder
    return 'placeholder-hash'
  }

  /**
   * Make HTTP request with timeout and error handling
   */
  async makeRequest(url, options = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Comic Collection Tracker/1.0',
          ...options.headers
        }
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    }
  }

  /**
   * Clear the search cache
   */
  clearCache() {
    const size = this.cache.size
    this.cache.clear()
    console.log(`Cleared cover search cache (${size} entries removed)`)
    return { cleared: size }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }

  /**
   * Enable or disable a provider
   */
  setProviderEnabled(providerId, enabled) {
    const provider = this.providers.get(providerId)
    if (provider) {
      provider.enabled = enabled
    }
  }

  /**
   * Get list of available providers
   */
  getProviders() {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      name: provider.name,
      enabled: provider.enabled,
      hasApiKey: !!provider.apiKey,
      deprecated: provider.deprecated || false,
      deprecationReason: provider.deprecationReason || null
    }))
  }

  /**
   * Get deprecated providers
   */
  getDeprecatedProviders() {
    return Array.from(this.providers.entries())
      .filter(([id, provider]) => provider.deprecated)
      .map(([id, provider]) => ({
        id,
        name: provider.name,
        reason: provider.deprecationReason
      }))
  }

  /**
   * Get provider status and recommendations
   */
  getProviderStatus() {
    const providers = this.getProviders()
    const deprecated = this.getDeprecatedProviders()
    const active = providers.filter(p => p.enabled && !p.deprecated)
    
    return {
      total: providers.length,
      active: active.length,
      deprecated: deprecated.length,
      recommendations: this.getProviderRecommendations(),
      deprecatedProviders: deprecated
    }
  }

  /**
   * Get provider recommendations
   */
  getProviderRecommendations() {
    return [
      {
        provider: 'comicvine',
        reason: 'Most comprehensive comic database with high-quality covers',
        requirement: 'Requires API key from Comic Vine'
      },
      {
        provider: 'lcg',
        reason: 'Community-driven with modern comics focus',
        requirement: 'No API key required (when implemented)'
      },
      {
        provider: 'gcd',
        reason: 'Extensive historical comic data',
        requirement: 'No API key required (when implemented)'
      }
    ]
  }

  /**
   * Load API keys from localStorage and update providers
   */
  loadAPIKeysFromStorage() {
    // Load Comic Vine API key (for backward compatibility)
    const comicvineKey = localStorage.getItem('comicvine_api_key')
    if (comicvineKey) {
      const provider = this.providers.get('comicvine')
      if (provider) {
        provider.apiKey = comicvineKey
      }
    }

    // Update provider enabled status based on API key availability or proxy usage
    for (const [id, provider] of this.providers) {
      if (provider.deprecated) {
        provider.enabled = false
      } else if (provider.usesProxy) {
        // Providers using backend proxy are always enabled (API key is server-side)
        provider.enabled = true
      } else if (provider.apiKey) {
        provider.enabled = true
      } else {
        provider.enabled = false
      }
    }
  }

  /**
   * Refresh API keys from storage (call after settings change)
   */
  refreshAPIKeys() {
    this.loadAPIKeysFromStorage()
  }
}

/**
 * Rate Limiter for API requests
 */
class RateLimiter {
  constructor() {
    this.requests = new Map() // providerId -> array of timestamps
  }

  canMakeRequest(providerId) {
    const provider = new CoverAPIService().providers.get(providerId)
    if (!provider || !provider.rateLimit) return true

    const now = Date.now()
    const requests = this.requests.get(providerId) || []
    
    // Remove old requests outside the window
    const validRequests = requests.filter(
      timestamp => now - timestamp < provider.rateLimit.window
    )
    
    this.requests.set(providerId, validRequests)
    
    return validRequests.length < provider.rateLimit.requests
  }

  recordRequest(providerId) {
    const requests = this.requests.get(providerId) || []
    requests.push(Date.now())
    this.requests.set(providerId, requests)
  }

  getRemainingRequests(providerId) {
    const provider = new CoverAPIService().providers.get(providerId)
    if (!provider || !provider.rateLimit) return Infinity

    const now = Date.now()
    const requests = this.requests.get(providerId) || []
    const validRequests = requests.filter(
      timestamp => now - timestamp < provider.rateLimit.window
    )

    return Math.max(0, provider.rateLimit.requests - validRequests.length)
  }
}

const coverAPIService = new CoverAPIService()

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.coverAPIService = coverAPIService
}

export default coverAPIService