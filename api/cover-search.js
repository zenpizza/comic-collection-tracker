/**
 * Simplified cover search API endpoint
 * Updated: 2025-11-12 - Using /issues/ endpoint for better reliability
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Cover search API called with:', req.query)
    const { series, issue, publisher, year } = req.query

    if (!series || !issue) {
      console.log('Missing parameters:', { series, issue })
      return res.status(400).json({
        error: 'Missing required parameters: series and issue'
      })
    }

    // Get API key from environment variables
    const apiKey = process.env.COMICVINE_API_KEY
    console.log('API key configured:', !!apiKey)

    if (!apiKey) {
      console.log('No API key found in environment')
      return res.status(500).json({
        error: 'Comic Vine API key not configured on server',
        details: 'Set COMICVINE_API_KEY environment variable'
      })
    }

    // Two-step approach for better accuracy:
    // Step 1: Search for the volume (series) to get volume IDs
    // Step 2: Query for the specific issue within those volumes
    
    console.log('Step 1: Searching for volumes matching:', series)
    const volumeSearchUrl = new URL('https://comicvine.gamespot.com/api/search/')
    volumeSearchUrl.searchParams.set('api_key', apiKey)
    volumeSearchUrl.searchParams.set('format', 'json')
    volumeSearchUrl.searchParams.set('resources', 'volume')
    volumeSearchUrl.searchParams.set('query', series)
    volumeSearchUrl.searchParams.set('field_list', 'id,name,start_year,publisher')
    volumeSearchUrl.searchParams.set('limit', '10')

    const volumeResponse = await fetch(volumeSearchUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    if (!volumeResponse.ok) {
      throw new Error(`Comic Vine API responded with ${volumeResponse.status}`)
    }

    const volumeData = await volumeResponse.json()
    
    if (volumeData.error !== 'OK') {
      throw new Error(`Comic Vine API error: ${volumeData.error}`)
    }

    console.log(`Found ${volumeData.results?.length || 0} matching volumes`)
    
    if (!volumeData.results || volumeData.results.length === 0) {
      console.log('No volumes found for series:', series)
      return res.json({
        success: true,
        results: [],
        total: 0,
        query: { series, issue, publisher }
      })
    }

    // Create a map of volume ID to volume data (including publisher)
    const volumeMap = new Map()
    volumeData.results.forEach(vol => {
      volumeMap.set(vol.id, vol)
    })

    // Step 2: Get issues from the matching volumes
    console.log('Step 2: Searching for issue', issue, 'in matching volumes')
    
    // Prioritize volumes by year if provided, but don't exclude others
    let filteredVolumes = volumeData.results
    if (year) {
      console.log('Prioritizing volumes by year:', year)
      const targetYear = parseInt(year)
      
      // Sort volumes: exact year match first, then close matches, then others
      filteredVolumes = [...volumeData.results].sort((a, b) => {
        const aYear = a.start_year || 0
        const bYear = b.start_year || 0
        const aDiff = Math.abs(aYear - targetYear)
        const bDiff = Math.abs(bYear - targetYear)
        
        // Exact matches first
        if (aYear === targetYear && bYear !== targetYear) return -1
        if (bYear === targetYear && aYear !== targetYear) return 1
        
        // Then by proximity to target year
        return aDiff - bDiff
      })
      
      console.log(`Sorted ${filteredVolumes.length} volumes by proximity to year ${year}`)
      console.log('Top volumes:', filteredVolumes.slice(0, 3).map(v => ({ name: v.name, year: v.start_year })))
    }
    
    const volumeIds = filteredVolumes.map(v => v.id).join('|')
    
    const issuesUrl = new URL('https://comicvine.gamespot.com/api/issues/')
    issuesUrl.searchParams.set('api_key', apiKey)
    issuesUrl.searchParams.set('format', 'json')
    issuesUrl.searchParams.set('filter', `volume:${volumeIds},issue_number:${issue}`)
    issuesUrl.searchParams.set('field_list', 'id,name,issue_number,cover_date,image,volume')
    issuesUrl.searchParams.set('limit', '20')
    // Sort by date ascending when year is provided, descending otherwise
    issuesUrl.searchParams.set('sort', year ? 'cover_date:asc' : 'cover_date:desc')

    console.log('Issues URL:', issuesUrl.toString().replace(apiKey, '[API_KEY]'))

    const issuesResponse = await fetch(issuesUrl.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })

    if (!issuesResponse.ok) {
      throw new Error(`Comic Vine API responded with ${issuesResponse.status}`)
    }

    const data = await issuesResponse.json()

    console.log('Comic Vine issues response:', { 
      error: data.error, 
      number_of_total_results: data.number_of_total_results,
      number_of_page_results: data.number_of_page_results
    })

    if (data.error !== 'OK') {
      throw new Error(`Comic Vine API error: ${data.error}`)
    }

    // Process results - filter by matching series name and issue number
    const seriesLower = series.toLowerCase().trim()
    const issueNum = issue.toString()
    
    // Normalize function to handle punctuation and articles
    const normalizeTitle = (title) => {
      return title
        .replace(/^(the|a|an)\s+/i, '') // Remove leading articles
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces (keeps words separate)
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
        .toLowerCase()
    }
    
    const normalizedSeries = normalizeTitle(series)
    const seriesWords = normalizedSeries.split(/\s+/).filter(w => w.length > 2)
    
    // Helper function to detect non-English content
    const isLikelyNonEnglish = (volumeName) => {
      if (!volumeName) return false
      
      const name = volumeName.toLowerCase()
      
      // Common non-English language indicators in volume names
      const nonEnglishIndicators = [
        // Language codes and names
        '(french)', '(spanish)', '(german)', '(italian)', '(portuguese)',
        '(japanese)', '(korean)', '(chinese)', '(russian)', '(polish)',
        'édition', 'edición', 'ausgabe', 'edizione', 'edição',
        // Country/region indicators
        '(france)', '(spain)', '(germany)', '(italy)', '(brazil)',
        '(mexico)', '(argentina)', '(japan)', '(korea)',
        // Common non-English words in titles
        'les ', 'los ', 'las ', 'der ', 'die ', 'das ', 'il ', 'la ',
        // Special characters common in non-English text
        'ñ', 'ç', 'ü', 'ö', 'ä', 'é', 'è', 'ê', 'à', 'â', 'ô', 'û'
      ]
      
      return nonEnglishIndicators.some(indicator => name.includes(indicator))
    }
    
    let processedResults = (data.results || [])
      .map(result => {
        // Enrich result with full volume data including publisher
        const volumeId = result.volume?.id
        const fullVolumeData = volumeMap.get(volumeId)
        
        return {
          ...result,
          volume: {
            ...result.volume,
            publisher: fullVolumeData?.publisher || null,
            start_year: fullVolumeData?.start_year || null
          }
        }
      })
      .filter(result => {
        // Must have an image
        if (!result.image || !result.image.original_url) return false
        
        // Must match issue number exactly
        if (result.issue_number?.toString() !== issueNum) return false
        
        // Filter by matching series name in volume.name
        const volumeName = result.volume?.name?.toLowerCase().trim() || ''
        const normalizedVolume = normalizeTitle(volumeName)
        
        // Exact match (case insensitive, normalized)
        if (normalizedVolume === normalizedSeries) return true
        
        // Direct substring match
        if (normalizedVolume.includes(normalizedSeries) || normalizedSeries.includes(normalizedVolume)) return true
        
        // Word-based matching: require ALL significant words from search to appear in volume name
        // This prevents false positives while allowing for minor variations
        if (seriesWords.length === 0) return false
        
        const allSeriesWordsMatch = seriesWords.every(word => normalizedVolume.includes(word))
        
        return allSeriesWordsMatch
      })
      // Sort results: Publisher match first, then English versions, then by year proximity
      .sort((a, b) => {
        // Priority 1: Publisher match (if publisher provided)
        if (publisher) {
          const publisherLower = publisher.toLowerCase().trim()
          const aPublisher = (a.volume?.publisher?.name || '').toLowerCase().trim()
          const bPublisher = (b.volume?.publisher?.name || '').toLowerCase().trim()
          
          const aPublisherMatch = aPublisher.includes(publisherLower) || publisherLower.includes(aPublisher)
          const bPublisherMatch = bPublisher.includes(publisherLower) || publisherLower.includes(bPublisher)
          
          if (aPublisherMatch && !bPublisherMatch) return -1
          if (bPublisherMatch && !aPublisherMatch) return 1
        }
        
        // Priority 2: English versions first
        const aVolumeName = a.volume?.name || ''
        const bVolumeName = b.volume?.name || ''
        
        const aIsNonEnglish = isLikelyNonEnglish(aVolumeName)
        const bIsNonEnglish = isLikelyNonEnglish(bVolumeName)
        
        if (!aIsNonEnglish && bIsNonEnglish) return -1
        if (aIsNonEnglish && !bIsNonEnglish) return 1
        
        // Priority 3: Year proximity (if year provided)
        if (year) {
          const targetYear = parseInt(year)
          const aYear = a.cover_date ? new Date(a.cover_date).getFullYear() : 0
          const bYear = b.cover_date ? new Date(b.cover_date).getFullYear() : 0
          const aDiff = Math.abs(aYear - targetYear)
          const bDiff = Math.abs(bYear - targetYear)
          return aDiff - bDiff
        }
        
        return 0
      })
      .map(result => ({
        id: result.id.toString(),
        imageUrl: result.image.original_url,
        thumbnailUrl: result.image.thumb_url || result.image.small_url,
        quality: 'medium',
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
          coverDate: result.cover_date || null,
          storeDate: result.store_date || null,
          year: result.cover_date ? new Date(result.cover_date).getFullYear() : null,
          apiId: result.id.toString(),
          originalUrl: result.site_detail_url
        }
      }))

    console.log(`Raw results from ComicVine: ${data.results?.length || 0}`)
    console.log(`Filtered to ${processedResults.length} covers matching series "${series}"`)
    
    // Log sorting results for debugging
    if (processedResults.length > 0) {
      console.log('Results after sorting (publisher/language/year):')
      processedResults.slice(0, 5).forEach((r, i) => {
        const volumeName = r.metadata?.title || ''
        const pub = r.metadata?.publisher || 'unknown'
        const isNonEng = isLikelyNonEnglish(volumeName)
        console.log(`  ${i + 1}. "${volumeName}" - Publisher: ${pub}, ${isNonEng ? 'NON-ENGLISH' : 'English'}, Year: ${r.metadata?.year || 'unknown'}`)
      })
    }
    
    if (processedResults.length === 0 && data.results?.length > 0) {
      console.log('First 10 raw results for debugging:')
      data.results.slice(0, 10).forEach((r, i) => {
        console.log(`  ${i + 1}. Volume: "${r.volume?.name}", Issue: ${r.issue_number}, Has Image: ${!!r.image?.original_url}`)
      })
    }
    
    // If no results after filtering, log what volumes were searched
    if (processedResults.length === 0) {
      console.log(`No matches found. Searched volumes:`, volumeData.results.map(v => v.name))
      console.log(`Looking for issue number: "${issueNum}"`)
      console.log(`Total issues returned from Comic Vine: ${data.results?.length || 0}`)
    }

    // Limit to 10 results
    processedResults = processedResults.slice(0, 10)

    console.log(`Found ${processedResults.length} covers for ${series} #${issue}`)

    res.json({
      success: true,
      results: processedResults,
      total: processedResults.length,
      query: { series, issue, publisher, year }
    })

  } catch (error) {
    console.error('Cover search error:', error)
    res.status(500).json({
      error: 'Failed to search for covers',
      details: error.message
    })
  }
}