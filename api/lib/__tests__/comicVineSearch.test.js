import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchComicVineIssues } from '../comicVineSearch.js'

const ok = (body) => ({ ok: true, json: async () => ({ error: 'OK', ...body }) })

// ComicVine's /search returns publisher: null for volumes; only /volumes has it.
const volumeSearch = ok({
  results: [
    { id: 4045, name: 'Black Panther', start_year: '1988', publisher: null },
    { id: 119953, name: 'Black Panther', start_year: '2017', publisher: null }
  ]
})

const issues = ok({
  results: [
    { id: 2, issue_number: '1', cover_date: '2017-01-01', image: { original_url: 'b.jpg' }, volume: { id: 119953, name: 'Black Panther' } },
    { id: 1, issue_number: '1', cover_date: '1988-07-01', image: { original_url: 'a.jpg' }, volume: { id: 4045, name: 'Black Panther' } }
  ]
})

const volumes = ok({
  results: [
    { id: 4045, publisher: { id: 31, name: 'Marvel' } },
    { id: 119953, publisher: { id: 2328, name: 'Panini Verlag' } }
  ]
})

function mockFetch(volumesResponse) {
  return vi.fn(async (url) => {
    if (url.includes('/api/search/')) return volumeSearch
    if (url.includes('/api/issues/')) return issues
    if (url.includes('/api/volumes/')) return volumesResponse()
    throw new Error(`unexpected fetch ${url}`)
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('searchComicVineIssues publisher (COM-49)', () => {
  it('fills metadata.publisher from the /volumes endpoint', async () => {
    const fetch = mockFetch(() => volumes)
    vi.stubGlobal('fetch', fetch)

    const results = await searchComicVineIssues({ series: 'Black Panther', issue: '1', apiKey: 'k' })

    expect(results.map(r => r.metadata.publisher).sort()).toEqual(['Marvel', 'Panini Verlag'])
    const volumesUrl = fetch.mock.calls.map(([u]) => u).find(u => u.includes('/api/volumes/'))
    expect(decodeURIComponent(volumesUrl)).toContain('filter=id:119953|4045')
  })

  it('parses the cover month from the date string (COM-51)', async () => {
    vi.stubGlobal('fetch', mockFetch(() => volumes))

    const results = await searchComicVineIssues({ series: 'Black Panther', issue: '1', publisher: 'Marvel', apiKey: 'k' })

    expect(results[0].metadata).toMatchObject({ year: 1988, month: 7 })
  })

  it('ranks results matching the publisher hint first', async () => {
    vi.stubGlobal('fetch', mockFetch(() => volumes))

    const results = await searchComicVineIssues({ series: 'Black Panther', issue: '1', publisher: 'Marvel', apiKey: 'k' })

    expect(results[0].metadata).toMatchObject({ publisher: 'Marvel', volumeId: '4045' })
  })

  it('still returns results without a publisher if /volumes fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', mockFetch(() => ({ ok: false, status: 500 })))

    const results = await searchComicVineIssues({ series: 'Black Panther', issue: '1', apiKey: 'k' })

    expect(results).toHaveLength(2)
    expect(results.every(r => r.metadata.publisher === '')).toBe(true)
  })
})
