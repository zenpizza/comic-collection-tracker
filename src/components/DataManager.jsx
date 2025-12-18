import React, { useState, useRef } from 'react'
import dataStore from '../utils/dataStore'
import BulkCoverManager from './BulkCoverManager'
import './DataManager.css'

function DataManager({ comics, onImport, onRefresh }) {
  const [stats, setStats] = useState(null)
  const [showBulkCoverManager, setShowBulkCoverManager] = useState(false)
  const fileInputRef = useRef(null)

  const loadStats = () => {
    try {
      const collectionStats = dataStore.getCollectionStats(comics)
      setStats(collectionStats)
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }


  const exportData = async () => {
    try {
      const data = await dataStore.exportData()
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
          type: 'application/json' 
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `comic-collection-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        // Fallback to current comics data
        const fallbackData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          comics: comics,
          metadata: dataStore.getCollectionStats(comics)
        }
        const blob = new Blob([JSON.stringify(fallbackData, null, 2)], { 
          type: 'application/json' 
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `comic-collection-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error exporting data:', error)
      alert('Error exporting data. Please try again.')
    }
  }

  const importData = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      const importedData = JSON.parse(text)
      
      const comics = await dataStore.importData(importedData)
      onImport(comics)
      alert(`Successfully imported ${comics.length} comics!`)
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Error importing data:', error)
      alert('Error importing data. Please check the file format and try again.')
    }
  }

  const clearAllData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear all data? This action cannot be undone. ' +
      'Consider exporting your data first as a backup.'
    )
    
    if (confirmed) {
      const doubleConfirmed = window.confirm(
        'This will permanently delete all your comics. Are you absolutely sure?'
      )
      
      if (doubleConfirmed) {
        onImport([])
        alert('All data has been cleared.')
      }
    }
  }

  React.useEffect(() => {
    loadStats()
  }, [comics])

  return (
    <div className="data-manager">
      <div className="data-header">
        <h2>Data Manager</h2>
        <p>Backup, restore, and manage your comic collection data</p>
      </div>

      {stats && (
        <div className="stats-section">
          <h3>Collection Statistics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{stats.totalComics}</div>
              <div className="stat-label">Total Comics</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.seriesCount}</div>
              <div className="stat-label">Series</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.publishers.length}</div>
              <div className="stat-label">Publishers</div>
            </div>
            {stats.yearRange.earliest !== Infinity && (
              <div className="stat-card">
                <div className="stat-number">
                  {stats.yearRange.earliest}-{stats.yearRange.latest}
                </div>
                <div className="stat-label">Year Range</div>
              </div>
            )}
          </div>

          {stats.topSeries.length > 0 && (
            <div className="top-series">
              <h4>Top Series by Issue Count</h4>
              <div className="series-list">
                {stats.topSeries.map(({ series, count }) => (
                  <div key={series} className="series-item">
                    <span className="series-name">{series}</span>
                    <span className="series-count">{count} issues</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.publishers.length > 0 && (
            <div className="publishers">
              <h4>Publishers in Collection</h4>
              <div className="publisher-tags">
                {stats.publishers.map(publisher => (
                  <span key={publisher} className="publisher-tag">
                    {publisher}
                  </span>
                ))}
              </div>
            </div>
          )}


        </div>
      )}



      <div className="data-actions">
        <h3>Data Management</h3>
        
        <div className="action-section">
          <h4>Backup & Export</h4>
          <div className="action-buttons">
            <button onClick={exportData} className="export-btn">
              📥 Export Collection
            </button>
            <button onClick={onRefresh} className="refresh-btn">
              🔄 Refresh Data
            </button>
          </div>
          <p className="action-description">
            Export your entire collection as a JSON file for backup or sharing.
          </p>
        </div>

        <div className="action-section">
          <h4>Import & Restore</h4>
          <div className="action-buttons">
            <input
              type="file"
              ref={fileInputRef}
              onChange={importData}
              accept=".json"
              style={{ display: 'none' }}
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="import-btn"
            >
              📤 Import Collection
            </button>
          </div>
          <p className="action-description">
            Import a previously exported collection file. This will replace your current collection.
          </p>
        </div>

        <div className="action-section">
          <h4>Cover Management</h4>
          <div className="action-buttons">
            <button 
              onClick={() => setShowBulkCoverManager(true)} 
              className="bulk-cover-btn"
            >
              🖼️ Bulk Cover Operations
            </button>
          </div>
          <p className="action-description">
            Fetch, replace, or manage covers for multiple comics at once.
          </p>
        </div>

        <div className="action-section danger-section">
          <h4>Danger Zone</h4>
          <div className="action-buttons">
            <button onClick={clearAllData} className="clear-btn">
              🗑️ Clear All Data
            </button>
          </div>
          <p className="action-description">
            Permanently delete data from your collection. This action cannot be undone.
          </p>
        </div>
      </div>

      {/* Bulk Cover Manager Modal */}
      <BulkCoverManager
        comics={comics}
        isVisible={showBulkCoverManager}
        onClose={() => {
          setShowBulkCoverManager(false)
          // Refresh data like Add Comic flow does
          if (onRefresh) {
            console.log('[DataManager] Refreshing data after bulk cover operation')
            onRefresh()
          }
        }}
      />
    </div>
  )
}

export default DataManager