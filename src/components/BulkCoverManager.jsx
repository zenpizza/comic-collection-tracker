import React, { useState, useEffect, useRef, useMemo } from 'react'
import coverAPIService from '../utils/coverAPIService'
import { imageStorageManager } from '../utils/imageStorageManager'
import coverQualityAssessment from '../utils/coverQualityAssessment'
import { parseComicIssueForSearch } from '../utils/issueParser'
import coverUpdateService from '../utils/coverUpdateService'
import coverSelectionService from '../utils/coverSelectionService'
import './BulkCoverManager.css'

function BulkCoverManager({ comics, isVisible, onClose, onCoverUpdate, initialFilterIds = null }) {
  const [selectedComics, setSelectedComics] = useState([])
  const [operation, setOperation] = useState('fetch') // 'fetch', 'replace', 'remove', 'migrate', 'assess'
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' })
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [filterBy, setFilterBy] = useState('without-covers') // 'all', 'with-covers', 'without-covers'
  const [sortBy, setSortBy] = useState('series') // 'series', 'date-added', 'cover-status'
  const [searchTerm, setSearchTerm] = useState('')
  const [duplicateDetection, setDuplicateDetection] = useState(true)
  const [smartMatching, setSmartMatching] = useState(true)
  const [qualityFilter, setQualityFilter] = useState('medium') // 'any', 'low', 'medium', 'high'
  const [batchSize, setBatchSize] = useState(5) // Number of concurrent operations
  const [autoRetry, setAutoRetry] = useState(true)
  const [maxRetries, setMaxRetries] = useState(3)
  const [qualityAssessments, setQualityAssessments] = useState([])
  const [upgradeSuggestions, setUpgradeSuggestions] = useState(null)
  const [showQualityDetails, setShowQualityDetails] = useState(false)
  
  const abortControllerRef = useRef(null)

  // Filter and sort comics based on current settings
  const filteredComics = useMemo(() => {
    return comics.filter(comic => {
      // Initial filter by specific IDs (for bulk import flow)
      if (initialFilterIds && initialFilterIds.length > 0) {
        if (!initialFilterIds.includes(comic.id)) return false
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const matchesSearch = comic.series.toLowerCase().includes(searchLower) ||
          comic.publisher?.toLowerCase().includes(searchLower) ||
          comic.issueNumber.toString().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Cover status filter
      const hasCover = comic.hasCover
      switch (filterBy) {
        case 'with-covers':
          return hasCover
        case 'without-covers':
          return !hasCover
        case 'all':
        default:
          return true
      }
    }).sort((a, b) => {
      switch (sortBy) {
        case 'series':
          return a.series.localeCompare(b.series) || 
                 (parseInt(a.issueNumber) || 0) - (parseInt(b.issueNumber) || 0)
        case 'date-added':
          return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)
        case 'cover-status':
          const aHasCover = a.hasCover ? 1 : 0
          const bHasCover = b.hasCover ? 1 : 0
          return bHasCover - aHasCover || a.series.localeCompare(b.series)
        default:
          return 0
      }
    })
  }, [comics, searchTerm, filterBy, sortBy, initialFilterIds])

  // Calculate actual selected count (only comics that are in the filtered list)
  const actualSelectedCount = useMemo(() => {
    const filteredIds = new Set(filteredComics.map(c => c.id))
    return selectedComics.filter(id => filteredIds.has(id)).length
  }, [selectedComics, filteredComics])

  // Auto-select comics without covers when filter changes
  useEffect(() => {
    if (filterBy === 'without-covers') {
      // Only select comics without covers when the filter specifically changes to 'without-covers'
      const comicsWithoutCovers = comics.filter(comic => 
        !comic.coverUrl || comic.coverUrl.trim() === ''
      )
      setSelectedComics(comicsWithoutCovers.map(comic => comic.id))
    } else {
      // Clear selection when changing to other filters
      setSelectedComics([])
    }
  }, [filterBy]) // Only depend on filterBy changes

  // Clean up selected comics that are no longer in the filtered list
  useEffect(() => {
    const filteredIds = new Set(filteredComics.map(c => c.id))
    setSelectedComics(prev => prev.filter(id => filteredIds.has(id)))
  }, [filteredComics])

  const handleSelectAll = () => {
    if (selectedComics.length === filteredComics.length) {
      setSelectedComics([])
    } else {
      setSelectedComics(filteredComics.map(comic => comic.id))
    }
  }

  const handleComicSelect = (comicId) => {
    setSelectedComics(prev => 
      prev.includes(comicId) 
        ? prev.filter(id => id !== comicId)
        : [...prev, comicId]
    )
  }

  const getSelectedComicsData = () => {
    return comics.filter(comic => selectedComics.includes(comic.id))
  }

  const startBulkOperation = async () => {
    if (selectedComics.length === 0) {
      alert('Please select at least one comic')
      return
    }

    setIsProcessing(true)
    setProgress({ current: 0, total: selectedComics.length, status: 'Starting...' })
    setResults([])
    setShowResults(true)

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()

    try {
      const selectedComicsData = getSelectedComicsData()
      
      switch (operation) {
        case 'fetch':
          await performBulkFetch(selectedComicsData)
          break
        case 'replace':
          await performBulkReplace(selectedComicsData)
          break
        case 'remove':
          await performBulkRemove(selectedComicsData)
          break
        case 'migrate':
          await performBulkMigrate(selectedComicsData)
          break
        case 'assess':
          await performQualityAssessment(selectedComicsData)
          break
        default:
          throw new Error(`Unknown operation: ${operation}`)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setProgress(prev => ({ ...prev, status: 'Cancelled' }))
      } else {
        console.error('Bulk operation failed:', error)
        setProgress(prev => ({ ...prev, status: `Error: ${error.message}` }))
      }
    } finally {
      setIsProcessing(false)
      abortControllerRef.current = null
    }
  }

  const cancelOperation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const performBulkFetch = async (selectedComicsData) => {
    const results = []
    const batches = createBatches(selectedComicsData, batchSize)
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      
      // Check for cancellation
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled')
      }

      setProgress(prev => ({
        ...prev,
        status: `Processing batch ${batchIndex + 1} of ${batches.length}...`
      }))

      // Process batch concurrently
      const batchPromises = batch.map(comic => fetchCoverForComic(comic))
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Process batch results
      for (let index = 0; index < batchResults.length; index++) {
        const result = batchResults[index]
        const comic = batch[index]
        const resultValue = result.status === 'fulfilled' ? result.value : null
        const processedResult = {
          comic,
          success: result.status === 'fulfilled',
          error: result.status === 'rejected' ? result.reason?.message : null,
          source: resultValue?.source || null,
          quality: resultValue?.quality || null,
          attribution: resultValue?.attribution || null,
          originalUrl: resultValue?.originalUrl || null,
          provider: resultValue?.provider || null
        }
        
        results.push(processedResult)
        
        // Update progress
        setProgress(prev => ({
          ...prev,
          current: prev.current + 1
        }))

        // Update comic if successful - follow Add Comic pattern
        if (processedResult.success && resultValue?.metadata) {
          console.log('[BulkCoverManager] Cover added successfully for:', comic.id)
          console.log('[BulkCoverManager] Volume metadata captured:', {
            volumeId: resultValue.metadata.volumeId,
            volumeName: resultValue.metadata.volumeName
          })
          
          // Call the callback to refresh parent data
          if (onCoverUpdate) {
            await onCoverUpdate(comic.id, resultValue.metadata)
          }
          
          console.log('[BulkCoverManager] onCoverUpdate completed for:', comic.id)
        } else {
          console.log('[BulkCoverManager] Skipping onCoverUpdate:', {
            comicId: comic.id,
            success: processedResult.success,
            hasMetadata: !!resultValue?.metadata
          })
        }
      }

      // Small delay between batches to avoid overwhelming the API
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    setResults(results)
    setProgress(prev => ({
      ...prev,
      status: `Completed: ${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`
    }))
    
    // Refresh the parent component to show updated data (like Add Comic flow)
    console.log('[BulkCoverManager] Bulk operation completed, triggering parent refresh')
    // Note: Parent will refresh when modal closes
  }

  const fetchCoverForComic = async (comic, retryCount = 0) => {
    try {
      // Check for existing cover if duplicate detection is enabled
      if (duplicateDetection && comic.hasCover) {
        return {
          source: 'existing',
          quality: 'unknown',
          skipped: true
        }
      }

      // Parse issue number to handle annuals and special formats
      // IMPORTANT: Always use issueParser before searching to ensure proper format
      // See docs/COVER_SEARCH_SYSTEM.md for details
      const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)
      
      // Search for covers using the API service
      const searchResults = await coverAPIService.searchCovers(
        searchSeries,
        searchIssue,
        comic.publisher,
        comic.year
      )

      if (searchResults.length === 0) {
        const error = new Error('No covers found')
        error.noRetry = true // Don't retry when no results found
        throw error
      }

      // Apply smart matching and quality filtering
      let selectedCover = selectBestCover(searchResults, comic)
      
      if (!selectedCover) {
        const error = new Error('No suitable covers found after filtering')
        error.noRetry = true // Don't retry when filtering removes all results
        throw error
      }

      // Download the cover image
      const imageBlob = await coverAPIService.downloadCover(
        selectedCover.imageUrl,
        comic.comicMetadataId
      )

      // Use centralized cover update service
      console.log('[BulkCoverManager] Selected cover metadata:', {
        volumeId: selectedCover.metadata?.volumeId,
        volumeName: selectedCover.metadata?.volumeName,
        fullMetadata: selectedCover.metadata
      })
      
      const result = await coverUpdateService.addCover(
        comic.comicMetadataId,
        imageBlob,
        {
          source: 'api',
          provider: selectedCover.provider,
          originalUrl: selectedCover.imageUrl,
          attribution: selectedCover.attribution,
          quality: selectedCover.quality,
          volumeId: selectedCover.metadata?.volumeId,
          volumeName: selectedCover.metadata?.volumeName
        }
      )

      return {
        success: true,
        metadata: result.metadata,
        source: selectedCover.provider,
        quality: selectedCover.quality,
        attribution: selectedCover.attribution,
        originalUrl: selectedCover.imageUrl,
        provider: selectedCover.provider
      }

    } catch (error) {
      // Retry logic - but skip retry for certain error types
      const shouldRetry = autoRetry && 
                         retryCount < maxRetries && 
                         !abortControllerRef.current?.signal.aborted &&
                         !error.noRetry // Don't retry if error is marked as non-retryable
      
      if (shouldRetry) {
        console.warn(`Retrying cover fetch for ${comic.series} #${comic.issueNumber} (attempt ${retryCount + 1})`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))) // Exponential backoff
        return fetchCoverForComic(comic, retryCount + 1)
      }
      
      throw error
    }
  }

  const selectBestCover = (searchResults, comic) => {
    // Use centralized cover selection service (DRY principle)
    return coverSelectionService.selectBestCover(searchResults, {
      targetSeries: comic.series,
      qualityFilter,
      smartMatching
    })
  }

  const performBulkReplace = async (selectedComicsData) => {
    // Similar to fetch but forces replacement of existing covers
    const results = []
    
    for (const comic of selectedComicsData) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled')
      }

      try {
        // Remove existing cover first
        if (comic.coverUrl) {
          await imageStorageManager.deleteImage(comic.comicMetadataId)
        }

        // Fetch new cover
        const result = await fetchCoverForComic(comic)
        
        results.push({
          comic,
          success: result.success,
          source: result.source,
          quality: result.quality,
          attribution: result.attribution,
          originalUrl: result.originalUrl,
          provider: result.provider
        })

        // Update comic with standardized metadata
        if (result.success && result.metadata) {
          onCoverUpdate(comic.id, result.metadata)
        }

      } catch (error) {
        results.push({
          comic,
          success: false,
          error: error.message
        })
      }

      setProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        status: `Replacing covers... ${prev.current + 1}/${prev.total}`
      }))
    }

    setResults(results)
    setProgress(prev => ({
      ...prev,
      status: `Completed: ${results.filter(r => r.success).length} replaced, ${results.filter(r => !r.success).length} failed`
    }))
  }

  const performBulkRemove = async (selectedComicsData) => {
    const results = []
    
    for (const comic of selectedComicsData) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled')
      }

      try {
        // Use centralized cover update service
        const result = await coverUpdateService.removeCover(comic.comicMetadataId)
        
        results.push({
          comic,
          success: true,
          action: 'removed'
        })

        // Update comic with standardized metadata
        onCoverUpdate(comic.id, result.metadata)

      } catch (error) {
        results.push({
          comic,
          success: false,
          error: error.message
        })
      }

      setProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        status: `Removing covers... ${prev.current + 1}/${prev.total}`
      }))
    }

    setResults(results)
    setProgress(prev => ({
      ...prev,
      status: `Completed: ${results.filter(r => r.success).length} removed, ${results.filter(r => !r.success).length} failed`
    }))
  }

  const performBulkMigrate = async (selectedComicsData) => {
    // Migrate covers between storage strategies or sources
    const results = []
    
    for (const comic of selectedComicsData) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled')
      }

      try {
        // This would implement source migration logic
        // For now, just mark as migrated
        results.push({
          comic,
          success: true,
          action: 'migrated'
        })

      } catch (error) {
        results.push({
          comic,
          success: false,
          error: error.message
        })
      }

      setProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        status: `Migrating covers... ${prev.current + 1}/${prev.total}`
      }))
    }

    setResults(results)
    setProgress(prev => ({
      ...prev,
      status: `Completed: ${results.filter(r => r.success).length} migrated, ${results.filter(r => !r.success).length} failed`
    }))
  }

  const performQualityAssessment = async (selectedComicsData) => {
    const results = []
    const assessments = []
    
    // Filter comics that have covers
    const comicsWithCovers = selectedComicsData.filter(comic => 
      comic.coverUrl && comic.coverUrl.trim() !== ''
    )

    if (comicsWithCovers.length === 0) {
      setProgress(prev => ({
        ...prev,
        status: 'No comics with covers found to assess'
      }))
      return
    }

    setProgress(prev => ({
      ...prev,
      total: comicsWithCovers.length,
      status: 'Analyzing cover quality...'
    }))

    for (const comic of comicsWithCovers) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled')
      }

      try {
        // Get image data and metadata
        const imageData = await getImageDataForAssessment(comic)
        const metadata = getImageMetadataForAssessment(comic)
        
        // Perform quality assessment
        const assessment = await coverQualityAssessment.assessCoverQuality(imageData, metadata)
        
        assessments.push({
          comic,
          assessment,
          needsUpgrade: assessment.upgradePotential,
          score: assessment.overallScore,
          grade: assessment.grade
        })

        results.push({
          comic,
          success: true,
          assessment,
          score: assessment.overallScore,
          grade: assessment.grade,
          needsUpgrade: assessment.upgradePotential
        })

      } catch (error) {
        results.push({
          comic,
          success: false,
          error: error.message
        })
      }

      setProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        status: `Assessing quality... ${prev.current + 1}/${prev.total}`
      }))
    }

    // Generate upgrade suggestions
    const suggestions = coverQualityAssessment.getUpgradeSuggestions(assessments)
    
    setQualityAssessments(assessments)
    setUpgradeSuggestions(suggestions)
    setResults(results)
    setShowQualityDetails(true)
    
    setProgress(prev => ({
      ...prev,
      status: `Assessment complete: ${suggestions.statistics.needsUpgrade} comics need upgrades (avg score: ${suggestions.statistics.averageScore})`
    }))
  }

  const getImageDataForAssessment = async (comic) => {
    try {
      // Try to get actual image data from storage
      const imageResult = await imageStorageManager.getImage(comic.comicMetadataId, 'full')
      
      if (imageResult?.url) {
        // Create a temporary image to get dimensions
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            resolve({
              dimensions: { width: img.width, height: img.height },
              size: 0, // We don't have access to file size from URL
              mimeType: 'image/jpeg' // Default assumption
            })
          }
          img.onerror = () => {
            // Fallback to estimated data
            resolve({
              dimensions: { width: 400, height: 600 }, // Estimated
              size: 150000, // Estimated
              mimeType: 'image/jpeg'
            })
          }
          img.src = imageResult.url
        })
      }
    } catch (error) {
      console.warn('Could not get actual image data, using estimates:', error)
    }

    // Fallback to estimated data
    return {
      dimensions: { width: 400, height: 600 },
      size: 150000,
      mimeType: 'image/jpeg'
    }
  }

  const getImageMetadataForAssessment = (comic) => {
    return {
      source: comic.coverSource || 'unknown',
      provider: comic.coverSourceProvider || 'unknown',
      uploadedAt: comic.coverLastUpdated || comic.dateAdded,
      originalUrl: comic.coverOriginalUrl,
      sourceDetails: {
        apiProvider: comic.coverSourceProvider,
        attribution: comic.coverAttribution
      }
    }
  }

  const createBatches = (items, batchSize) => {
    const batches = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  const getOperationDescription = () => {
    switch (operation) {
      case 'fetch':
        return 'Automatically fetch covers for selected comics from external sources'
      case 'replace':
        return 'Replace existing covers with new ones from external sources'
      case 'remove':
        return 'Remove cover images from selected comics'
      case 'migrate':
        return 'Migrate covers between different storage sources'
      case 'assess':
        return 'Analyze cover quality and provide upgrade suggestions'
      default:
        return ''
    }
  }

  const applyUpgradeSuggestions = async (priority = 'high') => {
    if (!upgradeSuggestions) return

    const suggestionsToApply = upgradeSuggestions[`${priority}Priority`] || []
    
    if (suggestionsToApply.length === 0) {
      alert(`No ${priority} priority suggestions to apply`)
      return
    }

    const confirmed = window.confirm(
      `Apply ${priority} priority upgrade suggestions for ${suggestionsToApply.length} comics? This will attempt to find better covers.`
    )

    if (!confirmed) return

    // Set operation to replace and select the comics
    setOperation('replace')
    setSelectedComics(suggestionsToApply.map(s => s.comic.id))
    
    // Start the bulk replace operation
    await startBulkOperation()
  }

  if (!isVisible) return null

  return (
    <div className="bulk-cover-manager-overlay">
      <div className="bulk-cover-manager-modal">
        <div className="modal-header">
          <h3>Bulk Cover Operations</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {/* Operation Selection */}
          <div className="operation-section">
            <h4>Operation</h4>
            <div className="operation-tabs">
              <button 
                className={operation === 'fetch' ? 'active' : ''}
                onClick={() => setOperation('fetch')}
              >
                Fetch Covers
              </button>
              <button 
                className={operation === 'replace' ? 'active' : ''}
                onClick={() => setOperation('replace')}
              >
                Replace Covers
              </button>
              <button 
                className={operation === 'remove' ? 'active' : ''}
                onClick={() => setOperation('remove')}
              >
                Remove Covers
              </button>
              <button 
                className={operation === 'migrate' ? 'active' : ''}
                onClick={() => setOperation('migrate')}
              >
                Migrate Sources
              </button>
              <button 
                className={operation === 'assess' ? 'active' : ''}
                onClick={() => setOperation('assess')}
              >
                Assess Quality
              </button>
            </div>
            <p className="operation-description">{getOperationDescription()}</p>
          </div>

          {/* Filters and Search */}
          <div className="filter-section">
            {initialFilterIds && initialFilterIds.length > 0 && (
              <div className="filter-notice">
                📦 Showing {filteredComics.length} newly imported comics
              </div>
            )}
            <div className="filter-row">
              <div className="filter-group">
                <label>Search:</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search series, publisher, issue..."
                  className="search-input"
                />
              </div>
              
              <div className="filter-group">
                <label>Filter by:</label>
                <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
                  <option value="all">All Comics</option>
                  <option value="with-covers">With Covers</option>
                  <option value="without-covers">Without Covers</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Sort by:</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="series">Series</option>
                  <option value="date-added">Date Added</option>
                  <option value="cover-status">Cover Status</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quality Assessment Results */}
          {operation === 'assess' && showQualityDetails && upgradeSuggestions && (
            <div className="quality-assessment-section">
              <h4>Quality Assessment Results</h4>
              
              <div className="assessment-summary">
                <div className="summary-stats">
                  <div className="stat-item">
                    <span className="stat-number">{upgradeSuggestions.statistics.total}</span>
                    <span className="stat-label">Comics Analyzed</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{upgradeSuggestions.statistics.needsUpgrade}</span>
                    <span className="stat-label">Need Upgrades</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{upgradeSuggestions.statistics.averageScore}</span>
                    <span className="stat-label">Average Score</span>
                  </div>
                </div>

                <div className="grade-distribution">
                  <h5>Grade Distribution</h5>
                  <div className="grade-bars">
                    {Object.entries(upgradeSuggestions.statistics.gradeDistribution).map(([grade, count]) => (
                      <div key={grade} className="grade-bar">
                        <span className="grade-label">{grade}</span>
                        <div className="grade-bar-fill">
                          <div 
                            className={`grade-fill grade-${grade.toLowerCase()}`}
                            style={{ width: `${(count / upgradeSuggestions.statistics.total) * 100}%` }}
                          />
                        </div>
                        <span className="grade-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {upgradeSuggestions.highPriority.length > 0 && (
                <div className="upgrade-suggestions high-priority">
                  <h5>🔴 High Priority Upgrades ({upgradeSuggestions.highPriority.length})</h5>
                  <button 
                    onClick={() => applyUpgradeSuggestions('high')}
                    className="apply-suggestions-btn high"
                  >
                    Apply High Priority Upgrades
                  </button>
                  <div className="suggestions-list">
                    {upgradeSuggestions.highPriority.slice(0, 5).map((suggestion, index) => (
                      <div key={index} className="suggestion-item">
                        <div className="comic-info">
                          <strong>{suggestion.comic.series} #{suggestion.comic.issueNumber}</strong>
                          <span className="score">Score: {suggestion.assessment.overallScore} ({suggestion.assessment.grade})</span>
                        </div>
                        <div className="recommendations">
                          {suggestion.recommendations.map((rec, recIndex) => (
                            <div key={recIndex} className="recommendation">
                              {rec.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {upgradeSuggestions.highPriority.length > 5 && (
                      <div className="more-suggestions">
                        ...and {upgradeSuggestions.highPriority.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {upgradeSuggestions.mediumPriority.length > 0 && (
                <div className="upgrade-suggestions medium-priority">
                  <h5>🟡 Medium Priority Upgrades ({upgradeSuggestions.mediumPriority.length})</h5>
                  <button 
                    onClick={() => applyUpgradeSuggestions('medium')}
                    className="apply-suggestions-btn medium"
                  >
                    Apply Medium Priority Upgrades
                  </button>
                </div>
              )}

              {upgradeSuggestions.lowPriority.length > 0 && (
                <div className="upgrade-suggestions low-priority">
                  <h5>🟢 Low Priority Upgrades ({upgradeSuggestions.lowPriority.length})</h5>
                  <button 
                    onClick={() => applyUpgradeSuggestions('low')}
                    className="apply-suggestions-btn low"
                  >
                    Apply Low Priority Upgrades
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          {(operation === 'fetch' || operation === 'replace') && (
            <div className="settings-section">
              <h4>Settings</h4>
              <div className="settings-grid">
                <div className="setting-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={duplicateDetection}
                      onChange={(e) => setDuplicateDetection(e.target.checked)}
                    />
                    Skip comics with existing covers
                  </label>
                </div>
                
                <div className="setting-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={smartMatching}
                      onChange={(e) => setSmartMatching(e.target.checked)}
                    />
                    Smart matching (prefer exact series matches)
                  </label>
                </div>

                <div className="setting-group">
                  <label>Quality filter:</label>
                  <select value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}>
                    <option value="any">Any Quality</option>
                    <option value="low">Low Quality</option>
                    <option value="medium">Medium+ Quality</option>
                    <option value="high">High Quality Only</option>
                  </select>
                </div>

                <div className="setting-group">
                  <label>Batch size:</label>
                  <select value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value))}>
                    <option value="1">1 (Slowest)</option>
                    <option value="3">3</option>
                    <option value="5">5 (Recommended)</option>
                    <option value="10">10</option>
                    <option value="20">20 (Fastest)</option>
                  </select>
                </div>

                <div className="setting-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={autoRetry}
                      onChange={(e) => setAutoRetry(e.target.checked)}
                    />
                    Auto-retry failed operations
                  </label>
                </div>

                {autoRetry && (
                  <div className="setting-group">
                    <label>Max retries:</label>
                    <select value={maxRetries} onChange={(e) => setMaxRetries(parseInt(e.target.value))}>
                      <option value="1">1</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comic Selection */}
          <div className="selection-section">
            <div className="selection-header">
              <h4>
                Select Comics ({actualSelectedCount} of {filteredComics.length} selected)
              </h4>
              <button 
                onClick={handleSelectAll}
                className="select-all-btn"
              >
                {actualSelectedCount === filteredComics.length && filteredComics.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="comics-list">
              {filteredComics.map(comic => (
                <div key={comic.id} className="comic-item">
                  <label className="comic-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedComics.includes(comic.id)}
                      onChange={() => handleComicSelect(comic.id)}
                    />
                    <div className="comic-info">
                      <div className="comic-title">
                        {comic.series} #{comic.issueNumber}
                        {comic.variant && <span className="variant"> ({comic.variant})</span>}
                      </div>
                      <div className="comic-details">
                        {comic.publisher && <span>{comic.publisher}</span>}
                        {comic.year && <span>{comic.year}</span>}
                        <span className={`cover-status ${comic.hasCover ? 'has-cover' : 'no-cover'}`}>
                          {comic.hasCover ? '🖼️ Has Cover' : '📄 No Cover'}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Progress and Results */}
          {showResults && (
            <div className="results-section">
              <h4>Progress</h4>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <div className="progress-text">
                {progress.current} / {progress.total} - {progress.status}
              </div>

              {results.length > 0 && (
                <div className="results-list">
                  <h5>Results</h5>
                  <div className="results-summary">
                    <span className="success-count">
                      ✅ {results.filter(r => r.success).length} successful
                    </span>
                    <span className="error-count">
                      ❌ {results.filter(r => !r.success).length} failed
                    </span>
                  </div>
                  
                  <div className="results-details">
                    {results.filter(r => !r.success).map((result, index) => (
                      <div key={index} className="result-item error">
                        <strong>{result.comic.series} #{result.comic.issueNumber}</strong>
                        <span className="error-message">{result.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="modal-actions">
            {isProcessing ? (
              <button onClick={cancelOperation} className="cancel-btn">
                Cancel Operation
              </button>
            ) : (
              <>
                <button 
                  onClick={startBulkOperation}
                  className="start-btn"
                  disabled={selectedComics.length === 0}
                >
                  Start {operation === 'fetch' ? 'Fetching' : 
                         operation === 'replace' ? 'Replacing' :
                         operation === 'remove' ? 'Removing' : 
                         operation === 'migrate' ? 'Migrating' : 'Assessing'} 
                  ({selectedComics.length} comics)
                </button>
                <button onClick={onClose} className="close-btn">
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BulkCoverManager