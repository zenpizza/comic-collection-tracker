/**
 * Issue Parser Utility
 * Handles parsing of issue numbers for Comic Vine API searches
 * Converts formats like "Annual 18" to proper series/issue combinations
 * 
 * IMPORTANT: This parser must be used in ALL cover search operations to ensure
 * consistent handling of special issue formats (Annuals, Specials, etc.)
 * 
 * Integration Points:
 * - ComicDetailView: Individual cover replacement
 * - ComicForm: Cover search when adding new comics
 * - BulkCoverManager: Bulk cover operations
 * 
 * See docs/COVER_SEARCH_SYSTEM.md for complete documentation
 */

/**
 * Parse issue number to handle annuals and special formats
 * 
 * This function normalizes issue numbers for Comic Vine API searches by:
 * 1. Detecting special formats (Annual, Special, Giant-Size, etc.)
 * 2. Moving the format keyword from issue number to series name
 * 3. Removing "The" prefix for better Comic Vine matching
 * 
 * Examples:
 *   series: "Fantastic Four", issue: "Annual 18" 
 *     -> { series: "Fantastic Four Annual", issue: "18" }
 *   series: "The Uncanny X-Men", issue: "Annual 9"
 *     -> { series: "Uncanny X-Men Annual", issue: "9" }
 *   series: "X-Men", issue: "18" 
 *     -> { series: "X-Men", issue: "18" }
 *   series: "Spider-Man", issue: "Special 5"
 *     -> { series: "Spider-Man Special", issue: "5" }
 * 
 * @param {string} series - Comic series name
 * @param {string|number} issueNumber - Issue number (may include format keywords)
 * @returns {Object} Parsed search parameters with series, issue, and optional alternativeSeries
 */
export function parseIssueForSearch(series, issueNumber) {
  const issueStr = issueNumber.toString().trim()
  
  // Check if issue number contains "Annual" or other special keywords
  const annualMatch = issueStr.match(/^annual\s+(\d+)/i)
  if (annualMatch) {
    // Remove "The" from series name for annuals as Comic Vine often doesn't include it
    const seriesWithoutThe = series.replace(/^The\s+/i, '')
    return {
      series: `${seriesWithoutThe} Annual`,
      issue: annualMatch[1],
      alternativeSeries: `${series} Annual` // Keep original as fallback
    }
  }
  
  // Check for other special formats like "Special 1", "Giant-Size 1", etc.
  const specialMatch = issueStr.match(/^(special|giant-size|king-size)\s+(\d+)/i)
  if (specialMatch) {
    const seriesWithoutThe = series.replace(/^The\s+/i, '')
    return {
      series: `${seriesWithoutThe} ${specialMatch[1]}`,
      issue: specialMatch[2],
      alternativeSeries: `${series} ${specialMatch[1]}`
    }
  }
  
  // Default: use as-is
  return {
    series: series,
    issue: issueStr
  }
}

/**
 * Parse issue from comic object
 * Convenience wrapper for parseIssueForSearch that accepts a comic object
 * 
 * @param {Object} comic - Comic object with series and issueNumber properties
 * @returns {Object} Parsed search parameters
 */
export function parseComicIssueForSearch(comic) {
  return parseIssueForSearch(comic.series, comic.issueNumber)
}

/**
 * Generate fallback search variations for when initial search fails
 * 
 * Comic Vine often uses simplified series names without common adjectives.
 * This function generates alternative search terms by removing adjectives like:
 * - "Uncanny" (e.g., "Uncanny X-Men" → "X-Men")
 * - "Amazing" (e.g., "Amazing Spider-Man" → "Spider-Man")
 * - "Incredible", "Spectacular", "Sensational", etc.
 * 
 * Used automatically by coverAPIService when primary search returns no results.
 * 
 * @param {string} series - Series name to generate fallbacks for
 * @param {string} issue - Issue number
 * @returns {Array<Object>} Array of fallback search variations with reason
 */
export function generateSearchFallbacks(series, issue) {
  const fallbacks = []
  
  // Remove common adjectives that might not be in Comic Vine
  const adjectives = ['uncanny', 'amazing', 'spectacular', 'sensational', 'incredible', 'invincible', 'mighty', 'astonishing', 'extraordinary']
  
  let simplifiedSeries = series
  for (const adj of adjectives) {
    const regex = new RegExp(`\\b${adj}\\b`, 'gi')
    if (regex.test(simplifiedSeries)) {
      const withoutAdj = simplifiedSeries.replace(regex, '').replace(/\s+/g, ' ').trim()
      if (withoutAdj !== simplifiedSeries && withoutAdj.length > 0) {
        fallbacks.push({
          series: withoutAdj,
          issue: issue,
          reason: `Removed "${adj}" from series name`
        })
      }
    }
  }
  
  return fallbacks
}
