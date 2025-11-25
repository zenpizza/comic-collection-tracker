/**
 * Utility for persisting view mode preferences across sessions
 */

const VIEW_MODE_STORAGE_KEY = 'comic-collection-view-mode'
const DEFAULT_VIEW_MODE = 'list'
const VALID_VIEW_MODES = ['list', 'grid']

/**
 * Get the saved view mode from localStorage
 * @returns {string} The saved view mode or default
 */
export function getSavedViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (saved && VALID_VIEW_MODES.includes(saved)) {
      return saved
    }
  } catch (error) {
    console.warn('Failed to load view mode from localStorage:', error)
  }
  return DEFAULT_VIEW_MODE
}

/**
 * Save the view mode to localStorage
 * @param {string} viewMode - The view mode to save
 * @returns {boolean} Success status
 */
export function saveViewMode(viewMode) {
  if (!VALID_VIEW_MODES.includes(viewMode)) {
    console.warn('Invalid view mode:', viewMode)
    return false
  }

  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    return true
  } catch (error) {
    console.warn('Failed to save view mode to localStorage:', error)
    return false
  }
}

/**
 * Clear the saved view mode (reset to default)
 * @returns {boolean} Success status
 */
export function clearSavedViewMode() {
  try {
    localStorage.removeItem(VIEW_MODE_STORAGE_KEY)
    return true
  } catch (error) {
    console.warn('Failed to clear view mode from localStorage:', error)
    return false
  }
}

/**
 * Get the default view mode
 * @returns {string} The default view mode
 */
export function getDefaultViewMode() {
  return DEFAULT_VIEW_MODE
}

/**
 * Check if a view mode is valid
 * @param {string} viewMode - The view mode to validate
 * @returns {boolean} Whether the view mode is valid
 */
export function isValidViewMode(viewMode) {
  return VALID_VIEW_MODES.includes(viewMode)
}

/**
 * Get all valid view modes
 * @returns {string[]} Array of valid view modes
 */
export function getValidViewModes() {
  return [...VALID_VIEW_MODES]
}