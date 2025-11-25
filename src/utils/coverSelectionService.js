/**
 * Cover Selection Service
 * 
 * Centralized logic for filtering and selecting covers from search results.
 * Implements DRY principle by consolidating duplicate logic from:
 * - BulkCoverManager.jsx
 * - coverAPIService.js
 * - Future components that need cover selection
 */

const coverSelectionService = {
  /**
   * Normalize title by removing leading articles
   * @param {string} title - The title to normalize
   * @returns {string} Normalized title
   */
  normalizeTitle(title) {
    if (!title) return ''
    return title.toLowerCase().trim().replace(/^(the|a|an)\s+/i, '')
  },

  /**
   * Check if two titles match using flexible matching rules
   * Handles cases like "Transformers" vs "The Transformers"
   * 
   * @param {string} title1 - First title
   * @param {string} title2 - Second title
   * @returns {boolean} True if titles match
   */
  titlesMatch(title1, title2) {
    if (!title1 || !title2) return false
    
    const t1Lower = title1.toLowerCase().trim()
    const t2Lower = title2.toLowerCase().trim()
    const t1Normalized = this.normalizeTitle(title1)
    const t2Normalized = this.normalizeTitle(title2)
    
    // Exact match
    if (t1Lower === t2Lower) return true
    
    // Normalized match (ignoring articles)
    if (t1Normalized === t2Normalized) return true
    
    // Substring match
    if (t1Lower.includes(t2Lower) || t2Lower.includes(t1Lower)) return true
    
    return false
  },

  /**
   * Filter results by title match
   * @param {Array} results - Cover search results
   * @param {string} targetSeries - Target series name
   * @returns {Array} Filtered results
   */
  filterByTitleMatch(results, targetSeries) {
    if (!targetSeries) return results
    
    return results.filter(result => 
      this.titlesMatch(result.metadata?.title || '', targetSeries)
    )
  },

  /**
   * Filter results by quality level
   * @param {Array} results - Cover search results
   * @param {string} qualityFilter - Quality filter ('any', 'low', 'medium', 'high')
   * @returns {Array} Filtered results
   */
  filterByQuality(results, qualityFilter) {
    if (!qualityFilter || qualityFilter === 'any') return results
    
    return results.filter(result => {
      // Exact quality match
      if (result.quality === qualityFilter) return true
      
      // Medium filter also accepts high quality
      if (qualityFilter === 'medium' && result.quality === 'high') return true
      
      return false
    })
  },

  /**
   * Select best cover from search results
   * 
   * Note: The API already sorts results by:
   * 1. Publisher match
   * 2. English vs non-English
   * 3. Year proximity
   * 
   * This function applies additional client-side filtering:
   * - Quality filtering
   * - Smart title matching
   * 
   * @param {Array} searchResults - Cover search results from API
   * @param {Object} options - Selection options
   * @param {string} options.targetSeries - Target series name for smart matching
   * @param {string} options.qualityFilter - Quality filter ('any', 'low', 'medium', 'high')
   * @param {boolean} options.smartMatching - Enable smart title matching
   * @returns {Object|null} Best matching cover or null
   */
  selectBestCover(searchResults, options = {}) {
    const {
      targetSeries,
      qualityFilter = 'any',
      smartMatching = true
    } = options
    
    if (!searchResults || searchResults.length === 0) return null
    
    let filteredResults = [...searchResults]

    // Apply quality filter
    filteredResults = this.filterByQuality(filteredResults, qualityFilter)
    
    if (filteredResults.length === 0) return null

    // Apply smart matching - prefer exact series matches
    if (smartMatching && targetSeries) {
      const matches = this.filterByTitleMatch(filteredResults, targetSeries)
      
      // Only use filtered results if we found matches
      if (matches.length > 0) {
        filteredResults = matches
      }
    }

    // Return first result (API already sorted by priority)
    return filteredResults[0] || null
  }
}

export default coverSelectionService
