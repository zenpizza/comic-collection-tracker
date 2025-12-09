import React, { useState, useEffect } from 'react'
import CoverImage from './CoverImage'
import CoverUploader from './CoverUploader'
import CoverSelector from './CoverSelector'
import ImageURLService from '../utils/ImageURLService'
import coverAPIService from '../utils/coverAPIService'
import { getSortedUniqueSeriesNames } from '../utils/sortUtils'
import './ComicDetailView.css'

function ComicDetailView({ comic, comics, onClose, onSave, onDelete }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    series: comic.series,
    issueNumber: comic.issueNumber,
    publisher: comic.publisher || '',
    year: comic.year || '',
    variant: comic.variant || '',
    notes: comic.notes || ''
  })
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false)
  const [filteredSeries, setFilteredSeries] = useState([])
  const [showPublisherDropdown, setShowPublisherDropdown] = useState(false)
  const [filteredPublishers, setFilteredPublishers] = useState([])
  const [showCoverManager, setShowCoverManager] = useState(false)
  const [coverManagerMode, setCoverManagerMode] = useState(null) // 'upload' or 'search'
  const [searchingCovers, setSearchingCovers] = useState(false)
  const [coverSearchResults, setCoverSearchResults] = useState([])
  const [coverRefreshKey, setCoverRefreshKey] = useState(0)
  const [showFullSizeImage, setShowFullSizeImage] = useState(false)

  useEffect(() => {
    // Close dropdowns when clicking outside
    const handleClickOutside = (e) => {
      if (!e.target.closest('.autocomplete-container')) {
        setShowSeriesDropdown(false)
        setShowPublisherDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))

    if (field === 'series') {
      const existingSeries = getSortedUniqueSeriesNames(comics)
      if (value.length > 0) {
        const filtered = existingSeries.filter(series =>
          series.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredSeries(filtered)
        setShowSeriesDropdown(filtered.length > 0)
      } else {
        setShowSeriesDropdown(false)
      }
    }

    if (field === 'publisher') {
      const existingPublishers = [...new Set(comics.map(c => c.publisher).filter(Boolean))]
      if (value.length > 0) {
        const filtered = existingPublishers.filter(publisher =>
          publisher.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredPublishers(filtered)
        setShowPublisherDropdown(filtered.length > 0)
      } else {
        setShowPublisherDropdown(false)
      }
    }
  }

  const handleSave = () => {
    if (!editForm.series || !editForm.issueNumber) {
      alert('Series and issue number are required')
      return
    }

    const updatedComic = {
      ...comic,
      ...editForm,
      issueNumber: parseInt(editForm.issueNumber) || editForm.issueNumber
    }

    onSave(updatedComic)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditForm({
      series: comic.series,
      issueNumber: comic.issueNumber,
      publisher: comic.publisher || '',
      year: comic.year || '',
      variant: comic.variant || '',
      notes: comic.notes || ''
    })
    setIsEditing(false)
  }

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${comic.series} #${comic.issueNumber}" from your collection?\n\nThis action cannot be undone.`
    )
    if (confirmed) {
      onDelete(comic.id)
      onClose()
    }
  }

  const handleSearchCovers = async () => {
    setSearchingCovers(true)
    setCoverSearchResults([])
    
    try {
      // Parse issue number to handle annuals and special formats
      // IMPORTANT: Always use issueParser before searching to ensure proper format
      // See docs/COVER_SEARCH_SYSTEM.md for details
      const { parseComicIssueForSearch } = await import('../utils/issueParser')
      const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)
      
      console.log('Searching for covers:', { 
        series: searchSeries, 
        issue: searchIssue, 
        publisher: comic.publisher,
        original: { series: comic.series, issue: comic.issueNumber }
      })
      
      const results = await coverAPIService.searchCovers(
        searchSeries,
        searchIssue,
        comic.publisher,
        comic.year
      )
      
      console.log('Cover search results:', results)
      setCoverSearchResults(results)
      setCoverManagerMode('search')
    } catch (error) {
      console.error('Error searching for covers:', error)
      alert('Failed to search for covers. Please try uploading instead.')
    } finally {
      setSearchingCovers(false)
    }
  }

  const handleCoverSelect = async (coverData) => {
    try {
      console.log('handleCoverSelect called with:', coverData)
      
      // CoverSelector returns: { blob, metadata, previewUrl }
      const metadata = coverData.metadata || {}
      
      // Use centralized cover update service (DRY principle)
      const { default: coverUpdateService } = await import('../utils/coverUpdateService.js')
      
      const result = await coverUpdateService.addCover(
        comic.id,
        coverData.blob,
        metadata
      )
      
      console.log('Cover added successfully:', result)
      
      // Update the comic with the standardized metadata
      const updatedComic = {
        ...comic,
        ...result.metadata
      }
      
      console.log('Saving updated comic metadata:', updatedComic)
      
      // Save to MongoDB
      await onSave(updatedComic)
      
      // Force CoverImage to remount and refetch from API
      setCoverRefreshKey(prev => prev + 1)
      
      // Wait a moment to ensure the component remounts before closing
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Close the cover manager
      setShowCoverManager(false)
      setCoverManagerMode(null)
      setCoverSearchResults([])
    } catch (error) {
      console.error('Error selecting cover:', error)
      alert('Failed to save selected cover. Please try again.')
    }
  }

  const handleCoverUpdate = async (uploadData) => {
    try {
      console.log('handleCoverUpdate called with:', uploadData)
      
      // Use centralized cover update service
      const { default: coverUpdateService } = await import('../utils/coverUpdateService.js')
      
      // Handle cover removal
      if (uploadData.removed) {
        console.log('Removing cover for comic:', comic.id)
        
        const result = await coverUpdateService.removeCover(comic.id)
        
        const updatedComic = {
          ...comic,
          ...result.metadata
        }
        
        // Save to MongoDB
        await onSave(updatedComic)
        
        console.log('Cover removed successfully')
        
        setShowCoverManager(false)
        setCoverManagerMode(null)
        return
      }

      // Handle new cover upload
      console.log('Uploading new cover for comic:', comic.id)
      
      // Note: uploadData from CoverUploader already has the image uploaded
      // We just need to update the metadata
      const updatedComic = {
        ...comic,
        hasCover: true,
        coverId: uploadData.uploadResult?.id || uploadData.comicId || Date.now().toString(),
        coverSource: 'upload',
        coverSourceProvider: null,
        coverOriginalUrl: null,
        coverLastUpdated: new Date().toISOString(),
        coverAttribution: null
      }
      
      console.log('Saving updated comic:', updatedComic)
      
      // Save to MongoDB
      await onSave(updatedComic)
      
      // Clear cache
      await ImageURLService.clearCache(comic.id)
      console.log('Cache invalidated successfully')
      
      // Force CoverImage to remount and re-fetch
      setCoverRefreshKey(prev => prev + 1)
      
      // Small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 200))
      
      setShowCoverManager(false)
      setCoverManagerMode(null)
    } catch (error) {
      console.error('Error updating cover:', error)
      alert('Failed to update cover. Please try again.')
    }
  }

  const handleCoverDelete = async () => {
    const confirmed = window.confirm('Are you sure you want to delete this cover image?')
    if (confirmed) {
      try {
        console.log('Deleting cover for comic:', comic.id)
        
        // Use centralized cover update service
        const { default: coverUpdateService } = await import('../utils/coverUpdateService.js')
        
        const result = await coverUpdateService.removeCover(comic.id)
        
        // Update comic metadata to remove cover references
        const updatedComic = {
          ...comic,
          ...result.metadata
        }
        
        console.log('Updated comic (cover removed):', updatedComic)
        
        // Save to MongoDB
        await onSave(updatedComic)
        
        console.log('Cover deleted successfully')
        
        // Force CoverImage to remount and show placeholder
        setCoverRefreshKey(prev => prev + 1)
        console.log('Triggered cover refresh to show placeholder')
      } catch (error) {
        console.error('Error deleting cover:', error)
        alert('Failed to delete cover. Please try again.')
      }
    }
  }

  // Trust the comic metadata - no need for separate API check
  // The CoverImage component will handle fetching if needed
  const hasCover = Boolean(comic.hasCover || comic.coverUrl || comic.coverId)
  const checkingCover = false

  return (
    <div className="comic-detail-overlay" onClick={onClose}>
      <div className="comic-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} title="Close">×</button>
        
        <div className="comic-detail-content">
          <div className="comic-detail-cover">
            <div 
              className="cover-display"
              onClick={() => hasCover && setShowFullSizeImage(true)}
              style={{ cursor: hasCover ? 'pointer' : 'default' }}
              title={hasCover ? 'Click to view full size' : ''}
            >
              <CoverImage
                key={`${comic.id}-${coverRefreshKey}`}
                comicId={comic.id}
                comic={comic}
                size="full"
                lazy={false}
              />
            </div>
            
            <div className="cover-actions">
              {checkingCover ? (
                <button className="btn btn-secondary" disabled>
                  Checking cover...
                </button>
              ) : hasCover ? (
                <>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setShowCoverManager(true)}
                  >
                    Replace Cover
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={handleCoverDelete}
                  >
                    Delete Cover
                  </button>
                </>
              ) : (
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowCoverManager(true)}
                >
                  Add Cover
                </button>
              )}
            </div>

            {comic.coverAttribution && (
              <div className="cover-attribution">
                {comic.coverAttribution}
              </div>
            )}
          </div>

          <div className="comic-detail-info">
            {isEditing ? (
              <div className="edit-form">
                <h2>Edit Comic</h2>
                
                <div className="form-group">
                  <label>Series *</label>
                  <div className="autocomplete-container">
                    <input
                      type="text"
                      value={editForm.series}
                      onChange={(e) => handleChange('series', e.target.value)}
                      className="form-input"
                      autoComplete="off"
                    />
                    {showSeriesDropdown && (
                      <div className="autocomplete-dropdown">
                        {filteredSeries.map((series, index) => (
                          <div
                            key={index}
                            className="autocomplete-option"
                            onClick={() => {
                              handleChange('series', series)
                              setShowSeriesDropdown(false)
                            }}
                          >
                            {series}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Issue Number *</label>
                  <input
                    type="text"
                    value={editForm.issueNumber}
                    onChange={(e) => handleChange('issueNumber', e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Publisher</label>
                  <div className="autocomplete-container">
                    <input
                      type="text"
                      value={editForm.publisher}
                      onChange={(e) => handleChange('publisher', e.target.value)}
                      className="form-input"
                      autoComplete="off"
                    />
                    {showPublisherDropdown && (
                      <div className="autocomplete-dropdown">
                        {filteredPublishers.map((publisher, index) => (
                          <div
                            key={index}
                            className="autocomplete-option"
                            onClick={() => {
                              handleChange('publisher', publisher)
                              setShowPublisherDropdown(false)
                            }}
                          >
                            {publisher}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Year</label>
                  <input
                    type="number"
                    value={editForm.year}
                    onChange={(e) => handleChange('year', e.target.value)}
                    className="form-input"
                    min="1900"
                    max="2030"
                  />
                </div>

                {comic.volumeName && (
                  <div className="form-group volume-info-edit">
                    <label>Volume (from ComicVine)</label>
                    <input
                      type="text"
                      value={`${comic.volumeName}${comic.volumeId ? ` (ID: ${comic.volumeId})` : ''}`}
                      readOnly
                      className="form-input readonly-field"
                      title="Volume information from ComicVine - re-fetch cover to update"
                    />
                    <small className="field-hint">Auto-populated from cover search (read-only)</small>
                  </div>
                )}

                <div className="form-group">
                  <label>Variant</label>
                  <input
                    type="text"
                    value={editForm.variant}
                    onChange={(e) => handleChange('variant', e.target.value)}
                    className="form-input"
                    placeholder="e.g., Variant A, Sketch Cover"
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    className="form-textarea"
                    rows="4"
                    placeholder="Add any notes about this comic..."
                  />
                </div>

                <div className="form-actions">
                  <button className="btn btn-primary" onClick={handleSave}>
                    Save Changes
                  </button>
                  <button className="btn btn-secondary" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="view-mode">
                <h2>{comic.series}</h2>
                
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Issue Number:</span>
                    <span className="detail-value">#{comic.issueNumber}</span>
                  </div>

                  {comic.publisher && (
                    <div className="detail-item">
                      <span className="detail-label">Publisher:</span>
                      <span className="detail-value">{comic.publisher}</span>
                    </div>
                  )}

                  {comic.year && (
                    <div className="detail-item">
                      <span className="detail-label">Year:</span>
                      <span className="detail-value">{comic.year}</span>
                    </div>
                  )}

                  {comic.volumeName && (
                    <div className="detail-item volume-info">
                      <span className="detail-label">Volume:</span>
                      <span className="detail-value" title={`Volume ID: ${comic.volumeId || 'N/A'}`}>
                        {comic.volumeName}
                        {comic.volumeId && (
                          <span className="volume-id"> (ID: {comic.volumeId})</span>
                        )}
                      </span>
                    </div>
                  )}

                  {comic.variant && (
                    <div className="detail-item">
                      <span className="detail-label">Variant:</span>
                      <span className="detail-value">{comic.variant}</span>
                    </div>
                  )}

                  {comic.notes && (
                    <div className="detail-item detail-item-full">
                      <span className="detail-label">Notes:</span>
                      <span className="detail-value">{comic.notes}</span>
                    </div>
                  )}
                </div>

                <div className="action-buttons">
                  <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
                    Edit Details
                  </button>
                  <button className="btn btn-danger" onClick={handleDelete}>
                    Delete Comic
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {showCoverManager && !coverManagerMode && (
          <div className="cover-uploader-overlay">
            <div className="cover-uploader-modal">
              <button 
                className="close-btn" 
                onClick={() => setShowCoverManager(false)}
                title="Close"
              >
                ×
              </button>
              <h2 style={{ marginBottom: '20px' }}>Choose Cover Source</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => setCoverManagerMode('upload')}
                  style={{ padding: '20px', fontSize: '16px' }}
                >
                  📁 Upload from File
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={handleSearchCovers}
                  disabled={searchingCovers}
                  style={{ padding: '20px', fontSize: '16px' }}
                >
                  {searchingCovers ? '🔍 Searching...' : '🔍 Search Cover APIs'}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowCoverManager(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showCoverManager && coverManagerMode === 'upload' && (
          <div className="cover-uploader-overlay">
            <div className="cover-uploader-modal">
              <button 
                className="close-btn" 
                onClick={() => {
                  setShowCoverManager(false)
                  setCoverManagerMode(null)
                }}
                title="Close"
              >
                ×
              </button>
              <CoverUploader
                comicId={comic.id}
                currentCover={comic.coverUrl}
                onUploadComplete={handleCoverUpdate}
                onUploadError={(error) => {
                  console.error('Cover upload error:', error)
                  alert('Failed to upload cover. Please try again.')
                }}
              />
              <button 
                className="btn btn-secondary"
                onClick={() => setCoverManagerMode(null)}
                style={{ marginTop: '10px' }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {showCoverManager && coverManagerMode === 'search' && (
          <div className="cover-uploader-overlay">
            <div className="cover-uploader-modal">
              <button 
                className="close-btn" 
                onClick={() => {
                  setShowCoverManager(false)
                  setCoverManagerMode(null)
                  setCoverSearchResults([])
                }}
                title="Close"
              >
                ×
              </button>
              <CoverSelector
                coverResults={coverSearchResults}
                onCoverSelect={handleCoverSelect}
                onCancel={() => setCoverManagerMode(null)}
                isVisible={true}
                comicInfo={{
                  series: comic.series,
                  issue: comic.issueNumber.toString(),
                  publisher: comic.publisher
                }}
              />
            </div>
          </div>
        )}

        {showFullSizeImage && hasCover && (
          <div 
            className="full-size-image-overlay" 
            onClick={() => setShowFullSizeImage(false)}
          >
            <button 
              className="close-btn" 
              onClick={() => setShowFullSizeImage(false)}
              title="Close"
            >
              ×
            </button>
            <div className="full-size-image-container">
              <CoverImage
                comicId={comic.id}
                comic={comic}
                size="full"
                lazy={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ComicDetailView
