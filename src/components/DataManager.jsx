import React, { useState, useRef } from 'react'
import dataStore from '../utils/dataStore'
import imageStorage from '../utils/imageStorage'
import imageCache from '../utils/imageCache'
import BulkCoverManager from './BulkCoverManager'
import './DataManager.css'

function DataManager({ comics, onImport, onRefresh, onComicsUpdate }) {
  const [stats, setStats] = useState(null)
  const [storageStats, setStorageStats] = useState(null)
  const [cacheStats, setCacheStats] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingStorage, setIsLoadingStorage] = useState(false)
  const [showBulkCoverManager, setShowBulkCoverManager] = useState(false)
  const fileInputRef = useRef(null)

  const loadStats = async () => {
    try {
      setIsLoading(true)
      const collectionStats = dataStore.getCollectionStats(comics)
      setStats(collectionStats)
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStorageStats = async () => {
    try {
      setIsLoadingStorage(true)
      const [storage, cache, quota] = await Promise.all([
        imageStorage.getStorageStats(),
        imageCache.getCacheStats(),
        imageStorage.checkStorageQuota()
      ])
      setStorageStats(storage)
      setCacheStats(cache)
      
      // Add quota info to storage stats
      if (quota) {
        setStorageStats(prev => ({ ...prev, quota }))
      }
    } catch (error) {
      console.error('Error loading storage stats:', error)
    } finally {
      setIsLoadingStorage(false)
    }
  }

  const clearImageCache = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear the image cache? This will remove all cached cover images but not the original stored images.'
    )
    
    if (confirmed) {
      try {
        setIsLoadingStorage(true)
        const clearedCount = await imageCache.clearCache()
        await loadStorageStats()
        alert(`Successfully cleared ${clearedCount} cached images.`)
      } catch (error) {
        console.error('Error clearing cache:', error)
        alert('Error clearing cache. Please try again.')
      } finally {
        setIsLoadingStorage(false)
      }
    }
  }

  const clearImageStorage = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear ALL stored images? This will permanently delete all cover images and cannot be undone.'
    )
    
    if (confirmed) {
      const doubleConfirmed = window.confirm(
        'This will permanently delete all cover images from your collection. Are you absolutely sure?'
      )
      
      if (doubleConfirmed) {
        try {
          setIsLoadingStorage(true)
          await imageStorage.clearStorage()
          await imageCache.clearCache()
          await loadStorageStats()
          alert('All image storage has been cleared.')
        } catch (error) {
          console.error('Error clearing storage:', error)
          alert('Error clearing storage. Please try again.')
        } finally {
          setIsLoadingStorage(false)
        }
      }
    }
  }

  const cleanupOldImages = async () => {
    const confirmed = window.confirm(
      'Clean up images older than 30 days? This will remove old cached and unused images to free up space.'
    )
    
    if (confirmed) {
      try {
        setIsLoadingStorage(true)
        const deletedCount = await imageStorage.cleanupOldImages()
        await imageCache.clearCache({ olderThan: Date.now() - (30 * 24 * 60 * 60 * 1000) })
        await loadStorageStats()
        alert(`Successfully cleaned up ${deletedCount} old images.`)
      } catch (error) {
        console.error('Error cleaning up images:', error)
        alert('Error cleaning up images. Please try again.')
      } finally {
        setIsLoadingStorage(false)
      }
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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

  const handleCoverUpdate = async (comicId, coverData) => {
    console.log('[DataManager] ===== handleCoverUpdate START =====')
    console.log('[DataManager] handleCoverUpdate called:', { comicId, coverData })
    
    // Extract metadata from coverData (it's nested inside metadata property)
    const metadataToApply = coverData.metadata || coverData
    
    console.log('[DataManager] Extracted metadata:', { 
      comicId, 
      volumeId: metadataToApply.volumeId, 
      volumeName: metadataToApply.volumeName,
      hasCover: metadataToApply.hasCover,
      fullMetadata: metadataToApply 
    })
    
    // Update local state
    if (onComicsUpdate) {
      onComicsUpdate(prevComics => 
        prevComics.map(comic => 
          comic.id === comicId 
            ? { ...comic, ...metadataToApply }
            : comic
        )
      )
    }
    
    // Persist to database
    try {
      const comicToUpdate = comics.find(c => c.id === comicId)
      if (comicToUpdate) {
        const updatedComic = { ...comicToUpdate, ...metadataToApply }
        console.log('[DataManager] Saving to database:', { 
          comicId, 
          volumeId: updatedComic.volumeId, 
          volumeName: updatedComic.volumeName,
          hasCover: updatedComic.hasCover,
          coverSource: updatedComic.coverSource,
          fullComic: updatedComic 
        })
        await dataStore.updateComic(updatedComic)
        console.log(`[DataManager] Saved cover metadata to database for comic: ${comicId}`)
      }
    } catch (error) {
      console.error('[DataManager] Failed to save cover metadata to database:', error)
      // Don't throw - the cover was uploaded successfully, just the metadata save failed
    }
  }

  const normalizeData = async () => {
    const confirmed = window.confirm(
      'This will normalize data types (ensure all issue numbers are strings) and remove duplicate records from the database. Continue?'
    )
    
    if (confirmed) {
      try {
        setIsLoading(true)
        const response = await fetch('/api/comics/normalize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const result = await response.json()
        
        if (result.success) {
          alert(
            `Data normalization completed!\n\n` +
            `Records normalized: ${result.stats.recordsNormalized}\n` +
            `Duplicates removed: ${result.stats.duplicatesRemoved}\n` +
            `Final record count: ${result.stats.finalCount}`
          )
          
          // Load fresh data from database and update state directly to avoid auto-save loop
          try {
            const freshComics = await dataStore.loadComics()
            onImport(freshComics)
          } catch (error) {
            console.error('Error loading fresh data:', error)
            // Fallback to refresh if direct load fails
            if (onRefresh) {
              await onRefresh()
            }
          }
        } else {
          throw new Error(result.error || 'Normalization failed')
        }
      } catch (error) {
        console.error('Error normalizing data:', error)
        alert(`Error normalizing data: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const runDeduplication = async () => {
    const confirmed = window.confirm(
      'This will scan for and remove duplicate comic records from the database. Continue?'
    )
    
    if (confirmed) {
      try {
        setIsLoading(true)
        const response = await fetch('/api/comics/dedupe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const result = await response.json()
        
        if (result.success) {
          alert(
            `Deduplication completed!\n\n` +
            `Duplicates removed: ${result.stats.duplicatesRemoved}\n` +
            `Unique comics remaining: ${result.stats.uniqueRemaining}`
          )
          
          // Load fresh data from database and update state directly to avoid auto-save loop
          try {
            const freshComics = await dataStore.loadComics()
            onImport(freshComics)
          } catch (error) {
            console.error('Error loading fresh data:', error)
            // Fallback to refresh if direct load fails
            if (onRefresh) {
              await onRefresh()
            }
          }
        } else {
          throw new Error(result.error || 'Deduplication failed')
        }
      } catch (error) {
        console.error('Error running deduplication:', error)
        alert(`Error running deduplication: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const cleanupIds = async () => {
    const confirmed = window.confirm(
      'This will standardize all comic IDs and years to numbers for consistency. Continue?'
    )
    
    if (confirmed) {
      try {
        setIsLoading(true)
        const response = await fetch('/api/comics/cleanup-ids', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const result = await response.json()
        
        if (result.success) {
          alert(
            `Number standardization completed!\n\n` +
            `Fields converted: ${result.stats.idsConverted}\n` +
            `Final ID types: ${result.stats.finalIdTypes.numbers} numbers, ${result.stats.finalIdTypes.strings} strings\n` +
            `Final year types: ${result.stats.finalYearTypes.numbers} numbers, ${result.stats.finalYearTypes.strings} strings, ${result.stats.finalYearTypes.empty} empty`
          )
          
          // Load fresh data from database and update state directly to avoid auto-save loop
          try {
            const freshComics = await dataStore.loadComics()
            onImport(freshComics)
          } catch (error) {
            console.error('Error loading fresh data:', error)
            // Fallback to refresh if direct load fails
            if (onRefresh) {
              await onRefresh()
            }
          }
        } else {
          throw new Error(result.error || 'ID cleanup failed')
        }
      } catch (error) {
        console.error('Error running ID cleanup:', error)
        alert(`Error running ID cleanup: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }
  }

  React.useEffect(() => {
    loadStats()
    loadStorageStats()
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

      {(storageStats || cacheStats) && (
        <div className="storage-section">
          <h3>Image Storage & Cache</h3>
          
          {storageStats && (
            <div className="storage-stats">
              <h4>Storage Statistics</h4>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-number">{storageStats.totalImages}</div>
                  <div className="stat-label">Stored Images</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{storageStats.totalSizeMB} MB</div>
                  <div className="stat-label">Storage Used</div>
                </div>
                {storageStats.quota && (
                  <>
                    <div className="stat-card">
                      <div className="stat-number">{formatBytes(storageStats.quota.available)}</div>
                      <div className="stat-label">Available Space</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">{storageStats.quota.usagePercentage}%</div>
                      <div className="stat-label">Storage Used</div>
                    </div>
                  </>
                )}
              </div>
              
              {storageStats.quota && parseFloat(storageStats.quota.usagePercentage) > 80 && (
                <div className="storage-warning">
                  ⚠️ Storage usage is high ({storageStats.quota.usagePercentage}%). Consider cleaning up old images.
                </div>
              )}
            </div>
          )}

          {cacheStats && (
            <div className="cache-stats">
              <h4>Cache Performance</h4>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-number">{cacheStats.memory.items}</div>
                  <div className="stat-label">Cached Items</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{cacheStats.memory.sizeMB} MB</div>
                  <div className="stat-label">Memory Used</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{cacheStats.performance.hitRate}%</div>
                  <div className="stat-label">Cache Hit Rate</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{cacheStats.memory.utilization}%</div>
                  <div className="stat-label">Cache Utilization</div>
                </div>
              </div>
              
              <div className="cache-details">
                <p><strong>Cache Hits:</strong> {cacheStats.performance.hits}</p>
                <p><strong>Cache Misses:</strong> {cacheStats.performance.misses}</p>
                <p><strong>Evictions:</strong> {cacheStats.performance.evictions}</p>
                <p><strong>Memory Limit:</strong> {cacheStats.memory.maxSizeMB} MB</p>
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

        <div className="action-section">
          <h4>Database Operations</h4>
          <div className="action-buttons">
            <button 
              onClick={normalizeData} 
              className="normalize-btn"
              disabled={isLoading}
            >
              🔧 Normalize & Dedupe Data
            </button>
            <button 
              onClick={runDeduplication} 
              className="dedupe-btn"
              disabled={isLoading}
            >
              🔍 Remove Duplicates
            </button>
            <button 
              onClick={cleanupIds} 
              className="cleanup-ids-btn"
              disabled={isLoading}
            >
              🔢 Standardize Numbers
            </button>
          </div>
          <p className="action-description">
            Fix data type inconsistencies, standardize numeric fields (IDs, years), and remove duplicate records.
          </p>
        </div>

        <div className="action-section">
          <h4>Storage Management</h4>
          <div className="action-buttons">
            <button 
              onClick={loadStorageStats} 
              className="refresh-btn"
              disabled={isLoadingStorage}
            >
              🔄 Refresh Storage Stats
            </button>
            <button 
              onClick={clearImageCache} 
              className="cache-btn"
              disabled={isLoadingStorage}
            >
              🧹 Clear Image Cache
            </button>
            <button 
              onClick={cleanupOldImages} 
              className="cleanup-btn"
              disabled={isLoadingStorage}
            >
              🗂️ Cleanup Old Images
            </button>
          </div>
          <p className="action-description">
            Manage image storage and cache to optimize performance and free up space.
          </p>
        </div>

        <div className="action-section danger-section">
          <h4>Danger Zone</h4>
          <div className="action-buttons">
            <button onClick={clearAllData} className="clear-btn">
              🗑️ Clear All Data
            </button>
            <button 
              onClick={clearImageStorage} 
              className="clear-btn"
              disabled={isLoadingStorage}
            >
              🖼️ Clear All Images
            </button>
          </div>
          <p className="action-description">
            Permanently delete data from your collection. These actions cannot be undone.
          </p>
        </div>
      </div>

      {/* Bulk Cover Manager Modal */}
      <BulkCoverManager
        comics={comics}
        onCoverUpdate={handleCoverUpdate}
        isVisible={showBulkCoverManager}
        onClose={() => setShowBulkCoverManager(false)}
      />
    </div>
  )
}

export default DataManager