/**
 * Simple download endpoint that redirects to cover-proxy
 * This fixes the 404 errors when downloading covers
 */

import { requireAuth } from './auth.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { url } = req.query

    if (!url) {
      return res.status(400).json({
        error: 'Missing required parameter: url'
      })
    }

    // Validate URL is from allowed domains
    const allowedDomains = [
      'comicvine.gamespot.com',
      'static.comicvine.com'
    ]

    let urlObj
    try {
      urlObj = new URL(url)
    } catch {
      return res.status(400).json({
        error: 'Invalid URL format'
      })
    }

    if (!allowedDomains.includes(urlObj.hostname)) {
      return res.status(403).json({
        error: 'URL domain not allowed'
      })
    }

    console.log('Downloading cover image:', url)

    // Download the image
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Comic Collection Tracker/1.0',
        'Referer': 'https://comicvine.gamespot.com/'
      }
    })

    if (!response.ok) {
      // Check if running locally and blocked by ComicVine
      const isLocal = process.env.VERCEL !== '1'
      if (response.status === 403 && isLocal) {
        throw new Error('ComicVine blocks requests from your IP. Please test cover downloads on Vercel preview deployments, or use a VPN.')
      }
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('Response is not an image')
    }

    // Stream the image back to client
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600') // 1 hour cache
    
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))

  } catch (error) {
    console.error('Cover download error:', error)
    res.status(500).json({
      error: 'Failed to download cover image',
      details: error.message
    })
  }
}