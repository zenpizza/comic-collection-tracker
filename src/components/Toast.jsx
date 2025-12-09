import React, { useEffect } from 'react'
import './Toast.css'

function Toast({ message, action, onActionClick, onClose, duration = 5000 }) {
  useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  return (
    <div className="toast">
      <span className="toast-message">{message}</span>
      {action && onActionClick && (
        <button className="toast-action" onClick={onActionClick}>
          {action}
        </button>
      )}
      {onClose && (
        <button className="toast-close" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  )
}

export default Toast
