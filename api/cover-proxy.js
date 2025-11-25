/**
 * Cover API Proxy - Backend proxy for external cover APIs
 * Handles CORS limitations and API key security
 */

/**
 * Comic Vine API proxy endpoint
 */
async function handleComicVineProxy(req, res) {
  try {
    const { series, issue, publisher } = req.query

    if (!series || !issue) {
      return res.status(400).json({
        error: 'Missing required parameters: series and issue'
      })
    }

    // Get API key from environment variables (server-side only)
    const apiKey = process.env.COMICVINE_API_KEY
    
    if (!apiKey) {
      return res.status(500).json({
        error: 'Comic Vine API key not configured on server',
        details: 'Set COMICVINE_API_KEY environment variable'
      })
    }

    // Build Comic Vine API request with publisher filtering
    let searchQuery = `${series} ${issue}`
    if (publisher) {
      searchQuery += ` ${publisher}`
    }
    
    const comicVineUrl = new URL('https://comicvine.gamespot.com/api/search/')
    comicVineUrl.searchParams.set('api_key', apiKey)
    comicVineUrl.searchParams.set('format', 'json')
    comicVineUrl.searchParams.set('resources', 'issue')
    comicVineUrl.searchParams.set('query', searchQuery)
    comicVineUrl.searchParams.set('limit', '20') // Increase limit to get more options for filtering

    console.log('Proxying Comic Vine request:', comicVineUrl.toString().replace(apiKey, '[API_KEY]'))
    console.log('Search parameters:', { series, issue, publisher })

    // Make request to Comic Vine API
    const response = await fetch(comicVineUrl.toString(), {
      headers: {
        'User-Agent': 'Comic Collection Tracker/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Comic Vine API responded with ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error !== 'OK') {
      throw new Error(`Comic Vine API error: ${data.error}`)
    }

    // Process and filter results
    const processedResults = processComicVineResults(data.results, series, issue, publisher)

    console.log(`Processed ${data.results?.length || 0} raw results into ${processedResults.length} filtered results`)
    if (publisher) {
      console.log(`Publisher filtering applied for: "${publisher}"`)
      processedResults.slice(0, 3).forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.metadata.title} #${result.metadata.issueNumber} (${result.metadata.publisher})`)
      })
    }

    res.json({
      success: true,
      results: processedResults,
      total: processedResults.length,
      query: { series, issue, publisher },
      rawTotal: data.results?.length || 0
    })

  } catch (error) {
    console.error('Comic Vine proxy error:', error)
    res.status(500).json({
      error: 'Failed to fetch covers from Comic Vine',
      details: error.message
    })
  }
}

/**
 * Process Comic Vine API results
 */
function processComicVineResults(results, series, issue, publisher) {
  if (!results || !Array.isArray(results)) {
    return []
  }

  const processedResults = results
    .filter(result => result.image && result.image.original_url)
    .map(result => ({
      id: result.id.toString(),
      imageUrl: result.image.original_url,
      thumbnailUrl: result.image.thumb_url || result.image.small_url,
      quality: determineImageQuality(result.image),
      dimensions: {
        width: result.image.original_width || 0,
        height: result.image.original_height || 0
      },
      variant: result.name || '',
      provider: 'comicvine',
      providerName: 'Comic Vine',
      attribution: 'Cover image provided by Comic Vine',
      licenseInfo: 'Used under Comic Vine API terms',
      metadata: {
        title: result.volume?.name || series,
        issueNumber: result.issue_number || issue,
        publisher: result.volume?.publisher?.name || '',
        description: result.description || '',
        apiId: result.id.toString(),
        originalUrl: result.site_detail_url,
        publishDate: result.store_date || result.cover_date
      },
      // Add relevance scores for sorting
      titleRelevance: calculateRelevance(result.volume?.name || '', series),
      publisherRelevance: publisher ? calculateRelevance(result.volume?.publisher?.name || '', publisher) : 0,
      issueMatch: (result.issue_number || '').toString() === issue.toString(),
      isEnglish: isLikelyEnglish(result.volume?.name || '', result.description || ''),
      isUSPublisher: isUSPublisher(result.volume?.publisher?.name || '')
    }))

  // Enhanced sorting with language and publisher consideration
  return processedResults
    .sort((a, b) => {
      // First priority: Exact issue number match
      if (a.issueMatch !== b.issueMatch) {
        return b.issueMatch ? 1 : -1
      }

      // Second priority: English language preference
      if (a.isEnglish !== b.isEnglish) {
        return b.isEnglish ? 1 : -1
      }

      // Third priority: US publisher preference
      if (a.isUSPublisher !== b.isUSPublisher) {
        return b.isUSPublisher ? 1 : -1
      }

      // Fourth priority: Publisher relevance (if publisher was provided)
      if (publisher && a.publisherRelevance !== b.publisherRelevance) {
        return b.publisherRelevance - a.publisherRelevance
      }

      // Fifth priority: Title relevance
      if (a.titleRelevance !== b.titleRelevance) {
        return b.titleRelevance - a.titleRelevance
      }

      // Sixth priority: Image quality
      const qualityOrder = { 'high': 3, 'medium': 2, 'low': 1 }
      const qualityDiff = (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0)
      if (qualityDiff !== 0) return qualityDiff

      // Finally: Prefer more recent issues
      if (a.metadata.publishDate && b.metadata.publishDate) {
        return new Date(b.metadata.publishDate) - new Date(a.metadata.publishDate)
      }

      return 0
    })
    // Remove the temporary sorting fields
    .map(result => {
      const { titleRelevance, publisherRelevance, issueMatch, isEnglish, isUSPublisher, ...cleanResult } = result
      return cleanResult
    })
    // Limit to top 10 results after sorting
    .slice(0, 10)
}

/**
 * Determine image quality based on URL or metadata
 */
function determineImageQuality(imageData) {
  if (!imageData || !imageData.original_url) return 'low'
  
  const url = imageData.original_url.toLowerCase()
  
  // Check for high-quality indicators
  if (url.includes('original') || url.includes('super') || url.includes('large')) {
    return 'high'
  }
  
  // Check dimensions if available
  const width = imageData.original_width || 0
  const height = imageData.original_height || 0
  
  if (width >= 800 || height >= 1200) return 'high'
  if (width >= 400 || height >= 600) return 'medium'
  
  return 'low'
}

/**
 * Check if content is likely in English
 */
function isLikelyEnglish(title, description) {
  const text = `${title} ${description}`.toLowerCase()
  
  // German indicators
  const germanIndicators = [
    'der ', 'die ', 'das ', 'und ', 'oder ', 'aber ', 'mit ', 'von ', 'zu ', 'auf ',
    'über', 'unter', 'zwischen', 'während', 'gegen', 'ohne', 'für', 'durch',
    'ä', 'ö', 'ü', 'ß', 'ausgabe', 'band', 'heft', 'sammlung'
  ]
  
  // French indicators
  const frenchIndicators = [
    'le ', 'la ', 'les ', 'un ', 'une ', 'des ', 'du ', 'de ', 'et ', 'ou ',
    'mais', 'avec', 'sans', 'pour', 'par', 'sur', 'sous', 'dans', 'tome',
    'é', 'è', 'ê', 'à', 'ç', 'édition'
  ]
  
  // Spanish indicators
  const spanishIndicators = [
    'el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'y ', 'o ', 'pero ', 'con ',
    'sin', 'para', 'por', 'sobre', 'bajo', 'entre', 'durante', 'contra',
    'ñ', 'á', 'é', 'í', 'ó', 'ú', 'tomo', 'edición'
  ]
  
  // Italian indicators
  const italianIndicators = [
    'il ', 'la ', 'lo ', 'gli ', 'le ', 'un ', 'una ', 'e ', 'o ', 'ma ', 'con ',
    'senza', 'per', 'da', 'su', 'sotto', 'tra', 'durante', 'contro',
    'à', 'è', 'ì', 'ò', 'ù', 'volume', 'edizione'
  ]
  
  const allForeignIndicators = [
    ...germanIndicators, ...frenchIndicators, 
    ...spanishIndicators, ...italianIndicators
  ]
  
  // Count foreign language indicators
  const foreignCount = allForeignIndicators.filter(indicator => 
    text.includes(indicator)
  ).length
  
  // If we find multiple foreign indicators, it's probably not English
  return foreignCount < 2
}

/**
 * Check if publisher is likely US-based
 */
function isUSPublisher(publisher) {
  if (!publisher) return false
  
  const publisherLower = publisher.toLowerCase()
  const usPublishers = [
    'marvel', 'dc', 'image', 'dark horse', 'idw', 'boom', 'dynamite',
    'valiant', 'oni', 'first second', 'vertigo', 'wildstorm', 'top cow',
    'avatar', 'aftershock', 'black mask', 'vault', 'scout', 'zenescope'
  ]
  
  return usPublishers.some(pub => publisherLower.includes(pub))
}

/**
 * Calculate relevance score between two strings
 */
function calculateRelevance(text, target) {
  if (!text || !target) return 0
  
  const textLower = text.toLowerCase().trim()
  const targetLower = target.toLowerCase().trim()
  
  // Exact match
  if (textLower === targetLower) return 100
  
  // Contains target
  if (textLower.includes(targetLower)) return 90
  
  // Target contains text
  if (targetLower.includes(textLower)) return 80
  
  // Remove common words and articles for better matching
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
  const cleanText = textLower.split(/\s+/).filter(word => !commonWords.includes(word) && word.length > 1)
  const cleanTarget = targetLower.split(/\s+/).filter(word => !commonWords.includes(word) && word.length > 1)
  
  if (cleanText.length === 0 || cleanTarget.length === 0) return 0
  
  // Calculate word overlap
  const overlap = cleanText.filter(word => cleanTarget.some(targetWord => 
    word === targetWord || word.includes(targetWord) || targetWord.includes(word)
  )).length
  
  const maxWords = Math.max(cleanText.length, cleanTarget.length)
  const overlapScore = (overlap / maxWords) * 70
  
  // Bonus for similar word count
  const lengthSimilarity = 1 - Math.abs(cleanText.length - cleanTarget.length) / maxWords
  const lengthBonus = lengthSimilarity * 10
  
  return Math.min(100, overlapScore + lengthBonus)
}

/**
 * Download cover image through proxy
 */
async function handleCoverDownload(req, res) {
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

    console.log('Proxying cover download:', url)

    // Download the image
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Comic Collection Tracker/1.0'
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
    console.error('Cover download proxy error:', error)
    res.status(500).json({
      error: 'Failed to download cover image',
      details: error.message
    })
  }
}

/**
 * Main handler for cover proxy endpoints
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathParts = url.pathname.split('/').filter(Boolean)

    // Route: GET /api/cover-proxy/comicvine/search
    if (req.method === 'GET' && pathParts[2] === 'comicvine' && pathParts[3] === 'search') {
      return await handleComicVineProxy(req, res)
    }

    // Route: GET /api/cover-proxy/download
    if (req.method === 'GET' && pathParts[2] === 'download') {
      return await handleCoverDownload(req, res)
    }

    // Route not found
    return res.status(404).json({ 
      error: 'Cover proxy endpoint not found',
      availableEndpoints: [
        'GET /api/cover-proxy/comicvine/search?series=<series>&issue=<issue>&publisher=<publisher>',
        'GET /api/cover-proxy/download?url=<image_url>'
      ]
    })

  } catch (error) {
    console.error('Cover proxy error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    })
  }
}