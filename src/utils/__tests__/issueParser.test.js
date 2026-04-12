import { describe, it, expect } from 'vitest'
import {
  parseIssueForSearch,
  parseComicIssueForSearch,
  generateSearchFallbacks,
} from '../issueParser'

describe('parseIssueForSearch', () => {
  describe('regular issues', () => {
    it('returns series and issue unchanged for a plain issue number', () => {
      expect(parseIssueForSearch('X-Men', '18')).toEqual({ series: 'X-Men', issue: '18' })
    })

    it('trims whitespace from the issue number', () => {
      expect(parseIssueForSearch('Batman', '  5  ')).toEqual({ series: 'Batman', issue: '5' })
    })

    it('converts a numeric issue number to a string', () => {
      expect(parseIssueForSearch('Batman', 42)).toEqual({ series: 'Batman', issue: '42' })
    })
  })

  describe('Annual issues', () => {
    it('appends "Annual" to series and extracts the number', () => {
      expect(parseIssueForSearch('Fantastic Four', 'Annual 18')).toEqual({
        series: 'Fantastic Four Annual',
        issue: '18',
        alternativeSeries: 'Fantastic Four Annual',
      })
    })

    it('strips "The" prefix from series when annual', () => {
      expect(parseIssueForSearch('The Uncanny X-Men', 'Annual 9')).toEqual({
        series: 'Uncanny X-Men Annual',
        issue: '9',
        alternativeSeries: 'The Uncanny X-Men Annual',
      })
    })

    it('is case-insensitive for "Annual" keyword', () => {
      const result = parseIssueForSearch('Spider-Man', 'annual 3')
      expect(result.series).toBe('Spider-Man Annual')
      expect(result.issue).toBe('3')
    })

    it('preserves alternativeSeries with original series name', () => {
      const result = parseIssueForSearch('The Avengers', 'Annual 7')
      expect(result.alternativeSeries).toBe('The Avengers Annual')
    })
  })

  describe('Special issues', () => {
    it('handles "Special" format', () => {
      expect(parseIssueForSearch('Spider-Man', 'Special 5')).toEqual({
        series: 'Spider-Man Special',
        issue: '5',
        alternativeSeries: 'Spider-Man Special',
      })
    })

    it('handles "Giant-Size" format', () => {
      expect(parseIssueForSearch('X-Men', 'Giant-Size 1')).toEqual({
        series: 'X-Men Giant-Size',
        issue: '1',
        alternativeSeries: 'X-Men Giant-Size',
      })
    })

    it('handles "King-Size" format', () => {
      expect(parseIssueForSearch('Fantastic Four', 'King-Size 2')).toEqual({
        series: 'Fantastic Four King-Size',
        issue: '2',
        alternativeSeries: 'Fantastic Four King-Size',
      })
    })

    it('strips "The" prefix for special formats', () => {
      const result = parseIssueForSearch('The X-Men', 'Special 2')
      expect(result.series).toBe('X-Men Special')
      expect(result.alternativeSeries).toBe('The X-Men Special')
    })

    it('is case-insensitive for special keywords', () => {
      const result = parseIssueForSearch('Hulk', 'SPECIAL 1')
      expect(result.series).toBe('Hulk Special')
      expect(result.issue).toBe('1')
    })
  })
})

describe('parseComicIssueForSearch', () => {
  it('delegates to parseIssueForSearch using series and issueNumber properties', () => {
    const comic = { series: 'Fantastic Four', issueNumber: 'Annual 18' }
    expect(parseComicIssueForSearch(comic)).toEqual({
      series: 'Fantastic Four Annual',
      issue: '18',
      alternativeSeries: 'Fantastic Four Annual',
    })
  })

  it('works for plain issue numbers', () => {
    const comic = { series: 'Batman', issueNumber: '5' }
    expect(parseComicIssueForSearch(comic)).toEqual({ series: 'Batman', issue: '5' })
  })
})

describe('generateSearchFallbacks', () => {
  describe('subtitle removal', () => {
    it('removes subtitle after a comma', () => {
      const fallbacks = generateSearchFallbacks('Firestorm, the Nuclear Man', '1')
      expect(fallbacks).toContainEqual({
        series: 'Firestorm',
        issue: '1',
        reason: 'Removed subtitle after comma',
      })
    })

    it('does not add a fallback when there is no comma', () => {
      const fallbacks = generateSearchFallbacks('Batman', '1')
      const commaFallback = fallbacks.find(f => f.reason === 'Removed subtitle after comma')
      expect(commaFallback).toBeUndefined()
    })
  })

  describe('adjective removal', () => {
    it('removes "Uncanny" from series name', () => {
      const fallbacks = generateSearchFallbacks('Uncanny X-Men', '1')
      expect(fallbacks).toContainEqual({
        series: 'X-Men',
        issue: '1',
        reason: 'Removed "uncanny" from series name',
      })
    })

    it('removes "Amazing" from series name', () => {
      const fallbacks = generateSearchFallbacks('Amazing Spider-Man', '1')
      expect(fallbacks).toContainEqual({
        series: 'Spider-Man',
        issue: '1',
        reason: 'Removed "amazing" from series name',
      })
    })

    it('removes "Incredible" from series name', () => {
      const fallbacks = generateSearchFallbacks('Incredible Hulk', '1')
      expect(fallbacks).toContainEqual({
        series: 'Hulk',
        issue: '1',
        reason: 'Removed "incredible" from series name',
      })
    })

    it('does not add a fallback when no adjective is present', () => {
      const fallbacks = generateSearchFallbacks('Batman', '1')
      const adjFallback = fallbacks.find(f => f.reason?.startsWith('Removed "'))
      expect(adjFallback).toBeUndefined()
    })

    it('returns an empty array when no fallbacks apply', () => {
      expect(generateSearchFallbacks('Batman', '1')).toEqual([])
    })

    it('can return multiple fallbacks for a series with both a comma and an adjective', () => {
      const fallbacks = generateSearchFallbacks('Spectacular Spider-Man, The', '1')
      expect(fallbacks.length).toBeGreaterThanOrEqual(2)
    })
  })
})
