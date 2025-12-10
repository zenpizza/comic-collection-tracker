import React, { useState, useEffect } from 'react'
import ComicForm from './components/ComicForm'
import BulkImport from './components/BulkImport'
import CollectionView from './components/CollectionView'
import MissingIssues from './components/MissingIssues'
import DataManager from './components/DataManager'
import DuplicateManager from './components/DuplicateManager'
import BulkCoverManager from './components/BulkCoverManager'
import Toast from './components/Toast'
import ErrorHandlingTest from './components/ErrorHandlingTest'
import { ErrorFeedbackProvider } from './components/ErrorFeedback'
import dataStore from './utils/dataStore'
import coverErrorHandler from './utils/errorHandling'
import coverUpdateService from './utils/coverUpdateService'
import { getSortedUniqueSeriesNames } from './utils/sortUtils'
import './App.css'

// Error Boundary Component
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>The app encountered an error. Please refresh the page.</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  const [comics, setComics] = useState([])
  const [activeTab, setActiveTab] = useState('collection')
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saving', 'saved', 'error'
  const [showBulkCoverManager, setShowBulkCoverManager] = useState(false)
  const [bulkCoverFilterIds, setBulkCoverFilterIds] = useState(null)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [recentlyImportedIds, setRecentlyImportedIds] = useState(null)
  const [recentlyImportedCount, setRecentlyImportedCount] = useState(0)

  // Load comics from persistent storage on mount
  useEffect(() => {
    loadComicsFromStore()
  }, [])

  const loadComicsFromStore = async () => {
    try {
      setIsLoading(true)
      const loadedComics = await dataStore.loadComics()
      setComics(loadedComics)
    } catch (error) {
      console.error('Error loading comics:', error)
      setSaveStatus('error')
      
      // Handle error through error handler
      await coverErrorHandler.handleError(error, {
        operation: 'load_comics',
        context: 'app_initialization'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addComic = async (comic) => {
    // Check for duplicates before adding
    const duplicate = dataStore.checkForDuplicate(comic, comics)
    if (duplicate) {
      const confirmAdd = window.confirm(
        `A comic with the same series and issue number already exists:\n\n` +
        `"${duplicate.series} #${duplicate.issueNumber}"\n\n` +
        `Do you want to add it anyway?`
      )
      if (!confirmAdd) {
        console.log('Duplicate comic addition cancelled by user')
        return
      }
    }

    // Extract coverData before creating comic (it needs to be uploaded separately)
    const { coverData, ...comicWithoutCover } = comic

    // Don't generate ID - let MongoDB create ObjectId
    const newComic = {
      ...comicWithoutCover,
      dateAdded: new Date().toISOString()
    }
    
    try {
      setSaveStatus('saving')
      // Save to database first (backend will generate ObjectId)
      const savedComic = await dataStore.addComic(newComic)
      
      // If we have cover data and a valid comic ID, upload the cover
      if (coverData && savedComic?.id) {
        console.log('Uploading cover for new comic:', savedComic.id)
        try {
          // Get the image blob from coverData
          const imageBlob = coverData.originalFile || coverData.processed?.full
          if (imageBlob) {
            await coverUpdateService.addCover(savedComic.id, imageBlob, {
              source: coverData.metadata?.source || 'upload',
              provider: coverData.metadata?.provider,
              originalUrl: coverData.metadata?.originalUrl,
              attribution: coverData.metadata?.attribution,
              quality: coverData.metadata?.quality,
              dimensions: coverData.metadata?.dimensions,
              volumeId: coverData.metadata?.volumeId,
              volumeName: coverData.metadata?.volumeName
            })
            console.log('Cover uploaded successfully for comic:', savedComic.id)
          }
        } catch (coverError) {
          console.error('Failed to upload cover:', coverError)
          // Don't fail the whole operation if cover upload fails
          // The comic is already saved, user can add cover later
        }
      }
      
      // Then refresh from database to get the current state
      await loadComicsFromStore()
      setSaveStatus('saved')
    } catch (error) {
      console.error('Error adding comic:', error)
      setSaveStatus('error')
      // Handle error through error handler
      await coverErrorHandler.handleError(error, {
        operation: 'add_comic',
        context: 'user_action',
        comic: newComic
      })
    }
  }

  const addMultipleComics = async (comicsToAdd, expectedCount) => {
    // Check for duplicates in bulk import
    const duplicatesFound = []
    const uniqueComics = []
    
    comicsToAdd.forEach(comic => {
      const duplicate = dataStore.checkForDuplicate(comic, [...comics, ...uniqueComics])
      if (duplicate) {
        duplicatesFound.push(comic)
      } else {
        uniqueComics.push(comic)
      }
    })

    if (duplicatesFound.length > 0) {
      const confirmAdd = window.confirm(
        `Found ${duplicatesFound.length} potential duplicates in your bulk import:\n\n` +
        duplicatesFound.slice(0, 3).map(c => `"${c.series} #${c.issueNumber}"`).join('\n') +
        (duplicatesFound.length > 3 ? `\n...and ${duplicatesFound.length - 3} more` : '') +
        `\n\nDo you want to add only the unique comics (${uniqueComics.length}) and skip the duplicates?`
      )
      
      if (!confirmAdd) {
        console.log('Bulk import cancelled by user due to duplicates')
        return
      }
      
      console.log(`Skipping ${duplicatesFound.length} duplicates, adding ${uniqueComics.length} unique comics`)
    }

    // Don't generate IDs - let MongoDB create ObjectIds
    const newComics = uniqueComics.map(comic => ({
      ...comic,
      dateAdded: new Date().toISOString()
    }))
    
    try {
      setSaveStatus('saving')
      const beforeCount = comics.length
      
      // Save to database first using bulk operation
      await dataStore.saveComics([...comics, ...newComics])
      // Then refresh from database to get the current state
      await loadComicsFromStore()
      setSaveStatus('saved')
      
      // Get the newly added comics (last N comics by dateAdded)
      const afterComics = await dataStore.loadComics()
      const sortedByDate = [...afterComics].sort((a, b) => 
        new Date(b.dateAdded) - new Date(a.dateAdded)
      )
      const newlyAddedComics = sortedByDate.slice(0, uniqueComics.length)
      const newComicIds = newlyAddedComics.map(c => c.id)
      
      // Store the imported IDs for later display
      setRecentlyImportedIds(newComicIds)
      setRecentlyImportedCount(uniqueComics.length)
      
      // Show success message and prompt for cover fetch
      const fetchCovers = window.confirm(
        `Successfully imported ${uniqueComics.length} comics!\n\n` +
        `Would you like to fetch covers for these comics now?`
      )
      
      if (fetchCovers) {
        setBulkCoverFilterIds(newComicIds)
        setShowBulkCoverManager(true)
      } else {
        // If user skips cover fetch, show toast immediately
        setToastMessage(`✓ Successfully imported ${uniqueComics.length} comics!`)
        setShowToast(true)
      }
    } catch (error) {
      console.error('Error adding multiple comics:', error)
      setSaveStatus('error')
      // Handle error through error handler
      await coverErrorHandler.handleError(error, {
        operation: 'add_multiple_comics',
        context: 'bulk_import',
        comicCount: newComics.length
      })
    }
  }

  const removeComic = async (id) => {
    try {
      setSaveStatus('saving')
      // Delete from database using RESTful endpoint
      await dataStore.deleteComic(id)
      // Then refresh from database to get the current state
      await loadComicsFromStore()
      setSaveStatus('saved')
    } catch (error) {
      console.error('Error deleting comic:', error)
      setSaveStatus('error')
      // Handle error through error handler
      await coverErrorHandler.handleError(error, {
        operation: 'delete_comic',
        context: 'user_action',
        comicId: id
      })
    }
  }

  const editComic = async (updatedComic) => {
    try {
      setSaveStatus('saving')
      // Update in database using RESTful endpoint
      await dataStore.updateComic(updatedComic)
      // Then refresh from database to get the current state
      await loadComicsFromStore()
      setSaveStatus('saved')
    } catch (error) {
      console.error('Error updating comic:', error)
      setSaveStatus('error')
      // Handle error through error handler
      await coverErrorHandler.handleError(error, {
        operation: 'update_comic',
        context: 'user_action',
        comic: updatedComic
      })
    }
  }

  const handleBulkCoverUpdate = async (comicId, coverData) => {
    try {
      setSaveStatus('saving')
      // Refresh from database to get updated cover data
      await loadComicsFromStore()
      setSaveStatus('saved')
    } catch (error) {
      console.error('Error after cover update:', error)
      setSaveStatus('error')
    }
  }

  const handleCloseBulkCoverManager = async () => {
    setShowBulkCoverManager(false)
    setBulkCoverFilterIds(null)
    
    // Refresh comics data to reflect updated hasCover flags
    await loadComicsFromStore()
    
    // Show toast if we have recently imported comics
    if (recentlyImportedIds && recentlyImportedIds.length > 0) {
      setToastMessage(`✓ Successfully imported ${recentlyImportedCount} comics!`)
      setShowToast(true)
    }
  }

  const handleViewRecentlyImported = () => {
    setShowToast(false)
    setActiveTab('collection')
  }

  const handleClearRecentFilter = () => {
    setRecentlyImportedIds(null)
    setRecentlyImportedCount(0)
  }

  return (
    <AppErrorBoundary>
      <ErrorFeedbackProvider errorHandler={coverErrorHandler}>
        <div className="app">
        <header className="app-header">
          <h1>📚 Comic Collection</h1>
          <div className="save-status">
            {isLoading && <span className="status loading">Loading...</span>}
            {!isLoading && saveStatus === 'saving' && <span className="status saving">Saving...</span>}
            {!isLoading && saveStatus === 'saved' && <span className="status saved">✓ Saved</span>}
            {!isLoading && saveStatus === 'error' && <span className="status error">⚠ Save Error</span>}
          </div>
        </header>

      <nav className="tab-nav">
        <button 
          className={activeTab === 'collection' ? 'active' : ''}
          onClick={() => setActiveTab('collection')}
        >
          My Collection
        </button>
        <button 
          className={activeTab === 'missing' ? 'active' : ''}
          onClick={() => setActiveTab('missing')}
        >
          Missing Issues
        </button>
        <button 
          className={activeTab === 'add' ? 'active' : ''}
          onClick={() => setActiveTab('add')}
        >
          Add Comic
        </button>
        <button 
          className={activeTab === 'bulk' ? 'active' : ''}
          onClick={() => setActiveTab('bulk')}
        >
          Bulk Import
        </button>
        <button 
          className={activeTab === 'duplicates' ? 'active' : ''}
          onClick={() => setActiveTab('duplicates')}
        >
          Duplicates
        </button>
        <button 
          className={activeTab === 'data' ? 'active' : ''}
          onClick={() => setActiveTab('data')}
        >
          Data Manager
        </button>
        <button 
          className={activeTab === 'test-errors' ? 'active' : ''}
          onClick={() => setActiveTab('test-errors')}
        >
          🧪 Test Errors
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'collection' && (
          <CollectionView 
            comics={comics} 
            onRemove={removeComic} 
            onEdit={editComic}
            recentlyImportedIds={recentlyImportedIds}
            onClearRecentFilter={handleClearRecentFilter}
          />
        )}
        {activeTab === 'missing' && (
          <MissingIssues comics={comics} />
        )}
        {activeTab === 'add' && (
          <ComicForm 
            onAdd={addComic} 
            existingSeries={getSortedUniqueSeriesNames(comics)} 
            existingPublishers={[...new Set(comics.map(comic => comic.publisher).filter(Boolean))]}
            existingComics={comics}
          />
        )}
        {activeTab === 'bulk' && (
          <BulkImport 
            onAddMultiple={addMultipleComics} 
            existingSeries={getSortedUniqueSeriesNames(comics)} 
            existingPublishers={[...new Set(comics.map(comic => comic.publisher).filter(Boolean))]}
          />
        )}
        {activeTab === 'duplicates' && (
          <DuplicateManager 
            comics={comics} 
            onComicsUpdate={setComics}
          />
        )}
        {activeTab === 'data' && (
          <DataManager 
            comics={comics} 
            onImport={setComics}
            onRefresh={loadComicsFromStore}
            onComicsUpdate={setComics}
          />
        )}
        {activeTab === 'test-errors' && (
          <ErrorHandlingTest />
        )}
      </main>

      {/* Bulk Cover Manager Modal - can be opened from bulk import */}
      <BulkCoverManager
        comics={comics}
        onCoverUpdate={handleBulkCoverUpdate}
        isVisible={showBulkCoverManager}
        onClose={handleCloseBulkCoverManager}
        initialFilterIds={bulkCoverFilterIds}
      />

      {/* Toast notification for successful imports */}
      {showToast && (
        <Toast
          message={toastMessage}
          action="View Collection →"
          onActionClick={handleViewRecentlyImported}
          onClose={() => setShowToast(false)}
          duration={8000}
        />
      )}
    </div>
      </ErrorFeedbackProvider>
    </AppErrorBoundary>
  )
}

export default App