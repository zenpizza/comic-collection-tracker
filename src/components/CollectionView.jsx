import React, { useState, useEffect } from 'react'
import { compareSeriesNames, groupAndSortBySeries, getSortedUniqueSeriesNames } from '../utils/sortUtils'
import CoverImage from './CoverImage'
import CoverGallery from './CoverGallery'
import ViewModeToggle from './ViewModeToggle'
import ComicDetailView from './ComicDetailView'
import { getSavedViewMode, saveViewMode } from '../utils/viewModeStorage'
import './CollectionView.css'

function CollectionView({ comics, onRemove, onEdit }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('series')
  const [viewMode, setViewMode] = useState(getSavedViewMode())
  const [coverFilter, setCoverFilter] = useState('all')
  const [selectedComic, setSelectedComic] = useState(null)
  const [editingComic, setEditingComic] = useState(null)
  const [editForm, setEditForm] = useState({
    series: '',
    issueNumber: '',
    publisher: '',
    year: '',
    variant: '',
    notes: ''
  })
  const [showEditSeriesDropdown, setShowEditSeriesDropdown] = useState(false)
  const [filteredEditSeries, setFilteredEditSeries] = useState([])
  const [showEditPublisherDropdown, setShowEditPublisherDropdown] = useState(false)
  const [filteredEditPublishers, setFilteredEditPublishers] = useState([])

  // Handle view mode changes and persistence
  useEffect(() => {
    saveViewMode(viewMode)
  }, [viewMode])

  // Update selected comic when comics array changes (after save/refresh)
  useEffect(() => {
    if (selectedComic) {
      const updatedComic = comics.find(c => c.id === selectedComic.id)
      if (updatedComic && JSON.stringify(updatedComic) !== JSON.stringify(selectedComic)) {
        setSelectedComic(updatedComic)
      }
    }
  }, [comics, selectedComic])

  const handleViewModeChange = (newViewMode) => {
    setViewMode(newViewMode)
  }

  const filteredComics = comics.filter(comic => {
    // Enhanced text search filter including cover-related fields
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = comic.series.toLowerCase().includes(searchLower) ||
      comic.publisher.toLowerCase().includes(searchLower) ||
      comic.issueNumber.toString().includes(searchLower) ||
      (comic.variant && comic.variant.toLowerCase().includes(searchLower)) ||
      (comic.notes && comic.notes.toLowerCase().includes(searchLower)) ||
      (comic.year && comic.year.toString().includes(searchTerm))
    
    // Cover status filter
    const hasCover = comic.hasCover
    const matchesCoverFilter = coverFilter === 'all' || 
      (coverFilter === 'with-covers' && hasCover) ||
      (coverFilter === 'without-covers' && !hasCover)
    
    return matchesSearch && matchesCoverFilter
  })

  const sortedComics = [...filteredComics].sort((a, b) => {
    if (sortBy === 'series') {
      return compareSeriesNames(a.series, b.series) || 
             (parseInt(a.issueNumber) || 0) - (parseInt(b.issueNumber) || 0)
    }
    if (sortBy === 'issue') {
      return (parseInt(a.issueNumber) || 0) - (parseInt(b.issueNumber) || 0) ||
             compareSeriesNames(a.series, b.series)
    }
    if (sortBy === 'publisher') {
      return (a.publisher || '').localeCompare(b.publisher || '') ||
             compareSeriesNames(a.series, b.series)
    }
    if (sortBy === 'cover-status') {
      const aHasCover = a.hasCover ? 1 : 0
      const bHasCover = b.hasCover ? 1 : 0
      return bHasCover - aHasCover || // Comics with covers first
             compareSeriesNames(a.series, b.series) ||
             (parseInt(a.issueNumber) || 0) - (parseInt(b.issueNumber) || 0)
    }
    if (sortBy === 'date-added') {
      const aDate = new Date(a.dateAdded || 0)
      const bDate = new Date(b.dateAdded || 0)
      return bDate - aDate || // Newest first
             compareSeriesNames(a.series, b.series)
    }
    return 0
  })

  // Use the utility function for proper grouping and sorting
  const groupedComics = groupAndSortBySeries(sortedComics)

  const startEdit = (comic) => {
    setEditingComic(comic.id)
    setEditForm({
      series: comic.series,
      issueNumber: comic.issueNumber,
      publisher: comic.publisher || '',
      year: comic.year || '',
      variant: comic.variant || '',
      notes: comic.notes || ''
    })
  }

  const cancelEdit = () => {
    setEditingComic(null)
    setEditForm({
      series: '',
      issueNumber: '',
      publisher: '',
      year: '',
      variant: '',
      notes: ''
    })
  }

  const saveEdit = () => {
    if (!editForm.series || !editForm.issueNumber) {
      alert('Series and issue number are required')
      return
    }

    const updatedComic = {
      ...comics.find(c => c.id === editingComic),
      ...editForm,
      issueNumber: parseInt(editForm.issueNumber) || editForm.issueNumber
    }

    onEdit(updatedComic)
    cancelEdit()
  }

  const handleEditChange = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }))

    // Handle series autocomplete for edit form
    if (field === 'series') {
      const existingSeries = getSortedUniqueSeriesNames(comics)
      if (value.length > 0) {
        const filtered = existingSeries.filter(series =>
          series.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredEditSeries(filtered)
        setShowEditSeriesDropdown(filtered.length > 0)
      } else {
        setShowEditSeriesDropdown(false)
      }
    }

    // Handle publisher autocomplete for edit form
    if (field === 'publisher') {
      const existingPublishers = [...new Set(comics.map(comic => comic.publisher).filter(Boolean))]
      if (value.length > 0) {
        const filtered = existingPublishers.filter(publisher =>
          publisher.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredEditPublishers(filtered)
        setShowEditPublisherDropdown(filtered.length > 0)
      } else {
        setShowEditPublisherDropdown(false)
      }
    }
  }

  const selectEditSeries = (series) => {
    setEditForm(prev => ({
      ...prev,
      series: series
    }))
    setShowEditSeriesDropdown(false)
  }

  const selectEditPublisher = (publisher) => {
    setEditForm(prev => ({
      ...prev,
      publisher: publisher
    }))
    setShowEditPublisherDropdown(false)
  }

  const handleRemove = (comic) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${comic.series} #${comic.issueNumber}" from your collection?\n\nThis action cannot be undone.`
    )
    
    if (confirmed) {
      onRemove(comic.id)
    }
  }

  const handleComicClick = (comic) => {
    // Don't open detail view if already editing
    if (editingComic !== comic.id) {
      setSelectedComic(comic)
    }
  }

  return (
    <div className="collection-view">
      <div className="collection-header">
        <h2>My Collection ({comics.length} issues)</h2>
        {comics.length > 0 && (
          <div className="collection-stats">
            {(() => {
              const withCovers = comics.filter(comic => comic.hasCover).length
              const withoutCovers = comics.length - withCovers
              const coverPercentage = Math.round((withCovers / comics.length) * 100)
              
              return (
                <div className="cover-stats">
                  <span className="stat-item stat-item--with-covers">
                    🖼️ {withCovers} with covers
                  </span>
                  <span className="stat-item stat-item--without-covers">
                    📄 {withoutCovers} without covers
                  </span>
                  <span className="stat-item stat-item--percentage">
                    ({coverPercentage}% coverage)
                  </span>
                </div>
              )
            })()}
          </div>
        )}
        
        <div className="controls">
          <input
            type="text"
            placeholder="Search series, publisher, issue, variant, year, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="series">Sort by Series</option>
            <option value="issue">Sort by Issue #</option>
            <option value="publisher">Sort by Publisher</option>
            <option value="cover-status">Sort by Cover Status</option>
            <option value="date-added">Sort by Date Added</option>
          </select>

          <select 
            value={coverFilter} 
            onChange={(e) => setCoverFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Comics</option>
            <option value="with-covers">With Covers</option>
            <option value="without-covers">Without Covers</option>
          </select>

          <ViewModeToggle 
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />
        </div>
      </div>

      {Object.keys(groupedComics).length === 0 ? (
        <div className="empty-state">
          <p>No comics in your collection yet!</p>
          <p>Start by adding some comics in the "Add Comic" tab.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <CoverGallery
          comics={sortedComics}
          searchTerm={searchTerm}
          sortBy={sortBy}
          onCoverClick={handleComicClick}
          onEdit={startEdit}
          onRemove={onRemove}
        />
      ) : (
        <div className="series-groups">
          {Object.entries(groupedComics).map(([series, seriesComics]) => (
            <div key={series} className="series-group">
              <h3 className="series-title">
                {series} 
                <span className="issue-count">({seriesComics.length} issues)</span>
              </h3>
              
              <div className="comics-grid">
                {seriesComics.map(comic => (
                  <div key={comic.id} className={`comic-card ${editingComic === comic.id ? 'editing' : ''}`}>
                    {editingComic === comic.id ? (
                      <div className="edit-form">
                        <div className="edit-field">
                          <label>Series:</label>
                          <div className="edit-series-container">
                            <input
                              type="text"
                              value={editForm.series}
                              onChange={(e) => handleEditChange('series', e.target.value)}
                              className="edit-input"
                              autoComplete="off"
                            />
                            {showEditSeriesDropdown && (
                              <div className="edit-series-dropdown">
                                {filteredEditSeries.map((series, index) => (
                                  <div
                                    key={index}
                                    className="edit-series-option"
                                    onClick={() => selectEditSeries(series)}
                                  >
                                    {series}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="edit-field">
                          <label>Issue #:</label>
                          <input
                            type="text"
                            value={editForm.issueNumber}
                            onChange={(e) => handleEditChange('issueNumber', e.target.value)}
                            className="edit-input"
                          />
                        </div>
                        <div className="edit-field">
                          <label>Publisher:</label>
                          <div className="edit-publisher-container">
                            <input
                              type="text"
                              value={editForm.publisher}
                              onChange={(e) => handleEditChange('publisher', e.target.value)}
                              className="edit-input"
                              autoComplete="off"
                            />
                            {showEditPublisherDropdown && (
                              <div className="edit-publisher-dropdown">
                                {filteredEditPublishers.map((publisher, index) => (
                                  <div
                                    key={index}
                                    className="edit-publisher-option"
                                    onClick={() => selectEditPublisher(publisher)}
                                  >
                                    {publisher}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="edit-field">
                          <label>Year:</label>
                          <input
                            type="number"
                            value={editForm.year}
                            onChange={(e) => handleEditChange('year', e.target.value)}
                            className="edit-input"
                            min="1900"
                            max="2030"
                          />
                        </div>
                        <div className="edit-field">
                          <label>Variant:</label>
                          <input
                            type="text"
                            value={editForm.variant}
                            onChange={(e) => handleEditChange('variant', e.target.value)}
                            className="edit-input"
                          />
                        </div>
                        <div className="edit-field">
                          <label>Notes:</label>
                          <textarea
                            value={editForm.notes}
                            onChange={(e) => handleEditChange('notes', e.target.value)}
                            className="edit-textarea"
                            rows="2"
                          />
                        </div>
                        <div className="edit-actions">
                          <button onClick={saveEdit} className="save-btn">
                            ✓ Save
                          </button>
                          <button onClick={cancelEdit} className="cancel-btn">
                            ✗ Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div 
                          className="comic-cover clickable"
                          onClick={() => handleComicClick(comic)}
                          title="Click to view details"
                        >
                          <CoverImage
                            comicId={comic.id}
                            comic={comic}
                            size={viewMode === 'grid' ? 'medium' : 'thumbnail'}
                            lazy={true}
                          />
                        </div>
                        
                        <div className="comic-info">
                          <div className="issue-number">#{comic.issueNumber}</div>
                          {comic.variant && (
                            <div className="variant">{comic.variant}</div>
                          )}
                          {comic.publisher && (
                            <div className="publisher">{comic.publisher}</div>
                          )}
                          {comic.year && (
                            <div className="year">({comic.year})</div>
                          )}
                          <div className="cover-status">
                            {comic.hasCover ? (
                              <span className="cover-status--has-cover" title="Has cover image">
                                🖼️ Cover
                              </span>
                            ) : (
                              <span className="cover-status--no-cover" title="No cover image">
                                📄 No Cover
                              </span>
                            )}
                          </div>
                          {comic.notes && (
                            <div className="notes">{comic.notes}</div>
                          )}
                        </div>
                        
                        <div className="comic-actions">
                          <button 
                            onClick={() => startEdit(comic)}
                            className="edit-btn"
                            title="Edit comic"
                          >
                            ✏️
                          </button>
                          <button 
                            onClick={() => handleRemove(comic)}
                            className="remove-btn"
                            title="Remove from collection"
                          >
                            ×
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedComic && (
        <ComicDetailView
          comic={selectedComic}
          comics={comics}
          onClose={() => setSelectedComic(null)}
          onSave={async (updatedComic) => {
            await onEdit(updatedComic)
            // Update selectedComic immediately to reflect changes
            setSelectedComic(updatedComic)
          }}
          onDelete={onRemove}
        />
      )}
    </div>
  )
}

export default CollectionView