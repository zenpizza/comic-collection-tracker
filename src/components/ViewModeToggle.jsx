import React from 'react'
import './ViewModeToggle.css'

/**
 * ViewModeToggle component - Toggle between list and grid view modes
 * Provides visual indicators and persists user preference
 */
function ViewModeToggle({ viewMode, onViewModeChange, className = '' }) {
  const handleToggle = (mode) => {
    if (mode !== viewMode && onViewModeChange) {
      onViewModeChange(mode)
    }
  }

  return (
    <div className={`view-mode-toggle ${className}`}>
      <button
        className={`view-mode-toggle__btn ${viewMode === 'list' ? 'view-mode-toggle__btn--active' : ''}`}
        onClick={() => handleToggle('list')}
        title="List view"
        aria-label="Switch to list view"
        aria-pressed={viewMode === 'list'}
      >
        <svg 
          className="view-mode-toggle__icon" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        <span className="view-mode-toggle__label">List</span>
      </button>
      
      <button
        className={`view-mode-toggle__btn ${viewMode === 'grid' ? 'view-mode-toggle__btn--active' : ''}`}
        onClick={() => handleToggle('grid')}
        title="Grid view"
        aria-label="Switch to grid view"
        aria-pressed={viewMode === 'grid'}
      >
        <svg 
          className="view-mode-toggle__icon" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        <span className="view-mode-toggle__label">Grid</span>
      </button>
    </div>
  )
}

export default ViewModeToggle