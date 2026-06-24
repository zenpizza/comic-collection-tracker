import React, { useState } from 'react'
import { sortSeriesNames } from '../utils/sortUtils'
import CoverImage from './CoverImage'
import './MissingIssues.css'

function MissingIssues({ comics }) {
  const [selectedSeries, setSelectedSeries] = useState('')
  const [maxIssue, setMaxIssue] = useState('')
  const [maxAnnual, setMaxAnnual] = useState('')

  // Group comics by series
  const seriesGroups = comics.reduce((groups, comic) => {
    const key = comic.series
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(comic)
    return groups
  }, {})

  // Get missing issues for a series
  const getMissingIssues = (seriesComics, maxIssueNum) => {
    const ownedIssues = new Set(
      seriesComics
        .map(comic => parseInt(comic.issueNumber))
        .filter(num => !isNaN(num))
    )
    
    const missing = []
    for (let i = 1; i <= maxIssueNum; i++) {
      if (!ownedIssues.has(i)) {
        missing.push(i)
      }
    }
    return missing
  }



  // Parse issue number to detect Annuals
  const parseIssueNumber = (issueNumber) => {
    const issueStr = issueNumber.toString().toLowerCase()
    
    // Check for Annual format: "Annual 1", "annual 1", "Ann 1", etc.
    const annualMatch = issueStr.match(/^(?:annual|ann)\s*(\d+)$/i)
    if (annualMatch) {
      return {
        type: 'annual',
        number: parseInt(annualMatch[1]),
        display: `Annual ${annualMatch[1]}`
      }
    }
    
    // Check for numeric issues
    const numericIssue = parseInt(issueNumber)
    if (!isNaN(numericIssue)) {
      return {
        type: 'regular',
        number: numericIssue,
        display: numericIssue.toString()
      }
    }
    
    // Handle other formats (like "1.1", "Special", etc.)
    return {
      type: 'special',
      number: 0,
      display: issueNumber.toString()
    }
  }

  // Get Annual issues from the series
  const getAnnualIssues = (seriesComics) => {
    return seriesComics
      .map(comic => ({
        ...comic,
        parsedIssue: parseIssueNumber(comic.issueNumber)
      }))
      .filter(comic => comic.parsedIssue.type === 'annual')
      .sort((a, b) => a.parsedIssue.number - b.parsedIssue.number)
  }

  // Create unified list of all issues (owned and missing) for visual scanning
  const createUnifiedIssueList = (seriesComics, maxIssueNum, maxAnnualNum) => {
    if (!maxIssueNum) return []
    
    const ownedIssuesMap = new Map()
    const ownedAnnualsMap = new Map()
    const specialIssues = []
    
    seriesComics.forEach(comic => {
      const parsed = parseIssueNumber(comic.issueNumber)
      
      if (parsed.type === 'regular') {
        if (!ownedIssuesMap.has(parsed.number)) {
          ownedIssuesMap.set(parsed.number, [])
        }
        ownedIssuesMap.get(parsed.number).push({
          ...comic,
          parsedIssue: parsed
        })
      } else if (parsed.type === 'annual') {
        if (!ownedAnnualsMap.has(parsed.number)) {
          ownedAnnualsMap.set(parsed.number, [])
        }
        ownedAnnualsMap.get(parsed.number).push({
          ...comic,
          parsedIssue: parsed
        })
      } else {
        // Handle other special issues
        specialIssues.push({
          ...comic,
          parsedIssue: parsed
        })
      }
    })
    
    const unifiedList = []
    
    // Add regular issues
    for (let i = 1; i <= maxIssueNum; i++) {
      if (ownedIssuesMap.has(i)) {
        // Owned issue(s)
        const comics = ownedIssuesMap.get(i)
        comics.forEach(comic => {
          unifiedList.push({
            issueNumber: i,
            displayNumber: i.toString(),
            owned: true,
            comic: comic,
            type: 'regular',
            isMilestone: i % 100 === 0 || i % 50 === 0 || i % 25 === 0
          })
        })
      } else {
        // Missing issue
        unifiedList.push({
          issueNumber: i,
          displayNumber: i.toString(),
          owned: false,
          comic: null,
          type: 'regular',
          isMilestone: i % 100 === 0 || i % 50 === 0 || i % 25 === 0
        })
      }
    }
    
    // Add Annual issues (both owned and missing)
    if (maxAnnualNum && maxAnnualNum > 0) {
      for (let i = 1; i <= maxAnnualNum; i++) {
        if (ownedAnnualsMap.has(i)) {
          // Owned Annual(s)
          const comics = ownedAnnualsMap.get(i)
          comics.forEach(comic => {
            unifiedList.push({
              issueNumber: `Annual ${i}`,
              displayNumber: `Annual ${i}`,
              owned: true,
              comic: comic,
              type: 'annual',
              isMilestone: false
            })
          })
        } else {
          // Missing Annual
          unifiedList.push({
            issueNumber: `Annual ${i}`,
            displayNumber: `Annual ${i}`,
            owned: false,
            comic: null,
            type: 'annual',
            isMilestone: false
          })
        }
      }
    }
    
    // Add other special issues at the end
    specialIssues
      .sort((a, b) => a.parsedIssue.display.localeCompare(b.parsedIssue.display))
      .forEach(comic => {
        unifiedList.push({
          issueNumber: comic.parsedIssue.display,
          displayNumber: comic.parsedIssue.display,
          owned: true,
          comic: comic,
          type: comic.parsedIssue.type,
          isMilestone: false
        })
      })
    
    return unifiedList
  }

  const handleSeriesChange = (e) => {
    const series = e.target.value
    setSelectedSeries(series)
    
    if (series && seriesGroups[series]) {
      const seriesComics = seriesGroups[series]
      
      // Auto-suggest max issue based on highest owned regular issue + buffer
      const highestRegularIssue = Math.max(
        ...seriesComics
          .map(comic => {
            const parsed = parseIssueNumber(comic.issueNumber)
            return parsed.type === 'regular' ? parsed.number : 0
          })
          .filter(num => num > 0)
      )
      setMaxIssue(Math.max(highestRegularIssue + 10, 50).toString())
      
      // Auto-suggest max annual based on highest owned annual + buffer
      const highestAnnual = Math.max(
        ...seriesComics
          .map(comic => {
            const parsed = parseIssueNumber(comic.issueNumber)
            return parsed.type === 'annual' ? parsed.number : 0
          })
          .filter(num => num > 0)
      )
      setMaxAnnual(highestAnnual > 0 ? Math.max(highestAnnual + 5, 10).toString() : '10')
    }
  }

  const selectedSeriesComics = selectedSeries ? seriesGroups[selectedSeries] : []
  const missingIssues = selectedSeries && maxIssue ? 
    getMissingIssues(selectedSeriesComics, parseInt(maxIssue)) : []
  const unifiedIssueList = selectedSeries && maxIssue ? 
    createUnifiedIssueList(selectedSeriesComics, parseInt(maxIssue), parseInt(maxAnnual) || 0) : []

  return (
    <div className="missing-issues">
      <div className="missing-header">
        <h2>Find Missing Issues</h2>
        <p>Perfect for when you're browsing at a comic shop!</p>
      </div>

      <div className="missing-controls">
        <div className="form-group">
          <label htmlFor="series-select">Select Series:</label>
          <select
            id="series-select"
            value={selectedSeries}
            onChange={handleSeriesChange}
            className="series-select"
          >
            <option value="">Choose a series...</option>
            {sortSeriesNames(Object.keys(seriesGroups)).map(series => (
              <option key={series} value={series}>
                {series} ({seriesGroups[series].length} owned)
              </option>
            ))}
          </select>
        </div>

        {selectedSeries && (
          <>
            <div className="form-group">
              <label htmlFor="max-issue">Check up to issue #:</label>
              <input
                type="number"
                id="max-issue"
                value={maxIssue}
                onChange={(e) => setMaxIssue(e.target.value)}
                placeholder="e.g., 100"
                min="1"
                max="9999"
                className="max-issue-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="max-annual">Check Annuals up to #:</label>
              <input
                type="number"
                id="max-annual"
                value={maxAnnual}
                onChange={(e) => setMaxAnnual(e.target.value)}
                placeholder="e.g., 30"
                min="0"
                max="100"
                className="max-annual-input"
              />
            </div>
          </>
        )}
      </div>

      {selectedSeries && (
        <div className="series-analysis">
          <h3>{selectedSeries}</h3>
          
          <div className="stats">
            <div className="stat">
              <span className="stat-number">{selectedSeriesComics.length}</span>
              <span className="stat-label">Issues Owned</span>
            </div>
            {maxIssue && (
              <>
                <div className="stat">
                  <span className="stat-number">{missingIssues.length}</span>
                  <span className="stat-label">Missing Issues</span>
                </div>
                <div className="stat">
                  <span className="stat-number">
                    {Math.round((selectedSeriesComics.length / parseInt(maxIssue)) * 100)}%
                  </span>
                  <span className="stat-label">Complete</span>
                </div>
              </>
            )}
          </div>

          {maxIssue && unifiedIssueList.length > 0 && (
            <div className="unified-issue-list">
              <h4>📊 Complete Issue Overview</h4>
              <div className="legend">
                <span className="legend-item">
                  <span className="legend-badge owned">🖼️</span> Issues You Own (Color)
                </span>
                <span className="legend-item">
                  <span className="legend-badge missing">📄</span> Missing Issues (B&W)
                </span>
                <span className="legend-item">
                  <span className="legend-badge milestone">⭐</span> Milestone Issues
                </span>
                <span className="legend-item">
                  <span className="legend-badge annual">A</span> Annual Issues
                </span>
              </div>
              
              <div className="issue-grid">
                {unifiedIssueList.map((item, index) => (
                  <div 
                    key={`${item.issueNumber}-${index}`} 
                    className={`issue-card ${item.owned ? 'owned' : 'missing'} ${item.isMilestone ? 'milestone' : ''} ${item.type}`}
                    title={item.owned 
                      ? `${item.displayNumber} - Owned${item.comic?.variant ? ` (${item.comic.variant})` : ''}`
                      : `${item.displayNumber} - Missing${item.isMilestone ? ' (Milestone Issue!)' : ''}${item.type === 'annual' ? ' (Annual Issue!)' : ''}`
                    }
                  >
                    <div className="issue-card__cover">
                      {item.owned && item.comic ? (
                        <CoverImage
                          comicId={item.comic.comicMetadataId}
                          comic={item.comic}
                          size="thumbnail"
                          lazy={true}
                        />
                      ) : (
                        <div className="issue-card__placeholder">
                          <div className="issue-card__placeholder-icon">
                            {item.type === 'annual' ? '📅' : '📄'}
                          </div>
                        </div>
                      )}
                      {item.isMilestone && <span className="milestone-star">⭐</span>}
                    </div>
                    
                    <div className="issue-card__info">
                      <div className="issue-card__number">
                        {item.type === 'regular' ? `#${item.displayNumber}` : item.displayNumber}
                      </div>
                      {item.owned && item.comic?.variant && (
                        <div className="issue-card__variant">({item.comic.variant})</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}



          {maxIssue && missingIssues.length === 0 && (
            <div className="complete-series">
              <h4>🎉 Complete Series!</h4>
              <p>You have all issues from #1 to #{maxIssue}!</p>
            </div>
          )}
        </div>
      )}

      {Object.keys(seriesGroups).length === 0 && (
        <div className="empty-state">
          <p>Add some comics to your collection first to see missing issues.</p>
        </div>
      )}
    </div>
  )
}

export default MissingIssues