import { describe, it, expect } from 'vitest'
import {
  normalizeCreatorKey,
  buildCreatorIndex,
  filterCreators,
  creatorSeriesGroups,
  seriesMatchingCreator,
} from '../creators.js'

const comic = (id, series, issueNumber, credits) => ({ id, series, issueNumber, credits })

const comics = [
  comic('t337', 'Thor', '337', [
    { name: 'Walt Simonson', roles: ['writer', 'artist'] },
    { name: 'Walt Simonson', roles: ['cover'] }, // repeat on the same comic
    { name: 'John Workman', roles: ['letterer'] },
  ]),
  comic('t338', 'Thor', '338', [{ name: 'walt  simonson', roles: ['writer', 'penciler'] }]),
  comic('xf10', 'X-Factor', '10', [{ name: 'Walt Simonson', roles: ['penciler'] }, { name: 'Louise Simonson', roles: ['writer'] }]),
  comic('xm137', 'The Uncanny X-Men', '137', [{ name: 'Chris Claremont', roles: ['writer'] }, { name: 'John Byrne', roles: ['penciler'] }]),
  comic('xm138', 'The Uncanny X-Men', '138', [{ name: 'Chris Claremont', roles: ['writer'] }]),
  comic('xma', 'The Uncanny X-Men', 'Annual 9', [{ name: 'Chris Claremont', roles: ['writer'] }]),
  comic('none', 'Hamsters', '7', null),
]

describe('creator index (COM-59)', () => {
  it('normalizes names for grouping', () => {
    expect(normalizeCreatorKey('  Walt   Simonson ')).toBe('walt simonson')
  })

  it('merges spellings, counts distinct comics, and tallies roles', () => {
    const walt = buildCreatorIndex(comics).find((c) => c.key === 'walt simonson')

    expect(walt).toMatchObject({
      name: 'Walt Simonson', // most common spelling
      comicCount: 3,
      writerCount: 2,
      artistCount: 3,
      roleSummary: ['writer', 'art', 'pencils', 'cover'],
    })
    expect(walt.entries.find((e) => e.comic.id === 't337').roles).toEqual(['writer', 'artist', 'cover'])
  })

  it('ignores comics without credits', () => {
    const index = buildCreatorIndex(comics)
    expect(index.map((c) => c.name).sort()).toEqual(['Chris Claremont', 'John Byrne', 'John Workman', 'Louise Simonson', 'Walt Simonson'])
  })

  it('filters by role and name, most issues first in that role', () => {
    const index = buildCreatorIndex(comics)

    expect(filterCreators(index).map((c) => c.name)).toEqual(['Chris Claremont', 'Walt Simonson', 'John Byrne', 'John Workman', 'Louise Simonson'])
    expect(filterCreators(index, { role: 'writers' }).map((c) => [c.name, c.writerCount])).toEqual([
      ['Chris Claremont', 3], ['Walt Simonson', 2], ['Louise Simonson', 1],
    ])
    expect(filterCreators(index, { role: 'artists' }).map((c) => c.name)).toEqual(['Walt Simonson', 'John Byrne'])
    expect(filterCreators(index, { search: 'SIMON' }).map((c) => c.name)).toEqual(['Walt Simonson', 'Louise Simonson'])
  })

  it('groups a creator\'s comics by series with their roles there, in library and issue order', () => {
    const walt = buildCreatorIndex(comics).find((c) => c.key === 'walt simonson')
    const groups = creatorSeriesGroups(walt)

    expect(groups.map((g) => [g.seriesName, g.roles, g.comics.map((c) => c.issueNumber)])).toEqual([
      ['Thor', ['writer', 'art', 'pencils', 'cover'], ['337', '338']],
      ['X-Factor', ['pencils'], ['10']],
    ])
    const chris = buildCreatorIndex(comics).find((c) => c.key === 'chris claremont')
    expect(creatorSeriesGroups(chris)[0].comics.map((c) => c.issueNumber)).toEqual(['137', '138', 'Annual 9'])
  })

  it('finds series by creator for title search, from three characters', () => {
    expect([...seriesMatchingCreator(comics, 'simonson')]).toEqual([
      ['Thor', 'Walt Simonson'],
      ['X-Factor', 'Walt Simonson'],
    ])
    expect([...seriesMatchingCreator(comics, 'byr')]).toEqual([['The Uncanny X-Men', 'John Byrne']])
    expect(seriesMatchingCreator(comics, 'wa').size).toBe(0)
  })
})
