import React, { useState, useEffect, useRef, useMemo } from 'react'
import CoverImage from './CoverImage'
import './CoverGallery.css'

/**
 * CoverGallery component - Grid view mode emphasizing cover images
 * Features virtual scrolling for large collections and cover-focused navigation
 */
function CoverGallery({ 
  comics, 
  onCoverClick, 
  onEdit, 
  onRemove,
  searchTerm = '',
  sortBy = 'series',
  itemHeight = 280,
  itemsPerRow = 'auto'
}) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })
  const [containerHeight, setContainerHeight] = useState(600)
  const [itemsPerRowCalculated, setItemsPerRowCalculated] = useState(4)
  const containerRef = useRef(null)
  const scrollRef = useRef(null)

  // Filter and sort comics
  const filteredAndSortedComics = useMemo(() => {
    let filtered = comics.filter(comic =>
      comic.series.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comic.publisher?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comic.issueNumber.toString().includes(searchTerm)
    )

    return filtered.sort((a, b) => {
      if (sortBy === 'series') {
        return a.series.localeCompare(b.series) || 
               (parseInt(a.issueNumber) || 0) - (parseInt(b.issueNumber) || 0)
      }
      if (sortBy === 'issue') {
        return (parseInt(a.issueNumber) || 0) - (parseInt(b.issueNumber) || 0) ||
               a.series.localeCompare(b.series)
      }
      if (sortBy === 'publisher') {
        return (a.publisher || '').localeCompare(b.publisher || '') ||
               a.series.localeCompare(b.series)
      }
      return 0
    })
  }, [comics, searchTerm, sortBy])

  // Calculate items per row based on container width
  useEffect(() => {
    const calculateItemsPerRow = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      const itemWidth = 200 // Base item width including padding
      const gap = 16 // Gap between items
      const padding = 32 // Container padding
      
      const availableWidth = containerWidth - padding
      const itemsWithGaps = Math.floor((availableWidth + gap) / (itemWidth + gap))
      const calculatedItems = Math.max(1, itemsWithGaps)
      
      setItemsPerRowCalculated(itemsPerRow === 'auto' ? calculatedItems : itemsPerRow)
    }

    calculateItemsPerRow()
    
    const resizeObserver = new ResizeObserver(calculateItemsPerRow)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [itemsPerRow])

  // Virtual scrolling logic
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollRef.current) return

      const scrollTop = scrollRef.current.scrollTop
      const clientHeight = scrollRef.current.clientHeight
      
      const rowHeight = itemHeight + 16 // Item height + gap
      const startRow = Math.floor(scrollTop / rowHeight)
      const endRow = Math.ceil((scrollTop + clientHeight) / rowHeight)
      
      const bufferRows = 2 // Render extra rows for smooth scrolling
      const startIndex = Math.max(0, (startRow - bufferRows) * itemsPerRowCalculated)
      const endIndex = Math.min(
        filteredAndSortedComics.length,
        (endRow + bufferRows) * itemsPerRowCalculated
      )

      setVisibleRange({ start: startIndex, end: endIndex })
    }

    const scrollElement = scrollRef.current
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll() // Initial calculation
    }

    return () => {
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', handleScroll)
      }
    }
  }, [filteredAndSortedComics.length, itemHeight, itemsPerRowCalculated])

  // Calculate total height for virtual scrolling
  const totalRows = Math.ceil(filteredAndSortedComics.length / itemsPerRowCalculated)
  const totalHeight = totalRows * (itemHeight + 16)

  // Get visible items
  const visibleItems = filteredAndSortedComics.slice(visibleRange.start, visibleRange.end)

  // Calculate offset for visible items
  const startRow = Math.floor(visibleRange.start / itemsPerRowCalculated)
  const offsetY = startRow * (itemHeight + 16)

  const handleCoverClick = (comic) => {
    if (onCoverClick) {
      onCoverClick(comic)
    }
  }

  const handleEdit = (comic) => {
    if (onEdit) {
      onEdit(comic)
    }
  }

  const handleRemove = (comic) => {
    if (onRemove) {
      const confirmed = window.confirm(
        `Are you sure you want to remove "${comic.series} #${comic.issueNumber}" from your collection?\n\nThis action cannot be undone.`
      )
      
      if (confirmed) {
        onRemove(comic.id)
      }
    }
  }

  if (filteredAndSortedComics.length === 0) {
    return (
      <div className="cover-gallery">
        <div className="cover-gallery__empty">
          <div className="cover-gallery__empty-icon">📚</div>
          <h3>No comics found</h3>
          <p>Try adjusting your search terms or add some comics to your collection.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cover-gallery" ref={containerRef}>
      <div className="cover-gallery__header">
        <h3>Gallery View ({filteredAndSortedComics.length} comics)</h3>
      </div>
      
      <div 
        className="cover-gallery__scroll-container"
        ref={scrollRef}
        style={{ height: containerHeight }}
      >
        <div 
          className="cover-gallery__virtual-spacer"
          style={{ height: totalHeight }}
        >
          <div 
            className="cover-gallery__grid"
            style={{ 
              transform: `translateY(${offsetY}px)`,
              gridTemplateColumns: `repeat(${itemsPerRowCalculated}, 1fr)`
            }}
          >
            {visibleItems.map((comic) => (
              <div key={comic.id} className="cover-gallery__item">
                <button
                  type="button"
                  className="cover-gallery__cover"
                  onClick={() => handleCoverClick(comic)}
                  title="View comic details"
                  aria-label={`View details for ${comic.series} issue ${comic.issueNumber}`}
                >
                  <CoverImage
                    comicId={comic.comicMetadataId}
                    comic={comic}
                    size="medium"
                    lazy={true}
                  />
                </button>
                
                <div className="cover-gallery__info">
                  <div className="cover-gallery__series" title={comic.series}>
                    {comic.series}
                  </div>
                  <div className="cover-gallery__issue">
                    #{comic.issueNumber}
                    {comic.variant && (
                      <span className="cover-gallery__variant"> ({comic.variant})</span>
                    )}
                  </div>
                  {comic.publisher && (
                    <div className="cover-gallery__publisher" title={comic.publisher}>
                      {comic.publisher}
                    </div>
                  )}
                  {comic.year && (
                    <div className="cover-gallery__year">({comic.year})</div>
                  )}
                </div>
                
                <div className="cover-gallery__actions">
                  <button 
                    onClick={() => handleEdit(comic)}
                    className="cover-gallery__action-btn cover-gallery__edit-btn"
                    aria-label={`Edit ${comic.series} issue ${comic.issueNumber}`}
                    title="Edit comic"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleRemove(comic)}
                    className="cover-gallery__action-btn cover-gallery__remove-btn"
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
      </div>
    </div>
  )
}

export default CoverGallery
