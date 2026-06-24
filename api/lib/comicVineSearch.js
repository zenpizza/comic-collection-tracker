/**
 * Core ComicVine volume+issue search/matching logic, shared between the
 * /api/cover-search endpoint and the one-off comicVineId backfill.
 */

const normalizeTitle = (title) => {
  return title
    .replace(/^(the|a|an)\s+/i, '') // Remove leading articles
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces (keeps words separate)
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
    .toLowerCase()
}

const isLikelyNonEnglish = (volumeName) => {
  if (!volumeName) return false

  const name = volumeName.toLowerCase()

  const nonEnglishIndicators = [
    '(french)', '(spanish)', '(german)', '(italian)', '(portuguese)',
    '(japanese)', '(korean)', '(chinese)', '(russian)', '(polish)',
    'édition', 'edición', 'ausgabe', 'edizione', 'edição',
    '(france)', '(spain)', '(germany)', '(italy)', '(brazil)',
    '(mexico)', '(argentina)', '(japan)', '(korea)',
    'les ', 'los ', 'las ', 'der ', 'die ', 'das ', 'il ', 'la ',
    'ñ', 'ç', 'ü', 'ö', 'ä', 'é', 'è', 'ê', 'à', 'â', 'ô', 'û'
  ]

  return nonEnglishIndicators.some(indicator => name.includes(indicator))
}

/**
 * Two-step ComicVine search: find candidate volumes by series name, then
 * issues within those volumes matching the issue number. Returns results
 * sorted by publisher match / English-language / year proximity, same as
 * /api/cover-search.
 */
export async function searchComicVineIssues({ series, issue, publisher, year, apiKey }) {
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

  if (!volumeData.results || volumeData.results.length === 0) {
    return []
  }

  const volumeMap = new Map()
  volumeData.results.forEach(vol => volumeMap.set(vol.id, vol))

  let filteredVolumes = volumeData.results
  if (year) {
    const targetYear = parseInt(year)
    filteredVolumes = [...volumeData.results].sort((a, b) => {
      const aYear = a.start_year || 0
      const bYear = b.start_year || 0
      const aDiff = Math.abs(aYear - targetYear)
      const bDiff = Math.abs(bYear - targetYear)
      if (aYear === targetYear && bYear !== targetYear) return -1
      if (bYear === targetYear && aYear !== targetYear) return 1
      return aDiff - bDiff
    })
  }

  const volumeIds = filteredVolumes.map(v => v.id).join('|')

  const issuesUrl = new URL('https://comicvine.gamespot.com/api/issues/')
  issuesUrl.searchParams.set('api_key', apiKey)
  issuesUrl.searchParams.set('format', 'json')
  issuesUrl.searchParams.set('filter', `volume:${volumeIds},issue_number:${issue}`)
  issuesUrl.searchParams.set('field_list', 'id,name,issue_number,cover_date,image,volume')
  issuesUrl.searchParams.set('limit', '20')
  issuesUrl.searchParams.set('sort', year ? 'cover_date:asc' : 'cover_date:desc')

  const issuesResponse = await fetch(issuesUrl.toString(), {
    headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
  })

  if (!issuesResponse.ok) {
    throw new Error(`Comic Vine API responded with ${issuesResponse.status}`)
  }

  const data = await issuesResponse.json()

  if (data.error !== 'OK') {
    throw new Error(`Comic Vine API error: ${data.error}`)
  }

  const issueNum = issue.toString()
  const normalizedSeries = normalizeTitle(series)
  const seriesWords = normalizedSeries.split(/\s+/).filter(w => w.length > 2)

  let processedResults = (data.results || [])
    .map(result => {
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
      if (!result.image || !result.image.original_url) return false
      if (result.issue_number?.toString() !== issueNum) return false

      const volumeName = result.volume?.name?.toLowerCase().trim() || ''
      const normalizedVolume = normalizeTitle(volumeName)

      if (normalizedVolume === normalizedSeries) return true
      if (normalizedVolume.includes(normalizedSeries) || normalizedSeries.includes(normalizedVolume)) return true
      if (seriesWords.length === 0) return false

      return seriesWords.every(word => normalizedVolume.includes(word))
    })
    .sort((a, b) => {
      if (publisher) {
        const publisherLower = publisher.toLowerCase().trim()
        const aPublisher = (a.volume?.publisher?.name || '').toLowerCase().trim()
        const bPublisher = (b.volume?.publisher?.name || '').toLowerCase().trim()

        const aPublisherMatch = aPublisher.includes(publisherLower) || publisherLower.includes(aPublisher)
        const bPublisherMatch = bPublisher.includes(publisherLower) || publisherLower.includes(bPublisher)

        if (aPublisherMatch && !bPublisherMatch) return -1
        if (bPublisherMatch && !aPublisherMatch) return 1
      }

      const aVolumeName = a.volume?.name || ''
      const bVolumeName = b.volume?.name || ''
      const aIsNonEnglish = isLikelyNonEnglish(aVolumeName)
      const bIsNonEnglish = isLikelyNonEnglish(bVolumeName)

      if (!aIsNonEnglish && bIsNonEnglish) return -1
      if (aIsNonEnglish && !bIsNonEnglish) return 1

      if (year) {
        const targetYear = parseInt(year)
        const aYear = a.cover_date ? new Date(a.cover_date).getFullYear() : 0
        const bYear = b.cover_date ? new Date(b.cover_date).getFullYear() : 0
        return Math.abs(aYear - targetYear) - Math.abs(bYear - targetYear)
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
        originalUrl: result.site_detail_url,
        volumeId: result.volume?.id?.toString() || null,
        volumeName: result.volume?.name || null
      }
    }))

  return processedResults.slice(0, 10)
}
