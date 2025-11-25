import React, { useState } from 'react'
import coverErrorHandler from '../utils/errorHandling'
import coverRecoveryService from '../utils/coverRecoveryService'
import ErrorFeedback from './ErrorFeedback'

/**
 * Test component for error handling system
 * Use this to test different error scenarios in production
 */
function ErrorHandlingTest() {
  const [currentError, setCurrentError] = useState(null)
  const [testResults, setTestResults] = useState([])

  const testScenarios = [
    {
      name: 'Network Error',
      error: new Error('Failed to fetch'),
      context: { operation: 'cover_search', provider: 'comicvine' }
    },
    {
      name: 'Storage Quota Error',
      error: { name: 'QuotaExceededError', message: 'Storage quota exceeded' },
      context: { operation: 'image_storage', comicId: 'test-comic' }
    },
    {
      name: 'Rate Limit Error',
      error: { status: 429, message: 'Too many requests' },
      context: { operation: 'api_request', provider: 'comicvine' }
    },
    {
      name: 'Image Processing Error',
      error: new Error('Failed to load image'),
      context: { operation: 'image_processing', fileType: 'image/jpeg' }
    },
    {
      name: 'Upload Error',
      error: { status: 500, message: 'Internal server error' },
      context: { operation: 'upload', strategy: 'remote' }
    },
    {
      name: 'Validation Error',
      error: new Error('Unsupported format: image/bmp'),
      context: { operation: 'file_validation', fileType: 'image/bmp' }
    }
  ]

  const runErrorTest = async (scenario) => {
    try {
      console.log(`Testing: ${scenario.name}`)
      
      const startTime = Date.now()
      const errorResult = await coverErrorHandler.handleError(scenario.error, scenario.context)
      const recoveryResult = await coverRecoveryService.attemptRecovery(scenario.error, scenario.context)
      const endTime = Date.now()

      const result = {
        scenario: scenario.name,
        success: true,
        duration: endTime - startTime,
        errorHandled: !!errorResult.userMessage,
        recoveryAvailable: recoveryResult.success || !!recoveryResult.manualStrategies,
        errorResult,
        recoveryResult
      }

      setTestResults(prev => [result, ...prev.slice(0, 9)]) // Keep last 10 results
      
      // Show error in UI
      setCurrentError(errorResult.errorInfo)
      
    } catch (error) {
      console.error(`Test failed for ${scenario.name}:`, error)
      
      const result = {
        scenario: scenario.name,
        success: false,
        error: error.message,
        duration: 0
      }
      
      setTestResults(prev => [result, ...prev.slice(0, 9)])
    }
  }

  const clearResults = () => {
    setTestResults([])
    setCurrentError(null)
  }

  const handleErrorRecovery = (action, options = {}) => {
    console.log('Recovery action triggered:', action, options)
    setCurrentError(null)
  }

  const handleErrorDismiss = () => {
    setCurrentError(null)
  }

  const getErrorStats = () => {
    return coverErrorHandler.getErrorStats()
  }

  const getRecoveryStats = () => {
    return coverRecoveryService.getRecoveryStats()
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>🧪 Error Handling Test Suite</h2>
      <p>Test the error handling and recovery system with different scenarios.</p>

      {/* Error Display */}
      {currentError && (
        <ErrorFeedback
          error={currentError}
          onRecoveryAction={handleErrorRecovery}
          onDismiss={handleErrorDismiss}
          autoHide={false}
          showTechnicalDetails={true}
        />
      )}

      {/* Test Scenarios */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Test Scenarios</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {testScenarios.map((scenario, index) => (
            <button
              key={index}
              onClick={() => runErrorTest(scenario)}
              style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f8f9fa',
                cursor: 'pointer'
              }}
            >
              {scenario.name}
            </button>
          ))}
        </div>
      </div>

      {/* Control Buttons */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button onClick={clearResults} style={{ padding: '8px 16px' }}>
          Clear Results
        </button>
        <button 
          onClick={() => console.log('Error Stats:', getErrorStats())}
          style={{ padding: '8px 16px' }}
        >
          Log Error Stats
        </button>
        <button 
          onClick={() => console.log('Recovery Stats:', getRecoveryStats())}
          style={{ padding: '8px 16px' }}
        >
          Log Recovery Stats
        </button>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div>
          <h3>Test Results</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {testResults.map((result, index) => (
              <div
                key={index}
                style={{
                  padding: '10px',
                  margin: '5px 0',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: result.success ? '#f0f8f0' : '#f8f0f0'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  {result.success ? '✅' : '❌'} {result.scenario}
                </div>
                
                {result.success ? (
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    <div>Duration: {result.duration}ms</div>
                    <div>Error Handled: {result.errorHandled ? 'Yes' : 'No'}</div>
                    <div>Recovery Available: {result.recoveryAvailable ? 'Yes' : 'No'}</div>
                    {result.errorResult.userMessage && (
                      <div>Message: "{result.errorResult.userMessage}"</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', color: '#d32f2f' }}>
                    Error: {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '4px' }}>
        <h4>How to Test:</h4>
        <ol>
          <li>Click any test scenario button above</li>
          <li>Watch for error feedback to appear</li>
          <li>Try the recovery options if provided</li>
          <li>Check the browser console for detailed logs</li>
          <li>Use "Log Error Stats" to see error statistics</li>
        </ol>
        
        <h4>What to Look For:</h4>
        <ul>
          <li>Error messages are user-friendly</li>
          <li>Recovery options are appropriate for the error type</li>
          <li>Technical details are available but hidden by default</li>
          <li>Errors are properly categorized and logged</li>
        </ul>
      </div>
    </div>
  )
}

export default ErrorHandlingTest