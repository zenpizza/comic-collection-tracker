import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch, configureApiClient } from '../apiClient.js'

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    configureApiClient(async () => 'test-token')
  })

  it('attaches the Authorization header when a token is available', async () => {
    await apiFetch('/api/comics')

    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers['Authorization']).toBe('Bearer test-token')
  })

  it('does not set Content-Type on a bodyless GET request', async () => {
    await apiFetch('/api/images/abc123?size=medium')

    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers['Content-Type']).toBeUndefined()
  })

  it('sets Content-Type to application/json when a JSON body is sent', async () => {
    await apiFetch('/api/comics', { method: 'POST', body: JSON.stringify({ series: 'X' }) })

    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not set Content-Type for FormData bodies, leaving the boundary to the browser', async () => {
    await apiFetch('/api/images/upload', { method: 'POST', body: new FormData() })

    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers['Content-Type']).toBeUndefined()
  })
})
