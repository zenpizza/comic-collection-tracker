import React, { useState, useEffect } from 'react'
import coverAPIService from '../utils/coverAPIService'
import './ProviderStatusNotice.css'

function ProviderStatusNotice() {
  const [providerStatus, setProviderStatus] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // Check if user has already dismissed the notice
    const dismissed = localStorage.getItem('provider-notice-dismissed')
    if (dismissed) {
      setIsDismissed(true)
      return
    }

    // Get provider status
    const status = coverAPIService.getProviderStatus()
    setProviderStatus(status)

    // Show notice if there are deprecated providers
    if (status.deprecated > 0) {
      setIsVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    localStorage.setItem('provider-notice-dismissed', 'true')
  }

  const handleShowDetails = () => {
    const deprecatedList = providerStatus.deprecatedProviders
      .map(p => `• ${p.name}: ${p.reason}`)
      .join('\n')
    
    const activeList = coverAPIService.getProviders()
      .filter(p => p.enabled && !p.deprecated)
      .map(p => `• ${p.name}`)
      .join('\n')

    alert(
      `Cover Provider Status Update\n\n` +
      `Deprecated Providers:\n${deprecatedList}\n\n` +
      `Active Providers:\n${activeList}\n\n` +
      `Your cover fetching functionality will continue to work with the active providers.`
    )
  }

  if (!isVisible || isDismissed || !providerStatus) {
    return null
  }

  return (
    <div className="provider-status-notice">
      <div className="notice-content">
        <div className="notice-icon">⚠️</div>
        <div className="notice-text">
          <strong>Cover Provider Update:</strong> Some cover providers have been deprecated. 
          {providerStatus.active > 0 ? (
            <span> {providerStatus.active} active provider{providerStatus.active !== 1 ? 's' : ''} available.</span>
          ) : (
            <span> Please configure an API key for Comic Vine to enable cover fetching.</span>
          )}
        </div>
        <div className="notice-actions">
          <button 
            className="details-btn"
            onClick={handleShowDetails}
          >
            Details
          </button>
          <button 
            className="dismiss-btn"
            onClick={handleDismiss}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProviderStatusNotice