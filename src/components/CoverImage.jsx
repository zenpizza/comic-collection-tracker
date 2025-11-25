import React, { useState, useRef, useEffect } from 'react'
import { getCoverFallbackStrategy } from '../utils/placeholderImages'
import ImageURLService from '../utils/ImageURLService'
import './CoverImage.css'

/**
 * CoverImage component with loading states and size variants
 * Supports thumbnail, medium, and full size variants with lazy loading
 */
function CoverImage({ 
  comicId, 
  comic = null,
  size = 'thumbnail', 
  fallback = null, 
  onClick = null, 
  lazy = true,
  alt = null,
  className = ''
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isInView, setIsInView] = useState(!lazy)
  const [currentImageUrl, setCurrentImageUrl] = useState(null)
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  // Get fallback strategy based on comic
  const fallbackStrategy = getCoverFallbackStrategy(comic, null)
  const effectiveAlt = alt || fallbackStrategy.altText

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || isInView) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.disconnect()
          }
        })
      },
      {
        rootMargin: '50px' // Start loading 50px before the image comes into view
      }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
      observerRef.current = observer
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [lazy, isInView])

  // Load image dynamically when needed
  useEffect(() => {
    let mounted = true
    let blobUrl = null

    async function loadImage() {
      console.log('[CoverImage] loadImage called:', { comicId, isInView })
      
      // If we have a comicId, try fetching from API
      if (comicId && isInView) {
        console.log('[CoverImage] Attempting to fetch from API:', { comicId, size })
        try {
          setIsLoading(true)
          blobUrl = await ImageURLService.getImageUrl(comicId, size)
          console.log('[CoverImage] API fetch result:', blobUrl ? 'success' : 'null')
          
          if (mounted && blobUrl) {
            setCurrentImageUrl(blobUrl)
            setHasError(false)
          } else if (mounted) {
            setCurrentImageUrl(fallbackStrategy.placeholderUrl)
            setIsLoading(false)
          }
        } catch (error) {
          console.error('[CoverImage] Failed to load image from API:', error)
          if (mounted) {
            setCurrentImageUrl(fallbackStrategy.placeholderUrl)
            setIsLoading(false)
            setHasError(true)
          }
        }
        return
      }

      // No cover available, use placeholder
      console.log('[CoverImage] No cover available, using placeholder')
      if (mounted) {
        setCurrentImageUrl(fallbackStrategy.placeholderUrl)
        setIsLoading(false)
        setHasError(false)
      }
    }

    if (isInView) {
      loadImage()
    }

    return () => {
      mounted = false
      // Note: blob URLs are auto-revoked by ImageURLService
    }
  }, [comicId, size, isInView, fallbackStrategy.placeholderUrl])

  const handleImageLoad = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleImageError = () => {
    setIsLoading(false)
    
    // Try fallback chain: primary -> fallback -> placeholder
    if (currentImageUrl === fallbackStrategy.primaryUrl && fallbackStrategy.fallbackUrl) {
      setCurrentImageUrl(fallbackStrategy.fallbackUrl)
      setIsLoading(true)
    } else if (currentImageUrl === fallbackStrategy.fallbackUrl && fallbackStrategy.placeholderUrl) {
      setCurrentImageUrl(fallbackStrategy.placeholderUrl)
      setIsLoading(true)
    } else {
      setHasError(true)
    }
  }

  const handleClick = () => {
    if (onClick && !isLoading && !hasError) {
      onClick()
    }
  }

  const getSizeClass = () => {
    switch (size) {
      case 'thumbnail':
        return 'cover-image--thumbnail'
      case 'medium':
        return 'cover-image--medium'
      case 'full':
        return 'cover-image--full'
      default:
        return 'cover-image--thumbnail'
    }
  }

  const shouldShowImage = isInView && currentImageUrl && !hasError
  const shouldShowPlaceholder = !currentImageUrl || hasError

  return (
    <div 
      ref={imgRef}
      className={`cover-image ${getSizeClass()} ${className} ${onClick ? 'cover-image--clickable' : ''}`}
      onClick={handleClick}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : -1}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* Loading indicator */}
      {isLoading && shouldShowImage && (
        <div className="cover-image__loading">
          <div className="cover-image__spinner"></div>
        </div>
      )}

      {/* Main image or fallback */}
      {shouldShowImage && (
        <img
          src={currentImageUrl}
          alt={effectiveAlt}
          className="cover-image__img"
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading={lazy ? 'lazy' : 'eager'}
        />
      )}

      {/* Placeholder when no image or error state */}
      {shouldShowPlaceholder && (
        <div className="cover-image__placeholder">
          <div className="cover-image__placeholder-icon">
            {hasError ? '⚠️' : '📚'}
          </div>
          <div className="cover-image__placeholder-text">
            {hasError ? 'Failed to load' : 'No Cover Available'}
          </div>
        </div>
      )}
    </div>
  )
}

export default CoverImage