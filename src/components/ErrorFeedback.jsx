import React, { useState, useEffect } from 'react'
import './ErrorFeedback.css'

/**
 * ErrorFeedback component for displaying error messages and recovery options
 * Integrates with the error handling system to provide user-friendly feedback
 */
function ErrorFeedback({ 
  error = null, 
  onRecoveryAction = null, 
  onDismiss = null,
  autoHide = false,
  autoHideDelay = 5000,
  showTechnicalDetails = false
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [countdown, setCountdown] = useState(null)

  useEffect(() => {
    if (error) {
      setIsVisible(true)
      setIsExpanded(false)
      
      // Auto-hide for non-critical errors
      if (autoHide && error.severity !== 'high') {
        const timer = setTimeout(() => {
          handleDismiss()
        }, autoHideDelay)
        
        return () => clearTimeout(timer)
      }
    } else {
      setIsVisible(false)
    }
  }, [error, autoHide, autoHideDelay])

  // Countdown for delayed retry actions
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      
      return () => clearTimeout(timer)
    } else if (countdown === 0) {
      setCountdown(null)
    }
  }, [countdown])

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss?.()
  }

  const handleRecoveryAction = (action, options = {}) => {
    if (action.delay) {
      setCountdown(Math.ceil(action.delay / 1000))
      setTimeout(() => {
        onRecoveryAction?.(action, options)
      }, action.delay)
    } else {
      onRecoveryAction?.(action, options)
    }
  }

  const toggleTechnicalDetails = () => {
    setIsExpanded(!isExpanded)
  }

  if (!isVisible || !error) {
    return null
  }

  const getSeverityIcon = () => {
    switch (error.severity) {
      case 'high':
        return '🚨'
      case 'medium':
        return '⚠️'
      case 'low':
        return 'ℹ️'
      default:
        return '❓'
    }
  }

  const getSeverityClass = () => {
    return `error-feedback--${error.severity || 'medium'}`
  }

  return (
    <div className={`error-feedback ${getSeverityClass()}`}>
      <div className="error-feedback__header">
        <div className="error-feedback__icon">
          {getSeverityIcon()}
        </div>
        <div className="error-feedback__content">
          <div className="error-feedback__title">
            {error.category === 'NetworkError' && 'Connection Problem'}
            {error.category === 'RateLimitError' && 'Service Busy'}
            {error.category === 'ImageProcessingError' && 'Image Processing Error'}
            {error.category === 'StorageError' && 'Storage Error'}
            {error.category === 'UploadError' && 'Upload Failed'}
            {error.category === 'ValidationError' && 'Invalid File'}
            {error.category === 'APIError' && 'Service Error'}
            {!error.category || error.category === 'UnknownError' ? 'Error' : ''}
          </div>
          <div className="error-feedback__message">
            {error.userFriendly || error.message}
          </div>
        </div>
        <button 
          className="error-feedback__close"
          onClick={handleDismiss}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {error.recoveryOptions && error.recoveryOptions.length > 0 && (
        <div className="error-feedback__actions">
          {error.recoveryOptions.map((option, index) => (
            <button
              key={index}
              className={`error-feedback__action ${option.primary ? 'error-feedback__action--primary' : ''}`}
              onClick={() => handleRecoveryAction(option)}
              disabled={countdown > 0 && option.action === 'retry_delayed'}
              title={option.description}
            >
              {countdown > 0 && option.action === 'retry_delayed' 
                ? `${option.label} (${countdown}s)`
                : option.label
              }
            </button>
          ))}
        </div>
      )}

      {(showTechnicalDetails || error.technical) && (
        <div className="error-feedback__technical">
          <button 
            className="error-feedback__technical-toggle"
            onClick={toggleTechnicalDetails}
          >
            {isExpanded ? 'Hide' : 'Show'} Technical Details
          </button>
          
          {isExpanded && (
            <div className="error-feedback__technical-content">
              <div className="error-feedback__technical-item">
                <strong>Error Type:</strong> {error.category}
              </div>
              <div className="error-feedback__technical-item">
                <strong>Message:</strong> {error.message}
              </div>
              {error.context && Object.keys(error.context).length > 0 && (
                <div className="error-feedback__technical-item">
                  <strong>Context:</strong>
                  <pre>{JSON.stringify(error.context, null, 2)}</pre>
                </div>
              )}
              <div className="error-feedback__technical-item">
                <strong>Timestamp:</strong> {new Date(error.timestamp).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      {error.category === 'RateLimitError' && (
        <div className="error-feedback__info">
          <small>
            The cover search service is experiencing high traffic. 
            Please wait a moment before trying again.
          </small>
        </div>
      )}

      {error.category === 'NetworkError' && (
        <div className="error-feedback__info">
          <small>
            Check your internet connection. You can continue working offline 
            with locally stored images.
          </small>
        </div>
      )}

      {error.category === 'StorageError' && (
        <div className="error-feedback__info">
          <small>
            Your device may be running low on storage space. 
            Consider clearing the image cache or using cloud storage.
          </small>
        </div>
      )}
    </div>
  )
}

/**
 * ErrorFeedbackProvider - Context provider for error feedback system
 */
export function ErrorFeedbackProvider({ children, errorHandler }) {
  const [currentError, setCurrentError] = useState(null)

  useEffect(() => {
    if (!errorHandler) return

    const unsubscribe = errorHandler.onUserFeedback((notification) => {
      if (notification.type === 'error') {
        setCurrentError({
          category: notification.category,
          message: notification.message,
          severity: notification.severity || 'medium',
          recoveryOptions: notification.recoveryOptions || [],
          technical: notification.technical || false,
          timestamp: new Date().toISOString()
        })
      } else if (notification.type === 'retry') {
        setCurrentError({
          category: notification.category,
          message: notification.message,
          severity: 'medium',
          recoveryOptions: [],
          technical: false,
          timestamp: new Date().toISOString(),
          isRetry: true,
          attempt: notification.attempt,
          maxAttempts: notification.maxAttempts
        })
      }
    })

    return unsubscribe
  }, [errorHandler])

  const handleRecoveryAction = (action, options = {}) => {
    // Handle common recovery actions
    switch (action.action) {
      case 'retry':
        // Trigger retry through error handler
        setCurrentError(null)
        break
        
      case 'clear_cache':
        // Clear image cache
        import('../utils/imageCache.js').then(({ default: imageCache }) => {
          imageCache.clearCache().then(() => {
            setCurrentError(null)
          })
        })
        break
        
      case 'offline_mode':
        // Switch to offline mode
        localStorage.setItem('cover_offline_mode', 'true')
        setCurrentError(null)
        break
        
      case 'skip_cover':
      case 'cancel':
        // Just dismiss the error
        setCurrentError(null)
        break
        
      default:
        // Let parent components handle specific actions
        setCurrentError(null)
    }
  }

  const handleDismiss = () => {
    setCurrentError(null)
  }

  return (
    <>
      {children}
      <ErrorFeedback
        error={currentError}
        onRecoveryAction={handleRecoveryAction}
        onDismiss={handleDismiss}
        autoHide={true}
        showTechnicalDetails={process.env.NODE_ENV === 'development'}
      />
    </>
  )
}

/**
 * Hook for using error feedback in components
 */
export function useErrorFeedback(errorHandler) {
  const [errors, setErrors] = useState([])

  useEffect(() => {
    if (!errorHandler) return

    const unsubscribe = errorHandler.onUserFeedback((notification) => {
      if (notification.type === 'error') {
        setErrors(prev => [notification, ...prev.slice(0, 4)]) // Keep last 5 errors
      }
    })

    return unsubscribe
  }, [errorHandler])

  const clearErrors = () => {
    setErrors([])
  }

  const dismissError = (index) => {
    setErrors(prev => prev.filter((_, i) => i !== index))
  }

  return {
    errors,
    clearErrors,
    dismissError,
    hasErrors: errors.length > 0
  }
}

export default ErrorFeedback