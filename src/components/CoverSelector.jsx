import React, { useState } from 'react'
import coverErrorHandler from '../utils/errorHandling.js'
import ErrorFeedback from './ErrorFeedback'
import './CoverSelector.css'

function CoverSelector({ 
  coverResults = [], 
  onCoverSelect, 
  onCancel, 
  isVisible = false,
  comicInfo = {} 
}) {
  const [selectedCover, setSelectedCover] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)
  const [currentError, setCurrentError] = useState(null)

  if (!isVisible || coverResults.length === 0) {
    return null
  }

  const handleCoverClick = (cover) => {
    setSelectedCover(cover)
    setDownloadError(null)
    setCurrentError(null)
  }

  const handleConfirmSelection = async () => {
    if (!selectedCover) return

    setIsDownloading(true)
    setDownloadError(null)
    setCurrentError(null)

    try {
      // Import the cover API service
      const { default: coverAPIService } = await import('../utils/coverAPIService')
      
      // Download the selected cover with error handling
      const downloadOperation = coverErrorHandler.withErrorHandling(
        coverAPIService.downloadCover.bind(coverAPIService),
        {
          operation: 'cover_download',
          provider: selectedCover.provider,
          coverUrl: selectedCover.imageUrl,
          comicInfo
        }
      )

      const coverBlob = await downloadOperation(
        selectedCover.imageUrl, 
        `temp_${Date.now()}`
      )

      // Create cover data object
      const coverData = {
        blob: coverBlob,
        metadata: {
          source: 'api',
          provider: selectedCover.provider,
          providerName: selectedCover.providerName,
          originalUrl: selectedCover.imageUrl,
          attribution: selectedCover.attribution,
          licenseInfo: selectedCover.licenseInfo,
          apiId: selectedCover.id,
          variant: selectedCover.variant,
          quality: selectedCover.quality,
          dimensions: selectedCover.dimensions,
          downloadedAt: new Date().toISOString()
        },
        previewUrl: URL.createObjectURL(coverBlob)
      }

      onCoverSelect(coverData)
    } catch (error) {
      console.error('Error downloading cover:', error)
      
      // Handle error through error handler
      const errorResult = await coverErrorHandler.handleError(error, {
        operation: 'cover_download',
        provider: selectedCover.provider,
        coverUrl: selectedCover.imageUrl,
        comicInfo
      })

      setCurrentError(errorResult.errorInfo)
      setDownloadError(errorResult.userMessage)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleSkip = () => {
    onCancel()
  }

  // Handle error recovery actions
  const handleErrorRecovery = async (action, options = {}) => {
    switch (action.action) {
      case 'retry':
        // Retry the download
        await handleConfirmSelection()
        break
        
      case 'select_different':
        // Clear selection and let user choose different cover
        setSelectedCover(null)
        setCurrentError(null)
        setDownloadError(null)
        break
        
      case 'manual_upload':
        // Close selector and trigger manual upload
        onCancel()
        // Could emit event or call callback to trigger manual upload
        break
        
      case 'skip_cover':
        // Skip cover selection
        onCancel()
        break
        
      default:
        // Dismiss error
        setCurrentError(null)
        setDownloadError(null)
    }
  }

  // Handle error dismissal
  const handleErrorDismiss = () => {
    setCurrentError(null)
    setDownloadError(null)
  }

  return (
    <div className="cover-selector-overlay">
      <div className="cover-selector-modal">
        <div className="cover-selector-header">
          <h3>Select Cover Image</h3>
          <p>
            Found {coverResults.length} cover{coverResults.length !== 1 ? 's' : ''} for{' '}
            <strong>{comicInfo.series} #{comicInfo.issueNumber}</strong>
            {comicInfo.publisher && ` (${comicInfo.publisher})`}
          </p>
        </div>

        <div className="cover-options">
          {coverResults.map((cover, index) => (
            <div
              key={`${cover.provider}-${cover.id}`}
              className={`cover-option ${selectedCover?.id === cover.id ? 'selected' : ''}`}
              onClick={() => handleCoverClick(cover)}
            >
              <div className="cover-image-container">
                <img
                  src={cover.imageUrl}
                  alt={`Cover option ${index + 1}`}
                  onError={(e) => {
                    e.target.src = '/placeholder-cover.png'
                  }}
                />
                {cover.quality && (
                  <div className={`quality-badge quality-${cover.quality}`}>
                    {cover.quality}
                  </div>
                )}
              </div>
              
              <div className="cover-details">
                <div className="cover-provider">
                  <strong>{cover.providerName}</strong>
                </div>
                {cover.variant && (
                  <div className="cover-variant">{cover.variant}</div>
                )}
                {cover.dimensions.width > 0 && (
                  <div className="cover-dimensions">
                    {cover.dimensions.width} × {cover.dimensions.height}
                  </div>
                )}
                <div className="cover-attribution">
                  {cover.attribution}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Enhanced error feedback */}
        {currentError && (
          <ErrorFeedback
            error={currentError}
            onRecoveryAction={handleErrorRecovery}
            onDismiss={handleErrorDismiss}
            autoHide={false}
          />
        )}

        {downloadError && !currentError && (
          <div className="download-error">
            <span className="error-icon">⚠️</span>
            <span>Failed to download cover: {downloadError}</span>
          </div>
        )}

        <div className="cover-selector-actions">
          <button
            type="button"
            onClick={handleSkip}
            className="skip-btn"
            disabled={isDownloading}
          >
            Skip Cover
          </button>
          <button
            type="button"
            onClick={handleConfirmSelection}
            className="select-btn"
            disabled={!selectedCover || isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Use Selected Cover'}
          </button>
        </div>

        <div className="cover-selector-note">
          <small>
            Cover images are provided by external services and may be subject to their terms of use.
            Attribution information will be stored with your comic.
          </small>
        </div>
      </div>
    </div>
  )
}

export default CoverSelector