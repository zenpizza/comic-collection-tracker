import React, { useState } from 'react'
import './CoverPreview.css'

function CoverPreview({ 
  coverData, 
  onReplace, 
  onRemove, 
  size = 'medium',
  showControls = true,
  onClick = null 
}) {
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  if (!coverData || imageError) {
    return (
      <div className={`cover-preview cover-preview-${size} no-cover`}>
        <div className="no-cover-content">
          <span className="no-cover-icon">📖</span>
          <span className="no-cover-text">No Cover</span>
        </div>
      </div>
    )
  }

  const handleImageLoad = () => {
    setIsLoading(false)
  }

  const handleImageError = () => {
    setImageError(true)
    setIsLoading(false)
  }

  const handleClick = () => {
    if (onClick) {
      onClick(coverData)
    }
  }

  const handleReplace = (e) => {
    e.stopPropagation()
    onReplace?.(coverData)
  }

  const handleRemove = (e) => {
    e.stopPropagation()
    onRemove?.(coverData)
  }

  // Determine which URL to use based on size
  const getImageUrl = () => {
    if (coverData.urls?.sizes?.[size]) {
      return coverData.urls.sizes[size]
    }
    if (coverData.urls?.optimized) {
      return coverData.urls.optimized
    }
    if (coverData.previewUrl) {
      return coverData.previewUrl
    }
    return null
  }

  const imageUrl = getImageUrl()

  return (
    <div 
      className={`cover-preview cover-preview-${size} ${onClick ? 'clickable' : ''}`}
      onClick={handleClick}
    >
      {isLoading && (
        <div className="cover-loading">
          <div className="loading-spinner"></div>
        </div>
      )}
      
      <img
        src={imageUrl}
        alt="Comic cover"
        className="cover-image"
        onLoad={handleImageLoad}
        onError={handleImageError}
        style={{ display: isLoading ? 'none' : 'block' }}
      />

      {showControls && !isLoading && (
        <div className="cover-controls">
          <button
            type="button"
            className="control-btn replace-btn"
            onClick={handleReplace}
            title="Replace cover"
          >
            🔄
          </button>
          <button
            type="button"
            className="control-btn remove-btn"
            onClick={handleRemove}
            title="Remove cover"
          >
            🗑️
          </button>
        </div>
      )}

      {coverData.metadata?.original && (
        <div className="cover-info">
          <span className="cover-dimensions">
            {coverData.metadata.original.width} × {coverData.metadata.original.height}
          </span>
          {coverData.metadata.totalStorageSize && (
            <span className="cover-size">
              {(coverData.metadata.totalStorageSize / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default CoverPreview