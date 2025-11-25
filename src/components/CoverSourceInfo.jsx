import React, { useState, useEffect } from 'react'
import coverMetadataService from '../utils/coverMetadataService'
import './CoverSourceInfo.css'

function CoverSourceInfo({ 
  comicId, 
  onCoverRefetch, 
  onSourceMigration,
  isVisible = false,
  onClose 
}) {
  const [metadata, setMetadata] = useState(null)
  const [sourceHistory, setSourceHistory] = useState([])
  const [isRefetching, setIsRefetching] = useState(false)
  const [refetchError, setRefetchError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isVisible && comicId) {
      loadCoverMetadata()
    }
  }, [isVisible, comicId])

  const loadCoverMetadata = async () => {
    setIsLoading(true)
    try {
      const [metadataResult, historyResult] = await Promise.all([
        coverMetadataService.getCoverMetadata(comicId),
        coverMetadataService.getSourceHistory(comicId)
      ])
      
      setMetadata(metadataResult)
      setSourceHistory(historyResult)
    } catch (error) {
      console.error('Error loading cover metadata:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefetch = async () => {
    if (!metadata || !metadata.refetchable) return

    setIsRefetching(true)
    setRefetchError(null)

    try {
      const refetchResult = await coverMetadataService.refetchCover(comicId)
      
      if (refetchResult && refetchResult.success) {
        // Notify parent component about the new cover
        if (onCoverRefetch) {
          onCoverRefetch({
            coverBlob: refetchResult.coverBlob,
            metadata: refetchResult.metadata,
            wasUpdated: refetchResult.wasUpdated
          })
        }

        // Reload metadata to show updated information
        await loadCoverMetadata()

        if (refetchResult.wasUpdated) {
          alert('Cover has been updated with the latest version!')
        } else {
          alert('Cover re-fetched successfully (no changes detected)')
        }
      }
    } catch (error) {
      console.error('Re-fetch error:', error)
      setRefetchError(error.message)
    } finally {
      setIsRefetching(false)
    }
  }

  const handleSourceMigration = () => {
    if (onSourceMigration) {
      onSourceMigration(comicId, metadata)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getSourceIcon = (source) => {
    switch (source) {
      case 'api': return '🌐'
      case 'upload': return '📁'
      case 'manual': return '🔗'
      default: return '❓'
    }
  }

  const getQualityColor = (quality) => {
    switch (quality) {
      case 'high': return '#10b981'
      case 'medium': return '#f59e0b'
      case 'low': return '#ef4444'
      default: return '#6b7280'
    }
  }

  if (!isVisible) return null

  return (
    <div className="cover-source-overlay">
      <div className="cover-source-modal">
        <div className="cover-source-header">
          <h3>Cover Source Information</h3>
          <button 
            className="close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="cover-source-content">
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading cover information...</p>
            </div>
          ) : metadata ? (
            <>
              <div className="source-main-info">
                <div className="source-type">
                  <span className="source-icon">{getSourceIcon(metadata.source)}</span>
                  <div className="source-details">
                    <h4>
                      {metadata.source === 'api' ? 'External API' : 
                       metadata.source === 'upload' ? 'User Upload' : 
                       metadata.source === 'manual' ? 'Manual URL' : 'Unknown Source'}
                    </h4>
                    {metadata.sourceDetails?.providerName && (
                      <p className="provider-name">{metadata.sourceDetails.providerName}</p>
                    )}
                  </div>
                </div>

                <div className="source-metadata">
                  <div className="metadata-item">
                    <label>Added:</label>
                    <span>{formatDate(metadata.createdAt)}</span>
                  </div>
                  
                  {metadata.updatedAt !== metadata.createdAt && (
                    <div className="metadata-item">
                      <label>Updated:</label>
                      <span>{formatDate(metadata.updatedAt)}</span>
                    </div>
                  )}

                  {metadata.sourceDetails?.quality && (
                    <div className="metadata-item">
                      <label>Quality:</label>
                      <span 
                        className="quality-indicator"
                        style={{ color: getQualityColor(metadata.sourceDetails.quality) }}
                      >
                        {metadata.sourceDetails.quality.toUpperCase()}
                      </span>
                    </div>
                  )}

                  {metadata.sourceDetails?.dimensions?.width > 0 && (
                    <div className="metadata-item">
                      <label>Dimensions:</label>
                      <span>
                        {metadata.sourceDetails.dimensions.width} × {metadata.sourceDetails.dimensions.height}
                      </span>
                    </div>
                  )}

                  {metadata.sourceDetails?.variant && (
                    <div className="metadata-item">
                      <label>Variant:</label>
                      <span>{metadata.sourceDetails.variant}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="attribution-section">
                <h4>Attribution & Licensing</h4>
                <div className="attribution-content">
                  <p className="attribution-text">
                    {coverMetadataService.generateAttributionText(metadata)}
                  </p>
                  <p className="license-text">
                    {coverMetadataService.generateLicenseText(metadata)}
                  </p>
                  
                  {metadata.sourceDetails?.originalUrl && (
                    <div className="original-url">
                      <label>Original URL:</label>
                      <a 
                        href={metadata.sourceDetails.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="url-link"
                      >
                        {metadata.sourceDetails.originalUrl.length > 50 
                          ? metadata.sourceDetails.originalUrl.substring(0, 50) + '...'
                          : metadata.sourceDetails.originalUrl
                        }
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {sourceHistory.length > 0 && (
                <div className="source-history">
                  <h4>Source History</h4>
                  <div className="history-list">
                    {sourceHistory.map((entry, index) => (
                      <div key={index} className="history-item">
                        <span className="history-icon">{getSourceIcon(entry.source)}</span>
                        <div className="history-details">
                          <div className="history-action">
                            {entry.action === 'created' ? 'Added' : 'Updated'} from{' '}
                            {entry.providerName || entry.source}
                          </div>
                          <div className="history-date">
                            {formatDate(entry.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {refetchError && (
                <div className="refetch-error">
                  <span className="error-icon">⚠️</span>
                  <span>Re-fetch failed: {refetchError}</span>
                </div>
              )}

              <div className="source-actions">
                {metadata.refetchable && (
                  <button
                    className="refetch-btn"
                    onClick={handleRefetch}
                    disabled={isRefetching}
                  >
                    {isRefetching ? 'Re-fetching...' : '🔄 Re-fetch Cover'}
                  </button>
                )}
                
                <button
                  className="migrate-btn"
                  onClick={handleSourceMigration}
                >
                  🔄 Change Source
                </button>
              </div>
            </>
          ) : (
            <div className="no-metadata">
              <p>No source information available for this cover.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CoverSourceInfo