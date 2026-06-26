/**
 * Authenticated API client
 *
 * Wraps fetch() to automatically inject the Clerk session token as a
 * Bearer header on every request to /api/* endpoints.
 *
 * Usage:
 *   // Once, in App.jsx after Clerk is loaded:
 *   configureApiClient(getToken)
 *
 *   // Everywhere else, instead of fetch():
 *   import { apiFetch } from './apiClient'
 *   const res = await apiFetch('/api/comics')
 */

let _getToken = async () => null

/**
 * Supply the Clerk getToken function so apiFetch can attach Bearer tokens.
 * Call this once in App.jsx when the authenticated user is available.
 *
 * @param {() => Promise<string|null>} getToken
 */
export function configureApiClient(getToken) {
  _getToken = getToken
}

/**
 * Authenticated fetch. Behaves identically to window.fetch() but adds an
 * Authorization header when a Clerk session token is available.
 *
 * Does NOT set Content-Type on FormData requests (the browser must do that
 * so it can include the multipart boundary).
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  const token = await _getToken()

  const headers = { ...options.headers }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Only set Content-Type when there's an actual body to send — a bodyless
  // GET doesn't need one, and some of our endpoints (e.g. /api/images/[id])
  // 302-redirect to a cross-origin CDN (CloudFront). A custom header like
  // this would get carried into that cross-origin redirect and force a
  // CORS preflight the CDN doesn't support, breaking the redirect entirely.
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(url, { ...options, headers })
}
