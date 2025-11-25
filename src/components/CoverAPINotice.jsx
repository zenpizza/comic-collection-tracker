import React, { useState } from 'react'
import './CoverAPINotice.css'

function CoverAPINotice() {
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('cover-api-notice-dismissed') === 'true'
  })

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('cover-api-notice-dismissed', 'true')
  }

  if (isDismissed) {
    return null
  }

  return (
    <div className="cover-api-notice">
      <div className="notice-content">
        <div className="notice-icon">ℹ️</div>
        <div className="notice-text">
          <strong>🎉 Cover Fetching Active:</strong> Automatic cover fetching from Comic Vine is now working! 
          Backend proxy successfully implemented. Try entering "Batman" and "1" to test it out.
        </div>
        <button 
          className="dismiss-btn"
          onClick={handleDismiss}
          title="Dismiss this notice"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default CoverAPINotice