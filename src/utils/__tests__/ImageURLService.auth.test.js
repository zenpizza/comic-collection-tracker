import { describe, it, expect, vi, beforeEach } from 'vitest'

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
globalThis.URL.createObjectURL = vi.fn(() => 'blob:test-url')

const { default: ImageURLService } = await import('../ImageURLService.js')
const { apiFetch } = await import('../apiClient.js')

describe('ImageURLService auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ImageURLService.memoryCache.clear()
    ImageURLService.resetStats()
  })

  it('fetches comic images through apiFetch so the Clerk Bearer token is attached', async () => {
    const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
    apiFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      blob: () => Promise.resolve(mockBlob),
    })

    await ImageURLService.getImageUrl('comic1', 'medium')

    expect(apiFetch).toHaveBeenCalled()
    expect(apiFetch.mock.calls[0][0]).toContain('/api/images/comic1')
  })
})
