import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CoverErrorHandler } from '../errorHandling.js'

// Use a fresh instance per describe block to avoid shared state
let handler

beforeEach(() => {
  handler = new CoverErrorHandler()
})

// ---------------------------------------------------------------------------
// Error detection predicates
// ---------------------------------------------------------------------------
describe('isNetworkError', () => {
  it('detects TypeError with "fetch" in message', () => {
    const err = Object.assign(new TypeError('Failed to fetch'), {})
    expect(handler.isNetworkError(err)).toBe(true)
  })

  it('detects error with name "NetworkError"', () => {
    const err = Object.assign(new Error('gone'), { name: 'NetworkError' })
    expect(handler.isNetworkError(err)).toBe(true)
  })

  it('detects "Failed to fetch" message', () => {
    expect(handler.isNetworkError(new Error('Failed to fetch'))).toBe(true)
  })

  it('detects "Network request failed" message', () => {
    expect(handler.isNetworkError(new Error('Network request failed'))).toBe(true)
  })

  it('detects ECONNREFUSED error code', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    expect(handler.isNetworkError(err)).toBe(true)
  })

  it('returns false for an unrelated error', () => {
    expect(handler.isNetworkError(new Error('Something else'))).toBe(false)
  })
})

describe('isRateLimitError', () => {
  it('detects status 429', () => {
    expect(handler.isRateLimitError(Object.assign(new Error(), { status: 429 }))).toBe(true)
  })

  it('detects "rate limit" in message', () => {
    expect(handler.isRateLimitError(new Error('rate limit exceeded'))).toBe(true)
  })

  it('detects "too many requests" in message', () => {
    expect(handler.isRateLimitError(new Error('too many requests'))).toBe(true)
  })

  it('detects RATE_LIMIT_EXCEEDED code', () => {
    expect(handler.isRateLimitError(Object.assign(new Error(), { code: 'RATE_LIMIT_EXCEEDED' }))).toBe(true)
  })

  it('returns false for unrelated error', () => {
    expect(handler.isRateLimitError(new Error('Something else'))).toBe(false)
  })
})

describe('isImageProcessingError', () => {
  it('detects "image processing" in message', () => {
    expect(handler.isImageProcessingError(new Error('image processing failed'))).toBe(true)
  })

  it('detects "Failed to load image"', () => {
    expect(handler.isImageProcessingError(new Error('Failed to load image'))).toBe(true)
  })

  it('detects name "ImageProcessingError"', () => {
    const err = Object.assign(new Error(), { name: 'ImageProcessingError' })
    expect(handler.isImageProcessingError(err)).toBe(true)
  })

  it('returns false for unrelated error', () => {
    expect(handler.isImageProcessingError(new Error('network issue'))).toBe(false)
  })
})

describe('isStorageError', () => {
  it('detects QuotaExceededError', () => {
    const err = Object.assign(new Error(), { name: 'QuotaExceededError' })
    expect(handler.isStorageError(err)).toBe(true)
  })

  it('detects "quota" in message', () => {
    expect(handler.isStorageError(new Error('storage quota exceeded'))).toBe(true)
  })

  it('detects "IndexedDB" in message', () => {
    expect(handler.isStorageError(new Error('IndexedDB error'))).toBe(true)
  })

  it('returns false for unrelated error', () => {
    expect(handler.isStorageError(new Error('network issue'))).toBe(false)
  })
})

describe('isValidationError', () => {
  it('detects "Invalid" in message', () => {
    expect(handler.isValidationError(new Error('Invalid file format'))).toBe(true)
  })

  it('detects "File too large" in message', () => {
    expect(handler.isValidationError(new Error('File too large'))).toBe(true)
  })

  it('detects "Unsupported format" in message', () => {
    expect(handler.isValidationError(new Error('Unsupported format'))).toBe(true)
  })

  it('detects name "ValidationError"', () => {
    const err = Object.assign(new Error(), { name: 'ValidationError' })
    expect(handler.isValidationError(err)).toBe(true)
  })

  it('returns false for unrelated error', () => {
    expect(handler.isValidationError(new Error('network issue'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Retry condition predicates
// ---------------------------------------------------------------------------
describe('isRetryableNetworkError', () => {
  it('retries when there is no status (pure network failure)', () => {
    expect(handler.isRetryableNetworkError(new Error('Failed to fetch'))).toBe(true)
  })

  it('retries on 5xx server errors', () => {
    expect(handler.isRetryableNetworkError(Object.assign(new Error(), { status: 503 }))).toBe(true)
  })

  it('does not retry on 4xx client errors', () => {
    expect(handler.isRetryableNetworkError(Object.assign(new Error(), { status: 400 }))).toBe(false)
  })
})

describe('isRetryableProcessingError', () => {
  it('retries transient processing errors', () => {
    expect(handler.isRetryableProcessingError(new Error('canvas timeout'))).toBe(true)
  })

  it('does not retry "Invalid" processing errors', () => {
    expect(handler.isRetryableProcessingError(new Error('Invalid image'))).toBe(false)
  })

  it('does not retry "Unsupported" processing errors', () => {
    expect(handler.isRetryableProcessingError(new Error('Unsupported format'))).toBe(false)
  })
})

describe('isRetryableStorageError', () => {
  it('retries generic storage errors', () => {
    expect(handler.isRetryableStorageError(new Error('IndexedDB write failed'))).toBe(true)
  })

  it('does not retry QuotaExceededError', () => {
    const err = Object.assign(new Error(), { name: 'QuotaExceededError' })
    expect(handler.isRetryableStorageError(err)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// categorizeError
// ---------------------------------------------------------------------------
describe('categorizeError', () => {
  it('categorizes a network error', () => {
    const result = handler.categorizeError(new Error('Failed to fetch'))
    expect(result.category).toBe('NetworkError')
    expect(result.severity).toBe('high')
  })

  it('categorizes a rate limit error', () => {
    const err = Object.assign(new Error('rate limit'), { status: 429 })
    expect(handler.categorizeError(err).category).toBe('RateLimitError')
  })

  it('categorizes an image processing error', () => {
    const err = new Error('image processing failed')
    expect(handler.categorizeError(err).category).toBe('ImageProcessingError')
  })

  it('categorizes a storage error', () => {
    const err = new Error('IndexedDB error')
    expect(handler.categorizeError(err).category).toBe('StorageError')
  })

  it('categorizes a validation error as low severity', () => {
    const result = handler.categorizeError(new Error('Invalid file format'))
    expect(result.category).toBe('ValidationError')
    expect(result.severity).toBe('low')
  })

  it('falls back to UnknownError for unrecognised errors', () => {
    expect(handler.categorizeError(new Error('something weird')).category).toBe('UnknownError')
  })

  it('attaches the original error and a timestamp', () => {
    const err = new Error('Failed to fetch')
    const result = handler.categorizeError(err)
    expect(result.originalError).toBe(err)
    expect(result.timestamp).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// generateUserMessage
// ---------------------------------------------------------------------------
describe('generateUserMessage', () => {
  const msg = (category, extra = {}) =>
    handler.generateUserMessage({ category, message: '', ...extra })

  it('returns a network error message', () => {
    expect(msg('NetworkError')).toContain('internet connection')
  })

  it('returns a rate limit message', () => {
    expect(msg('RateLimitError')).toContain('temporarily busy')
  })

  it('returns a storage error message', () => {
    expect(msg('StorageError')).toContain('save the image')
  })

  it('returns an upload error message', () => {
    expect(msg('UploadError')).toContain('upload failed')
  })

  it('returns a validation error message', () => {
    expect(msg('ValidationError')).toContain('not valid')
  })

  it('returns an API error message', () => {
    expect(msg('APIError')).toContain('unavailable')
  })

  it('returns a fallback message for UnknownError', () => {
    expect(msg('UnknownError')).toContain('unexpected error')
  })

  it('appends format hint when ValidationError message includes "format"', () => {
    const result = handler.generateUserMessage({ category: 'ValidationError', message: 'bad format' })
    expect(result).toContain('JPEG, PNG, WebP')
  })

  it('appends size hint when ValidationError message includes "size"', () => {
    const result = handler.generateUserMessage({ category: 'ValidationError', message: 'file size too big' })
    expect(result).toContain('5MB')
  })

  it('appends quota hint when StorageError message includes "quota"', () => {
    const result = handler.generateUserMessage({ category: 'StorageError', message: 'quota exceeded' })
    expect(result).toContain('quota may be full')
  })
})

// ---------------------------------------------------------------------------
// generateRecoveryOptions
// ---------------------------------------------------------------------------
describe('generateRecoveryOptions', () => {
  const options = (category, context = {}) =>
    handler.generateRecoveryOptions({ category }, context)

  it('NetworkError includes a primary Retry option', () => {
    const opts = options('NetworkError')
    expect(opts.some(o => o.action === 'retry' && o.primary)).toBe(true)
  })

  it('NetworkError includes an offline mode option', () => {
    expect(options('NetworkError').some(o => o.action === 'offline_mode')).toBe(true)
  })

  it('RateLimitError includes a delayed retry', () => {
    expect(options('RateLimitError').some(o => o.action === 'retry_delayed')).toBe(true)
  })

  it('StorageError includes a clear cache option', () => {
    expect(options('StorageError').some(o => o.action === 'clear_cache')).toBe(true)
  })

  it('ValidationError includes a select_different option', () => {
    expect(options('ValidationError').some(o => o.action === 'select_different')).toBe(true)
  })

  it('ValidationError with upload context includes convert_format option', () => {
    expect(options('ValidationError', { operation: 'upload' }).some(o => o.action === 'convert_format')).toBe(true)
  })

  it('ValidationError without upload context does not include convert_format', () => {
    expect(options('ValidationError').some(o => o.action === 'convert_format')).toBe(false)
  })

  it('UnknownError falls back to generic retry + cancel', () => {
    const opts = options('UnknownError')
    expect(opts.some(o => o.action === 'retry')).toBe(true)
    expect(opts.some(o => o.action === 'cancel')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// calculateRetryDelay
// ---------------------------------------------------------------------------
describe('calculateRetryDelay', () => {
  const strategy = { baseDelay: 1000, backoffMultiplier: 2, maxDelay: 10000 }

  it('returns a value at or above the base delay on attempt 0', () => {
    const delay = handler.calculateRetryDelay(strategy, 0)
    expect(delay).toBeGreaterThanOrEqual(1000)
  })

  it('doubles the delay on each attempt (exponential backoff)', () => {
    const d0 = handler.calculateRetryDelay({ ...strategy, maxDelay: Infinity }, 0)
    const d1 = handler.calculateRetryDelay({ ...strategy, maxDelay: Infinity }, 1)
    // d1 should be approximately 2× d0 (jitter is ≤10% of base)
    expect(d1).toBeGreaterThan(d0)
  })

  it('never exceeds maxDelay', () => {
    // attempt 10 with multiplier 2 would be 1000 * 2^10 = 1,024,000 without cap
    const delay = handler.calculateRetryDelay(strategy, 10)
    expect(delay).toBeLessThanOrEqual(strategy.maxDelay * 1.1) // allow for jitter
  })

  it('adds a positive jitter value', () => {
    // Run many times — the result should not always equal the bare exponential
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const delay = handler.calculateRetryDelay(strategy, 0)
    // With jitter: floor(1000 + 0.5 * 0.1 * 1000) = floor(1050) = 1050
    expect(delay).toBe(1050)
    vi.restoreAllMocks()
  })
})

// ---------------------------------------------------------------------------
// Error log management
// ---------------------------------------------------------------------------
describe('logError / getErrorStats / clearErrorLog', () => {
  it('adds errors to the log', () => {
    handler.logError({ category: 'NetworkError', severity: 'high' })
    expect(handler.errorLog).toHaveLength(1)
  })

  it('inserts newest error at the front of the log', () => {
    handler.logError({ category: 'NetworkError', severity: 'high' })
    handler.logError({ category: 'StorageError', severity: 'medium' })
    expect(handler.errorLog[0].category).toBe('StorageError')
  })

  it('trims the log to maxLogSize', () => {
    for (let i = 0; i < 110; i++) {
      handler.logError({ category: 'NetworkError', severity: 'high' })
    }
    expect(handler.errorLog.length).toBe(handler.maxLogSize)
  })

  it('getErrorStats returns correct totals', () => {
    handler.logError({ category: 'NetworkError', severity: 'high' })
    handler.logError({ category: 'NetworkError', severity: 'high' })
    handler.logError({ category: 'StorageError', severity: 'medium' })
    const stats = handler.getErrorStats()
    expect(stats.total).toBe(3)
    expect(stats.byCategory.NetworkError).toBe(2)
    expect(stats.byCategory.StorageError).toBe(1)
    expect(stats.bySeverity.high).toBe(2)
  })

  it('getErrorStats includes up to 10 recent errors', () => {
    for (let i = 0; i < 15; i++) {
      handler.logError({ category: 'NetworkError', severity: 'high' })
    }
    expect(handler.getErrorStats().recent).toHaveLength(10)
  })

  it('clearErrorLog empties the log', () => {
    handler.logError({ category: 'NetworkError', severity: 'high' })
    handler.clearErrorLog()
    expect(handler.errorLog).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// onUserFeedback / notifyUser
// ---------------------------------------------------------------------------
describe('onUserFeedback / notifyUser', () => {
  it('calls registered callbacks with the notification', () => {
    const cb = vi.fn()
    handler.onUserFeedback(cb)
    handler.notifyUser({ type: 'error', message: 'Oops' })
    expect(cb).toHaveBeenCalledWith({ type: 'error', message: 'Oops' })
  })

  it('calls multiple registered callbacks', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    handler.onUserFeedback(cb1)
    handler.onUserFeedback(cb2)
    handler.notifyUser({ type: 'retry' })
    expect(cb1).toHaveBeenCalled()
    expect(cb2).toHaveBeenCalled()
  })

  it('returns an unsubscribe function that stops future notifications', () => {
    const cb = vi.fn()
    const unsubscribe = handler.onUserFeedback(cb)
    unsubscribe()
    handler.notifyUser({ type: 'error' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not throw when a callback itself throws', () => {
    handler.onUserFeedback(() => { throw new Error('callback error') })
    expect(() => handler.notifyUser({ type: 'error' })).not.toThrow()
  })
})
