import React, { useState, useEffect } from 'react'
import coverAPIService from '../utils/coverAPIService'
import './CoverAPISettings.css'

function CoverAPISettings({ isVisible, onClose }) {
  const [apiKeys, setApiKeys] = useState({
    comicvine: ''
  })
  const [providers, setProviders] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    if (isVisible) {
      loadCurrentSettings()
    }
  }, [isVisible])

  const loadCurrentSettings = () => {
    // Load current API keys from localStorage
    const savedKeys = {
      comicvine: localStorage.getItem('comicvine_api_key') || ''
    }
    setApiKeys(savedKeys)

    // Get provider information
    const providerList = coverAPIService.getProviders()
    setProviders(providerList)
  }

  const handleApiKeyChange = (provider, value) => {
    setApiKeys(prev => ({
      ...prev,
      [provider]: value
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage('')

    try {
      // Save API keys to localStorage
      Object.entries(apiKeys).forEach(([provider, key]) => {
        if (key.trim()) {
          localStorage.setItem(`${provider}_api_key`, key.trim())
        } else {
          localStorage.removeItem(`${provider}_api_key`)
        }
      })

      // Update the cover API service with new keys
      await updateCoverAPIService()

      setSaveMessage('Settings saved successfully!')
      setTimeout(() => setSaveMessage(''), 3000)

    } catch (error) {
      console.error('Error saving settings:', error)
      setSaveMessage('Error saving settings. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const updateCoverAPIService = async () => {
    // Reinitialize providers with new API keys
    coverAPIService.providers.get('comicvine').apiKey = 
      localStorage.getItem('comicvine_api_key') || ''

    // Enable/disable providers based on API key availability
    const comicvineProvider = coverAPIService.providers.get('comicvine')
    if (comicvineProvider) {
      comicvineProvider.enabled = !!comicvineProvider.apiKey
    }
  }

  const handleTestConnection = async (provider) => {
    const apiKey = apiKeys[provider]
    if (!apiKey.trim()) {
      alert('Please enter an API key first')
      return
    }

    try {
      // Temporarily update the provider with the test key
      const originalKey = coverAPIService.providers.get(provider).apiKey
      coverAPIService.providers.get(provider).apiKey = apiKey.trim()

      // Test the connection with a simple search
      const results = await coverAPIService.searchProvider(provider, 'Batman', '1', 'DC')
      
      // Restore original key
      coverAPIService.providers.get(provider).apiKey = originalKey

      if (results.length > 0) {
        alert(`✅ Connection successful! Found ${results.length} result(s).`)
      } else {
        alert('⚠️ Connection successful but no results found. This might be normal.')
      }

    } catch (error) {
      alert(`❌ Connection failed: ${error.message}`)
    }
  }

  const getProviderInstructions = (provider) => {
    switch (provider) {
      case 'comicvine':
        return {
          url: 'https://comicvine.gamespot.com/api/',
          steps: [
            '1. Create a Comic Vine account',
            '2. Visit the API page',
            '3. Generate an API key',
            '4. Copy and paste the key below'
          ]
        }
      default:
        return null
    }
  }

  if (!isVisible) return null

  return (
    <div className="cover-api-settings-overlay">
      <div className="cover-api-settings-modal">
        <div className="settings-header">
          <h3>Cover API Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <div className="settings-intro">
            <p>Configure API keys for external cover providers to enable automatic cover fetching.</p>
          </div>

          {providers.map(provider => {
            const instructions = getProviderInstructions(provider.id)
            
            return (
              <div key={provider.id} className="provider-section">
                <div className="provider-header">
                  <h4>
                    {provider.name}
                    {provider.deprecated && <span className="deprecated-badge">Deprecated</span>}
                  </h4>
                  <div className="provider-status">
                    {provider.enabled ? (
                      <span className="status-enabled">✅ Enabled</span>
                    ) : (
                      <span className="status-disabled">❌ Disabled</span>
                    )}
                  </div>
                </div>

                {provider.deprecated ? (
                  <div className="deprecated-notice">
                    <p>⚠️ This provider is deprecated and will be removed in a future update.</p>
                  </div>
                ) : (
                  <>
                    <div className="api-key-input">
                      <label htmlFor={`${provider.id}-key`}>API Key:</label>
                      <div className="input-group">
                        <input
                          id={`${provider.id}-key`}
                          type="password"
                          value={apiKeys[provider.id] || ''}
                          onChange={(e) => handleApiKeyChange(provider.id, e.target.value)}
                          placeholder="Enter your API key"
                          className="api-key-field"
                        />
                        <button
                          type="button"
                          onClick={() => handleTestConnection(provider.id)}
                          className="test-btn"
                          disabled={!apiKeys[provider.id]?.trim()}
                        >
                          Test
                        </button>
                      </div>
                    </div>

                    {instructions && (
                      <div className="provider-instructions">
                        <h5>How to get an API key:</h5>
                        <ol>
                          {instructions.steps.map((step, index) => (
                            <li key={index}>{step}</li>
                          ))}
                        </ol>
                        <p>
                          <a 
                            href={instructions.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="api-link"
                          >
                            Visit {provider.name} API →
                          </a>
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {saveMessage && (
            <div className={`save-message ${saveMessage.includes('Error') ? 'error' : 'success'}`}>
              {saveMessage}
            </div>
          )}

          <div className="settings-actions">
            <button
              type="button"
              onClick={handleSave}
              className="save-btn"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoverAPISettings