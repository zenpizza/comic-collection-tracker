import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}))

import { verifyToken } from '@clerk/backend'
import { requireAuth } from '../auth.js'

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end() {
      return this
    },
  }
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CLERK_SECRET_KEY = 'test-secret'
  })

  it('attaches req.userId from the token sub claim on success', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_123', email: 'a@b.com' })
    const req = { method: 'GET', headers: { authorization: 'Bearer valid-token' } }
    const res = mockRes()

    const ok = await requireAuth(req, res)

    expect(ok).toBe(true)
    expect(req.userId).toBe('user_123')
  })

  it('rejects with 401 and does not set userId when the token is invalid', async () => {
    verifyToken.mockRejectedValue(new Error('invalid token'))
    const req = { method: 'GET', headers: { authorization: 'Bearer bad-token' } }
    const res = mockRes()

    const ok = await requireAuth(req, res)

    expect(ok).toBe(false)
    expect(req.userId).toBeUndefined()
    expect(res.statusCode).toBe(401)
  })

  it('rejects with 401 and does not set userId when no Authorization header is present', async () => {
    const req = { method: 'GET', headers: {} }
    const res = mockRes()

    const ok = await requireAuth(req, res)

    expect(ok).toBe(false)
    expect(req.userId).toBeUndefined()
    expect(res.statusCode).toBe(401)
  })
})
