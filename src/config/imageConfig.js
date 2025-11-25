/**
 * Image processing and storage configuration
 * Defines sizes, formats, and limits for cover images
 */

export const IMAGE_CONFIG = {
  // Image size configurations
  sizes: {
    thumbnail: { width: 150, height: 225 },
    medium: { width: 300, height: 450 },
    full: { width: 800, height: 1200 }
  },

  // File size limits
  maxFileSize: 5 * 1024 * 1024, // 5MB per image
  maxTotalStorage: 500 * 1024 * 1024, // 500MB total storage limit (supports ~1000+ comics)

  // Supported image formats
  supportedFormats: [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp'
  ],

  // File extensions mapping
  formatExtensions: {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  },

  // Compression settings
  compression: {
    quality: 0.85, // JPEG/WebP quality (0-1)
    progressive: true, // Progressive JPEG
    optimizeForWeb: true
  },

  // Cache settings
  cache: {
    expiry: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    maxCacheSize: 50 * 1024 * 1024, // 50MB cache limit
    cleanupThreshold: 0.8 // Clean up when 80% full
  },

  // Processing options
  processing: {
    maintainAspectRatio: true,
    backgroundColor: '#ffffff', // Background color for padding
    resizeMethod: 'cover', // 'cover', 'contain', 'fill'
    sharpen: false, // Apply sharpening filter
    autoOrient: true // Auto-rotate based on EXIF
  },

  // Default placeholder settings
  placeholder: {
    backgroundColor: '#f0f0f0',
    textColor: '#666666',
    text: 'No Cover',
    fontSize: 14
  },

  // API settings for external cover sources
  api: {
    timeout: 10000, // 10 seconds
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
    userAgent: 'Comic Collection Tracker/1.0',
    
    // Expected file sizes from different APIs (for caching/storage planning)
    expectedSizes: {
      marvel: {
        thumbnail: { min: 10000, max: 30000, avg: 20000 }, // ~20KB
        medium: { min: 50000, max: 150000, avg: 100000 },   // ~100KB
        full: { min: 200000, max: 800000, avg: 500000 }     // ~500KB
      },
      comicvine: {
        thumbnail: { min: 5000, max: 20000, avg: 12000 },   // ~12KB
        medium: { min: 30000, max: 100000, avg: 65000 },    // ~65KB
        full: { min: 150000, max: 500000, avg: 325000 }     // ~325KB
      },
      generic: {
        thumbnail: { min: 5000, max: 30000, avg: 15000 },   // ~15KB
        medium: { min: 30000, max: 150000, avg: 80000 },    // ~80KB
        full: { min: 150000, max: 800000, avg: 400000 }     // ~400KB
      }
    }
  }
}

/**
 * Get image size configuration by name
 */
export function getImageSize(sizeName) {
  return IMAGE_CONFIG.sizes[sizeName] || IMAGE_CONFIG.sizes.thumbnail
}

/**
 * Check if file type is supported
 */
export function isSupportedFormat(mimeType) {
  return IMAGE_CONFIG.supportedFormats.includes(mimeType.toLowerCase())
}

/**
 * Get file extension for mime type
 */
export function getFileExtension(mimeType) {
  return IMAGE_CONFIG.formatExtensions[mimeType.toLowerCase()] || 'jpg'
}

/**
 * Check if file size is within limits
 */
export function isValidFileSize(fileSize) {
  return fileSize <= IMAGE_CONFIG.maxFileSize
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Calculate aspect ratio
 */
export function calculateAspectRatio(width, height) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  return {
    ratio: width / height,
    simplified: `${width / divisor}:${height / divisor}`
  }
}

/**
 * Calculate dimensions maintaining aspect ratio
 */
export function calculateDimensions(originalWidth, originalHeight, targetWidth, targetHeight, method = 'cover') {
  const originalRatio = originalWidth / originalHeight
  const targetRatio = targetWidth / targetHeight

  let newWidth, newHeight

  switch (method) {
    case 'contain':
      // Fit entire image within target dimensions
      if (originalRatio > targetRatio) {
        newWidth = targetWidth
        newHeight = targetWidth / originalRatio
      } else {
        newHeight = targetHeight
        newWidth = targetHeight * originalRatio
      }
      break

    case 'cover':
      // Fill target dimensions, may crop image
      if (originalRatio > targetRatio) {
        newHeight = targetHeight
        newWidth = targetHeight * originalRatio
      } else {
        newWidth = targetWidth
        newHeight = targetWidth / originalRatio
      }
      break

    case 'fill':
      // Stretch to exact dimensions
      newWidth = targetWidth
      newHeight = targetHeight
      break

    default:
      newWidth = targetWidth
      newHeight = targetHeight
  }

  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight)
  }
}

export default IMAGE_CONFIG