import React, { useRef, useState } from 'react'
import coverAPIService from '../utils/coverAPIService'
import { parseIssueForSearch } from '../utils/issueParser'
import { ebaySoldUrl, findOwnedCopies } from '../utils/priceLinks'
import './ComicForm.css'
import './PriceCheck.css'

const EMPTY_QUERY = { series: '', issueNumber: '', year: '', publisher: '' }

/**
 * Price Check (COM-61): built for a phone in a comic shop. Find an issue on
 * ComicVine, see whether it's already in the collection, and open eBay's sold
 * listings for it. Nothing is saved; "Add to collection" hands off to Add Comic.
 */
function PriceCheck({ comics = [], existingSeries = [], onAddToCollection }) {
  const [query, setQuery] = useState(EMPTY_QUERY)
  const [showRefine, setShowRefine] = useState(false)
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false)
  const [results, setResults] = useState(null) // null = not searched yet
  const [match, setMatch] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  // The query the current results belong to. Result actions (ownership, eBay
  // links, Add to collection) use this, never the live inputs, which may
  // have been edited since.
  const [searchedQuery, setSearchedQuery] = useState(null)
  // Bumped on each search and each edit, so a response for an older query is ignored
  const requestId = useRef(0)

  const clearResults = () => {
    requestId.current++
    setResults(null)
    setMatch(null)
    setSearchedQuery(null)
    setSearching(false)
  }

  const seriesSuggestions = query.series
    ? existingSeries.filter((s) => s.toLowerCase().includes(query.series.toLowerCase())).slice(0, 8)
    : []

  const handleChange = (e) => {
    const { name, value } = e.target
    setQuery((prev) => ({ ...prev, [name]: value }))
    if (name === 'series') setShowSeriesDropdown(value.length > 0)
    // Results (or a pending search) for the old query no longer apply
    if (results || searching) clearResults()
  }

  const handleFind = async (e) => {
    e?.preventDefault()
    if (!query.series.trim() || !query.issueNumber.trim()) {
      setError('Enter the series and issue number first')
      return
    }
    const id = ++requestId.current
    const submitted = { ...query }
    setSearching(true)
    setError(null)
    setMatch(null)
    try {
      const { series, issue } = parseIssueForSearch(submitted.series, submitted.issueNumber)
      const found = await coverAPIService.searchCovers(series, issue, submitted.publisher, submitted.year)
      if (id !== requestId.current) return
      setSearchedQuery(submitted)
      setResults(found)
      if (found.length === 1) setMatch(found[0])
    } catch (err) {
      if (id !== requestId.current) return
      console.error('Price check search failed:', err)
      setSearchedQuery(submitted)
      setResults([])
      setError('ComicVine search isn\'t available right now. You can still search eBay with what you typed.')
    } finally {
      if (id === requestId.current) setSearching(false)
    }
  }

  const handleNewSearch = () => {
    clearResults()
    setQuery(EMPTY_QUERY)
    setError(null)
    setShowRefine(false)
  }

  const searched = searchedQuery || query
  const typedFields = { series: searched.series, issueNumber: searched.issueNumber, year: searched.year }
  const matchFields = match && {
    series: searched.series,
    volumeName: match.metadata?.volumeName,
    issueNumber: match.metadata?.issueNumber || searched.issueNumber,
    year: match.metadata?.year,
  }
  const owned = match
    ? findOwnedCopies(comics, { comicVineId: match.id, series: searched.series, issueNumber: searched.issueNumber })
    : []

  const ebayLink = (fields, label, className = 'submit-btn ebay-link') => (
    <a className={className} href={ebaySoldUrl(fields)} target="_blank" rel="noopener noreferrer">
      {label} <span aria-hidden="true">↗</span>
    </a>
  )

  return (
    <div className="comic-form price-check">
      <h2>Price Check</h2>

      {!match && (
        <form onSubmit={handleFind}>
          <p className="form-step-intro">
            Find an issue to see what it sells for on eBay and whether it's already in your collection.
          </p>
          <div className="form-group">
            <label htmlFor="pc-series">Series</label>
            <div className="series-input-container">
              <input
                id="pc-series"
                name="series"
                type="text"
                value={query.series}
                onChange={handleChange}
                onBlur={() => setTimeout(() => setShowSeriesDropdown(false), 200)}
                placeholder="e.g., Amazing Spider-Man"
                autoComplete="off"
              />
              {showSeriesDropdown && seriesSuggestions.length > 0 && (
                <div className="series-dropdown">
                  {seriesSuggestions.map((s) => (
                    <div
                      key={s}
                      className="series-option"
                      onClick={() => { setQuery((prev) => ({ ...prev, series: s })); setShowSeriesDropdown(false) }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pc-issue">Issue Number</label>
            <input
              id="pc-issue"
              name="issueNumber"
              type="text"
              inputMode="text"
              value={query.issueNumber}
              onChange={handleChange}
              placeholder="e.g., 1, Annual 9"
            />
          </div>

          <button
            type="button"
            className="link-button refine-toggle"
            aria-expanded={showRefine}
            onClick={() => setShowRefine((open) => !open)}
          >
            {showRefine ? '▾' : '▸'} Narrow it down (year, publisher)
          </button>
          {showRefine && (
            <div className="refine-fields">
              <div className="form-group">
                <label htmlFor="pc-year">Year</label>
                <input id="pc-year" name="year" type="number" value={query.year} onChange={handleChange} placeholder="e.g., 1988" />
              </div>
              <div className="form-group">
                <label htmlFor="pc-publisher">Publisher</label>
                <input id="pc-publisher" name="publisher" type="text" value={query.publisher} onChange={handleChange} placeholder="e.g., Marvel" />
              </div>
            </div>
          )}

          {error && (
            <div className="cover-error" role="alert">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={searching}>
            {searching ? 'Searching…' : 'Find on ComicVine'}
          </button>

          {results && results.length === 0 && (
            <div className="price-check__no-match">
              {!error && <p>ComicVine has no match for this issue.</p>}
              {ebayLink(typedFields, 'Search eBay sold listings for what you typed', 'price-check__fallback-link')}
            </div>
          )}

          {results && results.length > 1 && (
            <div className="price-check__matches">
              <p className="price-check__matches-label">{results.length} matches. Pick yours:</p>
              <ul role="list">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="price-check__match-row" onClick={() => setMatch(r)}>
                      {r.thumbnailUrl
                        ? <img src={r.thumbnailUrl} alt="" loading="lazy" />
                        : <span className="price-check__no-thumb" aria-hidden="true">📚</span>}
                      <span className="price-check__match-text">
                        <strong>{r.metadata?.volumeName || searched.series} #{r.metadata?.issueNumber || searched.issueNumber}</strong>
                        <span>{[r.metadata?.year, r.metadata?.publisher].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}

      {match && (
        <div className="price-check__result">
          <div className="match-card">
            {match.thumbnailUrl || match.imageUrl
              ? <img className="match-cover" src={match.thumbnailUrl || match.imageUrl} alt={`${matchFields.volumeName || searched.series} #${matchFields.issueNumber} cover`} />
              : <div className="match-cover match-cover--placeholder" aria-hidden="true">📚</div>}
            <div className="match-details">
              <strong className="match-title">{matchFields.volumeName || searched.series} #{matchFields.issueNumber}</strong>
              <span className="match-meta">{[match.metadata?.year, match.metadata?.publisher].filter(Boolean).join(' · ')}</span>
              <span className={`price-check__owned ${owned.length ? 'is-owned' : ''}`}>
                {owned.length
                  ? `✓ In your collection${owned.length > 1 ? ` (${owned.length} copies)` : ''}`
                  : 'Not in your collection'}
              </span>
              <div className="price-check__card-actions">
                {results && results.length > 1 && (
                  <button type="button" className="link-button" onClick={() => setMatch(null)}>Change match</button>
                )}
                <button type="button" className="link-button" onClick={handleNewSearch}>New search</button>
              </div>
            </div>
          </div>

          {ebayLink(matchFields, 'Check eBay sold prices')}
          <p className="price-check__hint">
            Opens eBay's sold listings. Compare a few recent sales in similar condition to the copy in front of you.
          </p>

          {onAddToCollection && (
            <button
              type="button"
              className="price-check__add"
              onClick={() => onAddToCollection({
                series: searched.series,
                issueNumber: searched.issueNumber,
                year: match.metadata?.year ? String(match.metadata.year) : searched.year,
                publisher: match.metadata?.publisher || searched.publisher,
              })}
            >
              {owned.length ? 'Add another copy to collection' : 'Add to collection'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default PriceCheck
