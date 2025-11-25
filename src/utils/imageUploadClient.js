/**
 * Image Upload Client
 * Centralized client for communicating with the image upload API
 * Handles all image upload operations with consistent error handling
 */

class ImageUploadClient {
  constructor() {
    this.uploadEndpoint = '/api/images/upload'
  }

  /**
   * Upload an image to the server
   * @param {string} comicId - Comic identifier
   * @param {File|Blob|string} imageSource - Image as File, Blob, or base64 string
   * @param {Object} metadata - Additional metadata to store with the image
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadImage(comicId, imageSource, metadata = {}, options = {}) {
    const {
      onProgress = null,
      signal = null, // AbortSignal for cancellation
      timeout = 60000, // 60 second timeout
      compress = true, // Compress before upload to avoid Vercel limits
      maxSizeKB = 4500 // Max 4.5MB to stay under Vercel's 5MB limit with overhead
    } = options

    try {
      // Convert imageSource to Blob if needed
      let blob = await this.normalizeImageSource(imageSource, metadata.mimeType)

      // Compress image if needed to stay under Vercel's limits
      if (compress) {
        blob = await this.compressForUpload(blob, maxSizeKB)
      }

      // Create FormData for multipart upload
      const formData = new FormData()
      formData.append('image', blob, `${comicId}.jpg`)
      formData.append('comicId', comicId)
      formData.append('metadata', JSON.stringify({
        uploadedAt: new Date().toISOString(),
        compressed: compress,
        originalSize: imageSource.size || blob.size,
        ...metadata
      }))

      // Create fetch options
      const fetchOptions = {
        method: 'POST',
        body: formData
      }

      // Add abort signal if provided
      if (signal) {
        fetchOptions.signal = signal
      }

      // Add timeout
      const timeoutId = setTimeout(() => {
        if (signal && !signal.aborted) {
          throw new Error('Upload timeout')
        }
      }, timeout)

      try {
        const response = await fetch(this.uploadEndpoint, fetchOptions)
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: response.statusText 
          }))
          throw new Error(errorData.error || `Upload failed: ${response.status}`)
        }

        const result = await response.json()
        
        return {
          success: true,
          imageId: result.imageId,
          comicId,
          ...result
        }
      } finally {
        clearTimeout(timeoutId)
      }

    } catch (error) {
      // Enhance error with context
      if (error.name === 'AbortError') {
        throw new Error('Upload cancelled')
      }
      
      throw new Error(`Failed to upload image for comic ${comicId}: ${error.message}`)
    }
  }

  /**
   * Normalize image source to Blob
   * Handles File, Blob, or base64 string inputs
   * @param {File|Blob|string} imageSource - Image source
   * @param {string} mimeType - MIME type (used for base64 conversion)
   * @returns {Promise<Blob>} Normalized blob
   */
  async normalizeImageSource(imageSource, mimeType = 'image/jpeg') {
    // Already a File or Blob
    if (imageSource instanceof File || imageSource instanceof Blob) {
      return imageSource
    }

    // Base64 string
    if (typeof imageSource === 'string') {
      return this.base64ToBlob(imageSource, mimeType)
    }

    throw new Error('Invalid image source: must be File, Blob, or base64 string')
  }

  /**
   * Compress image for upload to stay under Vercel's payload limits
   * @param {Blob} blob - Image blob
   * @param {number} maxSizeKB - Maximum size in KB
   * @returns {Promise<Blob>} Compressed blob
   */
  async compressForUpload(blob, maxSizeKB = 4500) {
    const currentSizeKB = blob.size / 1024

    // If already under limit, return as-is
    if (currentSizeKB <= maxSizeKB) {
      console.log(`Image size ${currentSizeKB.toFixed(0)}KB is under limit, no compression needed`)
      return blob
    }

    console.log(`Compressing image from ${currentSizeKB.toFixed(0)}KB to fit under ${maxSizeKB}KB limit`)

    // Load image to get dimensions
    const img = await this.loadImageFromBlob(blob)
    
    // Calculate target dimensions (reduce by percentage based on size ratio)
    const sizeRatio = maxSizeKB / currentSizeKB
    const scaleFactor = Math.sqrt(sizeRatio) * 0.9 // 0.9 for safety margin
    const targetWidth = Math.floor(img.width * scaleFactor)
    const targetHeight = Math.floor(img.height * scaleFactor)

    console.log(`Resizing from ${img.width}x${img.height} to ${targetWidth}x${targetHeight}`)

    // Create canvas and resize
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    // Try different quality levels until we're under the limit
    let quality = 0.85
    let compressedBlob = null

    while (quality > 0.3) {
      compressedBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
      })

      const compressedSizeKB = compressedBlob.size / 1024
      console.log(`Quality ${quality.toFixed(2)}: ${compressedSizeKB.toFixed(0)}KB`)

      if (compressedSizeKB <= maxSizeKB) {
        console.log(`Compression successful: ${currentSizeKB.toFixed(0)}KB → ${compressedSizeKB.toFixed(0)}KB`)
        return compressedBlob
      }

      quality -= 0.1
    }

    // If still too large, reduce dimensions further
    if (compressedBlob.size / 1024 > maxSizeKB) {
      console.warn('Could not compress to target size, reducing dimensions further')
      const furtherScaleFactor = 0.7
      const smallerWidth = Math.floor(targetWidth * furtherScaleFactor)
      const smallerHeight = Math.floor(targetHeight * furtherScaleFactor)
      
      canvas.width = smallerWidth
      canvas.height = smallerHeight
      ctx.drawImage(img, 0, 0, smallerWidth, smallerHeight)
      
      compressedBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      })
    }

    return compressedBlob
  }

  /**
   * Load image from blob
   * @param {Blob} blob - Image blob
   * @returns {Promise<HTMLImageElement>} Loaded image
   */
  async loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load image'))
      }
      
      img.src = url
    })
  }

  /**
   * Convert base64 string to Blob
   * @param {string} base64 - Base64 encoded image data
   * @param {string} mimeType - MIME type of the image
   * @returns {Blob} Image blob
   */
  base64ToBlob(base64, mimeType = 'image/jpeg') {
    try {
      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      
      const byteArray = new Uint8Array(byteNumbers)
      return new Blob([byteArray], { type: mimeType })
    } catch (error) {
      throw new Error(`Failed to convert base64 to blob: ${error.message}`)
    }
  }

  /**
   * Convert Blob to base64 string
   * @param {Blob} blob - Image blob
   * @returns {Promise<string>} Base64 encoded string
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Upload with automatic retry logic
   * @param {string} comicId - Comic identifier
   * @param {File|Blob|string} imageSource - Image source
   * @param {Object} metadata - Metadata
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadWithRetry(comicId, imageSource, metadata = {}, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      backoffMultiplier = 2,
      ...uploadOptions
    } = options

    let lastError = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.uploadImage(comicId, imageSource, metadata, uploadOptions)
      } catch (error) {
        lastError = error
        
        // Don't retry on certain errors
        if (error.message.includes('cancelled') || 
            error.message.includes('Invalid image source')) {
          throw error
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt - 1)
        console.warn(`Upload attempt ${attempt} failed, retrying in ${delay}ms...`, error)
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError.message}`)
  }

  /**
   * Batch upload multiple images
   * @param {Array<Object>} uploads - Array of {comicId, imageSource, metadata}
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Batch upload results
   */
  async batchUpload(uploads, options = {}) {
    const {
      concurrency = 3, // Upload 3 at a time
      onProgress = null,
      ...uploadOptions
    } = options

    const results = {
      successful: [],
      failed: [],
      total: uploads.length
    }

    // Process uploads in batches
    for (let i = 0; i < uploads.length; i += concurrency) {
      const batch = uploads.slice(i, i + concurrency)
      
      const batchPromises = batch.map(async (upload) => {
        try {
          const result = await this.uploadImage(
            upload.comicId,
            upload.imageSource,
            upload.metadata,
            uploadOptions
          )
          results.successful.push({ comicId: upload.comicId, result })
        } catch (error) {
          results.failed.push({ 
            comicId: upload.comicId, 
            error: error.message 
          })
        }
      })

      await Promise.all(batchPromises)

      // Report progress
      if (onProgress) {
        onProgress({
          completed: results.successful.length + results.failed.length,
          total: results.total,
          successful: results.successful.length,
          failed: results.failed.length
        })
      }
    }

    return results
  }

  /**
   * Check if the upload endpoint is available
   * @returns {Promise<boolean>} True if endpoint is available
   */
  async checkAvailability() {
    try {
      const response = await fetch(this.uploadEndpoint, {
        method: 'OPTIONS'
      })
      return response.ok
    } catch (error) {
      return false
    }
  }
}

// Create singleton instance
const imageUploadClient = new ImageUploadClient()

export default imageUploadClient
export { ImageUploadClient }
