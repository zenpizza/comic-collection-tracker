import React, { useMemo, useRef, useState, useEffect } from 'react'
import CoverImage from './CoverImage'
import { compareSeriesNames } from '../utils/sortUtils'
import './CollectionBrowser.css'

const DRAG_THRESHOLD_PX = 6

const parseIssueNumber = (issueNumber) => {
  if (issueNumber === null || issueNumber === undefined) {
    return null
  }

  const match = String(issueNumber).trim().match(/^\d+(\.\d+)?/)
  if (!match) {
    return null
  }

  const parsed = Number(match[0])
  return Number.isNaN(parsed) ? null : parsed
}

const buildSeriesData = (comics) => {
  const seriesMap = new Map()

  comics.forEach((comic) => {
    const seriesName = comic.series || 'Untitled Series'
    if (!seriesMap.has(seriesName)) {
      seriesMap.set(seriesName, [])
    }
    seriesMap.get(seriesName).push(comic)
  })

  return Array.from(seriesMap.entries())
    .map(([seriesName, seriesComics]) => {
      const issuesWithNumbers = seriesComics.map((comic, index) => ({
        key: comic.id || `${seriesName}-${index}`,
        type: 'comic',
        comic,
        issueLabel: comic.issueNumber,
        numericIssue: parseIssueNumber(comic.issueNumber)
      }))

      const numericIssues = issuesWithNumbers
        .map((issue) => issue.numericIssue)
        .filter((issueNumber) => issueNumber !== null)

      const firstIssue = numericIssues.length > 0 ? Math.min(...numericIssues) : null
      const lastIssue = numericIssues.length > 0 ? Math.max(...numericIssues) : null

      const integerIssues = new Set(
        issuesWithNumbers
          .map((issue) => issue.numericIssue)
          .filter((issueNumber) => Number.isInteger(issueNumber))
      )

      const missingIssues = []
      if (firstIssue !== null && lastIssue !== null) {
        const start = Math.floor(firstIssue)
        const end = Math.ceil(lastIssue)

        for (let issueNumber = start; issueNumber <= end; issueNumber += 1) {
          if (!integerIssues.has(issueNumber)) {
            missingIssues.push({
              key: `${seriesName}-missing-${issueNumber}`,
              type: 'missing',
              issueLabel: issueNumber,
              numericIssue: issueNumber
            })
          }
        }
      }

      const items = [...issuesWithNumbers, ...missingIssues].sort((a, b) => {
        const aValue = a.numericIssue ?? Number.MAX_SAFE_INTEGER
        const bValue = b.numericIssue ?? Number.MAX_SAFE_INTEGER

        if (aValue !== bValue) {
          return aValue - bValue
        }

        if (a.type !== b.type) {
          return a.type === 'comic' ? -1 : 1
        }

        return String(a.issueLabel).localeCompare(String(b.issueLabel))
      })

      return {
        seriesName,
        items,
        firstIssue,
        lastIssue,
        totalIssues: items.length
      }
    })
    .sort((a, b) => compareSeriesNames(a.seriesName, b.seriesName))
}

const getInitialSelection = (items) => {
  if (items.length === 0) {
    return null
  }
  const middleIndex = Math.floor(items.length / 2)
  return items[middleIndex]?.key ?? null
}

function CollectionBrowser({ comics }) {
  const seriesData = useMemo(() => buildSeriesData(comics), [comics])
  const [openSeries, setOpenSeries] = useState(seriesData[0]?.seriesName ?? null)
  const [selectedIssueKey, setSelectedIssueKey] = useState(null)
  const scrollerRefs = useRef(new Map())
  const dragState = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  })

  useEffect(() => {
    const activeSeries = seriesData.find((series) => series.seriesName === openSeries)
    if (activeSeries) {
      setSelectedIssueKey(getInitialSelection(activeSeries.items))
    }
  }, [openSeries, seriesData])

  useEffect(() => {
    if (!openSeries || !selectedIssueKey) {
      return
    }

    const scroller = scrollerRefs.current.get(openSeries)
    if (!scroller) {
      return
    }

    const selected = scroller.querySelector(
      `[data-issue-key="${selectedIssueKey}"]`
    )

    if (selected) {
      requestAnimationFrame(() => {
        selected.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        })
      })
    }
  }, [openSeries, selectedIssueKey])

  const handleSeriesToggle = (seriesName) => {
    setOpenSeries(seriesName)
  }

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    const container = event.currentTarget
    container.setPointerCapture(event.pointerId)

    dragState.current = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: container.scrollLeft,
      moved: false
    }
    container.classList.add('is-dragging')
  }

  const handlePointerMove = (event) => {
    if (!dragState.current.isDragging) {
      return
    }

    const container = event.currentTarget
    const deltaX = event.clientX - dragState.current.startX

    if (Math.abs(deltaX) > DRAG_THRESHOLD_PX) {
      dragState.current.moved = true
    }

    container.scrollLeft = dragState.current.scrollLeft - deltaX
  }

  const handlePointerUp = (event) => {
    const container = event.currentTarget
    container.releasePointerCapture(event.pointerId)
    dragState.current.isDragging = false
    container.classList.remove('is-dragging')
  }

  const handleIssueClick = (issueKey) => {
    if (dragState.current.moved) {
      dragState.current.moved = false
      return
    }
    setSelectedIssueKey(issueKey)
  }

  return (
    <section className="collection-browser">
      <header className="collection-browser__header">
        <h2>Browse Your Collection</h2>
        <p>
          Tap a title to open the horizontal scroller. Swipe on mobile or click
          and drag on desktop to explore issues.
        </p>
      </header>

      <div className="collection-browser__series-list">
        {seriesData.length === 0 && (
          <div className="collection-browser__empty">
            Add comics to your collection to browse by title.
          </div>
        )}
        {seriesData.map((series) => {
          const isOpen = series.seriesName === openSeries
          const selectedItem = series.items.find(
            (item) => item.key === selectedIssueKey
          )
          const selectedComic =
            selectedItem?.type === 'comic' ? selectedItem.comic : null

          return (
            <div
              key={series.seriesName}
              className={`collection-browser__series ${isOpen ? 'is-open' : ''}`}
            >
              <button
                type="button"
                className="collection-browser__series-title"
                onClick={() => handleSeriesToggle(series.seriesName)}
              >
                <span>{series.seriesName}</span>
                <span className="collection-browser__series-range">
                  {series.firstIssue !== null && series.lastIssue !== null
                    ? `First issue: ${series.firstIssue}, Last issue: ${series.lastIssue}`
                    : 'Issue range unavailable'}
                </span>
              </button>

              {isOpen && (
                <>
                  {selectedComic && (
                    <div className="collection-browser__metadata">
                      <div className="collection-browser__metadata-list">
                        {selectedComic.publisher && (
                          <div className="collection-browser__metadata-item">
                            <span className="collection-browser__metadata-label">Publisher</span>
                            <span className="collection-browser__metadata-value">
                              {selectedComic.publisher}
                            </span>
                          </div>
                        )}
                        {selectedComic.year && (
                          <div className="collection-browser__metadata-item">
                            <span className="collection-browser__metadata-label">Year</span>
                            <span className="collection-browser__metadata-value">
                              {selectedComic.year}
                            </span>
                          </div>
                        )}
                        {selectedComic.variant && (
                          <div className="collection-browser__metadata-item">
                            <span className="collection-browser__metadata-label">Variant</span>
                            <span className="collection-browser__metadata-value">
                              {selectedComic.variant}
                            </span>
                          </div>
                        )}
                      </div>
                      {selectedComic.notes && (
                        <div className="collection-browser__metadata-notes">
                          {selectedComic.notes}
                        </div>
                      )}
                    </div>
                  )}
                <div
                  className="collection-browser__scroller"
                  ref={(node) => {
                    if (node) {
                      scrollerRefs.current.set(series.seriesName, node)
                    } else {
                      scrollerRefs.current.delete(series.seriesName)
                    }
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <div className="collection-browser__track">
                    {series.items.map((item) => {
                      const isSelected = item.key === selectedIssueKey

                      return (
                        <button
                          key={item.key}
                          type="button"
                          data-issue-key={item.key}
                          className={`collection-browser__issue ${
                            isSelected ? 'is-selected' : ''
                          } ${item.type === 'missing' ? 'is-missing' : ''}`}
                          onClick={() => handleIssueClick(item.key)}
                        >
                          {item.type === 'missing' ? (
                            <div className="collection-browser__missing-card">
                              <div className="collection-browser__missing-label">
                                Issue #{item.issueLabel}
                              </div>
                              <div className="collection-browser__missing-text">Missing</div>
                            </div>
                          ) : (
                            <CoverImage
                              comicId={item.comic.comicMetadataId}
                              comic={item.comic}
                              size="medium"
                              lazy={false}
                              className="collection-browser__cover"
                              alt={`${item.comic.series} #${item.comic.issueNumber}`}
                            />
                          )}
                          <span className="collection-browser__issue-number">
                            #{item.issueLabel}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default CollectionBrowser
