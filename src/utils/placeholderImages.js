/**
 * Placeholder image system for comic covers
 * Provides default placeholder images and fallback logic
 */

// SVG-based placeholder images as data URLs
const PLACEHOLDER_IMAGES = {
  default: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg width="150" height="225" viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="225" fill="#f8f9fa" stroke="#e1e5e9" stroke-width="2"/>
      <g transform="translate(75, 112.5)">
        <rect x="-25" y="-35" width="50" height="30" fill="#6c757d" rx="4"/>
        <text x="0" y="10" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6c757d" font-weight="500">Comic Cover</text>
        <text x="0" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#adb5bd">Not Available</text>
      </g>
    </svg>
  `)}`,
  
  marvel: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg width="150" height="225" viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="225" fill="#ed1d24" stroke="#c41e3a" stroke-width="2"/>
      <g transform="translate(75, 112.5)">
        <text x="0" y="-10" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="white" font-weight="bold">MARVEL</text>
        <text x="0" y="15" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="white">Cover Not Available</text>
      </g>
    </svg>
  `)}`,
  
  dc: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg width="150" height="225" viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="225" fill="#0078f0" stroke="#0056b3" stroke-width="2"/>
      <g transform="translate(75, 112.5)">
        <text x="0" y="-10" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="white" font-weight="bold">DC</text>
        <text x="0" y="15" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="white">Cover Not Available</text>
      </g>
    </svg>
  `)}`,
  
  image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg width="150" height="225" viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="225" fill="#ff6b35" stroke="#e55a2b" stroke-width="2"/>
      <g transform="translate(75, 112.5)">
        <text x="0" y="-10" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="white" font-weight="bold">IMAGE</text>
        <text x="0" y="15" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="white">Cover Not Available</text>
      </g>
    </svg>
  `)}`,
  
  error: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg width="150" height="225" viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="225" fill="#fff5f5" stroke="#f5c6cb" stroke-width="2"/>
      <g transform="translate(75, 112.5)">
        <polygon points="0,-20 -15,5 15,5" fill="#dc3545"/>
        <text x="0" y="0" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white" font-weight="bold">!</text>
        <text x="0" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#dc3545" font-weight="500">Load Failed</text>
        <text x="0" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#dc3545">Try Again</text>
      </g>
    </svg>
  `)}`
}

/**
 * Get appropriate placeholder image based on comic publisher
 * @param {string} publisher - Comic publisher name
 * @param {string} type - Type of placeholder ('default', 'error')
 * @returns {string} Data URL for placeholder image
 */
export function getPlaceholderImage(publisher = '', type = 'default') {
  if (type === 'error') {
    return PLACEHOLDER_IMAGES.error
  }
  
  if (!publisher) {
    return PLACEHOLDER_IMAGES.default
  }
  
  const publisherLower = publisher.toLowerCase()
  
  if (publisherLower.includes('marvel')) {
    return PLACEHOLDER_IMAGES.marvel
  }
  
  if (publisherLower.includes('dc')) {
    return PLACEHOLDER_IMAGES.dc
  }
  
  if (publisherLower.includes('image')) {
    return PLACEHOLDER_IMAGES.image
  }
  
  return PLACEHOLDER_IMAGES.default
}

/**
 * Generate alt text for comic cover images
 * @param {Object} comic - Comic object
 * @param {string} fallbackText - Fallback text if comic info is incomplete
 * @returns {string} Appropriate alt text
 */
export function generateCoverAltText(comic, fallbackText = 'Comic cover') {
  if (!comic) {
    return fallbackText
  }
  
  let altText = ''
  
  if (comic.series) {
    altText += comic.series
  }
  
  if (comic.issueNumber) {
    altText += ` issue ${comic.issueNumber}`
  }
  
  if (comic.variant) {
    altText += ` (${comic.variant})`
  }
  
  if (comic.publisher) {
    altText += ` by ${comic.publisher}`
  }
  
  if (altText) {
    altText += ' cover'
  } else {
    altText = fallbackText
  }
  
  return altText
}

/**
 * Check if a URL is likely to be a valid image
 * @param {string} url - URL to check
 * @returns {boolean} True if URL appears to be an image
 */
export function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false
  }
  
  // Check for common image extensions
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i
  if (imageExtensions.test(url)) {
    return true
  }
  
  // Check for data URLs
  if (url.startsWith('data:image/')) {
    return true
  }
  
  // Check for blob URLs
  if (url.startsWith('blob:')) {
    return true
  }
  
  return false
}

/**
 * Get fallback strategy for a comic cover
 * @param {Object} comic - Comic object
 * @param {string} primaryUrl - Primary cover URL
 * @returns {Object} Fallback strategy with image and alt text
 */
export function getCoverFallbackStrategy(comic, primaryUrl) {
  const strategy = {
    primaryUrl: primaryUrl,
    fallbackUrl: null,
    placeholderUrl: null,
    altText: generateCoverAltText(comic),
    hasValidPrimary: isValidImageUrl(primaryUrl)
  }
  
  // If primary URL is invalid, go straight to placeholder
  if (!strategy.hasValidPrimary) {
    strategy.placeholderUrl = getPlaceholderImage(comic?.publisher)
    return strategy
  }
  
  // Set up fallback chain: primary -> publisher placeholder -> default placeholder
  strategy.fallbackUrl = getPlaceholderImage(comic?.publisher)
  strategy.placeholderUrl = getPlaceholderImage() // default
  
  return strategy
}

export default {
  getPlaceholderImage,
  generateCoverAltText,
  isValidImageUrl,
  getCoverFallbackStrategy,
  PLACEHOLDER_IMAGES
}