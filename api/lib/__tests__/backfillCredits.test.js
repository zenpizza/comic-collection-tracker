import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { startTestDb } from './testDb.js'
import { fillMissingCredits } from '../backfillCredits.js'

// Fake ComicVine per-issue endpoint: /api/issue/4000-<id>/
const CREDITS = {
  101: [{ name: 'Walt Simonson', role: 'writer, artist' }],
  102: [{ name: 'Chris Claremont', role: 'writer' }, { name: 'John Byrne', role: 'penciler' }],
  103: [],
}

const issueResponse = (url) => {
  const id = Number(url.match(/4000-(\d+)/)[1])
  if (!(id in CREDITS)) return { ok: true, status: 200, json: async () => ({ error: 'Object Not Found', status_code: 101 }) }
  return { ok: true, status: 200, json: async () => ({ error: 'OK', results: { person_credits: CREDITS[id] } }) }
}

const noWait = { intervalMs: 0, sleep: async () => {} }

describe('fillMissingCredits (COM-59)', () => {
  let db
  let stop

  beforeAll(async () => {
    ({ db, stop } = await startTestDb())
  })

  afterAll(async () => {
    await stop()
  })

  beforeEach(async () => {
    await db.collection('comics').deleteMany({})
    await db.collection('comics').insertMany([
      { series: 'Thor', issueNumber: '337', comicVineId: '101', credits: null },
      { series: 'X-Men', issueNumber: '137', comicVineId: '102' }, // no credits field at all
      { series: 'Quiet', issueNumber: '1', comicVineId: '103', credits: null },
      { series: 'Done', issueNumber: '1', comicVineId: '101', credits: [{ name: 'Hand Typed', roles: ['writer'] }] },
      { series: 'Looked up', issueNumber: '1', comicVineId: '102', credits: [] },
      { series: 'Hamsters', issueNumber: '7', comicVineId: null, credits: null },
    ])
  })

  const creditsOf = async (series) => (await db.collection('comics').findOne({ series })).credits

  it('fills comics with a ComicVine id and empty credits, never touching the rest', async () => {
    const fetchImpl = vi.fn(async (url) => issueResponse(url))
    const result = await fillMissingCredits(db, { apiKey: 'k', fetchImpl, ...noWait })

    expect(result).toMatchObject({ processed: 3, filled: 2, empty: 1, skipped: 0, stoppedBecause: 'done', requests: 3 })
    expect(await creditsOf('Thor')).toEqual([{ name: 'Walt Simonson', roles: ['writer', 'artist'] }])
    expect(await creditsOf('X-Men')).toEqual([
      { name: 'Chris Claremont', roles: ['writer'] },
      { name: 'John Byrne', roles: ['penciler'] },
    ])
    expect(await creditsOf('Quiet')).toEqual([]) // looked up, none: not retried later
    expect(await creditsOf('Done')).toEqual([{ name: 'Hand Typed', roles: ['writer'] }])
    expect(await creditsOf('Looked up')).toEqual([])
    expect(await creditsOf('Hamsters')).toBeNull()
  })

  it('does not overwrite credits saved while the lookup was running', async () => {
    // The app's fill-on-open saves Thor's credits between our read and our write
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('4000-101')) {
        await db.collection('comics').updateOne({ series: 'Thor' }, { $set: { credits: [{ name: 'Saved In App', roles: ['writer'] }] } })
      }
      return issueResponse(url)
    })

    const result = await fillMissingCredits(db, { apiKey: 'k', fetchImpl, ...noWait })

    expect(result.skipped).toBe(1)
    expect(await creditsOf('Thor')).toEqual([{ name: 'Saved In App', roles: ['writer'] }])
  })

  it('skips a comic whose ComicVine id changed while the lookup was running', async () => {
    // Thor's id is corrected between our read and our write
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('4000-101')) {
        await db.collection('comics').updateOne({ series: 'Thor' }, { $set: { comicVineId: '102' } })
      }
      return issueResponse(url)
    })

    const result = await fillMissingCredits(db, { apiKey: 'k', fetchImpl, ...noWait })

    expect(result.skipped).toBe(1)
    expect(await creditsOf('Thor')).toBeNull() // not the old issue's credits; retried next run
  })

  it('records errors, leaves those comics empty, and retries them next run', async () => {
    await db.collection('comics').insertOne({ series: 'Broken', issueNumber: '1', comicVineId: '999', credits: null })

    const first = await fillMissingCredits(db, { apiKey: 'k', fetchImpl: async (url) => issueResponse(url), ...noWait })
    expect(first.errors.map((e) => e.series)).toEqual(['Broken'])
    expect(await creditsOf('Broken')).toBeNull()

    const fetchImpl = vi.fn(async (url) => issueResponse(url))
    const second = await fillMissingCredits(db, { apiKey: 'k', fetchImpl, ...noWait })
    expect(second.processed).toBe(1) // only the failed one is picked up again
    expect(fetchImpl.mock.calls[0][0]).toContain('4000-999')
  })

  it('stops at a rate limit and keeps what it filled', async () => {
    let calls = 0
    const fetchImpl = async (url) => (++calls === 2 ? { ok: false, status: 420 } : issueResponse(url))

    const result = await fillMissingCredits(db, { apiKey: 'k', fetchImpl, ...noWait })

    expect(result.stoppedBecause).toMatch(/rate limited/)
    expect(result.filled).toBe(1)
    expect(await creditsOf('Thor')).toHaveLength(1)
    expect(await creditsOf('X-Men')).toBeUndefined()
  })

  it('stops before going over the request budget', async () => {
    const result = await fillMissingCredits(db, { apiKey: 'k', fetchImpl: async (url) => issueResponse(url), maxRequests: 2, ...noWait })
    expect(result).toMatchObject({ processed: 2, stoppedBecause: 'request budget reached' })
  })
})
