/**
 * Image processing utilities for resizing, compression, and format conversion
 * Handles client-side image manipulation using Canvas API
 */

import { IMAGE_CONFIG, getImageSize, calculateDimensions, getFileExtension } from '../config/imageConfig.js'

class ImageProcessor {
  constructor() {
    this.canvas = null
    this.ctx = null
  }

  /**
   * Initialize canvas for image processing
   */
  initCanvas(width, height) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.ctx = this.canvas.getContext('2d')
    }
    
    this.canvas.width = width
    this.canvas.height = height
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height)
    
    return { canvas: this.canvas, ctx: this.ctx }
  }

  /**
   * Load image from file or blob
   */
  async loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      
      if (source instanceof File || source instanceof Blob) {
        img.src = URL.createObjectURL(source)
      } else if (typeof source === 'string') {
        img.src = source
      } else {
        reject(new Error('Invalid image source'))
      }
    })
  }

  /**
   * Resize image to specified dimensions
   */
  async resizeImage(source, targetWidth, targetHeight, options = {}) {
    const img = await this.loadImage(source)
    const { canvas, ctx } = this.initCanvas(targetWidth, targetHeight)
    
    const {
      method = IMAGE_CONFIG.processing.resizeMethod,
      backgroundColor = IMAGE_CONFIG.processing.backgroundColor,
      maintainAspectRatio = IMAGE_CONFIG.processing.maintainAspectRatio
    } = options

    // Fill background
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    let drawWidth, drawHeight, drawX, drawY

    if (maintainAspectRatio) {
      const dimensions = calculateDimensions(
        img.width, 
        img.height, 
        targetWidth, 
        targetHeight, 
        method
      )
      
      drawWidth = dimensions.width
      drawHeight = dimensions.height
      
      // Center the image
      drawX = (targetWidth - drawWidth) / 2
      drawY = (targetHeight - drawHeight) / 2
    } else {
      drawWidth = targetWidth
      drawHeight = targetHeight
      drawX = 0
      drawY = 0
    }

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw the resized image
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

    // Clean up object URL if created
    if (source instanceof File || source instanceof Blob) {
      URL.revokeObjectURL(img.src)
    }

    return canvas
  }

  /**
   * Convert canvas to blob with specified format and quality
   */
  async canvasToBlob(canvas, format = 'image/jpeg', quality = IMAGE_CONFIG.compression.quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        },
        format,
        quality
      )
    })
  }

  /**
   * Compress image with specified quality
   */
  async compressImage(source, options = {}) {
    const {
      quality = IMAGE_CONFIG.compression.quality,
      format = 'image/jpeg',
      maxWidth = 1920,
      maxHeight = 1920
    } = options

    const img = await this.loadImage(source)
    
    // Calculate dimensions to fit within max size
    let { width, height } = img
    
    if (width > maxWidth || height > maxHeight) {
      const dimensions = calculateDimensions(width, height, maxWidth, maxHeight, 'contain')
      width = dimensions.width
      height = dimensions.height
    }

    const canvas = await this.resizeImage(source, width, height, {
      method: 'contain',
      maintainAspectRatio: true
    })

    return this.canvasToBlob(canvas, format, quality)
  }

  /**
   * Generate multiple image sizes from source
   */
  async generateImageSizes(source, sizes = ['thumbnail', 'medium', 'full']) {
    const results = {}
    
    for (const sizeName of sizes) {
      const sizeConfig = getImageSize(sizeName)
      const canvas = await this.resizeImage(
        source, 
        sizeConfig.width, 
        sizeConfig.height,
        {
          method: 'cover',
          maintainAspectRatio: true
        }
      )
      
      results[sizeName] = await this.canvasToBlob(canvas, 'image/jpeg', IMAGE_CONFIG.compression.quality)
    }
    
    return results
  }

  /**
   * Convert image format
   */
  async convertFormat(source, targetFormat = 'image/jpeg', quality = IMAGE_CONFIG.compression.quality) {
    const img = await this.loadImage(source)
    const canvas = await this.resizeImage(source, img.width, img.height, {
      method: 'fill',
      maintainAspectRatio: false
    })
    
    return this.canvasToBlob(canvas, targetFormat, quality)
  }

  /**
   * Get image dimensions and metadata
   */
  async getImageInfo(source) {
    const img = await this.loadImage(source)
    
    let fileSize = 0
    let mimeType = 'image/jpeg'
    
    if (source instanceof File) {
      fileSize = source.size
      mimeType = source.type
    } else if (source instanceof Blob) {
      fileSize = source.size
      mimeType = source.type
    }

    return {
      width: img.width,
      height: img.height,
      aspectRatio: img.width / img.height,
      fileSize,
      mimeType,
      format: getFileExtension(mimeType)
    }
  }

  /**
   * Create a placeholder image
   */
  async createPlaceholder(width, height, text = 'No Cover') {
    const { canvas, ctx } = this.initCanvas(width, height)
    
    // Fill background
    ctx.fillStyle = IMAGE_CONFIG.placeholder.backgroundColor
    ctx.fillRect(0, 0, width, height)
    
    // Draw border
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, width - 2, height - 2)
    
    // Draw text
    ctx.fillStyle = IMAGE_CONFIG.placeholder.textColor
    ctx.font = `${IMAGE_CONFIG.placeholder.fontSize}px Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const lines = text.split('\n')
    const lineHeight = IMAGE_CONFIG.placeholder.fontSize * 1.2
    const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2
    
    lines.forEach((line, index) => {
      ctx.fillText(line, width / 2, startY + (index * lineHeight))
    })
    
    return this.canvasToBlob(canvas, 'image/png', 1.0)
  }

  /**
   * Validate image file
   */
  async validateImage(file) {
    const errors = []
    
    // Check file type
    if (!IMAGE_CONFIG.supportedFormats.includes(file.type.toLowerCase())) {
      errors.push(`Unsupported format: ${file.type}. Supported formats: ${IMAGE_CONFIG.supportedFormats.join(', ')}`)
    }
    
    // Check file size
    if (file.size > IMAGE_CONFIG.maxFileSize) {
      errors.push(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum size: ${(IMAGE_CONFIG.maxFileSize / (1024 * 1024)).toFixed(2)}MB`)
    }
    
    // Try to load image to check if it's valid
    try {
      const img = await this.loadImage(file)
      
      // Check dimensions
      if (img.width < 50 || img.height < 50) {
        errors.push('Image too small. Minimum size: 50x50 pixels')
      }
      
      if (img.width > 5000 || img.height > 5000) {
        errors.push('Image too large. Maximum size: 5000x5000 pixels')
      }
      
      // Clean up
      URL.revokeObjectURL(img.src)
      
    } catch (error) {
      errors.push('Invalid or corrupted image file')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Process uploaded image for storage
   */
  async processUploadedImage(file, options = {}) {
    // Validate the image first
    const validation = await this.validateImage(file)
    if (!validation.isValid) {
      throw new Error(`Image validation failed: ${validation.errors.join(', ')}`)
    }

    const {
      generateSizes = ['thumbnail', 'medium', 'full'],
      compress = true,
      targetFormat = 'image/jpeg',
      onProgress = null
    } = options

    const results = {
      original: file,
      info: await this.getImageInfo(file),
      processed: {}
    }

    let progress = 0
    const updateProgress = (step) => {
      progress = step
      onProgress?.(progress)
    }

    updateProgress(10)

    // Compress original if requested
    if (compress) {
      results.processed.compressed = await this.compressImage(file, {
        format: targetFormat,
        quality: IMAGE_CONFIG.compression.quality
      })
      updateProgress(40)
    }

    // Generate different sizes
    if (generateSizes && generateSizes.length > 0) {
      results.processed.sizes = await this.generateImageSizes(file, generateSizes)
      updateProgress(80)
    }

    // Generate URLs for processed images
    results.urls = await this.generateImageUrls(results.processed)
    updateProgress(100)

    return results
  }

  /**
   * Generate blob URLs for processed images
   */
  async generateImageUrls(processedImages) {
    const urls = {}

    if (processedImages.compressed) {
      urls.compressed = URL.createObjectURL(processedImages.compressed)
    }

    if (processedImages.sizes) {
      urls.sizes = {}
      for (const [sizeName, blob] of Object.entries(processedImages.sizes)) {
        urls.sizes[sizeName] = URL.createObjectURL(blob)
      }
    }

    return urls
  }

  /**
   * Clean up generated URLs
   */
  cleanupUrls(urls) {
    if (urls.compressed) {
      URL.revokeObjectURL(urls.compressed)
    }

    if (urls.sizes) {
      Object.values(urls.sizes).forEach(url => {
        URL.revokeObjectURL(url)
      })
    }
  }

  /**
   * Advanced image processing pipeline
   */
  async processImagePipeline(source, pipeline = []) {
    let currentImage = source
    const results = []

    for (const step of pipeline) {
      const { operation, options = {} } = step

      switch (operation) {
        case 'resize':
          currentImage = await this.resizeImage(currentImage, options.width, options.height, options)
          break
        case 'compress':
          currentImage = await this.compressImage(currentImage, options)
          break
        case 'convert':
          currentImage = await this.convertFormat(currentImage, options.format, options.quality)
          break
        case 'validate':
          const validation = await this.validateImage(currentImage)
          if (!validation.isValid) {
            throw new Error(`Pipeline validation failed: ${validation.errors.join(', ')}`)
          }
          break
        default:
          console.warn(`Unknown pipeline operation: ${operation}`)
      }

      results.push({
        operation,
        result: currentImage,
        options
      })
    }

    return {
      final: currentImage,
      steps: results
    }
  }

  /**
   * Batch process multiple images
   */
  async batchProcess(files, options = {}) {
    const {
      concurrency = 3,
      onProgress = null,
      onError = null
    } = options

    const results = []
    let completed = 0

    const processFile = async (file, index) => {
      try {
        const result = await this.processUploadedImage(file, {
          ...options,
          onProgress: (progress) => {
            onProgress?.({
              fileIndex: index,
              fileName: file.name,
              progress,
              completed,
              total: files.length
            })
          }
        })
        
        completed++
        return { success: true, result, file, index }
      } catch (error) {
        completed++
        onError?.(error, file, index)
        return { success: false, error: error.message, file, index }
      }
    }

    // Process files in batches
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency)
      const batchPromises = batch.map((file, batchIndex) => 
        processFile(file, i + batchIndex)
      )
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    return results
  }
}

export default new ImageProcessor()