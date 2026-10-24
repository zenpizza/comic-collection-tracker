import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../imageStorage.js', () => ({
  default: {
    getImage: vi.fn().mockResolvedValue(null),
    getImageUrl: vi.fn(),
    storeImage: vi.fn(),
    deleteImage: vi.fn(),
    clearStorage: vi.fn(),
    getStorageStats: vi.fn().mockResolvedValue({ totalImages: 0, totalSizeMB: '0.00' }),
  },
}))

vi.mock('../apiClient.js', () => ({
  apiFetch: vi.fn(),
}))

// ImageURLService detects isBrowser once at module load, so `window`/`URL`
// must exist on globalThis before the module is imported.
globalThis.window = globalThis.window || {
  addEventListener: () => {},
  removeEventListener: () => {},
}

let urlCounter = 0
globalThis.URL.createObjectURL = vi.fn(() => `blob:test-${++urlCounter}`)
globalThis.URL.revokeObjectURL = vi.fn()

const { default: ImageURLService } = await import('../ImageURLService.js')
const { default: realImageStorage } = await vi.importActual('../imageStorage.js')

function seedMemoryCache(comicId, size = 'medium') {
  const cacheKey = ImageURLService.generateCacheKey(comicId, size)
  ImageURLService.setMemoryCache(cacheKey, new Blob(['x'], { type: 'image/jpeg' }))
}

describe('ImageURLService blob URL lifecycle (COM-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ImageURLService.memoryCache.clear()
    ImageURLService.createdUrls.clear()
    ImageURLService.urlRefCounts.clear()
    ImageURLService.operationLocks.clear()
    ImageURLService.resetStats()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not revoke a held URL when the auto-revoke timer fires', async () => {
    vi.useFakeTimers()
    seedMemoryCache('comic1')

    const held = await ImageURLService.getImageUrlWithRevoke('comic1', 'medium')
    // Simulate an auto-revoke timer elsewhere targeting the same URL
    setTimeout(() => ImageURLService.revokeUrlIfUnheld(held.url), 30000)
    vi.advanceTimersByTime(30000)

    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(held.url)

    held.revoke()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(held.url)
  })

  it('revokes a shared URL only after the last holder releases it', () => {
    const url = 'blob:shared'
    ImageURLService.retainUrl(url)
    ImageURLService.retainUrl(url)

    ImageURLService.releaseRetainedUrl(url)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    ImageURLService.releaseRetainedUrl(url)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('makes revoke() idempotent for a single holder', async () => {
    seedMemoryCache('comic1')
    const a = await ImageURLService.getImageUrlWithRevoke('comic1', 'medium')
    ImageURLService.retainUrl(a.url) // second holder of the same URL

    a.revoke()
    a.revoke() // double release must not drop the other holder's reference
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('skips held URLs when evicting tracked URLs over the limit', () => {
    const held = 'blob:held'
    ImageURLService.trackCreatedUrl(held)
    ImageURLService.retainUrl(held)

    for (let i = 0; i < ImageURLService.config.maxTrackedUrls; i++) {
      ImageURLService.trackCreatedUrl(`blob:filler-${i}`)
    }

    expect(URL.revokeObjectURL).toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(held)
  })
})

describe('ImageURLService operation locks (COM-15)', () => {
  beforeEach(() => {
    ImageURLService.memoryCache.clear()
    ImageURLService.operationLocks.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('removes the lock once the operation settles', async () => {
    seedMemoryCache('comic1')
    await ImageURLService.getImageUrlUnsafe('comic1', 'medium')
    expect(ImageURLService.operationLocks.size).toBe(0)
  })

  it('does not delete a newer lock when an older operation finishes', async () => {
    vi.useFakeTimers()
    let resolveFirst
    vi.spyOn(ImageURLService, '_getImageUrlInternal')
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(() => {})) // still pending

    const first = ImageURLService.getImageUrlUnsafe('comic1', 'medium')
    await Promise.resolve()
    // Lock timeout expires, a new request takes the lock
    vi.advanceTimersByTime(ImageURLService.config.lockTimeout)
    ImageURLService.getImageUrlUnsafe('comic1', 'medium')
    await Promise.resolve()
    const newerLock = [...ImageURLService.operationLocks.values()][0]

    resolveFirst('blob:first')
    await first

    expect(ImageURLService.operationLocks.size).toBe(1)
    expect([...ImageURLService.operationLocks.values()][0]).toBe(newerLock)
  })
})

describe('imageStorage.cleanupOldImages (COM-17)', () => {
  it('deletes records older than maxAge based on cachedAt', async () => {
    const now = Date.now()
    const records = [
      { id: 'old', cachedAt: now - 40 * 24 * 60 * 60 * 1000 },
      { id: 'fresh', cachedAt: now - 1000 },
      { id: 'missing-timestamp' },
    ]
    const deleted = []

    // Minimal IndexedDB stub: a store cursor over `records`. Records have no
    // uploadedAt field, so an index on it would iterate nothing.
    const store = {
      index: () => ({ openCursor: () => fakeCursorRequest([]) }),
      openCursor: () => fakeCursorRequest(records),
    }
    function fakeCursorRequest(items) {
      const request = {}
      let i = 0
      const step = () => {
        const value = items[i]
        const cursor = value && {
          value,
          delete: () => deleted.push(value.id),
          continue: () => { i++; setTimeout(step) },
        }
        request.onsuccess({ target: { result: cursor } })
      }
      setTimeout(step)
      return request
    }

    realImageStorage.db = { transaction: () => ({ objectStore: () => store }) }
    realImageStorage.init = async () => realImageStorage.db

    const count = await realImageStorage.cleanupOldImages(30 * 24 * 60 * 60 * 1000)

    expect(count).toBe(2)
    expect(deleted).toEqual(['old', 'missing-timestamp'])
  })
})
