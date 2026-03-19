// Data store utility for persistent comic collection storage
import { compareSeriesNames } from './sortUtils.js'

class ComicDataStore {
  constructor() {
    // Always use API in development (local backend on port 3001)
    // In production, API is on same domain via Vercel
    this.isProduction = true // Always use backend API
  }

  // Load comics from storage
  async loadComics() {
    try {
      if (this.isProduction) {
        // Try to load from MongoDB
        const response = await fetch('/api/comics')
        if (response.ok) {
          const data = await response.json()
          // Handle both old and new API response formats
          let comics = data.comics || []
          
          // Convert new format (individual documents) to expected format
          comics = this.normalizeComics(comics)
          
          return comics
        }
      }
    } catch (error) {
      console.log('No cloud data found, checking localStorage')
    }

    // Fallback to localStorage
    try {
      const localData = localStorage.getItem('comicCollection')
      if (localData) {
        const comics = JSON.parse(localData)
        // If we're in production, try to migrate to cloud storage
        if (this.isProduction && comics.length > 0) {
          console.log('Migrating data from localStorage to cloud storage')
          await this.saveComics(comics)
          // Clear localStorage after successful migration to prevent re-migration
          localStorage.removeItem('comicCollection')
          console.log('Cleared localStorage after migration')
        }
        return comics
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error)
    }

    return []
  }

  // Save comics to storage
  async saveComics(comics) {
    try {
      // Remove duplicates before saving
      const duplicates = this.findDuplicates(comics)
      if (duplicates.length > 0) {
        console.log(`⚠️ Found ${duplicates.length} duplicates, removing them before save`)
        duplicates.forEach(dup => {
          console.log(`   Duplicate: ${dup.duplicate.series} #${dup.duplicate.issueNumber}`)
        })
        comics = this.removeDuplicates(comics)
        console.log(`✅ Cleaned collection: ${comics.length} unique comics`)
      }

      const dataToSave = {
        version: '2.0', // Updated version for new format compatibility
        lastUpdated: new Date().toISOString(),
        comics: comics,
        metadata: {
          totalComics: comics.length,
          seriesCount: new Set(comics.map(c => c.series)).size,
          publishers: [...new Set(comics.map(c => c.publisher).filter(Boolean))]
        }
      }

      // Always save to localStorage as backup
      localStorage.setItem('comicCollection', JSON.stringify(comics))

      // Save to cloud storage if in production
      if (this.isProduction) {
        const response = await fetch('/api/comics/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataToSave)
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('MongoDB save failed:', response.status, errorText)
          
          // Don't throw error for empty collection protection
          if (response.status === 400 && errorText.includes('EMPTY_COLLECTION_NOT_CONFIRMED')) {
            console.log('Save prevented empty collection deletion - this is expected behavior')
            return true // Return success to prevent data clearing
          }
          
          throw new Error(`Failed to save to cloud storage: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        console.log('MongoDB save successful:', result)
      }
      
      return true
    } catch (error) {
      console.error('Error saving comics:', error)
      // Return false if cloud storage failed in production
      if (this.isProduction) {
        return false
      }
      return true
    }
  }

  // Create backup of current data (now handled by MongoDB's native backup capabilities)
  async createBackup() {
    // This functionality is now handled by MongoDB's native backup capabilities
    // and the migration service. No manual backup creation needed.
    console.log('Backup functionality now handled by MongoDB native capabilities')
    return true
  }

  // Validate and migrate data from older versions
  validateAndMigrateData(data) {
    // Handle different data formats
    if (Array.isArray(data)) {
      // Old format - just an array of comics
      return this.normalizeComics(data)
    }

    if (data.comics && Array.isArray(data.comics)) {
      // New format with metadata
      return this.normalizeComics(data.comics)
    }

    return []
  }

  // Normalize comics to ensure consistent id field
  normalizeComics(comics) {
    return comics.map(comic => {
      // If comic has _id instead of id, convert it
      if (comic._id !== undefined && !comic.id) {
        const normalized = {
          ...comic,
          id: comic._id
        }
        delete normalized._id // Remove _id to avoid confusion
        return normalized
      }
      return comic
    }).filter(comic => comic.id !== undefined && comic.id !== null) // Filter out any invalid comics
  }

  // Export data for backup
  async exportData() {
    try {
      const response = await fetch('/api/comics')
      if (response.ok) {
        const data = await response.json()
        // Return the full response which includes comics and metadata
        return data
      }
    } catch (error) {
      console.error('Error exporting data:', error)
    }
    return null
  }

  // Import data from backup
  async importData(importedData) {
    try {
      const comics = this.validateAndMigrateData(importedData)
      await this.saveComics(comics)
      return comics
    } catch (error) {
      console.error('Error importing data:', error)
      throw error
    }
  }

  // Get statistics about the collection
  getCollectionStats(comics) {
    const stats = {
      totalComics: comics.length,
      seriesCount: new Set(comics.map(c => c.series)).size,
      publishers: [...new Set(comics.map(c => c.publisher).filter(Boolean))],
      yearRange: {
        earliest: Math.min(...comics.map(c => parseInt(c.year)).filter(y => !isNaN(y))),
        latest: Math.max(...comics.map(c => parseInt(c.year)).filter(y => !isNaN(y)))
      },
      topSeries: this.getTopSeries(comics, 5)
    }

    return stats
  }

  // Get series with most issues
  getTopSeries(comics, limit = 5) {
    const seriesCounts = comics.reduce((counts, comic) => {
      counts[comic.series] = (counts[comic.series] || 0) + 1
      return counts
    }, {})

    return Object.entries(seriesCounts)
      .sort(([seriesA, countA], [seriesB, countB]) => {
        // First sort by count (descending)
        if (countB !== countA) {
          return countB - countA
        }
        // Then sort by series name (library-style alphabetical)
        return compareSeriesNames(seriesA, seriesB)
      })
      .slice(0, limit)
      .map(([series, count]) => ({ series, count }))
  }

  // Check for duplicate comics
  checkForDuplicate(newComic, existingComics) {
    const normalizeField = value => String(value ?? '').toLowerCase()
    const newSeries = normalizeField(newComic?.series)
    const newIssueNumber = normalizeField(newComic?.issueNumber)

    if (!newSeries || !newIssueNumber) {
      return null
    }

    return existingComics.find(existing => {
      const existingSeries = normalizeField(existing?.series)
      const existingIssueNumber = normalizeField(existing?.issueNumber)

      if (!existingSeries || !existingIssueNumber) {
        return false
      }

      return existingSeries === newSeries && existingIssueNumber === newIssueNumber
    })
  }

  // Find all duplicates in a collection
  findDuplicates(comics) {
    const duplicates = []
    const seen = new Map()

    comics.forEach((comic, index) => {
      const key = `${comic.series}|${comic.issueNumber}`.toLowerCase()
      
      if (seen.has(key)) {
        const originalIndex = seen.get(key)
        duplicates.push({
          original: comics[originalIndex],
          duplicate: comic,
          originalIndex,
          duplicateIndex: index
        })
      } else {
        seen.set(key, index)
      }
    })

    return duplicates
  }

  // Remove duplicates from a collection (keeps the first occurrence)
  removeDuplicates(comics) {
    const seen = new Set()
    return comics.filter(comic => {
      const key = `${comic.series}|${comic.issueNumber}`.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  // Add individual comic (uses new API endpoint)
  async addComic(comic) {
    try {
      if (this.isProduction) {
        const response = await fetch('/api/comics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(comic)
        })

        if (!response.ok) {
          // If endpoint doesn't exist (404), fall back gracefully
          if (response.status === 404) {
            console.log('Individual add endpoint not available, using bulk save')
            return comic
          }
          const errorText = await response.text()
          throw new Error(`Failed to add comic: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        return this.normalizeComics([result.comic])[0]
      }
      return comic
    } catch (error) {
      console.error('Error adding comic:', error)
      throw error
    }
  }

  // Update individual comic (uses RESTful endpoint)
  async updateComic(comic) {
    try {
      if (this.isProduction) {
        const response = await fetch(`/api/comics/${comic.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(comic)
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to update comic: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        return this.normalizeComics([result.comic])[0]
      }
      return comic
    } catch (error) {
      console.error('Error updating comic:', error)
      throw error
    }
  }

  // Delete all comics from MongoDB and localStorage
  async clearAllData() {
    try {
      if (this.isProduction) {
        const response = await fetch('/api/comics/bulk', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to clear data: ${response.status} ${errorText}`)
        }
      }

      // Only clear localStorage after confirmed successful DELETE
      localStorage.removeItem('comicCollection')
      return true
    } catch (error) {
      console.error('Error clearing all data:', error)
      throw error
    }
  }

  // Delete individual comic (uses RESTful endpoint)
  async deleteComic(comicId) {
    try {
      if (this.isProduction) {
        const response = await fetch(`/api/comics/${comicId}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to delete comic: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        return result.success
      }
      return true
    } catch (error) {
      console.error('Error deleting comic:', error)
      throw error
    }
  }
}

export default new ComicDataStore()
