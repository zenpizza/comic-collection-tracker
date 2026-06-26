/**
 * Authentication middleware for API endpoints
 * Validates Clerk JWT Bearer tokens on every request
 */

import { verifyToken } from '@clerk/backend'

/**
 * Check that the request carries a valid Clerk JWT Bearer token.
 * Returns true if authorized, false (and sends a 401/500 response) if not.
 *
 * Usage:
 *   if (!await requireAuth(req, res)) return
 */
export async function requireAuth(req, res) {
  // Allow CORS preflight through without auth
  if (req.method === 'OPTIONS') {
    return true
  }

  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }

  const token = authHeader.slice(7)
  const secretKey = process.env.CLERK_SECRET_KEY

  if (!secretKey) {
    console.error('[Auth] CLERK_SECRET_KEY is not configured')
    res.status(500).json({ error: 'Server misconfiguration: CLERK_SECRET_KEY is not set' })
    return false
  }

  try {
    const payload = await verifyToken(token, { secretKey })
    req.userId = payload.sub
    req.userEmail = payload.email || undefined
    return true
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message)
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
}
