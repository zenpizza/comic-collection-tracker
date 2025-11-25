/**
 * Image processing pipeline for cover images
 * Handles the complete workflow from upload to storage-ready images
 */

import imageProcessor from './imageProcessing.js'
import { IMAGE_CONFIG, getImageSize } from '../config/imageConfig.js'

class ImagePipeline {
  constructor() {
    this.processingQueue = new Map()
    this.activeProcesses = 0
    this.maxConcurrentProcesses = 3
  }

  /**
   * Process a single cover image through the complete pipeline
   */
  async processCoverImage(file, options = {}) {
    const {
      comicId,
      generateThumbnails = true,
      optimizeForWeb = true,
      onProgress = null,
      onStepComplete = null
    } = options

    const processId = `${comicId || 'temp'}_${Date.now()}`
    
    try {
      // Add to processing queue
      this.processingQueue.set(processId, {
        file,
        status: 'processing',
        startTime: Date.now()
      })

      const pipeline = this.createCoverProcessingPipeline({
        generateThumbnails,
        optimizeForWeb
      })

      const result = await this.executePipeline(file, pipeline, {
        processId,
        onProgress,
        onStepComplete
      })

      // Update queue status
      this.processingQueue.set(processId, {
        ...this.processingQueue.get(processId),
        status: 'completed',
        result
      })

      return {
        processId,
        success: true,
        ...result
      }

    } catch (error) {
      // Update queue status
      this.processingQueue.set(processId, {
        ...this.processingQueue.get(processId),
        status: 'failed',
        error: error.message
      })

      throw error
    }
  }

  /**
   * Create the standard cover processing pipeline
   */
  createCoverProcessingPipeline(options = {}) {
    const {
      generateThumbnails = true,
      optimizeForWeb = true,
      targetFormat = 'image/jpeg'
    } = options

    const pipeline = [
      // Step 1: Validate input
      {
        name: 'validate',
        operation: 'validate',
        description: 'Validating image file'
      },
      
      // Step 2: Get image info
      {
        name: 'analyze',
        operation: 'analyze',
        description: 'Analyzing image properties'
      }
    ]

    if (optimizeForWeb) {
      // Step 3: Optimize for web (compress and convert if needed)
      pipeline.push({
        name: 'optimize',
        operation: 'optimize',
        options: {
          targetFormat,
          quality: IMAGE_CONFIG.compression.quality,
          maxDimensions: IMAGE_CONFIG.sizes.full
        },
        description: 'Optimizing for web display'
      })
    }

    if (generateThumbnails) {
      // Step 4: Generate thumbnails
      pipeline.push({
        name: 'thumbnails',
        operation: 'generateSizes',
        options: {
          sizes: ['thumbnail', 'medium']
        },
        description: 'Generating thumbnails'
      })
    }

    // Step 5: Finalize
    pipeline.push({
      name: 'finalize',
      operation: 'finalize',
      description: 'Finalizing processed images'
    })

    return pipeline
  }

  /**
   * Execute a processing pipeline
   */
  async executePipeline(source, pipeline, options = {}) {
    const { processId, onProgress, onStepComplete } = options
    const results = {
      original: source,
      processed: {},
      metadata: {},
      urls: {}
    }

    let currentSource = source
    const totalSteps = pipeline.length

    for (let i = 0; i < pipeline.length; i++) {
      const step = pipeline[i]
      const progress = Math.round(((i + 1) / totalSteps) * 100)

      onProgress?.({
        processId,
        step: step.name,
        description: step.description,
        progress,
        currentStep: i + 1,
        totalSteps
      })

      try {
        const stepResult = await this.executeStep(currentSource, step, results)
        
        if (stepResult.newSource) {
          currentSource = stepResult.newSource
        }

        onStepComplete?.({
          processId,
          step: step.name,
          result: stepResult,
          progress
        })

      } catch (error) {
        throw new Error(`Pipeline step '${step.name}' failed: ${error.message}`)
      }
    }

    return results
  }

  /**
   * Execute a single pipeline step
   */
  async executeStep(source, step, results) {
    const { operation, options = {} } = step

    switch (operation) {
      case 'validate':
        const validation = await imageProcessor.validateImage(source)
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
        }
        results.metadata.validation = validation
        return { success: true }

      case 'analyze':
        const info = await imageProcessor.getImageInfo(source)
        results.metadata.original = info
        return { success: true }

      case 'optimize':
        const optimized = await this.optimizeImage(source, options)
        results.processed.optimized = optimized.blob
        results.urls.optimized = optimized.url
        results.metadata.optimized = optimized.info
        return { 
          success: true, 
          newSource: optimized.blob 
        }

      case 'generateSizes':
        const sizes = await this.generateImageSizes(source, options.sizes)
        results.processed.sizes = sizes.blobs
        results.urls.sizes = sizes.urls
        results.metadata.sizes = sizes.info
        return { success: true }

      case 'finalize':
        // Generate final URLs and cleanup
        await this.finalizeProcessing(results)
        return { success: true }

      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
  }

  /**
   * Optimize image for web display
   */
  async optimizeImage(source, options = {}) {
    const {
      targetFormat = 'image/jpeg',
      quality = IMAGE_CONFIG.compression.quality,
      maxDimensions = IMAGE_CONFIG.sizes.full
    } = options

    // Get original info
    const originalInfo = await imageProcessor.getImageInfo(source)
    
    // Determine if resizing is needed
    const needsResize = originalInfo.width > maxDimensions.width || 
                       originalInfo.height > maxDimensions.height

    let processedBlob = source

    if (needsResize) {
      // Resize to fit within max dimensions
      const canvas = await imageProcessor.resizeImage(
        source,
        maxDimensions.width,
        maxDimensions.height,
        { method: 'contain', maintainAspectRatio: true }
      )
      processedBlob = await imageProcessor.canvasToBlob(canvas, targetFormat, quality)
    } else if (originalInfo.mimeType !== targetFormat || originalInfo.fileSize > IMAGE_CONFIG.maxFileSize * 0.8) {
      // Compress or convert format
      processedBlob = await imageProcessor.compressImage(source, {
        format: targetFormat,
        quality
      })
    }

    const processedInfo = await imageProcessor.getImageInfo(processedBlob)
    const url = URL.createObjectURL(processedBlob)

    return {
      blob: processedBlob,
      url,
      info: processedInfo,
      compressionRatio: originalInfo.fileSize / processedInfo.fileSize
    }
  }

  /**
   * Generate multiple image sizes
   */
  async generateImageSizes(source, sizeNames = ['thumbnail', 'medium']) {
    const blobs = {}
    const urls = {}
    const info = {}

    for (const sizeName of sizeNames) {
      const sizeConfig = getImageSize(sizeName)
      const canvas = await imageProcessor.resizeImage(
        source,
        sizeConfig.width,
        sizeConfig.height,
        { method: 'cover', maintainAspectRatio: true }
      )
      
      const blob = await imageProcessor.canvasToBlob(
        canvas, 
        'image/jpeg', 
        IMAGE_CONFIG.compression.quality
      )
      
      blobs[sizeName] = blob
      urls[sizeName] = URL.createObjectURL(blob)
      info[sizeName] = await imageProcessor.getImageInfo(blob)
    }

    return { blobs, urls, info }
  }

  /**
   * Finalize processing and prepare for storage
   */
  async finalizeProcessing(results) {
    // Calculate total processing time
    const processStart = this.processingQueue.get(results.processId)?.startTime
    if (processStart) {
      results.metadata.processingTime = Date.now() - processStart
    }

    // Calculate storage requirements
    let totalSize = 0
    if (results.processed.optimized) {
      totalSize += results.processed.optimized.size
    }
    if (results.processed.sizes) {
      Object.values(results.processed.sizes).forEach(blob => {
        totalSize += blob.size
      })
    }
    
    results.metadata.totalStorageSize = totalSize
    results.metadata.storageEfficiency = results.metadata.original?.fileSize 
      ? (results.metadata.original.fileSize - totalSize) / results.metadata.original.fileSize
      : 0

    return results
  }

  /**
   * Get processing status
   */
  getProcessingStatus(processId) {
    return this.processingQueue.get(processId)
  }

  /**
   * Clean up processing queue
   */
  cleanupProcess(processId) {
    const process = this.processingQueue.get(processId)
    if (process?.result?.urls) {
      // Clean up any blob URLs
      imageProcessor.cleanupUrls(process.result.urls)
    }
    this.processingQueue.delete(processId)
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const processes = Array.from(this.processingQueue.values())
    return {
      total: processes.length,
      processing: processes.filter(p => p.status === 'processing').length,
      completed: processes.filter(p => p.status === 'completed').length,
      failed: processes.filter(p => p.status === 'failed').length
    }
  }

  /**
   * Batch process multiple cover images
   */
  async batchProcessCovers(files, options = {}) {
    const {
      onProgress = null,
      onFileComplete = null,
      onError = null
    } = options

    const results = []
    let completed = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
        const result = await this.processCoverImage(file, {
          ...options,
          onProgress: (progress) => {
            onProgress?.({
              fileIndex: i,
              fileName: file.name,
              fileProgress: progress.progress,
              overallProgress: Math.round(((completed + progress.progress / 100) / files.length) * 100),
              completed,
              total: files.length
            })
          }
        })

        results.push({ success: true, result, file, index: i })
        completed++
        onFileComplete?.(result, file, i)

      } catch (error) {
        results.push({ success: false, error: error.message, file, index: i })
        completed++
        onError?.(error, file, i)
      }
    }

    return results
  }
}

export default new ImagePipeline()