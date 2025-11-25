import React, { useState, useRef, useCallback } from 'react'
import { IMAGE_CONFIG, isSupportedFormat, isValidFileSize, formatFileSize } from '../config/imageConfig.js'
import imageProcessor from '../utils/imageProcessing.js'
import imageStorage from '../utils/imageStorage.js'
import coverErrorHandler from '../utils/errorHandling.js'
import CoverPreview from './CoverPreview'
import ErrorFeedback from './ErrorFeedback'
import './CoverUploader.css'

function CoverUploader({ 
  comicId, 
  onUploadComplete, 
  onUploadError, 
  currentCover = null,
  currentCoverData = null,
  disabled = false,
  uploadStrategy = 'hybrid', // 'local', 'remote', 'hybrid'
  enableResumableUpload = true,
  maxRetries = 3
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(currentCover)
  const [validationErrors, setValidationErrors] = useState([])
  const [uploadStatus, setUploadStatus] = useState('') // Status message for user
  const [retryCount, setRetryCount] = useState(0)
  const [uploadId, setUploadId] = useState(null) // For resumable uploads
  const [currentError, setCurrentError] = useState(null) // Current error state
  const fileInputRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Handle file selection with enhanced error handling
  const handleFileSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return
    
    const file = files[0]
    setValidationErrors([])
    setCurrentError(null)
    
    try {
      // Enhanced validation with error handling
      if (!isSupportedFormat(file.type)) {
        const error = new Error(`Unsupported format: ${file.type}. Supported formats: ${IMAGE_CONFIG.supportedFormats.join(', ')}`)
        error.name = 'ValidationError'
        throw error
      }
      
      if (!isValidFileSize(file.size)) {
        const error = new Error(`File too large: ${formatFileSize(file.size)}. Maximum size: ${formatFileSize(IMAGE_CONFIG.maxFileSize)}`)
        error.name = 'ValidationError'
        throw error
      }

      await processFile(file)
    } catch (error) {
      const errorResult = await coverErrorHandler.handleError(error, {
        operation: 'file_selection',
        fileType: file.type,
        fileSize: file.size,
        comicId
      })
      
      setCurrentError(errorResult.errorInfo)
      setValidationErrors([errorResult.userMessage])
      onUploadError?.(errorResult.userMessage)
    }
  }, [onUploadError, comicId])

  // Process the selected file with enhanced error handling
  const processFile = async (file) => {
    setIsUploading(true)
    setUploadProgress(0)
    setUploadStatus('Preparing upload...')
    setRetryCount(0)
    setCurrentError(null)
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()
    
    try {
      // Create preview URL
      const preview = URL.createObjectURL(file)
      setPreviewUrl(preview)
      setUploadProgress(10)

      // Validate image thoroughly with error handling
      setUploadStatus('Validating image...')
      const validation = await imageProcessor.validateImage(file)
      if (!validation.isValid) {
        const error = new Error(validation.errors.join(', '))
        error.name = 'ValidationError'
        throw error
      }
      setUploadProgress(20)

      // Process the image locally first for preview
      setUploadStatus('Processing image...')
      const processedImage = await imageProcessor.processUploadedImage(file, {
        generateSizes: ['thumbnail', 'medium', 'full'],
        compress: true,
        targetFormat: 'image/jpeg',
        onProgress: (progress) => {
          setUploadProgress(20 + (progress * 0.2)) // 20-40% range
        }
      })
      setUploadProgress(40)

      // Upload to backend with retry logic
      await uploadWithRetry(file, processedImage, preview)

    } catch (error) {
      if (error.name === 'AbortError') {
        setUploadStatus('Upload cancelled')
        setIsUploading(false)
        setUploadProgress(0)
        return
      }

      // Handle error through error handler
      const errorResult = await coverErrorHandler.handleError(error, {
        operation: 'image_processing',
        fileType: file.type,
        fileSize: file.size,
        comicId,
        uploadStrategy
      })

      setCurrentError(errorResult.errorInfo)
      setValidationErrors([errorResult.userMessage])
      onUploadError?.(errorResult.userMessage)
      setUploadStatus('Processing failed')
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // Upload with enhanced retry logic and error handling
  const uploadWithRetry = async (file, processedImage, previewUrl, attempt = 1) => {
    try {
      setUploadStatus(`Uploading to server... (attempt ${attempt}/${maxRetries})`)
      
      // Generate unique upload ID for resumable uploads
      if (!uploadId && enableResumableUpload) {
        setUploadId(`upload_${comicId}_${Date.now()}`)
      }

      // Upload using the selected strategy with error handling wrapper
      const uploadOperation = coverErrorHandler.withErrorHandling(
        imageStorage.uploadImage.bind(imageStorage),
        {
          operation: 'upload',
          strategy: uploadStrategy,
          comicId,
          attempt
        }
      )

      const uploadResult = await uploadOperation(file, comicId, uploadStrategy)
      
      setUploadProgress(90)
      setUploadStatus('Finalizing upload...')

      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setUploadProgress(100)
      setUploadStatus('Upload complete!')
      setCurrentError(null) // Clear any previous errors
      
      // Call completion callback
      onUploadComplete?.({
        file,
        processedImage,
        previewUrl,
        comicId,
        uploadResult,
        strategy: uploadStrategy
      })
      
      // Reset state
      setTimeout(() => {
        setIsUploading(false)
        setUploadStatus('')
        setUploadId(null)
      }, 1000)

    } catch (error) {
      console.error(`Upload attempt ${attempt} failed:`, error)
      
      // Handle error through error handler
      const errorResult = await coverErrorHandler.handleError(error, {
        operation: 'upload',
        strategy: uploadStrategy,
        comicId,
        attempt,
        maxRetries
      })

      if (errorResult.shouldRetry && attempt < maxRetries && !abortControllerRef.current?.signal.aborted) {
        setRetryCount(attempt)
        setUploadProgress(40) // Reset to processing stage
        
        const delay = errorResult.delay || Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        setUploadStatus(`Retrying in ${Math.ceil(delay / 1000)} seconds...`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        if (!abortControllerRef.current?.signal.aborted) {
          return uploadWithRetry(file, processedImage, previewUrl, attempt + 1)
        }
      } else {
        // All retries exhausted or upload cancelled
        setCurrentError(errorResult.errorInfo)
        setValidationErrors([errorResult.userMessage])
        onUploadError?.(errorResult.userMessage)
        setUploadStatus('Upload failed')
        setIsUploading(false)
        setUploadProgress(0)
      }
    }
  }

  // Cancel upload
  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsUploading(false)
    setUploadProgress(0)
    setUploadStatus('')
    setRetryCount(0)
    setUploadId(null)
  }, [])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    if (disabled || isUploading) return
    
    const files = Array.from(e.dataTransfer.files)
    handleFileSelect(files)
  }, [disabled, isUploading, handleFileSelect])

  // File input change handler
  const handleInputChange = useCallback((e) => {
    const files = Array.from(e.target.files)
    handleFileSelect(files)
  }, [handleFileSelect])

  // Click to select file
  const handleClick = useCallback(() => {
    if (disabled || isUploading) return
    fileInputRef.current?.click()
  }, [disabled, isUploading])

  // Remove current cover
  const handleRemove = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setValidationErrors([])
    setCurrentError(null)
    setUploadProgress(0)
    setUploadStatus('')
    setRetryCount(0)
    onUploadComplete?.({ removed: true, comicId })
  }, [previewUrl, onUploadComplete, comicId])

  // Handle error recovery actions
  const handleErrorRecovery = useCallback(async (action, options = {}) => {
    switch (action.action) {
      case 'retry':
        // Retry the last operation
        if (fileInputRef.current?.files?.length > 0) {
          const files = Array.from(fileInputRef.current.files)
          await handleFileSelect(files)
        }
        break
        
      case 'select_different':
        // Clear current state and allow new selection
        setCurrentError(null)
        setValidationErrors([])
        setPreviewUrl(null)
        fileInputRef.current?.click()
        break
        
      case 'use_original':
        // Upload without processing (if supported)
        if (fileInputRef.current?.files?.length > 0) {
          const file = fileInputRef.current.files[0]
          try {
            const uploadResult = await imageStorage.uploadImage(file, comicId, 'local')
            onUploadComplete?.({
              file,
              comicId,
              uploadResult,
              strategy: 'local',
              skipProcessing: true
            })
            setCurrentError(null)
          } catch (error) {
            const errorResult = await coverErrorHandler.handleError(error, {
              operation: 'direct_upload',
              comicId
            })
            setCurrentError(errorResult.errorInfo)
          }
        }
        break
        
      case 'save_local':
        // Switch to local storage strategy
        if (fileInputRef.current?.files?.length > 0) {
          const files = Array.from(fileInputRef.current.files)
          // Temporarily switch strategy and retry
          const originalStrategy = uploadStrategy
          uploadStrategy = 'local'
          await handleFileSelect(files)
          uploadStrategy = originalStrategy
        }
        break
        
      case 'clear_cache':
        // Clear image cache and retry
        try {
          const { default: imageCache } = await import('../utils/imageCache.js')
          await imageCache.clearCache()
          setCurrentError(null)
          setValidationErrors([])
        } catch (error) {
          console.error('Failed to clear cache:', error)
        }
        break
        
      default:
        // Dismiss error
        setCurrentError(null)
        setValidationErrors([])
    }
  }, [handleFileSelect, comicId, uploadStrategy, onUploadComplete])

  // Handle error dismissal
  const handleErrorDismiss = useCallback(() => {
    setCurrentError(null)
    setValidationErrors([])
  }, [])

  return (
    <div className="cover-uploader">
      <div className="uploader-label">
        <span>Cover Image</span>
        {(previewUrl || currentCoverData) && (
          <button 
            type="button"
            className="remove-cover-btn"
            onClick={handleRemove}
            disabled={disabled || isUploading}
            title="Remove cover"
          >
            ✕
          </button>
        )}
      </div>

      <div 
        className={`upload-area ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_CONFIG.supportedFormats.join(',')}
          onChange={handleInputChange}
          disabled={disabled || isUploading}
          style={{ display: 'none' }}
        />

        {previewUrl || currentCoverData ? (
          <div className="preview-container">
            {currentCoverData ? (
              <CoverPreview
                coverData={currentCoverData}
                size="medium"
                showControls={false}
                onClick={!isUploading ? handleClick : null}
              />
            ) : (
              <>
                <img 
                  src={previewUrl} 
                  alt="Cover preview" 
                  className="cover-preview"
                />
                {!isUploading && (
                  <div className="preview-overlay">
                    <span>Click to change</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="upload-placeholder">
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              <p><strong>Click to select</strong> or drag and drop</p>
              <p className="upload-hint">
                Supports: {IMAGE_CONFIG.supportedFormats.map(format => 
                  format.split('/')[1].toUpperCase()
                ).join(', ')}
              </p>
              <p className="upload-hint">
                Max size: {formatFileSize(IMAGE_CONFIG.maxFileSize)}
              </p>
            </div>
          </div>
        )}

        {isUploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="progress-info">
              <span className="progress-text">{uploadProgress}%</span>
              {retryCount > 0 && (
                <span className="retry-indicator">
                  Retry {retryCount}/{maxRetries}
                </span>
              )}
            </div>
            {uploadStatus && (
              <div className="upload-status">
                {uploadStatus}
              </div>
            )}
            <button 
              type="button"
              className="cancel-upload-btn"
              onClick={cancelUpload}
              title="Cancel upload"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Enhanced error feedback */}
      {currentError && (
        <ErrorFeedback
          error={currentError}
          onRecoveryAction={handleErrorRecovery}
          onDismiss={handleErrorDismiss}
          autoHide={currentError.severity === 'low'}
        />
      )}

      {validationErrors.length > 0 && !currentError && (
        <div className="validation-errors">
          {validationErrors.map((error, index) => (
            <div key={index} className="error-message">
              ⚠️ {error}
            </div>
          ))}
        </div>
      )}

      <div className="upload-info">
        <p>Recommended: High-quality cover images work best</p>
        <p>Images will be automatically resized and optimized</p>
        {uploadStrategy === 'hybrid' && (
          <p className="strategy-info">
            📡 Hybrid mode: Uploads to server with local backup
          </p>
        )}
        {uploadStrategy === 'remote' && (
          <p className="strategy-info">
            ☁️ Server mode: Uploads directly to server
          </p>
        )}
        {uploadStrategy === 'local' && (
          <p className="strategy-info">
            💾 Local mode: Stores images locally only
          </p>
        )}
      </div>
    </div>
  )
}

export default CoverUploader