import React, { useState, useEffect } from 'react'
import dataStore from '../utils/dataStore'
import CoverUploader from './CoverUploader'
import CoverSelector from './CoverSelector'

import CoverAPISettings from './CoverAPISettings'

import imagePipeline from '../utils/imagePipeline'
import coverAPIService from '../utils/coverAPIService'
import { apiFetch } from '../utils/apiClient'
import { applyCoverMetadataToForm } from '../utils/coverFormFill'
import { applyCreditFields, creditsToFields, groupCredits } from '../utils/credits'
import { MONTH_NAMES } from '../utils/months'
import './ComicForm.css'

const EMPTY_FORM = {
  series: '',
  issueNumber: '',
  publisher: '',
  year: '',
  month: '',
  variant: '',
  notes: '',
  volumeId: '',
  volumeName: '',
  comicVineId: '',
  credits: null,
  // Editable text for the creator inputs; turned into credits on submit
  writers: '',
  artists: ''
}

/**
 * Add Comic, look-up first (COM-55):
 *   find   — Series + Issue # (optionally year/publisher); Find on ComicVine
 *   review — the match's details pre-filled (incl. creators) for checking
 *   manual — the full form, for comics ComicVine doesn't have
 */
function ComicForm({ onAdd, existingSeries = [], existingPublishers = [], existingComics = [] }) {
  const [step, setStep] = useState('find')
  const [showRefine, setShowRefine] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)
  // Inputs as they were when Find was pressed, so Change match can undo the
  // fields the match filled in (year/publisher are also search hints)
  const [searchInputs, setSearchInputs] = useState(null)
  const [creditsStatus, setCreditsStatus] = useState(null) // 'loading' | 'error' | null
  const [libraryMatch, setLibraryMatch] = useState(false)
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
  const [showAPISettings, setShowAPISettings] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Stable for the lifetime of one form entry; regenerated after each submit
  const [uploaderComicId, setUploaderComicId] = useState(() => `form_${Date.now()}`)

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

  const resetForm = () => {
    setFormData(EMPTY_FORM)
    setStep('find')
    setShowRefine(false)
    setSearchInputs(null)
    setCreditsStatus(null)
    setLibraryMatch(false)
    setCoverData(null)
    setCoverError(null)
    setUploaderComicId(`form_${Date.now()}`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (step === 'find') {
      handleFind()
      return
    }
    if (!formData.series || !formData.issueNumber) {
      alert('Please fill in at least the series and issue number')
      return
    }

    // Prepare comic data with cover information; the creator inputs become credits
    const { writers, artists, ...fields } = formData
    const comicData = {
      ...fields,
      credits: applyCreditFields(formData.credits, { writers, artists }),
      issueNumber: parseInt(formData.issueNumber) || formData.issueNumber
    }
    if (!comicData.comicVineId) delete comicData.comicVineId

    // Add cover data if available
    if (coverData) {
      comicData.coverData = coverData
      comicData.hasCover = true
      comicData.coverSource = coverData.metadata?.source || 'upload'
      // ComicVine's issue id, when known, is a stronger identity than the
      // series/issue/publisher text composite (see buildIdentityKey)
      if (coverData.metadata?.apiId && coverData.metadata?.source === 'api') {
        comicData.comicVineId = coverData.metadata.apiId
      }
    }

    try {
      setIsSubmitting(true)
      await onAdd(comicData)
      resetForm()
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

  const handleFind = () => {
    if (!formData.series || !formData.issueNumber) {
      setCoverError('Enter the series and issue number first')
      return
    }
    setSearchInputs(formData)
    searchForCovers()
  }

  // A match was chosen: show the review step and fetch its creator credits.
  // A failed credits lookup doesn't block adding the comic.
  const handleMatched = async (comicVineId) => {
    setStep('review')
    if (!comicVineId) return
    setFormData(prev => ({ ...prev, comicVineId: String(comicVineId) }))
    setCreditsStatus('loading')
    try {
      const credits = await coverAPIService.fetchIssueCredits(comicVineId)
      // The creator inputs are editable while this runs; keep anything typed
      // and fill only the inputs still blank
      const fetched = creditsToFields(credits)
      setFormData(prev => ({
        ...prev,
        credits,
        writers: prev.writers || fetched.writers,
        artists: prev.artists || fetched.artists
      }))
      setCreditsStatus(null)
    } catch (error) {
      console.error('Credits lookup failed:', error)
      setCreditsStatus('error')
    }
  }

  // Back to the find step with the inputs from before the match
  const handleChangeMatch = () => {
    setFormData(searchInputs || formData)
    setCoverData(null)
    setCoverError(null)
    setCreditsStatus(null)
    setLibraryMatch(false)
    setStep('find')
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
        const match = lookupResult.metadata
        console.log('Found existing shared cover, skipping ComicVine search:', match)
        // The cover is already saved on the shared record, so there's no
        // coverData to upload; fill in what the existing comic knows.
        setFormData(prev => ({
          ...applyCoverMetadataToForm(prev, {
            publisher: match.publisher,
            year: match.year,
            month: match.month,
            volumeId: match.volumeId,
            volumeName: match.volumeName
          }),
          ...(match.credits ? { credits: match.credits, ...creditsToFields(match.credits) } : {})
        }))
        setLibraryMatch(true)
        if (match.comicVineId && !match.credits) {
          await handleMatched(match.comicVineId)
        } else {
          if (match.comicVineId) setFormData(prev => ({ ...prev, comicVineId: String(match.comicVineId) }))
          setStep('review')
        }
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
        setCoverError('ComicVine has no match for this issue. Check the series name and issue number, or enter the details by hand.')
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
        setCoverError('ComicVine search isn\'t available right now. You can enter the details by hand.')
      } else {
        setCoverError(`ComicVine search failed: ${error.message}`)
      }
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

      // Auto-populate volume, publisher, year and month fields in form
      setFormData(prev => applyCoverMetadataToForm(prev, coverResult.metadata))
      await handleMatched(coverResult.id)

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

      // Auto-populate volume, publisher, year and month fields in form
      setFormData(prev => applyCoverMetadataToForm(prev, selectedCoverData.metadata))
      await handleMatched(selectedCoverData.metadata?.apiId)

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

  const goToManual = () => {
    setCoverError(null)
    setStep('manual')
  }

  const busy = isSearchingCovers || isProcessingCover || isSubmitting

  // ── Fields shared between steps ──
  const seriesField = (
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
  )

  const issueField = (
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
  )

  const publisherField = (
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
  )

  const yearField = (
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
  )

  const monthField = (
    <div className="form-group">
      <label htmlFor="month">Month</label>
      <select id="month" name="month" value={formData.month} onChange={handleChange}>
        <option value="">—</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1)}>{name}</option>
        ))}
      </select>
    </div>
  )

  const creatorFields = (
    <>
      <div className="form-group">
        <label htmlFor="writers">Writer(s)</label>
        <input
          type="text"
          id="writers"
          name="writers"
          value={formData.writers}
          onChange={handleChange}
          placeholder="Separate names with commas"
        />
      </div>
      <div className="form-group">
        <label htmlFor="artists">Artist(s)</label>
        <input
          type="text"
          id="artists"
          name="artists"
          value={formData.artists}
          onChange={handleChange}
          placeholder="Separate names with commas"
        />
      </div>
    </>
  )

  const variantAndNotes = (
    <>
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
    </>
  )

  const duplicateNotice = duplicateWarning && (
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
  )

  const otherCredits = groupCredits(formData.credits).other

  return (
    <div className="comic-form">
      <h2>Add Comic to Collection</h2>
      <form onSubmit={handleSubmit}>
        {step === 'find' && (
          <>
            <p className="form-step-intro">
              Enter the series and issue number, and we'll fill in the rest from ComicVine.
            </p>
            {seriesField}
            {issueField}

            <button
              type="button"
              className="link-button refine-toggle"
              aria-expanded={showRefine}
              onClick={() => setShowRefine(open => !open)}
            >
              {showRefine ? '▾' : '▸'} Narrow it down (year, publisher)
            </button>
            {showRefine && (
              <div className="refine-fields">
                {yearField}
                {publisherField}
              </div>
            )}

            {(isSearchingCovers || isProcessingCover) && (
              <div className="cover-searching">
                <span className="searching-icon">🔍</span>
                <span>{isProcessingCover ? 'Getting the cover…' : 'Searching ComicVine…'}</span>
              </div>
            )}

            {coverError && (
              <div className="cover-error">
                <span className="error-icon">⚠️</span>
                <span>{coverError}</span>
              </div>
            )}

            {duplicateNotice}

            <div className="form-step-actions">
              <button type="submit" className="submit-btn" disabled={busy}>
                {isSearchingCovers ? 'Searching…' : 'Find on ComicVine'}
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
            </div>
            <button type="button" className="link-button" onClick={goToManual}>
              No match? Enter details by hand
            </button>
          </>
        )}

        {step === 'review' && (
          <>
            <div className="match-card">
              {coverData?.previewUrl ? (
                <img className="match-cover" src={coverData.previewUrl} alt={`${formData.series} #${formData.issueNumber} cover`} />
              ) : (
                <div className="match-cover match-cover--placeholder" aria-hidden="true">📚</div>
              )}
              <div className="match-details">
                <strong className="match-title">{formData.series} #{formData.issueNumber}</strong>
                {(formData.volumeName || formData.year) && (
                  <span className="match-meta">
                    {formData.volumeName}{formData.volumeName && formData.year ? ' · ' : ''}{formData.year}
                  </span>
                )}
                {libraryMatch && <span className="match-meta">Cover already in the library</span>}
                <button type="button" className="link-button" onClick={handleChangeMatch} disabled={busy}>
                  Change match
                </button>
              </div>
            </div>

            {publisherField}
            <div className="form-row">
              {yearField}
              {monthField}
            </div>
            {creatorFields}
            {creditsStatus === 'loading' && (
              <p className="credits-note">Looking up creators on ComicVine…</p>
            )}
            {creditsStatus === 'error' && (
              <p className="credits-note">Couldn't get creators from ComicVine. You can type them in, or leave them blank.</p>
            )}
            {otherCredits.length > 0 && (
              <p className="also-credited">
                Also credited: {otherCredits.map(({ label, names }) => `${label} ${names.join(', ')}`).join(' · ')}
              </p>
            )}
            {variantAndNotes}
            {duplicateNotice}

            <button type="submit" className="submit-btn" disabled={busy || creditsStatus === 'loading'}>
              {isSubmitting ? 'Saving Comic...' : 'Add to collection'}
            </button>
          </>
        )}

        {step === 'manual' && (
          <>
            <button type="button" className="link-button" onClick={() => setStep('find')}>
              ← Back to search
            </button>
            {seriesField}
            {issueField}
            {publisherField}
            <div className="form-row">
              {yearField}
              {monthField}
            </div>
            {creatorFields}
            {variantAndNotes}

            <div className="form-group">
              <div className="cover-section">
                <div className="cover-section-header">
                  <label>Cover Image</label>
                </div>
                <CoverUploader
                  comicId={uploaderComicId}
                  onUploadComplete={handleCoverUploadComplete}
                  onUploadError={handleCoverUploadError}
                  currentCover={coverData?.previewUrl}
                  currentCoverData={coverData}
                  disabled={isProcessingCover}
                />
                {coverError && (
                  <div className="cover-error">
                    <span className="error-icon">⚠️</span>
                    <span>{coverError}</span>
                  </div>
                )}
              </div>
            </div>

            {duplicateNotice}

            <button type="submit" className="submit-btn" disabled={busy}>
              {isSubmitting ? 'Saving Comic...' : 'Add to collection'}
            </button>
          </>
        )}
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
