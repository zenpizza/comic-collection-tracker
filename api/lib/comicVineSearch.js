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

// Year and month from a ComicVine date string like "1988-07-01". Parsed from
// the string rather than via Date: new Date('1987-01-01') is UTC midnight, so
// west of UTC getFullYear() gives 1986 (and the month can shift too).
const coverDateYear = (coverDate) => {
  const year = parseInt(coverDate?.split('-')[0], 10)
  return Number.isInteger(year) ? year : null
}

const coverDateMonth = (coverDate) => {
  const month = parseInt(coverDate?.split('-')[1], 10)
  return month >= 1 && month <= 12 ? month : null
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
 * Fetch publishers for the given volume IDs. ComicVine's /search endpoint
 * returns `publisher: null` for volumes even when it's in field_list, so the
 * /volumes endpoint is the only source. Failure is non-fatal: results just
 * come back without a publisher, as they did before.
 */
async function fetchVolumePublishers(volumeIds, apiKey, fetchImpl) {
  const publishers = new Map()
  if (volumeIds.length === 0) return publishers

  try {
    const url = new URL('https://comicvine.gamespot.com/api/volumes/')
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('format', 'json')
    url.searchParams.set('filter', `id:${volumeIds.join('|')}`)
    url.searchParams.set('field_list', 'id,publisher')
    url.searchParams.set('limit', '100')

    const response = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': 'Comic Collection Tracker/1.0' }
    })
    if (!response.ok) throw new Error(`Comic Vine API responded with ${response.status}`)

    const data = await response.json()
    if (data.error !== 'OK') throw new Error(`Comic Vine API error: ${data.error}`)

    ;(data.results || []).forEach(vol => {
      if (vol.publisher) publishers.set(vol.id, vol.publisher)
    })
  } catch (error) {
    // A rate-limit stop (see paced fetch in backfillComicVineIds) must reach the caller
    if (error.rateLimited) throw error
    console.warn('Could not fetch volume publishers:', error.message)
  }

  return publishers
}

/**
 * Two-step ComicVine search: find candidate volumes by series name, then
 * issues within those volumes matching the issue number. Returns results
 * sorted by publisher match / English-language / year proximity, same as
 * /api/cover-search.
 *
 * `fetchImpl` lets the backfill pass a paced, caching fetch. Request URLs
 * depend only on the series and issue number, so responses for a series can
 * be reused across its issues.
 *
 * `volumeIds` skips the name search and looks only in those volumes, for
 * series whose volume ComicVine's search doesn't surface.
 */
export async function searchComicVineIssues({ series, issue, publisher, year, apiKey, fetchImpl = fetch, volumeIds: knownVolumeIds }) {
  if (knownVolumeIds?.length) {
    const volumes = knownVolumeIds.map(id => ({ id: Number(id) }))
    return searchIssuesInVolumes({ volumes, matchName: false, series, issue, publisher, year, apiKey, fetchImpl })
  }

  const volumeSearchUrl = new URL('https://comicvine.gamespot.com/api/search/')
  volumeSearchUrl.searchParams.set('api_key', apiKey)
  volumeSearchUrl.searchParams.set('format', 'json')
  volumeSearchUrl.searchParams.set('resources', 'volume')
  volumeSearchUrl.searchParams.set('query', series)
  volumeSearchUrl.searchParams.set('field_list', 'id,name,start_year,publisher')
  volumeSearchUrl.searchParams.set('limit', '10')

  const volumeResponse = await fetchImpl(volumeSearchUrl.toString(), {
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

  return searchIssuesInVolumes({ volumes: volumeData.results, matchName: true, series, issue, publisher, year, apiKey, fetchImpl })
}

/**
 * Issues numbered `issue` within `volumes`, ranked. With `matchName`, results
 * whose volume name doesn't resemble `series` are dropped (the name search is
 * fuzzy); known volumes skip that check.
 */
async function searchIssuesInVolumes({ volumes, matchName, series, issue, publisher, year, apiKey, fetchImpl }) {
  const volumeMap = new Map()
  volumes.forEach(vol => volumeMap.set(vol.id, vol))

  let filteredVolumes = volumes
  if (year) {
    const targetYear = parseInt(year)
    filteredVolumes = [...volumes].sort((a, b) => {
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

  const issuesResponse = await fetchImpl(issuesUrl.toString(), {
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

  const matchedResults = (data.results || [])
    .filter(result => {
      if (!result.image || !result.image.original_url) return false
      if (result.issue_number?.toString() !== issueNum) return false
      if (!matchName) return true

      const volumeName = result.volume?.name?.toLowerCase().trim() || ''
      const normalizedVolume = normalizeTitle(volumeName)

      if (normalizedVolume === normalizedSeries) return true
      if (normalizedVolume.includes(normalizedSeries) || normalizedSeries.includes(normalizedVolume)) return true
      if (seriesWords.length === 0) return false

      return seriesWords.every(word => normalizedVolume.includes(word))
    })

  // Ask for every candidate volume, not just the matched ones, so the request
  // is the same for every issue of a series (and cacheable by the backfill).
  const volumePublishers = matchedResults.length > 0
    ? await fetchVolumePublishers(volumes.map(v => v.id), apiKey, fetchImpl)
    : new Map()

  const processedResults = matchedResults
    .map(result => {
      const volumeId = result.volume?.id
      const fullVolumeData = volumeMap.get(volumeId)
      return {
        ...result,
        volume: {
          ...result.volume,
          publisher: volumePublishers.get(volumeId) || fullVolumeData?.publisher || null,
          start_year: fullVolumeData?.start_year || null
        }
      }
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
        const aYear = coverDateYear(a.cover_date) || 0
        const bYear = coverDateYear(b.cover_date) || 0
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
        year: coverDateYear(result.cover_date),
        month: coverDateMonth(result.cover_date),
        apiId: result.id.toString(),
        originalUrl: result.site_detail_url,
        volumeId: result.volume?.id?.toString() || null,
        volumeName: result.volume?.name || null
      }
    }))

  return processedResults.slice(0, 10)
}
