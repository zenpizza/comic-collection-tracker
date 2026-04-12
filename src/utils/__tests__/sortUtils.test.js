import { describe, it, expect } from 'vitest'
import {
  removeLeadingArticles,
  getSeriesSortKey,
  compareSeriesNames,
  sortSeriesNames,
  sortBySeriesName,
  groupAndSortBySeries,
  getSortedUniqueSeriesNames,
} from '../sortUtils'

describe('removeLeadingArticles', () => {
  it('removes "The" from the start', () => {
    expect(removeLeadingArticles('The Amazing Spider-Man')).toBe('Amazing Spider-Man')
  })

  it('removes "A" from the start', () => {
    expect(removeLeadingArticles('A Death in the Family')).toBe('Death in the Family')
  })

  it('removes "An" from the start', () => {
    expect(removeLeadingArticles('An Unexpected Journey')).toBe('Unexpected Journey')
  })

  it('is case-insensitive for articles', () => {
    expect(removeLeadingArticles('the amazing spider-man')).toBe('amazing spider-man')
    expect(removeLeadingArticles('THE X-Men')).toBe('X-Men')
  })

  it('does not remove article that is part of a word', () => {
    expect(removeLeadingArticles('There Goes the Neighborhood')).toBe('There Goes the Neighborhood')
  })

  it('does not remove article when it is the only word', () => {
    expect(removeLeadingArticles('The')).toBe('The')
  })

  it('preserves original casing of remaining words', () => {
    expect(removeLeadingArticles('The X-Men')).toBe('X-Men')
  })

  it('returns empty string for empty input', () => {
    expect(removeLeadingArticles('')).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(removeLeadingArticles(null)).toBe('')
  })

  it('returns empty string for undefined input', () => {
    expect(removeLeadingArticles(undefined)).toBe('')
  })

  it('trims surrounding whitespace', () => {
    expect(removeLeadingArticles('  The X-Men  ')).toBe('X-Men')
  })

  it('does not strip article in the middle', () => {
    expect(removeLeadingArticles('X-Men: The Dark Phoenix Saga')).toBe('X-Men: The Dark Phoenix Saga')
  })
})

describe('getSeriesSortKey', () => {
  it('returns lowercase sort key with article stripped', () => {
    expect(getSeriesSortKey('The Amazing Spider-Man')).toBe('amazing spider-man')
  })

  it('lowercases non-article titles', () => {
    expect(getSeriesSortKey('Batman')).toBe('batman')
  })
})

describe('compareSeriesNames', () => {
  it('sorts "The Amazing Spider-Man" before "Batman" (A before B)', () => {
    expect(compareSeriesNames('The Amazing Spider-Man', 'Batman')).toBeLessThan(0)
  })

  it('sorts "Batman" after "The Amazing Spider-Man"', () => {
    expect(compareSeriesNames('Batman', 'The Amazing Spider-Man')).toBeGreaterThan(0)
  })

  it('returns 0 for identical names', () => {
    expect(compareSeriesNames('Batman', 'Batman')).toBe(0)
  })

  it('treats "The X-Men" and "X-Men" as equal after article stripping', () => {
    expect(compareSeriesNames('The X-Men', 'X-Men')).toBe(0)
  })
})

describe('sortSeriesNames', () => {
  it('sorts a list in library order (articles ignored)', () => {
    const input = ['The X-Men', 'Batman', 'The Amazing Spider-Man', 'Daredevil']
    const result = sortSeriesNames(input)
    expect(result).toEqual(['The Amazing Spider-Man', 'Batman', 'Daredevil', 'The X-Men'])
  })

  it('does not mutate the original array', () => {
    const input = ['The X-Men', 'Batman']
    sortSeriesNames(input)
    expect(input).toEqual(['The X-Men', 'Batman'])
  })

  it('handles an empty array', () => {
    expect(sortSeriesNames([])).toEqual([])
  })

  it('handles a single-element array', () => {
    expect(sortSeriesNames(['Batman'])).toEqual(['Batman'])
  })
})

describe('sortBySeriesName', () => {
  it('sorts objects by default "series" property in library order', () => {
    const input = [
      { series: 'The X-Men', issue: 1 },
      { series: 'Batman', issue: 1 },
      { series: 'The Amazing Spider-Man', issue: 1 },
    ]
    const result = sortBySeriesName(input)
    expect(result.map(o => o.series)).toEqual([
      'The Amazing Spider-Man',
      'Batman',
      'The X-Men',
    ])
  })

  it('supports a custom property name', () => {
    const input = [
      { title: 'The X-Men' },
      { title: 'Batman' },
    ]
    const result = sortBySeriesName(input, 'title')
    expect(result.map(o => o.title)).toEqual(['Batman', 'The X-Men'])
  })

  it('treats missing series property as empty string (sorts first)', () => {
    const input = [
      { series: 'Batman' },
      { series: undefined },
    ]
    const result = sortBySeriesName(input)
    expect(result[0].series).toBeUndefined()
    expect(result[1].series).toBe('Batman')
  })

  it('does not mutate the original array', () => {
    const input = [{ series: 'The X-Men' }, { series: 'Batman' }]
    sortBySeriesName(input)
    expect(input[0].series).toBe('The X-Men')
  })
})

describe('groupAndSortBySeries', () => {
  it('groups items by series', () => {
    const input = [
      { series: 'Batman', issueNumber: '1' },
      { series: 'Batman', issueNumber: '2' },
      { series: 'The X-Men', issueNumber: '1' },
    ]
    const result = groupAndSortBySeries(input)
    expect(Object.keys(result)).toContain('Batman')
    expect(Object.keys(result)).toContain('The X-Men')
    expect(result['Batman']).toHaveLength(2)
    expect(result['The X-Men']).toHaveLength(1)
  })

  it('sorts items within each group by issue number ascending', () => {
    const input = [
      { series: 'Batman', issueNumber: '3' },
      { series: 'Batman', issueNumber: '1' },
      { series: 'Batman', issueNumber: '2' },
    ]
    const result = groupAndSortBySeries(input)
    expect(result['Batman'].map(i => i.issueNumber)).toEqual(['1', '2', '3'])
  })

  it('falls back to "Unknown" for items with no series', () => {
    const input = [{ issueNumber: '1' }]
    const result = groupAndSortBySeries(input)
    expect(result['Unknown']).toHaveLength(1)
  })

  it('supports a custom series property name', () => {
    const input = [{ title: 'Batman', issueNumber: '1' }]
    const result = groupAndSortBySeries(input, 'title')
    expect(result['Batman']).toHaveLength(1)
  })
})

describe('getSortedUniqueSeriesNames', () => {
  it('returns unique series names in library sort order', () => {
    const input = [
      { series: 'The X-Men' },
      { series: 'Batman' },
      { series: 'The X-Men' },
      { series: 'The Amazing Spider-Man' },
    ]
    const result = getSortedUniqueSeriesNames(input)
    expect(result).toEqual(['The Amazing Spider-Man', 'Batman', 'The X-Men'])
  })

  it('excludes empty/falsy series values', () => {
    const input = [
      { series: 'Batman' },
      { series: '' },
      { series: null },
    ]
    const result = getSortedUniqueSeriesNames(input)
    expect(result).toEqual(['Batman'])
  })

  it('returns empty array for empty input', () => {
    expect(getSortedUniqueSeriesNames([])).toEqual([])
  })
})
