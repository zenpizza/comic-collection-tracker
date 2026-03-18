import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import CoverImage from './CoverImage'
import ComicDetailView from './ComicDetailView'
import { compareSeriesNames } from '../utils/sortUtils'
import './UnifiedCollectionView.css'

const DRAG_THRESHOLD_PX = 6

// Parse issue number to a numeric value for ordering and gap detection
const parseIssueNum = (issueNumber) => {
  if (issueNumber === null || issueNumber === undefined) return null
  const match = String(issueNumber).trim().match(/^\d+(\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isNaN(parsed) ? null : parsed
}

// Build enriched series data: groups comics, detects gaps within owned range
function buildSeriesData(comics) {
  const seriesMap = new Map()
  comics.forEach((comic) => {
    const key = comic.series || 'Untitled Series'
    if (!seriesMap.has(key)) seriesMap.set(key, [])
    seriesMap.get(key).push(comic)
  })

  return Array.from(seriesMap.entries())
    .map(([seriesName, seriesComics]) => {
      const issueItems = seriesComics.map((comic, index) => ({
        key: comic.id || `${seriesName}-${index}`,
        type: 'comic',
        comic,
        issueLabel: comic.issueNumber,
        numericIssue: parseIssueNum(comic.issueNumber)
      }))

      const numericValues = issueItems
        .map((i) => i.numericIssue)
        .filter((n) => n !== null)

      const firstIssue = numericValues.length > 0 ? Math.min(...numericValues) : null
      const lastIssue = numericValues.length > 0 ? Math.max(...numericValues) : null

      // Only track integer-numbered issues for gap detection
      const integerSet = new Set(
        issueItems
          .map((i) => i.numericIssue)
          .filter((n) => Number.isInteger(n))
      )

      // Gaps are only within the owned range: firstIssue → lastIssue
      const missingItems = []
      if (firstIssue !== null && lastIssue !== null) {
        const start = Math.floor(firstIssue)
        const end = Math.ceil(lastIssue)
        for (let n = start; n <= end; n++) {
          if (!integerSet.has(n)) {
            missingItems.push({
              key: `${seriesName}-missing-${n}`,
              type: 'missing',
              issueLabel: n,
              numericIssue: n
            })
          }
        }
      }

      const allItems = [...issueItems, ...missingItems].sort((a, b) => {
        const av = a.numericIssue ?? Number.MAX_SAFE_INTEGER
        const bv = b.numericIssue ?? Number.MAX_SAFE_INTEGER
        if (av !== bv) return av - bv
        if (a.type !== b.type) return a.type === 'comic' ? -1 : 1
        return String(a.issueLabel).localeCompare(String(b.issueLabel))
      })

      return {
        seriesName,
        items: allItems,
        ownedCount: seriesComics.length,
        missingCount: missingItems.length,
        firstIssue,
        lastIssue
      }
    })
    .sort((a, b) => compareSeriesNames(a.seriesName, b.seriesName))
}

// ── Main view ──────────────────────────────────────────────────────────────
function UnifiedCollectionView({ comics, onEdit, onRemove }) {
  const seriesData = useMemo(() => buildSeriesData(comics), [comics])

  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name') // 'name' | 'count' | 'missing'
  const [expandedSeries, setExpandedSeries] = useState(null)
  const [selectedComic, setSelectedComic] = useState(null)

  // Auto-open the first series when data first loads
  useEffect(() => {
    if (seriesData.length > 0 && expandedSeries === null) {
      setExpandedSeries(seriesData[0].seriesName)
    }
  }, [seriesData]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSeries = useMemo(() => {
    let list = seriesData
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter((s) => s.seriesName.toLowerCase().includes(term))
    }
    if (sortBy === 'count') {
      list = [...list].sort((a, b) => b.ownedCount - a.ownedCount)
    } else if (sortBy === 'missing') {
      list = [...list].sort((a, b) => b.missingCount - a.missingCount)
    }
    // 'name' retains the library-sort from buildSeriesData
    return list
  }, [seriesData, searchTerm, sortBy])

  const stats = useMemo(() => ({
    totalIssues: comics.length,
    totalTitles: seriesData.length,
    totalMissing: seriesData.reduce((sum, s) => sum + s.missingCount, 0)
  }), [comics, seriesData])

  const handleSeriesToggle = (name) => {
    setExpandedSeries((prev) => (prev === name ? null : name))
  }

  return (
    <section className="ucv">

      {/* ── Stats bar ── */}
      <div className="ucv-stats">
        <div className="ucv-stat">
          <span className="ucv-stat__value">{stats.totalIssues.toLocaleString()}</span>
          <span className="ucv-stat__label">Issues Owned</span>
        </div>
        <div className="ucv-stat-sep" aria-hidden="true" />
        <div className="ucv-stat">
          <span className="ucv-stat__value">{stats.totalTitles.toLocaleString()}</span>
          <span className="ucv-stat__label">Titles</span>
        </div>
        <div className="ucv-stat-sep" aria-hidden="true" />
        <div className="ucv-stat">
          <span className="ucv-stat__value ucv-stat__value--gaps">{stats.totalMissing.toLocaleString()}</span>
          <span className="ucv-stat__label">Gaps in Ranges</span>
        </div>
      </div>

      {/* ── Search + Sort ── */}
      <div className="ucv-controls">
        <input
          className="ui-input ucv-search"
          type="search"
          placeholder="Search titles…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search titles"
        />
        <select
          className="ui-input ucv-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort titles by"
        >
          <option value="name">A – Z</option>
          <option value="count">Most Issues</option>
          <option value="missing">Most Gaps</option>
        </select>
      </div>

      {/* ── Series list ── */}
      <div className="ucv-list" role="list">
        {filteredSeries.length === 0 && (
          <div className="ucv-empty">
            {searchTerm
              ? 'No titles match your search.'
              : 'No comics in your collection yet. Use Add Comic or Bulk Import to get started.'}
          </div>
        )}
        {filteredSeries.map((series) => (
          <SeriesRow
            key={series.seriesName}
            series={series}
            isExpanded={expandedSeries === series.seriesName}
            onToggle={() => handleSeriesToggle(series.seriesName)}
            onIssueSelect={setSelectedComic}
          />
        ))}
      </div>

      {/* ── Comic detail modal ── */}
      {selectedComic && (
        <ComicDetailView
          comic={selectedComic}
          comics={comics}
          onClose={() => setSelectedComic(null)}
          onSave={(updated) => {
            onEdit(updated)
            setSelectedComic(null)
          }}
          onDelete={(id) => {
            onRemove(id)
            setSelectedComic(null)
          }}
        />
      )}
    </section>
  )
}

// ── Series row ─────────────────────────────────────────────────────────────
function SeriesRow({ series, isExpanded, onToggle, onIssueSelect }) {
  const scrollerRef = useRef(null)
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false })

  const rangeText =
    series.firstIssue !== null && series.lastIssue !== null
      ? series.firstIssue === series.lastIssue
        ? `#${series.firstIssue}`
        : `#${series.firstIssue}–${series.lastIssue}`
      : null

  // When a series opens, scroll to the first owned issue
  useEffect(() => {
    if (!isExpanded || !scrollerRef.current) return
    const firstOwned = scrollerRef.current.querySelector('.ucv-issue--owned')
    if (firstOwned) {
      requestAnimationFrame(() =>
        firstOwned.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
      )
    }
  }, [isExpanded])

  const handlePointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    dragState.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false
    }
    el.classList.add('is-dragging')
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!dragState.current.active) return
    const dx = e.clientX - dragState.current.startX
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) dragState.current.moved = true
    e.currentTarget.scrollLeft = dragState.current.scrollLeft - dx
  }, [])

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragState.current.active = false
    e.currentTarget.classList.remove('is-dragging')
  }, [])

  const handleIssueClick = useCallback((item) => {
    if (dragState.current.moved) {
      dragState.current.moved = false
      return
    }
    if (item.type === 'comic') onIssueSelect(item.comic)
  }, [onIssueSelect])

  return (
    <div
      className={`ucv-series${isExpanded ? ' is-expanded' : ''}`}
      role="listitem"
    >
      <button
        type="button"
        className="ucv-series__header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className="ucv-series__name">{series.seriesName}</span>
        <div className="ucv-series__meta">
          {rangeText && (
            <span className="ucv-series__range">{rangeText}</span>
          )}
          <span className="ucv-series__count">
            {series.ownedCount} {series.ownedCount === 1 ? 'issue' : 'issues'}
          </span>
          {series.missingCount > 0 && (
            <span className="ucv-series__gap-badge">
              {series.missingCount} missing
            </span>
          )}
          <span className="ucv-series__chevron" aria-hidden="true">
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div
          className="ucv-scroller"
          ref={scrollerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="ucv-track">
            {series.items.map((item) =>
              item.type === 'comic' ? (
                <OwnedIssueCard
                  key={item.key}
                  item={item}
                  onClick={() => handleIssueClick(item)}
                />
              ) : (
                <MissingIssueCard key={item.key} item={item} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Issue cards ────────────────────────────────────────────────────────────
function OwnedIssueCard({ item, onClick }) {
  const title = [
    `${item.comic.series} #${item.comic.issueNumber}`,
    item.comic.variant,
    item.comic.year
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      className="ucv-issue ucv-issue--owned"
      onClick={onClick}
      title={title}
    >
      <CoverImage
        comicId={item.comic.id}
        comic={item.comic}
        size="medium"
        lazy={false}
        className="ucv-issue__cover"
        alt={`${item.comic.series} #${item.comic.issueNumber}`}
      />
      <span className="ucv-issue__label">#{item.issueLabel}</span>
    </button>
  )
}

function MissingIssueCard({ item }) {
  return (
    <div
      className="ucv-issue ucv-issue--missing"
      aria-label={`Issue #${item.issueLabel} — not in collection`}
    >
      <div className="ucv-issue__placeholder">
        <span className="ucv-issue__placeholder-icon" aria-hidden="true">?</span>
      </div>
      <span className="ucv-issue__label">#{item.issueLabel}</span>
    </div>
  )
}

export default UnifiedCollectionView
