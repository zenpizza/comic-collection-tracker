import { describe, it, expect } from 'vitest'
import { buildPriceQuery, ebaySoldUrl, findOwnedCopies } from '../priceLinks.js'

describe('price links (COM-61)', () => {
  it('builds the search text from volume (or series), issue and year', () => {
    expect(buildPriceQuery({ series: 'Black Panther', volumeName: 'Black Panther', issueNumber: 1, year: 1988 }))
      .toBe('Black Panther 1 1988 comic')
    expect(buildPriceQuery({ series: 'The Uncanny X-Men', volumeName: 'X-Men Annual', issueNumber: 'Annual 9', year: 1985 }))
      .toBe('X-Men Annual 9 1985 comic')
    expect(buildPriceQuery({ series: '  Fantastic  Four ', issueNumber: 'Annual 18' })).toBe('Fantastic Four Annual 18 comic')
    expect(buildPriceQuery({ series: 'Saga', issueNumber: '1', year: '' })).toBe('Saga 1 comic')
  })

  it('links to eBay sold, completed listings with the query encoded', () => {
    const url = new URL(ebaySoldUrl({ series: 'Batman & the Outsiders', issueNumber: '1', year: 1983 }))

    expect(url.origin + url.pathname).toBe('https://www.ebay.com/sch/i.html')
    expect(url.searchParams.get('_nkw')).toBe('Batman & the Outsiders 1 1983 comic')
    expect(url.searchParams.get('LH_Sold')).toBe('1')
    expect(url.searchParams.get('LH_Complete')).toBe('1')
    expect(ebaySoldUrl({ series: 'Batman & the Outsiders', issueNumber: '1' })).toContain('Batman+%26+the+Outsiders')
  })

  describe('findOwnedCopies', () => {
    const comics = [
      { id: 'bp98', series: 'Black Panther', issueNumber: '1', comicVineId: '2002' },
      { id: 'thor', series: 'Thor', issueNumber: '337', comicVineId: '101' },
      { id: 'legacy', series: 'Hamsters', issueNumber: '7', comicVineId: null },
    ]

    it('matches by ComicVine id, so another volume\'s #1 doesn\'t count', () => {
      expect(findOwnedCopies(comics, { comicVineId: '2002', series: 'Black Panther', issueNumber: '1' }).map((c) => c.id)).toEqual(['bp98'])
      expect(findOwnedCopies(comics, { comicVineId: '2001', series: 'Black Panther', issueNumber: '1' })).toEqual([])
    })

    it('falls back to series and issue number for comics without a ComicVine id', () => {
      expect(findOwnedCopies(comics, { comicVineId: '999', series: ' hamsters ', issueNumber: '7' }).map((c) => c.id)).toEqual(['legacy'])
      expect(findOwnedCopies(comics, { series: 'Hamsters', issueNumber: '7' }).map((c) => c.id)).toEqual(['legacy'])
    })

    it('finds nothing without enough to match on', () => {
      expect(findOwnedCopies(comics, {})).toEqual([])
      expect(findOwnedCopies(null, { series: 'Thor', issueNumber: '337' })).toEqual([])
    })
  })
})
