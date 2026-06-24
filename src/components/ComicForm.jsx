import React, { useState, useEffect } from 'react'
import dataStore from '../utils/dataStore'
import CoverUploader from './CoverUploader'
import CoverSelector from './CoverSelector'

import CoverAPISettings from './CoverAPISettings'

import imagePipeline from '../utils/imagePipeline'
import coverAPIService from '../utils/coverAPIService'
import coverMetadataService from '../utils/coverMetadataService'
import { apiFetch } from '../utils/apiClient'
import './ComicForm.css'

function ComicForm({ onAdd, existingSeries = [], existingPublishers = [], existingComics = [] }) {
  const [formData, setFormData] = useState({
    series: '',
    issueNumber: '',
    publisher: '',
    year: '',
    variant: '',
    notes: '',
    volumeId: '',
    volumeName: ''
  })
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false)
  const [filteredSeries, setFilteredSeries] = useState([])
  const [showPublisherDropdown, setShowPublisherDropdown] = useState(false)
  const [filteredPublishers, setFilteredPublishers] = useState([])
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [coverData, setCoverData] = useState(null)
  const [coverError, setCoverError] = useState(null)
  const [isProcessingCover, setIsProcessingCover] = useState(false)
  const [isSearchingCovers, setIsSearchingCovers] = useState(false)
  const [coverSearchResults, setCoverSearchResults] = useState([])
  const [showCoverSelector, setShowCoverSelector] = useState(false)
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(true)
  const [showAPISettings, setShowAPISettings] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check for duplicates when series or issue number changes
  useEffect(() => {
    if (formData.series && formData.issueNumber && existingComics.length > 0) {
      const duplicate = dataStore.checkForDuplicate(formData, existingComics)
      if (duplicate) {
        setDuplicateWarning({
          series: duplicate.series,
          issueNumber: duplicate.issueNumber,
          dateAdded: duplicate.dateAdded
        })
      } else {
        setDuplicateWarning(null)
      }
    } else {
      setDuplicateWarning(null)
    }
  }, [formData.series, formData.issueNumber, existingComics])

  // Auto-fetch covers when series and issue are filled
  useEffect(() => {
    if (autoFetchEnabled && 
        formData.series && 
        formData.issueNumber && 
        !coverData && 
        !isSearchingCovers) {
      
      // Debounce the search to avoid too many API calls
      const searchTimeout = setTimeout(() => {
        searchForCovers()
      }, 1000)

      return () => clearTimeout(searchTimeout)
    }
  }, [formData.series, formData.issueNumber, formData.publisher, autoFetchEnabled, coverData, isSearchingCovers])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.series || !formData.issueNumber) {
      alert('Please fill in at least the series and issue number')
      return
    }

    // Prepare comic data with cover information
    const comicData = {
      ...formData,
      issueNumber: parseInt(formData.issueNumber) || formData.issueNumber
    }

    // Add cover data if available
    if (coverData) {
      comicData.coverData = coverData
      comicData.hasCover = true
      comicData.coverSource = coverData.metadata?.source || 'upload'
      
      // Store cover metadata for source tracking
      if (coverData.metadata) {
        coverMetadataService.storeCoverMetadata(comicData.id || `temp_${Date.now()}`, coverData.metadata)
          .catch(error => console.error('Error storing cover metadata:', error))
      }
    }

    try {
      setIsSubmitting(true)
      await onAdd(comicData)

      // Reset form
      setFormData({
        series: '',
        issueNumber: '',
        publisher: '',
        year: '',
        variant: '',
        notes: '',
        volumeId: '',
        volumeName: ''
      })
      setCoverData(null)
      setCoverError(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    // Handle series autocomplete
    if (name === 'series') {
      if (value.length > 0) {
        // existingSeries is already sorted from App.jsx using getSortedUniqueSeriesNames
        const filtered = existingSeries.filter(series =>
          series.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredSeries(filtered)
        setShowSeriesDropdown(filtered.length > 0)
      } else {
        setShowSeriesDropdown(false)
      }
    }

    // Handle publisher autocomplete
    if (name === 'publisher') {
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

  const selectSeries = (series) => {
    setFormData(prev => ({
      ...prev,
      series: series
    }))
    setShowSeriesDropdown(false)
  }

  const handleSeriesFocus = () => {
    if (existingSeries.length > 0 && formData.series === '') {
      // existingSeries is already sorted from App.jsx
      setFilteredSeries(existingSeries)
      setShowSeriesDropdown(true)
    }
  }

  const handleSeriesBlur = () => {
    // Delay hiding dropdown to allow for clicks
    setTimeout(() => setShowSeriesDropdown(false), 200)
  }

  const selectPublisher = (publisher) => {
    setFormData(prev => ({
      ...prev,
      publisher: publisher
    }))
    setShowPublisherDropdown(false)
  }

  const handlePublisherFocus = () => {
    if (existingPublishers.length > 0 && formData.publisher === '') {
      setFilteredPublishers(existingPublishers)
      setShowPublisherDropdown(true)
    }
  }

  const handlePublisherBlur = () => {
    // Delay hiding dropdown to allow for clicks
    setTimeout(() => setShowPublisherDropdown(false), 200)
  }

  // Cover upload handlers
  const handleCoverUploadComplete = async (uploadResult) => {
    if (uploadResult.removed) {
      setCoverData(null)
      setCoverError(null)
      return
    }

    setIsProcessingCover(true)
    setCoverError(null)

    try {
      // Process the uploaded image through the pipeline
      const processedResult = await imagePipeline.processCoverImage(uploadResult.file, {
        comicId: `temp_${Date.now()}`,
        generateThumbnails: true,
        optimizeForWeb: true,
        onProgress: (progress) => {
          console.log('Processing cover:', progress)
        }
      })

      setCoverData({
        processId: processedResult.processId,
        originalFile: uploadResult.file,
        processed: processedResult.processed,
        urls: processedResult.urls,
        metadata: {
          ...processedResult.metadata,
          source: 'upload',
          sourceDetails: {
            originalFilename: uploadResult.file.name,
            fileSize: uploadResult.file.size,
            mimeType: uploadResult.file.type,
            uploadedAt: new Date().toISOString()
          }
        },
        previewUrl: uploadResult.previewUrl
      })

    } catch (error) {
      console.error('Error processing cover:', error)
      setCoverError(error.message)
    } finally {
      setIsProcessingCover(false)
    }
  }

  const handleCoverUploadError = (error) => {
    setCoverError(error)
    setCoverData(null)
  }

  // Search for covers using the Cover API service
  const searchForCovers = async () => {
    if (!formData.series || !formData.issueNumber) return

    setIsSearchingCovers(true)
    setCoverError(null)

    try {
      // Parse issue number to handle annuals and special formats
      // IMPORTANT: Always use issueParser before searching to ensure proper format
      // See docs/COVER_SEARCH_SYSTEM.md for details
      const { parseIssueForSearch } = await import('../utils/issueParser')
      const { series: searchSeries, issue: searchIssue } = parseIssueForSearch(formData.series, formData.issueNumber)
      
      console.log('Searching for covers:', {
        series: searchSeries,
        issue: searchIssue,
        publisher: formData.publisher,
        year: formData.year,
        original: { series: formData.series, issue: formData.issueNumber }
      })

      // Another account may have already added this issue — reuse its
      // cached metadata/cover instead of calling ComicVine again.
      const lookupParams = new URLSearchParams({
        series: searchSeries,
        issueNumber: searchIssue,
        publisher: formData.publisher || '',
        variant: formData.variant || ''
      })
      const lookupResponse = await apiFetch(`/api/comics/metadata-lookup?${lookupParams}`)
      const lookupResult = lookupResponse.ok ? await lookupResponse.json() : null

      if (lookupResult?.metadata?.hasCover) {
        console.log('Found existing shared cover, skipping ComicVine search:', lookupResult.metadata)
        if (lookupResult.metadata.volumeName) {
          setFormData(prev => ({
            ...prev,
            volumeId: lookupResult.metadata.volumeId || '',
            volumeName: lookupResult.metadata.volumeName || ''
          }))
        }
        setCoverError(null)
        // No coverData to upload (the cover is already saved on the shared
        // metadata record) — stop the auto-fetch effect from retrying, since
        // it only stops once coverData is set or auto-fetch is disabled.
        setAutoFetchEnabled(false)
        return
      }

      const results = await coverAPIService.searchCovers(
        searchSeries,
        searchIssue,
        formData.publisher,
        formData.year
      )

      console.log('Cover search results:', results)

      if (results.length === 0) {
        console.log('No covers found for', formData.series, formData.issueNumber)
        setCoverError('No covers found for this comic. You can upload a cover manually.')
        // Without this, the auto-fetch effect's guard (!coverData) stays
        // satisfied forever and re-triggers the same failed search every
        // second since coverData never gets set on this path.
        setAutoFetchEnabled(false)
        return
      }

      if (results.length === 1) {
        // Auto-select single result
        await handleAutoSelectCover(results[0])
      } else {
        // Show selector for multiple results
        setCoverSearchResults(results)
        setShowCoverSelector(true)
      }

    } catch (error) {
      console.error('Cover search error:', error)

      if (error.message.includes('service is not available') || error.message.includes('backend server')) {
        setCoverError('Cover search service is not available. Please ensure the backend server is running, or upload covers manually.')
      } else if (error.message.includes('backend proxy') || error.message.includes('CORS')) {
        setCoverError('Cover search requires a backend server. For now, you can upload covers manually using the upload button below.')
      } else {
        setCoverError(`Cover search failed: ${error.message}`)
      }
      // Same loop-prevention as the zero-results path above — a failed
      // search never sets coverData, so auto-fetch must be disabled here
      // too or the effect retries the same failing search every second.
      setAutoFetchEnabled(false)
    } finally {
      setIsSearchingCovers(false)
    }
  }

  // Auto-select a single cover result
  const handleAutoSelectCover = async (coverResult) => {
    setIsProcessingCover(true)
    setCoverError(null)

    try {
      const coverBlob = await coverAPIService.downloadCover(
        coverResult.imageUrl,
        `temp_${Date.now()}`
      )

      // Process the downloaded cover through the pipeline
      const processedResult = await imagePipeline.processCoverImage(coverBlob, {
        comicId: `temp_${Date.now()}`,
        generateThumbnails: true,
        optimizeForWeb: true,
        onProgress: (progress) => {
          console.log('Processing auto-fetched cover:', progress)
        }
      })

      setCoverData({
        processId: processedResult.processId,
        originalFile: coverBlob,
        processed: processedResult.processed,
        urls: processedResult.urls,
        metadata: {
          ...processedResult.metadata,
          source: 'api',
          provider: coverResult.provider,
          providerName: coverResult.providerName,
          originalUrl: coverResult.imageUrl,
          attribution: coverResult.attribution,
          licenseInfo: coverResult.licenseInfo,
          apiId: coverResult.id,
          variant: coverResult.variant,
          quality: coverResult.quality,
          dimensions: coverResult.dimensions,
          downloadedAt: new Date().toISOString(),
          volumeId: coverResult.metadata?.volumeId,
          volumeName: coverResult.metadata?.volumeName
        },
        previewUrl: URL.createObjectURL(coverBlob)
      })

      // Auto-populate volume fields in form
      if (coverResult.metadata?.volumeName) {
        setFormData(prev => ({
          ...prev,
          volumeId: coverResult.metadata.volumeId || '',
          volumeName: coverResult.metadata.volumeName || ''
        }))
      }

    } catch (error) {
      console.error('Error auto-selecting cover:', error)
      setCoverError(`Failed to download cover: ${error.message}`)
    } finally {
      setIsProcessingCover(false)
    }
  }

  // Handle cover selection from the selector modal
  const handleCoverSelect = async (selectedCoverData) => {
    setShowCoverSelector(false)
    setIsProcessingCover(true)
    setCoverError(null)

    try {
      // Process the selected cover through the pipeline
      const processedResult = await imagePipeline.processCoverImage(selectedCoverData.blob, {
        comicId: `temp_${Date.now()}`,
        generateThumbnails: true,
        optimizeForWeb: true,
        onProgress: (progress) => {
          console.log('Processing selected cover:', progress)
        }
      })

      setCoverData({
        processId: processedResult.processId,
        originalFile: selectedCoverData.blob,
        processed: processedResult.processed,
        urls: processedResult.urls,
        metadata: {
          ...processedResult.metadata,
          ...selectedCoverData.metadata
        },
        previewUrl: selectedCoverData.previewUrl
      })

      // Auto-populate volume fields in form
      if (selectedCoverData.metadata?.volumeName) {
        setFormData(prev => ({
          ...prev,
          volumeId: selectedCoverData.metadata.volumeId || '',
          volumeName: selectedCoverData.metadata.volumeName || ''
        }))
      }

    } catch (error) {
      console.error('Error processing selected cover:', error)
      setCoverError(`Failed to process cover: ${error.message}`)
    } finally {
      setIsProcessingCover(false)
    }
  }

  // Handle canceling cover selection
  const handleCoverSelectCancel = () => {
    setShowCoverSelector(false)
    setCoverSearchResults([])
  }

  // Manual cover search trigger
  const handleManualCoverSearch = () => {
    if (!formData.series || !formData.issueNumber) {
      setCoverError('Please enter series and issue number first')
      return
    }
    searchForCovers()
  }

  // Toggle auto-fetch
  const handleToggleAutoFetch = () => {
    setAutoFetchEnabled(!autoFetchEnabled)
  }

  return (
    <div className="comic-form">
      <h2>Add Comic to Collection</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="series">Series *</label>
          <div className="series-input-container">
            <input
              type="text"
              id="series"
              name="series"
              value={formData.series}
              onChange={handleChange}
              onFocus={handleSeriesFocus}
              onBlur={handleSeriesBlur}
              placeholder="e.g., Amazing Spider-Man"
              required
              autoComplete="off"
            />
            {showSeriesDropdown && (
              <div className="series-dropdown">
                {filteredSeries.map((series, index) => (
                  <div
                    key={index}
                    className="series-option"
                    onClick={() => selectSeries(series)}
                  >
                    {series}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="issueNumber">Issue Number *</label>
          <input
            type="text"
            id="issueNumber"
            name="issueNumber"
            value={formData.issueNumber}
            onChange={handleChange}
            placeholder="e.g., 1, 1.1, Annual 1"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="publisher">Publisher</label>
          <div className="publisher-input-container">
            <input
              type="text"
              id="publisher"
              name="publisher"
              value={formData.publisher}
              onChange={handleChange}
              onFocus={handlePublisherFocus}
              onBlur={handlePublisherBlur}
              placeholder="e.g., Marvel, DC, Image"
              autoComplete="off"
            />
            {showPublisherDropdown && (
              <div className="publisher-dropdown">
                {filteredPublishers.map((publisher, index) => (
                  <div
                    key={index}
                    className="publisher-option"
                    onClick={() => selectPublisher(publisher)}
                  >
                    {publisher}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="year">Year</label>
          <input
            type="number"
            id="year"
            name="year"
            value={formData.year}
            onChange={handleChange}
            placeholder="e.g., 2023"
            min="1900"
            max="2030"
          />
        </div>

        {formData.volumeName && (
          <div className="form-group volume-info">
            <label htmlFor="volumeName">Volume (from ComicVine)</label>
            <input
              type="text"
              id="volumeName"
              name="volumeName"
              value={formData.volumeName}
              readOnly
              className="readonly-field"
              title={`Volume ID: ${formData.volumeId || 'N/A'}`}
            />
            <small className="field-hint">Auto-populated from cover search</small>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="variant">Variant/Cover</label>
          <input
            type="text"
            id="variant"
            name="variant"
            value={formData.variant}
            onChange={handleChange}
            placeholder="e.g., Variant A, McFarlane Cover"
          />
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Any additional notes..."
            rows="3"
          />
        </div>

        <div className="form-group">
          <div className="cover-section">
            <div className="cover-section-header">
              <label>Cover Image</label>
              <div className="cover-controls">
                <label className="auto-fetch-toggle">
                  <input
                    type="checkbox"
                    checked={autoFetchEnabled}
                    onChange={handleToggleAutoFetch}
                  />
                  <span>Auto-fetch covers</span>
                </label>
                {formData.series && formData.issueNumber && (
                  <>
                    <button
                      type="button"
                      onClick={handleManualCoverSearch}
                      className="search-covers-btn"
                      disabled={isSearchingCovers || isProcessingCover || isSubmitting}
                    >
                      {isSearchingCovers ? 'Searching...' : '🔍 Search Covers'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAPISettings(true)}
                      className="settings-btn"
                      title="Configure API Settings"
                      disabled={isSubmitting}
                    >
                      ⚙️
                    </button>
                  </>
                )}
              </div>
            </div>

            <CoverUploader
              comicId={`form_${Date.now()}`}
              onUploadComplete={handleCoverUploadComplete}
              onUploadError={handleCoverUploadError}
              currentCover={coverData?.previewUrl}
              currentCoverData={coverData}
              disabled={isProcessingCover || isSearchingCovers}
            />

            {isSearchingCovers && (
              <div className="cover-searching">
                <span className="searching-icon">🔍</span>
                <span>Searching for covers...</span>
              </div>
            )}

            {coverError && (
              <div className="cover-error">
                <span className="error-icon">⚠️</span>
                <span>{coverError}</span>
              </div>
            )}

            {coverData && (
              <div className="cover-success">
                <span className="success-icon">✅</span>
                <span>
                  Cover {coverData.metadata?.source === 'api' ? 'downloaded' : 'processed'} successfully
                  {coverData.metadata?.providerName && (
                    <span className="cover-provider"> from {coverData.metadata.providerName}</span>
                  )}
                </span>
                {coverData.metadata?.totalStorageSize && (
                  <span className="cover-size">
                    ({(coverData.metadata.totalStorageSize / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {duplicateWarning && (
          <div className="duplicate-warning">
            <div className="warning-icon">⚠️</div>
            <div className="warning-content">
              <strong>Potential Duplicate Detected</strong>
              <p>
                A comic with the same series and issue number already exists:
                <br />
                <strong>"{duplicateWarning.series} #{duplicateWarning.issueNumber}"</strong>
                <br />
                <small>Added: {new Date(duplicateWarning.dateAdded).toLocaleDateString()}</small>
              </p>
              <p className="warning-note">
                You can still add this comic, but you'll be asked to confirm.
              </p>
            </div>
          </div>
        )}

        <button type="submit" className="submit-btn" disabled={isSubmitting || isSearchingCovers || isProcessingCover}>
          {isSubmitting ? 'Saving Comic...' : 'Add to Collection'}
        </button>
      </form>

      <CoverSelector
        coverResults={coverSearchResults}
        onCoverSelect={handleCoverSelect}
        onCancel={handleCoverSelectCancel}
        isVisible={showCoverSelector}
        comicInfo={{
          series: formData.series,
          issueNumber: formData.issueNumber,
          publisher: formData.publisher
        }}
      />

      <CoverAPISettings
        isVisible={showAPISettings}
        onClose={() => setShowAPISettings(false)}
      />
    </div>
  )
}

export default ComicForm
