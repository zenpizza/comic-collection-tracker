/**
 * Comprehensive error handling and recovery utilities for cover operations
 * Provides centralized error management, user feedback, and retry mechanisms
 */

class CoverErrorHandler {
  constructor() {
    this.errorLog = []
    this.retryStrategies = new Map()
    this.userFeedbackCallbacks = new Set()
    this.maxLogSize = 100
    
    this.initializeRetryStrategies()
  }

  /**
   * Initialize retry strategies for different error types
   */
  initializeRetryStrategies() {
    // Network errors - retry with exponential backoff
    this.retryStrategies.set('NetworkError', {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      shouldRetry: (error, attempt) => attempt < 3 && this.isRetryableNetworkError(error)
    })

    // API rate limiting - retry with longer delays
    this.retryStrategies.set('RateLimitError', {
      maxRetries: 5,
      baseDelay: 5000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      shouldRetry: (error, attempt) => attempt < 5
    })

    // Image processing errors - retry once with different settings
    this.retryStrategies.set('ImageProcessingError', {
      maxRetries: 1,
      baseDelay: 500,
      maxDelay: 1000,
      backoffMultiplier: 1,
      shouldRetry: (error, attempt) => attempt < 1 && this.isRetryableProcessingError(error)
    })

    // Storage errors - retry with fallback strategies
    this.retryStrategies.set('StorageError', {
      maxRetries: 2,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      shouldRetry: (error, attempt) => attempt < 2 && this.isRetryableStorageError(error)
    })

    // Upload errors - retry with different strategies
    this.retryStrategies.set('UploadError', {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      shouldRetry: (error, attempt) => attempt < 3 && this.isRetryableUploadError(error)
    })
  }

  /**
   * Handle and categorize errors with appropriate recovery strategies
   */
  async handleError(error, context = {}) {
    const errorInfo = this.categorizeError(error, context)
    
    // Log the error
    this.logError(errorInfo)
    
    // Determine if retry is appropriate
    const retryStrategy = this.retryStrategies.get(errorInfo.category)
    
    if (retryStrategy && context.attempt !== undefined) {
      const shouldRetry = retryStrategy.shouldRetry(error, context.attempt)
      
      if (shouldRetry) {
        const delay = this.calculateRetryDelay(retryStrategy, context.attempt)
        
        // Notify user about retry
        this.notifyUser({
          type: 'retry',
          message: `Operation failed, retrying in ${Math.ceil(delay / 1000)} seconds...`,
          category: errorInfo.category,
          attempt: context.attempt + 1,
          maxAttempts: retryStrategy.maxRetries
        })
        
        return {
          shouldRetry: true,
          delay,
          strategy: retryStrategy
        }
      }
    }
    
    // No retry - provide user feedback and recovery options
    const userMessage = this.generateUserMessage(errorInfo)
    const recoveryOptions = this.generateRecoveryOptions(errorInfo, context)
    
    this.notifyUser({
      type: 'error',
      message: userMessage,
      category: errorInfo.category,
      recoveryOptions,
      technical: errorInfo.technical
    })
    
    return {
      shouldRetry: false,
      userMessage,
      recoveryOptions,
      errorInfo
    }
  }

  /**
   * Categorize errors into types for appropriate handling
   */
  categorizeError(error, context = {}) {
    const errorInfo = {
      originalError: error,
      message: error.message || 'Unknown error',
      category: 'UnknownError',
      severity: 'medium',
      context,
      timestamp: new Date().toISOString(),
      technical: false
    }

    // Network-related errors
    if (this.isNetworkError(error)) {
      errorInfo.category = 'NetworkError'
      errorInfo.severity = 'high'
      errorInfo.userFriendly = 'Network connection issue'
    }
    // Rate limiting errors
    else if (this.isRateLimitError(error)) {
      errorInfo.category = 'RateLimitError'
      errorInfo.severity = 'medium'
      errorInfo.userFriendly = 'Service temporarily busy'
    }
    // Image processing errors
    else if (this.isImageProcessingError(error)) {
      errorInfo.category = 'ImageProcessingError'
      errorInfo.severity = 'medium'
      errorInfo.userFriendly = 'Image processing failed'
    }
    // Storage errors
    else if (this.isStorageError(error)) {
      errorInfo.category = 'StorageError'
      errorInfo.severity = 'high'
      errorInfo.userFriendly = 'Storage operation failed'
    }
    // Upload errors
    else if (this.isUploadError(error)) {
      errorInfo.category = 'UploadError'
      errorInfo.severity = 'medium'
      errorInfo.userFriendly = 'Upload failed'
    }
    // Validation errors
    else if (this.isValidationError(error)) {
      errorInfo.category = 'ValidationError'
      errorInfo.severity = 'low'
      errorInfo.userFriendly = 'Invalid input'
    }
    // API errors
    else if (this.isAPIError(error)) {
      errorInfo.category = 'APIError'
      errorInfo.severity = 'medium'
      errorInfo.userFriendly = 'External service error'
    }

    return errorInfo
  }

  /**
   * Generate user-friendly error messages
   */
  generateUserMessage(errorInfo) {
    const baseMessages = {
      NetworkError: 'Unable to connect to the server. Please check your internet connection.',
      RateLimitError: 'The service is temporarily busy. Please wait a moment and try again.',
      ImageProcessingError: 'There was a problem processing the image. Please try a different image or format.',
      StorageError: 'Unable to save the image. Please check available storage space.',
      UploadError: 'The image upload failed. Please check your connection and try again.',
      ValidationError: 'The selected file is not valid. Please choose a supported image format.',
      APIError: 'The cover search service is temporarily unavailable.',
      UnknownError: 'An unexpected error occurred. Please try again.'
    }

    let message = baseMessages[errorInfo.category] || baseMessages.UnknownError

    // Add specific details for certain error types
    const errorMessage = errorInfo.message || ''
    if (errorInfo.category === 'ValidationError' && errorMessage.includes('format')) {
      message += ' Supported formats: JPEG, PNG, WebP.'
    }
    
    if (errorInfo.category === 'ValidationError' && errorMessage.includes('size')) {
      message += ' Maximum file size is 5MB.'
    }

    if (errorInfo.category === 'StorageError' && errorMessage.includes('quota')) {
      message += ' Your storage quota may be full.'
    }

    return message
  }

  /**
   * Generate recovery options for different error types
   */
  generateRecoveryOptions(errorInfo, context = {}) {
    const options = []

    switch (errorInfo.category) {
      case 'NetworkError':
        options.push({
          label: 'Retry',
          action: 'retry',
          primary: true
        })
        options.push({
          label: 'Work Offline',
          action: 'offline_mode',
          description: 'Continue with local storage only'
        })
        break

      case 'RateLimitError':
        options.push({
          label: 'Wait and Retry',
          action: 'retry_delayed',
          primary: true,
          delay: 30000
        })
        options.push({
          label: 'Skip Cover',
          action: 'skip_cover',
          description: 'Continue without adding a cover'
        })
        break

      case 'ImageProcessingError':
        options.push({
          label: 'Try Different Image',
          action: 'select_different',
          primary: true
        })
        options.push({
          label: 'Use Original',
          action: 'use_original',
          description: 'Upload without processing'
        })
        break

      case 'StorageError':
        options.push({
          label: 'Clear Cache',
          action: 'clear_cache',
          primary: true,
          description: 'Free up storage space'
        })
        options.push({
          label: 'Use Cloud Storage',
          action: 'use_remote',
          description: 'Store on server instead'
        })
        break

      case 'UploadError':
        options.push({
          label: 'Retry Upload',
          action: 'retry',
          primary: true
        })
        options.push({
          label: 'Save Locally',
          action: 'save_local',
          description: 'Store image locally only'
        })
        break

      case 'ValidationError':
        options.push({
          label: 'Choose Different File',
          action: 'select_different',
          primary: true
        })
        if (context.operation === 'upload') {
          options.push({
            label: 'Convert Format',
            action: 'convert_format',
            description: 'Attempt to convert to supported format'
          })
        }
        break

      case 'APIError':
        options.push({
          label: 'Try Again Later',
          action: 'retry_later',
          primary: true
        })
        options.push({
          label: 'Upload Manually',
          action: 'manual_upload',
          description: 'Upload your own cover image'
        })
        break

      default:
        options.push({
          label: 'Try Again',
          action: 'retry',
          primary: true
        })
        options.push({
          label: 'Cancel',
          action: 'cancel'
        })
    }

    return options
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(strategy, attempt) {
    const delay = Math.min(
      strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt),
      strategy.maxDelay
    )
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay
    return Math.floor(delay + jitter)
  }

  /**
   * Log error for debugging and analytics
   */
  logError(errorInfo) {
    // Add to in-memory log
    this.errorLog.unshift(errorInfo)
    
    // Trim log if it gets too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize)
    }
    
    // Console logging for development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Cover Error: ${errorInfo.category}`)
      console.error('Message:', errorInfo.message)
      console.error('Context:', errorInfo.context)
      console.error('Original:', errorInfo.originalError)
      console.groupEnd()
    }
    
    // Could send to analytics service in production
    if (process.env.NODE_ENV === 'production' && errorInfo.severity === 'high') {
      this.reportToAnalytics(errorInfo)
    }
  }

  /**
   * Register callback for user feedback notifications
   */
  onUserFeedback(callback) {
    this.userFeedbackCallbacks.add(callback)
    
    return () => {
      this.userFeedbackCallbacks.delete(callback)
    }
  }

  /**
   * Notify user about errors and recovery options
   */
  notifyUser(notification) {
    this.userFeedbackCallbacks.forEach(callback => {
      try {
        callback(notification)
      } catch (error) {
        console.error('Error in user feedback callback:', error)
      }
    })
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats() {
    const stats = {
      total: this.errorLog.length,
      byCategory: {},
      bySeverity: {},
      recent: this.errorLog.slice(0, 10)
    }
    
    this.errorLog.forEach(error => {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1
    })
    
    return stats
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = []
  }

  // Error type detection methods
  isNetworkError(error) {
    const message = error.message || ''
    return error.name === 'TypeError' && message.includes('fetch') ||
           error.name === 'NetworkError' ||
           message.includes('Failed to fetch') ||
           message.includes('Network request failed') ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ENOTFOUND'
  }

  isRateLimitError(error) {
    const message = error.message || ''
    return error.status === 429 ||
           message.includes('rate limit') ||
           message.includes('too many requests') ||
           error.code === 'RATE_LIMIT_EXCEEDED'
  }

  isImageProcessingError(error) {
    const message = error.message || ''
    return message.includes('image processing') ||
           message.includes('canvas') ||
           message.includes('Failed to load image') ||
           error.name === 'ImageProcessingError'
  }

  isStorageError(error) {
    const message = error.message || ''
    return error.name === 'QuotaExceededError' ||
           message.includes('storage') ||
           message.includes('IndexedDB') ||
           message.includes('quota') ||
           error.name === 'StorageError'
  }

  isUploadError(error) {
    const message = error.message || ''
    return message.includes('upload') ||
           message.includes('Failed to upload') ||
           error.status >= 500 ||
           error.name === 'UploadError'
  }

  isValidationError(error) {
    const message = error.message || ''
    return message.includes('validation') ||
           message.includes('Invalid') ||
           message.includes('Unsupported format') ||
           message.includes('File too large') ||
           error.name === 'ValidationError'
  }

  isAPIError(error) {
    const message = error.message || ''
    return message.includes('API') ||
           error.status >= 400 && error.status < 500 ||
           message.includes('service') ||
           error.name === 'APIError'
  }

  // Retry condition methods
  isRetryableNetworkError(error) {
    // Don't retry on 4xx client errors, but retry on 5xx server errors
    return !error.status || error.status >= 500 || this.isNetworkError(error)
  }

  isRetryableProcessingError(error) {
    // Only retry processing errors that might be transient
    const message = error.message || ''
    return !message.includes('Invalid') && 
           !message.includes('Unsupported')
  }

  isRetryableStorageError(error) {
    // Don't retry quota errors, but retry other storage issues
    return error.name !== 'QuotaExceededError'
  }

  isRetryableUploadError(error) {
    // Retry server errors and network issues, not client errors
    return !error.status || error.status >= 500 || this.isNetworkError(error)
  }

  /**
   * Report error to analytics service (placeholder)
   */
  reportToAnalytics(errorInfo) {
    // In a real implementation, this would send to an analytics service
    console.log('Would report to analytics:', {
      category: errorInfo.category,
      message: errorInfo.message,
      severity: errorInfo.severity,
      context: errorInfo.context,
      timestamp: errorInfo.timestamp
    })
  }

  /**
   * Create a wrapper for async operations with error handling
   */
  withErrorHandling(operation, context = {}) {
    return async (...args) => {
      let attempt = 0
      const maxAttempts = 3

      while (attempt < maxAttempts) {
        try {
          return await operation(...args)
        } catch (error) {
          const result = await this.handleError(error, { ...context, attempt })
          
          if (result.shouldRetry && attempt < maxAttempts - 1) {
            attempt++
            if (result.delay) {
              await new Promise(resolve => setTimeout(resolve, result.delay))
            }
            continue
          } else {
            throw error
          }
        }
      }
    }
  }

  /**
   * Create error boundary for React components (factory function)
   */
  createErrorBoundary() {
    const errorHandler = this
    
    return function CoverErrorBoundary(React) {
      return class extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }

        static getDerivedStateFromError(error) {
          return { hasError: true, error }
        }

        componentDidCatch(error, errorInfo) {
          // Log the error through our error handler
          errorHandler.handleError(error, {
            component: errorInfo.componentStack,
            operation: 'render'
          })
        }

        render() {
          if (this.state.hasError) {
            return this.props.fallback || React.createElement('div', 
              { className: 'cover-error-boundary' },
              React.createElement('h3', null, 'Something went wrong'),
              React.createElement('p', null, 'There was an error loading the cover image.'),
              React.createElement('button', 
                { onClick: () => this.setState({ hasError: false, error: null }) },
                'Try Again'
              )
            )
          }

          return this.props.children
        }
      }
    }
  }
}

// Create singleton instance
const coverErrorHandler = new CoverErrorHandler()

export default coverErrorHandler
export { CoverErrorHandler }