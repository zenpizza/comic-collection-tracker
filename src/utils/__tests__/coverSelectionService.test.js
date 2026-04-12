import { describe, it, expect } from 'vitest'
import coverSelectionService from '../coverSelectionService.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const cover = (title, quality = 'high', extra = {}) => ({
  metadata: { title },
  quality,
  ...extra,
})

// ---------------------------------------------------------------------------
// normalizeTitle
// ---------------------------------------------------------------------------
describe('normalizeTitle', () => {
  it('lowercases and trims the title', () => {
    expect(coverSelectionService.normalizeTitle('  Batman  ')).toBe('batman')
  })

  it('removes leading "the"', () => {
    expect(coverSelectionService.normalizeTitle('The Avengers')).toBe('avengers')
  })

  it('removes leading "a"', () => {
    expect(coverSelectionService.normalizeTitle('A Death in the Family')).toBe('death in the family')
  })

  it('removes leading "an"', () => {
    expect(coverSelectionService.normalizeTitle('An Unexpected Journey')).toBe('unexpected journey')
  })

  it('does not remove article embedded mid-title', () => {
    expect(coverSelectionService.normalizeTitle('Batman: The Dark Knight')).toBe('batman: the dark knight')
  })

  it('returns empty string for null', () => {
    expect(coverSelectionService.normalizeTitle(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(coverSelectionService.normalizeTitle(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(coverSelectionService.normalizeTitle('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// titlesMatch
// ---------------------------------------------------------------------------
describe('titlesMatch', () => {
  it('matches identical titles', () => {
    expect(coverSelectionService.titlesMatch('Batman', 'Batman')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(coverSelectionService.titlesMatch('BATMAN', 'batman')).toBe(true)
  })

  it('matches when one has a leading article the other lacks', () => {
    expect(coverSelectionService.titlesMatch('The Transformers', 'Transformers')).toBe(true)
    expect(coverSelectionService.titlesMatch('Transformers', 'The Transformers')).toBe(true)
  })

  it('matches when one title is a substring of the other', () => {
    expect(coverSelectionService.titlesMatch('Batman: Year One', 'Batman')).toBe(true)
  })

  it('returns false for clearly different titles', () => {
    expect(coverSelectionService.titlesMatch('Batman', 'Superman')).toBe(false)
  })

  it('returns false when either title is null', () => {
    expect(coverSelectionService.titlesMatch(null, 'Batman')).toBe(false)
    expect(coverSelectionService.titlesMatch('Batman', null)).toBe(false)
  })

  it('returns false when either title is empty string', () => {
    expect(coverSelectionService.titlesMatch('', 'Batman')).toBe(false)
    expect(coverSelectionService.titlesMatch('Batman', '')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterByTitleMatch
// ---------------------------------------------------------------------------
describe('filterByTitleMatch', () => {
  const results = [
    cover('Batman'),
    cover('Superman'),
    cover('The Avengers'),
  ]

  it('keeps only covers whose title matches the target series', () => {
    const filtered = coverSelectionService.filterByTitleMatch(results, 'Batman')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].metadata.title).toBe('Batman')
  })

  it('matches via article normalization', () => {
    const filtered = coverSelectionService.filterByTitleMatch(results, 'Avengers')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].metadata.title).toBe('The Avengers')
  })

  it('returns all results when targetSeries is falsy', () => {
    expect(coverSelectionService.filterByTitleMatch(results, '')).toHaveLength(3)
    expect(coverSelectionService.filterByTitleMatch(results, null)).toHaveLength(3)
  })

  it('returns empty array when no results match', () => {
    expect(coverSelectionService.filterByTitleMatch(results, 'Daredevil')).toHaveLength(0)
  })

  it('handles results with no metadata gracefully', () => {
    const bare = [{ quality: 'high' }, cover('Batman')]
    const filtered = coverSelectionService.filterByTitleMatch(bare, 'Batman')
    expect(filtered).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// filterByQuality
// ---------------------------------------------------------------------------
describe('filterByQuality', () => {
  const results = [
    cover('A', 'low'),
    cover('B', 'medium'),
    cover('C', 'high'),
  ]

  it('returns all results for qualityFilter "any"', () => {
    expect(coverSelectionService.filterByQuality(results, 'any')).toHaveLength(3)
  })

  it('returns all results when qualityFilter is falsy', () => {
    expect(coverSelectionService.filterByQuality(results, null)).toHaveLength(3)
    expect(coverSelectionService.filterByQuality(results, '')).toHaveLength(3)
  })

  it('filters to exact quality match for "low"', () => {
    const filtered = coverSelectionService.filterByQuality(results, 'low')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].quality).toBe('low')
  })

  it('filters to exact quality match for "high"', () => {
    const filtered = coverSelectionService.filterByQuality(results, 'high')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].quality).toBe('high')
  })

  it('"medium" filter accepts both medium and high quality covers', () => {
    const filtered = coverSelectionService.filterByQuality(results, 'medium')
    expect(filtered).toHaveLength(2)
    expect(filtered.map(r => r.quality)).toContain('medium')
    expect(filtered.map(r => r.quality)).toContain('high')
  })

  it('"medium" filter excludes low quality covers', () => {
    const filtered = coverSelectionService.filterByQuality(results, 'medium')
    expect(filtered.map(r => r.quality)).not.toContain('low')
  })
})

// ---------------------------------------------------------------------------
// selectBestCover
// ---------------------------------------------------------------------------
describe('selectBestCover', () => {
  it('returns null for null input', () => {
    expect(coverSelectionService.selectBestCover(null)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(coverSelectionService.selectBestCover([])).toBeNull()
  })

  it('returns the first result when no options are applied', () => {
    const results = [cover('Batman'), cover('Superman')]
    expect(coverSelectionService.selectBestCover(results)).toBe(results[0])
  })

  it('applies quality filter and returns null when nothing passes', () => {
    const results = [cover('Batman', 'low')]
    expect(coverSelectionService.selectBestCover(results, { qualityFilter: 'high' })).toBeNull()
  })

  it('applies quality filter and returns first passing result', () => {
    const results = [cover('Batman', 'low'), cover('Superman', 'high')]
    const best = coverSelectionService.selectBestCover(results, { qualityFilter: 'high' })
    expect(best.metadata.title).toBe('Superman')
  })

  it('prefers title-matched results when smartMatching is enabled', () => {
    const results = [cover('Superman'), cover('Batman')]
    const best = coverSelectionService.selectBestCover(results, {
      targetSeries: 'Batman',
      smartMatching: true,
    })
    expect(best.metadata.title).toBe('Batman')
  })

  it('falls back to unfiltered results when smart matching finds no matches', () => {
    const results = [cover('Superman'), cover('Batman')]
    const best = coverSelectionService.selectBestCover(results, {
      targetSeries: 'Daredevil',
      smartMatching: true,
    })
    // No match → returns first of original results
    expect(best.metadata.title).toBe('Superman')
  })

  it('skips smart matching when smartMatching is false', () => {
    const results = [cover('Superman'), cover('Batman')]
    const best = coverSelectionService.selectBestCover(results, {
      targetSeries: 'Batman',
      smartMatching: false,
    })
    expect(best.metadata.title).toBe('Superman')
  })

  it('handles article normalization in smart matching', () => {
    const results = [cover('The Avengers'), cover('Batman')]
    const best = coverSelectionService.selectBestCover(results, {
      targetSeries: 'Avengers',
      smartMatching: true,
    })
    expect(best.metadata.title).toBe('The Avengers')
  })
})
