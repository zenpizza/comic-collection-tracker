/**
 * Simple download endpoint that redirects to cover-proxy
 * This fixes the 404 errors when downloading covers
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

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

    // Download the image with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://comicvine.gamespot.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    })

    if (!response.ok) {
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