import React, { useState, useEffect } from 'react'
import { compareSeriesNames, groupAndSortBySeries } from '../utils/sortUtils'
import CoverImage from './CoverImage'
import CoverGallery from './CoverGallery'
import ViewModeToggle from './ViewModeToggle'
import ComicDetailView from './ComicDetailView'
import { getSavedViewMode, saveViewMode } from '../utils/viewModeStorage'
import './CollectionView.css'

function CollectionView({ comics, onRemove, onEdit, recentlyImportedIds = null, onClearRecentFilter = null }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('series')
  const [viewMode, setViewMode] = useState(getSavedViewMode())
  const [coverFilter, setCoverFilter] = useState('all')
  const [selectedComic, setSelectedComic] = useState(null)

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
    // Recently imported filter (takes precedence)
    if (recentlyImportedIds && recentlyImportedIds.length > 0) {
      if (!recentlyImportedIds.includes(comic.id)) {
        return false
      }
    }

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

  const handleRemove = (comic) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${comic.series} #${comic.issueNumber}" from your collection?\n\nThis action cannot be undone.`
    )
    
    if (confirmed) {
      onRemove(comic.id)
    }
  }

  const handleComicClick = (comic) => {
    setSelectedComic(comic)
  }

  return (
    <div className="collection-view">
      {recentlyImportedIds && recentlyImportedIds.length > 0 && (
        <div className="recently-imported-banner">
          <span>📦 Showing {filteredComics.length} newly imported comics</span>
          <button onClick={onClearRecentFilter} className="clear-filter-btn">
            View All Comics
          </button>
        </div>
      )}

      <div className="collection-header">
        <h2>My Collection ({comics.length} issues)</h2>
        
        <div className="controls">
          <input
            type="text"
            placeholder="Search series, publisher, issue, variant, year, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            aria-label="Search comics"
          />
          
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
            aria-label="Sort comics"
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
            aria-label="Filter by cover status"
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
          onEdit={handleComicClick}
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
                  <div key={comic.id} className="comic-card">
                    <button
                      type="button"
                      className="comic-cover clickable"
                      onClick={() => handleComicClick(comic)}
                      title="View comic details"
                      aria-label={`View details for ${comic.series} issue ${comic.issueNumber}`}
                    >
                      <CoverImage
                        comicId={comic.id}
                        comic={comic}
                        size={viewMode === 'grid' ? 'medium' : 'thumbnail'}
                        lazy={true}
                      />
                    </button>
                    
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
                      {comic.notes && (
                        <div className="notes">{comic.notes}</div>
                      )}
                    </div>
                    
                    <div className="comic-actions">
                      <button 
                        onClick={() => handleComicClick(comic)}
                        className="edit-btn"
                        aria-label={`Edit ${comic.series} issue ${comic.issueNumber}`}
                        title="Edit comic"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => handleRemove(comic)}
                        className="remove-btn"
                        aria-label={`Remove ${comic.series} issue ${comic.issueNumber}`}
                        title="Remove from collection"
                      >
                        ×
                      </button>
                    </div>
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
