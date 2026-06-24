import React, { useEffect, useRef, useState } from 'react'
import CoverImage from './CoverImage'
import './CoverModal.css'

/**
 * CoverModal component for full-size cover viewing
 * Provides keyboard navigation, accessibility features, cover metadata display,
 * and cover management options including replacement and removal
 */
function CoverModal({ 
  comic, 
  isOpen, 
  onClose, 
  onCoverChange = null,
  onCoverReplace = null,
  onCoverRemove = null,
  availableCovers = [],
  isManagementEnabled = true
}) {
  const modalRef = useRef(null)
  const closeButtonRef = useRef(null)
  const fileInputRef = useRef(null)
  
  const [showManagementOptions, setShowManagementOptions] = useState(false)
  const [selectedCoverIndex, setSelectedCoverIndex] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          break
        case 'Tab':
          // Trap focus within modal
          const focusableElements = modalRef.current?.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          if (focusableElements && focusableElements.length > 0) {
            const firstElement = focusableElements[0]
            const lastElement = focusableElements[focusableElements.length - 1]
            
            if (event.shiftKey && document.activeElement === firstElement) {
              event.preventDefault()
              lastElement.focus()
            } else if (!event.shiftKey && document.activeElement === lastElement) {
              event.preventDefault()
              firstElement.focus()
            }
          }
          break
        default:
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    // Focus the close button when modal opens
    if (closeButtonRef.current) {
      closeButtonRef.current.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen || !comic) {
    return null
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !onCoverReplace) return

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image file (JPEG, PNG, or WebP)')
      return
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      alert('File size must be less than 5MB')
      return
    }

    setIsUploading(true)
    try {
      await onCoverReplace(comic.id, file)
      setShowManagementOptions(false)
    } catch (error) {
      console.error('Cover upload failed:', error)
      alert('Failed to upload cover. Please try again.')
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleCoverRemove = async () => {
    if (!onCoverRemove) return
    
    const confirmed = window.confirm('Are you sure you want to remove this cover? This action cannot be undone.')
    if (!confirmed) return

    try {
      await onCoverRemove(comic.id)
      onClose()
    } catch (error) {
      console.error('Cover removal failed:', error)
      alert('Failed to remove cover. Please try again.')
    }
  }

  const handleCoverVariantSelect = (coverIndex) => {
    setSelectedCoverIndex(coverIndex)
    if (onCoverChange && availableCovers[coverIndex]) {
      onCoverChange(comic.id, availableCovers[coverIndex])
    }
  }

  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  const formatCoverMetadata = () => {
    const metadata = []
    
    if (comic.series) {
      metadata.push(`Series: ${comic.series}`)
    }
    
    if (comic.issueNumber) {
      metadata.push(`Issue: #${comic.issueNumber}`)
    }
    
    if (comic.publisher) {
      metadata.push(`Publisher: ${comic.publisher}`)
    }
    
    if (comic.publicationDate) {
      const date = new Date(comic.publicationDate)
      if (!isNaN(date.getTime())) {
        metadata.push(`Published: ${date.toLocaleDateString()}`)
      }
    }

    if (comic.coverSource) {
      const sourceLabel = comic.coverSource === 'upload' ? 'User Upload' : 
                         comic.coverSource === 'api' ? 'External API' : 'Manual Entry'
      metadata.push(`Cover Source: ${sourceLabel}`)
    }

    if (comic.coverSourceProvider) {
      metadata.push(`Provider: ${comic.coverSourceProvider}`)
    }

    return metadata
  }

  return (
    <div 
      className="cover-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-modal-title"
      aria-describedby="cover-modal-description"
    >
      <div 
        ref={modalRef}
        className="cover-modal"
      >
        {/* Modal Header */}
        <div className="cover-modal__header">
          <h2 id="cover-modal-title" className="cover-modal__title">
            {comic.series} {comic.issueNumber ? `#${comic.issueNumber}` : ''}
          </h2>
          <button
            ref={closeButtonRef}
            className="cover-modal__close"
            onClick={onClose}
            aria-label="Close cover modal"
            type="button"
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div className="cover-modal__content">
          {/* Cover Image */}
          <div className="cover-modal__image-container">
            <CoverImage
              comicId={comic.id}
              comic={comic}
              size="full"
              lazy={false}
              alt={`Cover of ${comic.series} ${comic.issueNumber ? `#${comic.issueNumber}` : ''}`}
              className="cover-modal__image"
            />
          </div>

          {/* Cover Metadata */}
          <div className="cover-modal__metadata">
            <h3 className="cover-modal__metadata-title">Cover Information</h3>
            <div id="cover-modal-description" className="cover-modal__metadata-list">
              {formatCoverMetadata().map((item, index) => (
                <div key={index} className="cover-modal__metadata-item">
                  {item}
                </div>
              ))}
            </div>

            {comic.coverAttribution && (
              <div className="cover-modal__attribution">
                <small>
                  <strong>Attribution:</strong> {comic.coverAttribution}
                </small>
              </div>
            )}

            {comic.coverOriginalUrl && (
              <div className="cover-modal__source-link">
                <a 
                  href={comic.coverOriginalUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="cover-modal__external-link"
                >
                  View Original Source
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Cover Management Section */}
        {isManagementEnabled && (
          <div className="cover-modal__management">
            <div className="cover-modal__management-header">
              <h3 className="cover-modal__management-title">Cover Management</h3>
              <button
                className="cover-modal__toggle-management"
                onClick={() => setShowManagementOptions(!showManagementOptions)}
                aria-expanded={showManagementOptions}
                type="button"
              >
                {showManagementOptions ? 'Hide Options' : 'Show Options'}
              </button>
            </div>

            {showManagementOptions && (
              <div className="cover-modal__management-content">
                {/* Cover Replacement */}
                <div className="cover-modal__management-section">
                  <h4 className="cover-modal__section-title">Replace Cover</h4>
                  <p className="cover-modal__section-description">
                    Upload a new cover image to replace the current one
                  </p>
                  <div className="cover-modal__management-actions">
                    <button
                      className="cover-modal__action-button cover-modal__action-button--primary"
                      onClick={triggerFileUpload}
                      disabled={isUploading}
                      type="button"
                    >
                      {isUploading ? 'Uploading...' : 'Upload New Cover'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                      aria-label="Select cover image file"
                    />
                  </div>
                </div>

                {/* Cover Variants */}
                {availableCovers && availableCovers.length > 1 && (
                  <div className="cover-modal__management-section">
                    <h4 className="cover-modal__section-title">Available Variants</h4>
                    <p className="cover-modal__section-description">
                      Select from available cover variants
                    </p>
                    <div className="cover-modal__variants">
                      {availableCovers.map((cover, index) => (
                        <div
                          key={index}
                          className={`cover-modal__variant ${
                            index === selectedCoverIndex ? 'cover-modal__variant--selected' : ''
                          }`}
                        >
                          <button
                            className="cover-modal__variant-button"
                            onClick={() => handleCoverVariantSelect(index)}
                            type="button"
                            aria-label={`Select cover variant ${index + 1}`}
                          >
                            <img
                              src={cover.thumbnailUrl || cover.imageUrl}
                              alt={`Cover variant ${index + 1}`}
                              className="cover-modal__variant-image"
                            />
                          </button>
                          <div className="cover-modal__variant-info">
                            <div className="cover-modal__variant-quality">
                              Quality: {cover.quality || 'Unknown'}
                            </div>
                            {cover.variant && (
                              <div className="cover-modal__variant-type">
                                {cover.variant}
                              </div>
                            )}
                            {cover.provider && (
                              <div className="cover-modal__variant-provider">
                                Source: {cover.provider}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cover Source Information */}
                <div className="cover-modal__management-section">
                  <h4 className="cover-modal__section-title">Source Information</h4>
                  <div className="cover-modal__source-info">
                    <div className="cover-modal__source-item">
                      <strong>Source Type:</strong> {
                        comic.coverSource === 'upload' ? 'User Upload' :
                        comic.coverSource === 'api' ? 'External API' :
                        comic.coverSource === 'manual' ? 'Manual Entry' : 'Unknown'
                      }
                    </div>
                    {comic.coverSourceProvider && (
                      <div className="cover-modal__source-item">
                        <strong>Provider:</strong> {comic.coverSourceProvider}
                      </div>
                    )}
                    {comic.coverLastUpdated && (
                      <div className="cover-modal__source-item">
                        <strong>Last Updated:</strong> {new Date(comic.coverLastUpdated).toLocaleDateString()}
                      </div>
                    )}
                    {comic.coverOriginalUrl && (
                      <div className="cover-modal__source-item">
                        <strong>Original URL:</strong>{' '}
                        <a
                          href={comic.coverOriginalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cover-modal__source-link"
                        >
                          View Source
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cover Removal */}
                <div className="cover-modal__management-section cover-modal__management-section--danger">
                  <h4 className="cover-modal__section-title">Remove Cover</h4>
                  <p className="cover-modal__section-description">
                    Permanently remove the current cover image
                  </p>
                  <div className="cover-modal__management-actions">
                    <button
                      className="cover-modal__action-button cover-modal__action-button--danger"
                      onClick={handleCoverRemove}
                      type="button"
                    >
                      Remove Cover
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="cover-modal__actions">
          <button
            className="cover-modal__action-button cover-modal__action-button--secondary"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default CoverModal