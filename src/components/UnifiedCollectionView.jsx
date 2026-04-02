import React, { useMemo, useRef, useState, useEffect } from 'react'
import CoverImage from './CoverImage'
import ComicDetailView from './ComicDetailView'
import { compareSeriesNames } from '../utils/sortUtils'
import './UnifiedCollectionView.css'

const DRAG_THRESHOLD_PX = 6

const parseIssueNumber = (issueNumber) => {
  if (issueNumber === null || issueNumber === undefined) return null
  const match = String(issueNumber).trim().match(/^\d+(\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isNaN(parsed) ? null : parsed
}

const buildSeriesData = (comics) => {
  const seriesMap = new Map()
  comics.forEach((comic) => {
    const name = comic.series || 'Untitled Series'
    if (!seriesMap.has(name)) seriesMap.set(name, [])
    seriesMap.get(name).push(comic)
  })

  return Array.from(seriesMap.entries())
    .map(([seriesName, seriesComics]) => {
      const issuesWithNumbers = seriesComics.map((comic, i) => ({
        key: comic.id || `${seriesName}-${i}`,
        type: 'comic',
        comic,
        issueLabel: comic.issueNumber,
        numericIssue: parseIssueNumber(comic.issueNumber),
      }))

      const numericIssues = issuesWithNumbers
        .map((i) => i.numericIssue)
        .filter((n) => n !== null)

      const firstIssue = numericIssues.length > 0 ? Math.min(...numericIssues) : null
      const lastIssue = numericIssues.length > 0 ? Math.max(...numericIssues) : null

      const integerIssues = new Set(
        issuesWithNumbers.map((i) => i.numericIssue).filter((n) => Number.isInteger(n))
      )

      const missingItems = []
      if (firstIssue !== null && lastIssue !== null) {
        for (let n = Math.floor(firstIssue); n <= Math.ceil(lastIssue); n++) {
          if (!integerIssues.has(n)) {
            missingItems.push({
              key: `${seriesName}-missing-${n}`,
              type: 'missing',
              issueLabel: n,
              numericIssue: n,
            })
          }
        }
      }

      const items = [...issuesWithNumbers, ...missingItems].sort((a, b) => {
        const av = a.numericIssue ?? Number.MAX_SAFE_INTEGER
        const bv = b.numericIssue ?? Number.MAX_SAFE_INTEGER
        if (av !== bv) return av - bv
        if (a.type !== b.type) return a.type === 'comic' ? -1 : 1
        return String(a.issueLabel).localeCompare(String(b.issueLabel))
      })

      return {
        seriesName,
        items,
        firstIssue,
        lastIssue,
        ownedCount: issuesWithNumbers.length,
        missingCount: missingItems.length,
      }
    })
    .sort((a, b) => compareSeriesNames(a.seriesName, b.seriesName))
}

function UnifiedCollectionView({ comics, onRemove, onEdit }) {
  const seriesData = useMemo(() => buildSeriesData(comics), [comics])
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedComic, setSelectedComic] = useState(null)
  const dragState = useRef({ isDragging: false, startX: 0, scrollLeft: 0, moved: false })
  const scrollerRef = useRef(null)

  // Select first series on initial load
  useEffect(() => {
    if (seriesData.length > 0 && selectedSeries === null) {
      setSelectedSeries(seriesData[0].seriesName)
    }
  }, [seriesData, selectedSeries])

  // Keep selectedComic in sync after edits/saves
  useEffect(() => {
    if (!selectedComic) return
    const updated = comics.find((c) => c.id === selectedComic.id)
    if (updated && JSON.stringify(updated) !== JSON.stringify(selectedComic)) {
      setSelectedComic(updated)
    }
  }, [comics, selectedComic])

  const filteredSeries = useMemo(() => {
    if (!searchTerm) return seriesData
    const lower = searchTerm.toLowerCase()
    return seriesData.filter((s) => s.seriesName.toLowerCase().includes(lower))
  }, [seriesData, searchTerm])

  const activeSeries = seriesData.find((s) => s.seriesName === selectedSeries) ?? null

  const totalOwned = comics.length
  const totalTitles = seriesData.length
  const totalGaps = useMemo(
    () => seriesData.reduce((sum, s) => sum + s.missingCount, 0),
    [seriesData]
  )

  // Pointer drag handlers for the cover scroller.
  // No setPointerCapture — pointer capture redirects the pointerup that
  // synthesises click to the scroller element, so child button onClick
  // never fires. Instead we cancel stale drags via onPointerLeave.
  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    }
    el.classList.add('is-dragging')
  }

  const handlePointerMove = (e) => {
    if (!dragState.current.isDragging) return
    const el = e.currentTarget
    const deltaX = e.clientX - dragState.current.startX
    if (Math.abs(deltaX) > DRAG_THRESHOLD_PX) dragState.current.moved = true
    el.scrollLeft = dragState.current.scrollLeft - deltaX
  }

  const handlePointerUp = (e) => {
    if (!dragState.current.isDragging) return
    e.currentTarget.classList.remove('is-dragging')
    dragState.current.isDragging = false
    dragState.current.moved = false
  }

  const handlePointerLeave = (e) => {
    if (!dragState.current.isDragging) return
    e.currentTarget.classList.remove('is-dragging')
    dragState.current.isDragging = false
    dragState.current.moved = false
  }

  const handleIssueClick = (item) => {
    // Swallow clicks that ended a drag; moved is already reset by handlePointerUp
    if (dragState.current.moved) return
    if (item.type === 'comic') setSelectedComic(item.comic)
  }

  const handleDotClick = (item) => {
    if (item.type === 'comic') {
      // Open detail modal for owned issues
      setSelectedComic(item.comic)
    } else {
      // Scroll the cover scroller to show this gap in context
      if (!scrollerRef.current) return
      const cell = scrollerRef.current.querySelector(`[data-item-key="${item.key}"]`)
      if (cell) {
        cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }

  const handleSelectSeries = (name) => {
    setSelectedSeries(name)
    setDrawerOpen(false)
  }

  return (
    <div className="ucv">
      {/* Stats + mobile "All Titles" trigger */}
      <div className="ucv__stats">
        <div className="ucv__stat">
          <span className="ucv__stat-value">{totalOwned}</span>
          <span className="ucv__stat-label">Issues Owned</span>
        </div>
        <div className="ucv__stat">
          <span className="ucv__stat-value">{totalTitles}</span>
          <span className="ucv__stat-label">Titles</span>
        </div>
        <div className="ucv__stat">
          <span className="ucv__stat-value">{totalGaps}</span>
          <span className="ucv__stat-label">Gaps in Ranges</span>
        </div>
        <button
          type="button"
          className="ucv__all-titles-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Browse all titles"
        >
          ☰ All Titles
        </button>
      </div>

      <div className="ucv__body">
        {/* Mobile overlay behind the drawer */}
        {drawerOpen && (
          <div
            className="ucv__overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left panel / mobile drawer */}
        <aside
          className={`ucv__panel-left ${drawerOpen ? 'is-open' : ''}`}
          aria-label="Series list"
        >
          <div className="ucv__drawer-header">
            <span>All Titles</span>
            <button
              type="button"
              className="ucv__drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="ucv__search-wrap">
            <input
              className="ucv__search"
              type="text"
              placeholder="Search titles…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search titles"
            />
          </div>
          <ul className="ucv__series-list" role="listbox" aria-label="Series">
            {filteredSeries.map((s) => (
              <li
                key={s.seriesName}
                role="option"
                aria-selected={s.seriesName === selectedSeries}
                className={`ucv__series-row ${s.seriesName === selectedSeries ? 'is-active' : ''}`}
                onClick={() => handleSelectSeries(s.seriesName)}
              >
                <span className="ucv__series-name">{s.seriesName}</span>
                <span className="ucv__series-sub">
                  {s.ownedCount} issue{s.ownedCount !== 1 ? 's' : ''}
                  {s.missingCount > 0 ? (
                    <span className="ucv__badge ucv__badge--missing">
                      {s.missingCount} missing
                    </span>
                  ) : (
                    <span className="ucv__badge ucv__badge--complete">complete</span>
                  )}
                </span>
              </li>
            ))}
            {filteredSeries.length === 0 && (
              <li className="ucv__series-empty">No titles match &ldquo;{searchTerm}&rdquo;</li>
            )}
          </ul>
        </aside>

        {/* Right panel: series detail */}
        <main className="ucv__panel-right">
          {comics.length === 0 ? (
            <div className="ucv__empty">
              Add comics to your collection to get started.
            </div>
          ) : !activeSeries ? (
            <div className="ucv__empty">Select a title to browse its issues.</div>
          ) : (
            <>
              <div className="ucv__detail-header">
                <h2 className="ucv__detail-title">{activeSeries.seriesName}</h2>
                {activeSeries.firstIssue !== null && (
                  <p className="ucv__detail-meta">
                    Your range: #{activeSeries.firstIssue}–#{activeSeries.lastIssue}
                  </p>
                )}
                <div className="ucv__detail-pills">
                  <span className="ucv__pill">{activeSeries.ownedCount} owned</span>
                  {activeSeries.missingCount > 0 ? (
                    <>
                      <span className="ucv__pill ucv__pill--red">
                        {activeSeries.missingCount} missing in range
                      </span>
                      <span className="ucv__pill">
                        {Math.round(
                          (activeSeries.ownedCount / activeSeries.items.length) * 100
                        )}% of range
                      </span>
                    </>
                  ) : (
                    <span className="ucv__pill ucv__pill--green">Complete range</span>
                  )}
                </div>
              </div>

              {/* Gap ribbon */}
              {activeSeries.items.length > 0 && (
                <div className="ucv__ribbon-section">
                  <p className="ucv__section-label">
                    Gap map — #{activeSeries.firstIssue} to #{activeSeries.lastIssue}
                  </p>
                  <div className="ucv__ribbon">
                    {activeSeries.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`ucv__dot ${
                          item.type === 'missing' ? 'ucv__dot--missing' : 'ucv__dot--owned'
                        }`}
                        onClick={() => handleDotClick(item)}
                        aria-label={
                          item.type === 'missing'
                            ? `#${item.issueLabel} — Missing, scroll to in scroller`
                            : `#${item.issueLabel} — View details`
                        }
                        title={
                          item.type === 'missing'
                            ? `#${item.issueLabel} — Missing`
                            : `#${item.issueLabel}`
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Cover scroller */}
              <div className="ucv__scroller-section">
                <p className="ucv__section-label">← drag to browse issues →</p>
                <div
                  className="ucv__scroller"
                  ref={scrollerRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerLeave}
                  onPointerLeave={handlePointerLeave}
                >
                  {activeSeries.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      data-item-key={item.key}
                      className={`ucv__issue-cell ${item.type === 'missing' ? 'is-missing' : ''}`}
                      onClick={() => handleIssueClick(item)}
                      aria-label={
                        item.type === 'missing'
                          ? `Issue #${item.issueLabel} — Missing`
                          : `${activeSeries.seriesName} #${item.issueLabel} — View details`
                      }
                    >
                      {item.type === 'missing' ? (
                        <div className="ucv__cover ucv__cover--missing" aria-hidden="true">
                          <span className="ucv__missing-number">#{item.issueLabel}</span>
                          <span className="ucv__missing-label">Missing</span>
                        </div>
                      ) : (
                        <CoverImage
                          comicId={item.comic.id}
                          comic={item.comic}
                          size="medium"
                          lazy={true}
                          className="ucv__cover"
                          alt={`${activeSeries.seriesName} #${item.issueLabel}`}
                        />
                      )}
                      <span
                        className={`ucv__issue-label ${
                          item.type === 'missing' ? 'ucv__issue-label--missing' : ''
                        }`}
                      >
                        #{item.issueLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {selectedComic && (
        <ComicDetailView
          comic={selectedComic}
          comics={comics}
          onClose={() => setSelectedComic(null)}
          onSave={async (updatedComic) => {
            await onEdit(updatedComic)
            setSelectedComic(updatedComic)
          }}
          onDelete={onRemove}
        />
      )}
    </div>
  )
}

export default UnifiedCollectionView
