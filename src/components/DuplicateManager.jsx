import React, { useState, useEffect } from 'react'
import dataStore from '../utils/dataStore'
import './DuplicateManager.css'

/**
 * Component for detecting and managing duplicate comics
 */
export default function DuplicateManager({ comics, onComicsUpdate }) {
  const [duplicates, setDuplicates] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Detect duplicates in the current collection
  const detectDuplicates = () => {
    const found = dataStore.findDuplicates(comics)
    setDuplicates(found)
    return found
  }

  // Remove duplicates from the collection
  const removeDuplicates = async () => {
    if (duplicates.length === 0) return

    setIsRemoving(true)
    try {
      const cleanedComics = dataStore.removeDuplicates(comics)
      await onComicsUpdate(cleanedComics)
      
      // Re-detect duplicates after removal
      const remainingDuplicates = detectDuplicates()
      
      if (remainingDuplicates.length === 0) {
        alert(`Successfully removed ${duplicates.length} duplicates!`)
      }
    } catch (error) {
      console.error('Error removing duplicates:', error)
      alert('Failed to remove duplicates. Please try again.')
    } finally {
      setIsRemoving(false)
    }
  }

  // Check for duplicates when comics change
  useEffect(() => {
    if (comics.length > 0) {
      detectDuplicates()
    }
  }, [comics])

  // Group duplicates by series for better display
  const groupedDuplicates = duplicates.reduce((groups, dup) => {
    const series = dup.original.series
    if (!groups[series]) {
      groups[series] = []
    }
    groups[series].push(dup)
    return groups
  }, {})

  if (isLoading) {
    return (
      <div className="duplicate-manager loading">
        <p>Checking for duplicates...</p>
      </div>
    )
  }

  return (
    <div className="duplicate-manager">
      <div className="duplicate-header">
        <h3>Duplicate Detection</h3>
        <div className="duplicate-stats">
          {duplicates.length === 0 ? (
            <span className="no-duplicates">✅ No duplicates found</span>
          ) : (
            <span className="duplicates-found">
              ⚠️ {duplicates.length} duplicates found
            </span>
          )}
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="duplicate-content">
          <div className="duplicate-actions">
            <button 
              onClick={removeDuplicates}
              disabled={isRemoving}
              className="remove-duplicates-btn"
            >
              {isRemoving ? 'Removing...' : `Remove ${duplicates.length} Duplicates`}
            </button>
            <p className="duplicate-note">
              This will keep the first occurrence of each comic and remove the rest.
            </p>
          </div>

          <div className="duplicate-list">
            <h4>Duplicate Comics Found:</h4>
            {Object.entries(groupedDuplicates).map(([series, seriesDuplicates]) => (
              <div key={series} className="series-duplicates">
                <h5>{series}</h5>
                <ul>
                  {seriesDuplicates.map((dup, index) => (
                    <li key={index} className="duplicate-item">
                      <span className="issue-number">#{dup.original.issueNumber}</span>
                      <span className="duplicate-count">
                        (2 copies - will keep the first one)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="duplicate-info">
        <h4>How Duplicate Detection Works:</h4>
        <ul>
          <li>Comics are considered duplicates if they have the same <strong>Series</strong> and <strong>Issue Number</strong></li>
          <li>Comparison is case-insensitive</li>
          <li>When removing duplicates, the first occurrence is kept</li>
          <li>Duplicates are automatically prevented when saving your collection</li>
        </ul>
      </div>
    </div>
  )
}