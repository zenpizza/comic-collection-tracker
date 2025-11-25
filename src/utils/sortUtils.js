/**
 * Utility functions for sorting series names in library-style alphabetical order
 * (ignoring articles like "The", "A", "An" at the beginning)
 */

// Common articles to ignore when sorting (case-insensitive)
const ARTICLES = ['the', 'a', 'an']

/**
 * Remove leading articles from a string for sorting purposes
 * @param {string} str - The string to process
 * @returns {string} - The string with leading articles removed
 */
export function removeLeadingArticles(str) {
  if (!str || typeof str !== 'string') return str || ''
  
  const trimmed = str.trim()
  const words = trimmed.split(/\s+/)
  
  if (words.length > 1) {
    const firstWord = words[0].toLowerCase()
    if (ARTICLES.includes(firstWord)) {
      // Return the string without the first word, maintaining original case
      return words.slice(1).join(' ')
    }
  }
  
  return trimmed
}

/**
 * Get the sort key for a series name (for library-style alphabetical sorting)
 * @param {string} seriesName - The series name
 * @returns {string} - The sort key (lowercase, articles removed)
 */
export function getSeriesSortKey(seriesName) {
  return removeLeadingArticles(seriesName).toLowerCase()
}

/**
 * Compare two series names for library-style alphabetical sorting
 * @param {string} a - First series name
 * @param {string} b - Second series name
 * @returns {number} - Comparison result (-1, 0, 1)
 */
export function compareSeriesNames(a, b) {
  const keyA = getSeriesSortKey(a)
  const keyB = getSeriesSortKey(b)
  return keyA.localeCompare(keyB)
}

/**
 * Sort an array of series names in library-style alphabetical order
 * @param {string[]} seriesArray - Array of series names
 * @returns {string[]} - Sorted array
 */
export function sortSeriesNames(seriesArray) {
  return [...seriesArray].sort(compareSeriesNames)
}

/**
 * Sort an array of objects by their series property in library-style alphabetical order
 * @param {Object[]} objectArray - Array of objects with series property
 * @param {string} seriesProperty - Property name containing the series (default: 'series')
 * @returns {Object[]} - Sorted array
 */
export function sortBySeriesName(objectArray, seriesProperty = 'series') {
  return [...objectArray].sort((a, b) => {
    const seriesA = a[seriesProperty] || ''
    const seriesB = b[seriesProperty] || ''
    return compareSeriesNames(seriesA, seriesB)
  })
}

/**
 * Group objects by series and sort both the groups and items within groups
 * @param {Object[]} objectArray - Array of objects with series property
 * @param {string} seriesProperty - Property name containing the series (default: 'series')
 * @returns {Object} - Object with series names as keys, sorted arrays as values
 */
export function groupAndSortBySeries(objectArray, seriesProperty = 'series') {
  // Group by series
  const grouped = objectArray.reduce((groups, item) => {
    const series = item[seriesProperty] || 'Unknown'
    if (!groups[series]) {
      groups[series] = []
    }
    groups[series].push(item)
    return groups
  }, {})
  
  // Sort items within each group (by issue number if available)
  Object.keys(grouped).forEach(series => {
    grouped[series].sort((a, b) => {
      // Try to sort by issue number first
      if (a.issueNumber && b.issueNumber) {
        const issueA = parseInt(a.issueNumber) || 0
        const issueB = parseInt(b.issueNumber) || 0
        if (issueA !== issueB) {
          return issueA - issueB
        }
      }
      // Fall back to string comparison of issue numbers
      return (a.issueNumber || '').localeCompare(b.issueNumber || '')
    })
  })
  
  return grouped
}

/**
 * Get sorted series names from an array of objects
 * @param {Object[]} objectArray - Array of objects with series property
 * @param {string} seriesProperty - Property name containing the series (default: 'series')
 * @returns {string[]} - Sorted unique series names
 */
export function getSortedUniqueSeriesNames(objectArray, seriesProperty = 'series') {
  const uniqueSeries = [...new Set(objectArray.map(item => item[seriesProperty] || ''))]
  return sortSeriesNames(uniqueSeries.filter(Boolean))
}

// Export default object with all functions for convenience
export default {
  removeLeadingArticles,
  getSeriesSortKey,
  compareSeriesNames,
  sortSeriesNames,
  sortBySeriesName,
  groupAndSortBySeries,
  getSortedUniqueSeriesNames
}