import React, { useState } from 'react'
import './BulkImport.css'

function BulkImport({ onAddMultiple, existingSeries = [], existingPublishers = [] }) {
  const [importMethod, setImportMethod] = useState('text')
  const [textInput, setTextInput] = useState('')
  const [rangeData, setRangeData] = useState({
    series: '',
    publisher: '',
    year: '',
    startIssue: '',
    endIssue: '',
    skipIssues: ''
  })
  const [previewComics, setPreviewComics] = useState([])
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false)
  const [filteredSeries, setFilteredSeries] = useState([])
  const [showPublisherDropdown, setShowPublisherDropdown] = useState(false)
  const [filteredPublishers, setFilteredPublishers] = useState([])

  const parseTextInput = () => {
    const lines = textInput.trim().split('\n').filter(line => line.trim())
    const comics = []

    for (const line of lines) {
      // Try to parse different formats
      const comic = parseComicLine(line.trim())
      if (comic) {
        comics.push(comic)
      }
    }

    setPreviewComics(comics)
  }

  const parseComicLine = (line) => {
    // Supported formats:
    // 1. Comma-separated: "Amazing Spider-Man, 1, Marvel, 2023"
    // 2. Escaped commas: "Firestorm\, the Nuclear Man, 90, DC, 1990"
    // 3. Hash format: "Amazing Spider-Man #1"

    // Try comma-separated format first
    if (line.includes(',')) {
      // Handle escaped commas: replace \, with a placeholder before splitting
      const COMMA_PLACEHOLDER = '___COMMA___'
      const processedLine = line.replace(/\\,/g, COMMA_PLACEHOLDER)
      
      const parts = processedLine.split(',').map(p => {
        // Restore escaped commas and trim
        return p.replace(new RegExp(COMMA_PLACEHOLDER, 'g'), ',').trim()
      })
      
      if (parts.length >= 2) {
        return {
          series: parts[0],
          issueNumber: parts[1],
          publisher: parts[2] || '',
          year: parts[3] || '',
          variant: '',
          notes: ''
        }
      }
    }

    // Try hash format: "Series #Number"
    const hashIndex = line.indexOf('#')
    if (hashIndex !== -1) {
      const series = line.substring(0, hashIndex).trim()
      const issueNumber = line.substring(hashIndex + 1).trim()
      
      return {
        series: series,
        issueNumber: issueNumber,
        publisher: '',
        year: '',
        variant: '',
        notes: ''
      }
    }

    return null
  }

  const generateRangeComics = () => {
    if (!rangeData.series || !rangeData.startIssue || !rangeData.endIssue) {
      alert('Please fill in series name, start issue, and end issue')
      return
    }

    const start = parseInt(rangeData.startIssue)
    const end = parseInt(rangeData.endIssue)
    const skipList = rangeData.skipIssues
      .split(',')
      .map(n => parseInt(n.trim()))
      .filter(n => !isNaN(n))

    const comics = []
    for (let i = start; i <= end; i++) {
      if (!skipList.includes(i)) {
        comics.push({
          series: rangeData.series,
          issueNumber: i.toString(),
          publisher: rangeData.publisher,
          year: rangeData.year,
          variant: '',
          notes: ''
        })
      }
    }

    setPreviewComics(comics)
  }

  const handleImport = () => {
    if (previewComics.length === 0) {
      alert('No comics to import. Please generate a preview first.')
      return
    }

    const importCount = previewComics.length
    onAddMultiple(previewComics, importCount)
    
    // Reset form
    setTextInput('')
    setRangeData({
      series: '',
      publisher: '',
      year: '',
      startIssue: '',
      endIssue: '',
      skipIssues: ''
    })
    setPreviewComics([])
  }

  const removeFromPreview = (index) => {
    setPreviewComics(prev => prev.filter((_, i) => i !== index))
  }

  const handleRangeDataChange = (field, value) => {
    setRangeData(prev => ({...prev, [field]: value}))

    // Handle series autocomplete
    if (field === 'series') {
      if (value.length > 0) {
        // existingSeries is already sorted from App.jsx using getSortedUniqueSeriesNames
        const filtered = existingSeries.filter(series =>
          series.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredSeries(filtered)
        setShowSeriesDropdown(filtered.length > 0)
      } else {
        setShowSeriesDropdown(false)
      }
    }

    // Handle publisher autocomplete
    if (field === 'publisher') {
      if (value.length > 0) {
        const filtered = existingPublishers.filter(publisher =>
          publisher.toLowerCase().includes(value.toLowerCase())
        )
        setFilteredPublishers(filtered)
        setShowPublisherDropdown(filtered.length > 0)
      } else {
        setShowPublisherDropdown(false)
      }
    }
  }

  const selectSeries = (series) => {
    setRangeData(prev => ({...prev, series: series}))
    setShowSeriesDropdown(false)
  }

  const selectPublisher = (publisher) => {
    setRangeData(prev => ({...prev, publisher: publisher}))
    setShowPublisherDropdown(false)
  }

  const handleSeriesFocus = () => {
    if (existingSeries.length > 0 && rangeData.series === '') {
      // existingSeries is already sorted from App.jsx
      setFilteredSeries(existingSeries)
      setShowSeriesDropdown(true)
    }
  }

  const handlePublisherFocus = () => {
    if (existingPublishers.length > 0 && rangeData.publisher === '') {
      setFilteredPublishers(existingPublishers)
      setShowPublisherDropdown(true)
    }
  }

  const handleDropdownBlur = (type) => {
    // Delay hiding dropdown to allow for clicks
    setTimeout(() => {
      if (type === 'series') {
        setShowSeriesDropdown(false)
      } else if (type === 'publisher') {
        setShowPublisherDropdown(false)
      }
    }, 200)
  }

  return (
    <div className="bulk-import">
      <div className="bulk-header">
        <h2>Bulk Import Comics</h2>
        <p>Add multiple comics to your collection at once</p>
      </div>

      <div className="import-methods">
        <div className="method-tabs">
          <button 
            className={importMethod === 'text' ? 'active' : ''}
            onClick={() => setImportMethod('text')}
          >
            Text Import
          </button>
          <button 
            className={importMethod === 'range' ? 'active' : ''}
            onClick={() => setImportMethod('range')}
          >
            Issue Range
          </button>
        </div>

        {importMethod === 'text' && (
          <div className="text-import">
            <div className="form-group">
              <label htmlFor="text-input">
                Paste your comics list (one per line):
              </label>
              <div className="format-examples">
                <p><strong>Supported formats:</strong></p>
                <ul>
                  <li>Amazing Spider-Man #1</li>
                  <li>Amazing Spider-Man, 1, Marvel, 2023</li>
                  <li>Firestorm\, the Nuclear Man, 90, DC, 1990 <em>(use \, to escape commas in titles)</em></li>
                </ul>
              </div>
              <textarea
                id="text-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Amazing Spider-Man #1&#10;X-Men, 1, Marvel, 2023&#10;Batman, 1, DC, 2016"
                rows="10"
                className="text-input"
              />
            </div>
            <button onClick={parseTextInput} className="preview-btn">
              Generate Preview
            </button>
          </div>
        )}

        {importMethod === 'range' && (
          <div className="range-import">
            <div className="range-form">
              <div className="form-group">
                <label htmlFor="range-series">Series Name *</label>
                <div className="bulk-series-container">
                  <input
                    type="text"
                    id="range-series"
                    value={rangeData.series}
                    onChange={(e) => handleRangeDataChange('series', e.target.value)}
                    onFocus={handleSeriesFocus}
                    onBlur={() => handleDropdownBlur('series')}
                    placeholder="e.g., Amazing Spider-Man"
                    required
                    autoComplete="off"
                  />
                  {showSeriesDropdown && (
                    <div className="bulk-series-dropdown">
                      {filteredSeries.map((series, index) => (
                        <div
                          key={index}
                          className="bulk-series-option"
                          onClick={() => selectSeries(series)}
                        >
                          {series}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="start-issue">Start Issue *</label>
                  <input
                    type="number"
                    id="start-issue"
                    value={rangeData.startIssue}
                    onChange={(e) => setRangeData(prev => ({...prev, startIssue: e.target.value}))}
                    placeholder="1"
                    min="1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="end-issue">End Issue *</label>
                  <input
                    type="number"
                    id="end-issue"
                    value={rangeData.endIssue}
                    onChange={(e) => setRangeData(prev => ({...prev, endIssue: e.target.value}))}
                    placeholder="50"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="range-publisher">Publisher</label>
                  <div className="bulk-publisher-container">
                    <input
                      type="text"
                      id="range-publisher"
                      value={rangeData.publisher}
                      onChange={(e) => handleRangeDataChange('publisher', e.target.value)}
                      onFocus={handlePublisherFocus}
                      onBlur={() => handleDropdownBlur('publisher')}
                      placeholder="e.g., Marvel"
                      autoComplete="off"
                    />
                    {showPublisherDropdown && (
                      <div className="bulk-publisher-dropdown">
                        {filteredPublishers.map((publisher, index) => (
                          <div
                            key={index}
                            className="bulk-publisher-option"
                            onClick={() => selectPublisher(publisher)}
                          >
                            {publisher}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="range-year">Year</label>
                  <input
                    type="number"
                    id="range-year"
                    value={rangeData.year}
                    onChange={(e) => setRangeData(prev => ({...prev, year: e.target.value}))}
                    placeholder="2023"
                    min="1900"
                    max="2030"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="skip-issues">Skip Issues (comma-separated)</label>
                <input
                  type="text"
                  id="skip-issues"
                  value={rangeData.skipIssues}
                  onChange={(e) => setRangeData(prev => ({...prev, skipIssues: e.target.value}))}
                  placeholder="e.g., 5, 12, 25"
                />
              </div>
            </div>

            <button onClick={generateRangeComics} className="preview-btn">
              Generate Preview
            </button>
          </div>
        )}
      </div>

      {previewComics.length > 0 && (
        <div className="preview-section">
          <div className="preview-header">
            <h3>Preview ({previewComics.length} comics)</h3>
            <div className="preview-actions">
              <button onClick={() => setPreviewComics([])} className="clear-btn">
                Clear All
              </button>
              <button onClick={handleImport} className="import-btn">
                Import All Comics
              </button>
            </div>
          </div>

          <div className="preview-list">
            {previewComics.map((comic, index) => (
              <div key={index} className="preview-item">
                <div className="comic-preview">
                  <div className="comic-title">
                    <strong>{comic.series} #{comic.issueNumber}</strong>
                    {comic.variant && <span className="variant">({comic.variant})</span>}
                  </div>
                  <div className="comic-details">
                    {comic.publisher && <span>{comic.publisher}</span>}
                    {comic.year && <span>{comic.year}</span>}
                    {comic.notes && <span className="notes">{comic.notes}</span>}
                  </div>
                </div>
                <button 
                  onClick={() => removeFromPreview(index)}
                  className="remove-preview-btn"
                  title="Remove from import"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default BulkImport