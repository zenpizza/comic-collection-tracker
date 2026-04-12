import { describe, it, expect, beforeEach, vi } from 'vitest'
import dataStore from '../dataStore.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const comic = (series, issueNumber, extra = {}) => ({
  id: `${series}-${issueNumber}`,
  series,
  issueNumber,
  ...extra,
})

// ---------------------------------------------------------------------------
// normalizeComics
// ---------------------------------------------------------------------------
describe('normalizeComics', () => {
  it('maps _id to id and removes _id', () => {
    const input = [{ _id: 'abc123', series: 'Batman', issueNumber: '1' }]
    const result = dataStore.normalizeComics(input)
    expect(result[0].id).toBe('abc123')
    expect(result[0]._id).toBeUndefined()
  })

  it('leaves comics that already have id unchanged', () => {
    const input = [{ id: 'abc123', series: 'Batman', issueNumber: '1' }]
    const result = dataStore.normalizeComics(input)
    expect(result[0].id).toBe('abc123')
  })

  it('filters out comics with no id and no _id', () => {
    const input = [
      { series: 'Batman', issueNumber: '1' },
      { id: 'good', series: 'X-Men', issueNumber: '1' },
    ]
    const result = dataStore.normalizeComics(input)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('good')
  })

  it('filters out comics where id is null', () => {
    const input = [{ id: null, series: 'Batman', issueNumber: '1' }]
    expect(dataStore.normalizeComics(input)).toHaveLength(0)
  })

  it('returns empty array for empty input', () => {
    expect(dataStore.normalizeComics([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// validateAndMigrateData
// ---------------------------------------------------------------------------
describe('validateAndMigrateData', () => {
  it('handles old format — plain array of comics', () => {
    const input = [{ id: '1', series: 'Batman', issueNumber: '1' }]
    const result = dataStore.validateAndMigrateData(input)
    expect(result).toHaveLength(1)
    expect(result[0].series).toBe('Batman')
  })

  it('handles new format — object with comics array', () => {
    const input = { comics: [{ id: '1', series: 'Batman', issueNumber: '1' }] }
    const result = dataStore.validateAndMigrateData(input)
    expect(result).toHaveLength(1)
  })

  it('returns empty array for unrecognised input', () => {
    expect(dataStore.validateAndMigrateData({})).toEqual([])
    expect(dataStore.validateAndMigrateData('string')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// checkForDuplicate
// ---------------------------------------------------------------------------
describe('checkForDuplicate', () => {
  const existing = [
    comic('Amazing Spider-Man', '1'),
    comic('Batman', '5A'),
  ]

  it('returns the matching comic when a duplicate exists', () => {
    const result = dataStore.checkForDuplicate(comic('Amazing Spider-Man', '1'), existing)
    expect(result).toBeDefined()
    expect(result.series).toBe('Amazing Spider-Man')
  })

  it('is case-insensitive for series', () => {
    const result = dataStore.checkForDuplicate(comic('amazing spider-man', '1'), existing)
    expect(result).toBeDefined()
  })

  it('is case-insensitive for issue number', () => {
    const result = dataStore.checkForDuplicate({ series: 'Batman', issueNumber: '5a' }, existing)
    expect(result).toBeDefined()
  })

  it('returns undefined when no duplicate exists', () => {
    const result = dataStore.checkForDuplicate(comic('Daredevil', '1'), existing)
    expect(result).toBeUndefined()
  })

  it('matches numeric issue numbers against string issue numbers', () => {
    const withNumericString = [comic('Batman', '5')]
    const result = dataStore.checkForDuplicate({ series: 'Batman', issueNumber: 5 }, withNumericString)
    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// findDuplicates
// ---------------------------------------------------------------------------
describe('findDuplicates', () => {
  it('returns an empty array when there are no duplicates', () => {
    const comics = [comic('Batman', '1'), comic('Batman', '2')]
    expect(dataStore.findDuplicates(comics)).toEqual([])
  })

  it('identifies a duplicate pair', () => {
    const comics = [comic('Batman', '1'), comic('Batman', '1')]
    const dups = dataStore.findDuplicates(comics)
    expect(dups).toHaveLength(1)
    expect(dups[0].original.series).toBe('Batman')
    expect(dups[0].duplicate.series).toBe('Batman')
  })

  it('is case-insensitive', () => {
    const comics = [comic('Batman', '1'), comic('BATMAN', '1')]
    expect(dataStore.findDuplicates(comics)).toHaveLength(1)
  })

  it('records correct original and duplicate indices', () => {
    const comics = [comic('Batman', '1'), comic('X-Men', '5'), comic('Batman', '1')]
    const dups = dataStore.findDuplicates(comics)
    expect(dups[0].originalIndex).toBe(0)
    expect(dups[0].duplicateIndex).toBe(2)
  })

  it('returns empty array for an empty collection', () => {
    expect(dataStore.findDuplicates([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// removeDuplicates
// ---------------------------------------------------------------------------
describe('removeDuplicates', () => {
  it('keeps the first occurrence and removes the duplicate', () => {
    const a = { ...comic('Batman', '1'), id: 'first' }
    const b = { ...comic('Batman', '1'), id: 'second' }
    const result = dataStore.removeDuplicates([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('first')
  })

  it('is case-insensitive', () => {
    const comics = [comic('Batman', '1'), comic('BATMAN', '1')]
    expect(dataStore.removeDuplicates(comics)).toHaveLength(1)
  })

  it('does not mutate the original array', () => {
    const comics = [comic('Batman', '1'), comic('Batman', '1')]
    dataStore.removeDuplicates(comics)
    expect(comics).toHaveLength(2)
  })

  it('returns all items when there are no duplicates', () => {
    const comics = [comic('Batman', '1'), comic('Batman', '2'), comic('X-Men', '1')]
    expect(dataStore.removeDuplicates(comics)).toHaveLength(3)
  })

  it('returns empty array for empty input', () => {
    expect(dataStore.removeDuplicates([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getTopSeries
// ---------------------------------------------------------------------------
describe('getTopSeries', () => {
  const comics = [
    comic('Batman', '1'), comic('Batman', '2'), comic('Batman', '3'),
    comic('X-Men', '1'), comic('X-Men', '2'),
    comic('Daredevil', '1'),
  ]

  it('returns series ordered by issue count descending', () => {
    const top = dataStore.getTopSeries(comics, 3)
    expect(top[0].series).toBe('Batman')
    expect(top[0].count).toBe(3)
    expect(top[1].series).toBe('X-Men')
    expect(top[1].count).toBe(2)
  })

  it('respects the limit', () => {
    expect(dataStore.getTopSeries(comics, 2)).toHaveLength(2)
  })

  it('defaults to 5 results', () => {
    const many = Array.from({ length: 10 }, (_, i) => comic(`Series ${i}`, '1'))
    expect(dataStore.getTopSeries(many)).toHaveLength(5)
  })

  it('breaks ties by library-style alphabetical order', () => {
    const tied = [
      comic('The Avengers', '1'),
      comic('Batman', '1'),
    ]
    const top = dataStore.getTopSeries(tied, 2)
    expect(top[0].series).toBe('The Avengers')
    expect(top[1].series).toBe('Batman')
  })

  it('returns empty array for empty input', () => {
    expect(dataStore.getTopSeries([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getCollectionStats
// ---------------------------------------------------------------------------
describe('getCollectionStats', () => {
  const comics = [
    comic('Batman', '1', { publisher: 'DC', year: '1940' }),
    comic('Batman', '2', { publisher: 'DC', year: '1941' }),
    comic('X-Men', '1', { publisher: 'Marvel', year: '1963' }),
  ]

  it('returns correct total comic count', () => {
    expect(dataStore.getCollectionStats(comics).totalComics).toBe(3)
  })

  it('returns correct series count', () => {
    expect(dataStore.getCollectionStats(comics).seriesCount).toBe(2)
  })

  it('returns unique publishers', () => {
    const { publishers } = dataStore.getCollectionStats(comics)
    expect(publishers).toContain('DC')
    expect(publishers).toContain('Marvel')
    expect(publishers).toHaveLength(2)
  })

  it('excludes falsy publishers', () => {
    const withBlank = [...comics, comic('Daredevil', '1', { publisher: '' })]
    const { publishers } = dataStore.getCollectionStats(withBlank)
    expect(publishers).not.toContain('')
  })

  it('calculates earliest and latest year', () => {
    const { yearRange } = dataStore.getCollectionStats(comics)
    expect(yearRange.earliest).toBe(1940)
    expect(yearRange.latest).toBe(1963)
  })

  it('includes topSeries', () => {
    const { topSeries } = dataStore.getCollectionStats(comics)
    expect(topSeries[0].series).toBe('Batman')
    expect(topSeries[0].count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// loadComics — async, mocks fetch + localStorage
// ---------------------------------------------------------------------------
describe('loadComics', () => {
  let store = {}

  beforeEach(() => {
    vi.restoreAllMocks()
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v },
      removeItem: (k) => { delete store[k] },
      clear: () => { store = {} },
    })
  })

  it('returns normalized comics from the API on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ comics: [{ _id: '1', series: 'Batman', issueNumber: '1' }] }),
    }))

    const result = await dataStore.loadComics()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('falls back to localStorage when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    localStorage.setItem('comicCollection', JSON.stringify([
      { id: 'local-1', series: 'Batman', issueNumber: '1' },
    ]))

    const result = await dataStore.loadComics()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('local-1')
  })

  it('returns empty array when both API and localStorage are empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await dataStore.loadComics()
    expect(result).toEqual([])
  })
})
