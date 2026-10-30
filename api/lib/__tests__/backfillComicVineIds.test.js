import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { startTestDb } from './testDb.js'
import {
  createPacedFetch,
  chooseMatch,
  createState,
  lookupComics,
  applyLookups,
} from '../backfillComicVineIds.js'

// A tiny fake ComicVine. Like the real one, /search returns publisher: null
// for volumes; only /volumes has it.
const VOLUMES = [
  { id: 43460, name: 'Saga', start_year: '2012', publisher: { id: 1, name: 'Image' } },
  { id: 2190, name: 'Fantastic Four Annual', start_year: '1963', publisher: { id: 31, name: 'Marvel' } },
  { id: 2870, name: 'The Spectacular Spider-Man', start_year: '1976', publisher: { id: 31, name: 'Marvel' }, hiddenFromSearch: true },
  { id: 139754, name: 'Peter Parker, the Spectacular Spider-Man', start_year: '1980', publisher: { id: 31, name: 'Marvel' }, hiddenFromSearch: true },
  { id: 2011, name: 'The Transformers', start_year: '1984', publisher: { id: 31, name: 'Marvel' } },
  { id: 2012, name: 'The Transformers', start_year: '1984', publisher: { id: 32, name: 'Marvel UK/Panini UK' } },
  { id: 4045, name: 'Black Panther', start_year: '1988', publisher: { id: 31, name: 'Marvel' } },
  { id: 6496, name: 'Black Panther', start_year: '1998', publisher: { id: 31, name: 'Marvel' } },
]
const ISSUES = [
  { id: 1001, issue_number: '1', cover_date: '2012-03-01', volume: 43460 },
  { id: 1002, issue_number: '2', cover_date: '2012-04-01', volume: 43460 },
  { id: 2001, issue_number: '1', cover_date: '1988-07-01', volume: 4045 },
  { id: 2002, issue_number: '1', cover_date: '1998-11-01', volume: 6496 },
  { id: 3001, issue_number: '18', cover_date: '1984-11-01', volume: 2190 },
  { id: 3002, issue_number: '120', cover_date: '1987-01-01', volume: 139754 },
  { id: 3005, issue_number: '178', cover_date: '1991-07-01', volume: 2870 },
  { id: 3003, issue_number: '10', cover_date: '1985-11-01', volume: 2011 },
  { id: 3004, issue_number: '10', cover_date: '1985-03-30', volume: 2012 },
]

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => ({ error: 'OK', ...body }) })

function fakeComicVine(url) {
  const { pathname, searchParams } = new URL(url)
  if (pathname === '/api/search/') {
    const query = searchParams.get('query').toLowerCase()
    return json({
      results: VOLUMES
        .filter((v) => !v.hiddenFromSearch && v.name.toLowerCase() === query)
        .map(({ hiddenFromSearch, ...v }) => ({ ...v, publisher: null })),
    })
  }
  if (pathname === '/api/issues/') {
    const [, ids, number] = searchParams.get('filter').match(/volume:([\d|]+),issue_number:(.+)/)
    const volumeIds = ids.split('|').map(Number)
    return json({
      results: ISSUES
        .filter((i) => volumeIds.includes(i.volume) && i.issue_number === number)
        .map((i) => ({
          ...i,
          image: { original_url: `${i.id}.jpg` },
          volume: { id: i.volume, name: VOLUMES.find((v) => v.id === i.volume).name },
        })),
    })
  }
  if (pathname === '/api/volumes/') {
    const ids = searchParams.get('filter').replace('id:', '').split('|').map(Number)
    return json({ results: VOLUMES.filter((v) => ids.includes(v.id)).map(({ id, publisher }) => ({ id, publisher })) })
  }
  throw new Error(`unexpected ${url}`)
}

const noWait = { intervalMs: 0, sleep: async () => {} }

describe('createPacedFetch (COM-48)', () => {
  it('spaces uncached requests by the interval and serves repeats from cache', async () => {
    let clock = 0
    const sleeps = []
    const fetchImpl = vi.fn(async () => json({ results: [] }))
    const paced = createPacedFetch({
      intervalMs: 36000,
      fetchImpl,
      now: () => clock,
      sleep: async (ms) => { sleeps.push(ms); clock += ms },
    })

    await paced('https://comicvine.gamespot.com/api/search/?api_key=a&query=saga')
    await paced('https://comicvine.gamespot.com/api/search/?api_key=b&query=saga') // same URL minus key
    await paced('https://comicvine.gamespot.com/api/search/?api_key=a&query=x')
    await paced('https://comicvine.gamespot.com/api/search/?api_key=a&query=y')

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(paced.requestCount()).toBe(3)
    expect(sleeps).toEqual([36000, 36000])
  })

  it('throws a rate-limit error on HTTP 420 and on ComicVine status_code 107', async () => {
    const blocked = createPacedFetch({ ...noWait, fetchImpl: async () => ({ ok: false, status: 420 }) })
    await expect(blocked('https://comicvine.gamespot.com/api/search/?q=1')).rejects.toMatchObject({ rateLimited: true })

    const capped = createPacedFetch({
      ...noWait,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status_code: 107, error: 'Rate limit exceeded' }) }),
    })
    await expect(capped('https://comicvine.gamespot.com/api/search/?q=1')).rejects.toMatchObject({ rateLimited: true })
  })
})

const result = (comicVineId, volumeId, year, publisher = 'Marvel') => ({
  id: String(comicVineId),
  metadata: { volumeId: String(volumeId), volumeName: 'Black Panther', year, month: 1, publisher },
})

describe('chooseMatch (COM-48)', () => {
  const bp88 = result(2001, 4045, 1988)
  const bp98 = result(2002, 6496, 1998)

  it('uses the comic\'s own volume when it has one', () => {
    expect(chooseMatch({ volumeId: '6496' }, [bp88, bp98])).toMatchObject({ status: 'matched', match: bp98 })
    expect(chooseMatch({ volumeId: '999' }, [bp88, bp98]).status).toBe('needs-review')
  })

  it('picks the single volume matching the comic\'s year', () => {
    expect(chooseMatch({ year: 1998 }, [bp88, bp98])).toMatchObject({ status: 'matched', match: bp98 })
    expect(chooseMatch({ year: 2005 }, [bp88, bp98]).status).toBe('needs-review')
  })

  it('needs review when there is no year and several volumes', () => {
    expect(chooseMatch({}, [bp88, bp98]).status).toBe('needs-review')
    expect(chooseMatch({}, [bp88])).toMatchObject({ status: 'matched', match: bp88 })
  })

  it('needs review when the publisher disagrees', () => {
    expect(chooseMatch({ year: 1998, publisher: 'DC' }, [bp98]).status).toBe('needs-review')
    expect(chooseMatch({ year: 1998, publisher: 'Marvel Comics' }, [bp98]).status).toBe('matched')
  })

  it('breaks a same-year tie by an exact publisher match', () => {
    const us = result(3003, 2011, 1985, 'Marvel')
    const uk = result(3004, 2012, 1985, 'Marvel UK/Panini UK')
    expect(chooseMatch({ year: 1985, publisher: 'Marvel' }, [us, uk])).toMatchObject({ status: 'matched', match: us })
    expect(chooseMatch({ publisher: 'Marvel' }, [us, uk])).toMatchObject({ status: 'matched', match: us })
    expect(chooseMatch({ year: 1985 }, [us, uk]).status).toBe('needs-review')
  })

  it('reports no-match for no results', () => {
    expect(chooseMatch({}, []).status).toBe('no-match')
  })
})

describe('lookupComics + applyLookups (COM-48)', () => {
  let db
  let stop
  let ids

  beforeAll(async () => {
    ({ db, stop } = await startTestDb())
  })

  afterAll(async () => {
    await stop()
  })

  beforeEach(async () => {
    await db.collection('comics').deleteMany({})
    const comic = (series, issueNumber, extra = {}) => ({
      userId: 'user_a', series, issueNumber, publisher: null, year: null, comicVineId: null,
      identityKey: `manual|${series}|${issueNumber}|${extra.year ?? ''}`, ...extra,
    })
    const { insertedIds } = await db.collection('comics').insertMany([
      comic('Saga', '1', { year: 2012, publisher: 'Image Comics' }),
      comic('Saga', '2'),
      comic('Black Panther', '1'),
      comic('Black Panther', '1', { year: 1998, variant: 'B' }),
      comic('Unknown Series', '1'),
    ])
    ids = Object.values(insertedIds).map(String)
  })

  const [SAGA_1, SAGA_2, BP_NO_YEAR, BP_1998, UNKNOWN] = [0, 1, 2, 3, 4]

  it('records a result per comic and caches volume lookups per series', async () => {
    const state = createState()
    const fetchImpl = vi.fn(async (url) => fakeComicVine(url))

    const run = await lookupComics(db, { state, apiKey: 'k', fetchImpl, ...noWait })

    expect(run).toMatchObject({ processed: 5, stoppedBecause: 'done' })
    // Saga and Black Panther: 1 search + 1 volumes each, plus 1 issues call
    // per comic; Unknown stops after its search. Uncached would be 13.
    expect(fetchImpl).toHaveBeenCalledTimes(9)
    expect(state.requests).toBe(9)

    const status = (i) => state.lookups[ids[i]].status
    expect([SAGA_1, SAGA_2, BP_NO_YEAR, BP_1998, UNKNOWN].map(status))
      .toEqual(['matched', 'matched', 'needs-review', 'matched', 'no-match'])
    expect(state.lookups[ids[BP_1998]].match).toMatchObject({ comicVineId: '2002', publisher: 'Marvel', year: 1998, month: 11 })
    expect(state.lookups[ids[BP_NO_YEAR]].candidates).toHaveLength(2)
  })

  it('stops at a rate limit, keeps progress, and resumes without repeating lookups', async () => {
    const state = createState()
    let calls = 0
    const flaky = async (url) => (++calls === 5 ? { ok: false, status: 420 } : fakeComicVine(url))

    const first = await lookupComics(db, { state, apiKey: 'k', fetchImpl: flaky, ...noWait })
    expect(first.stoppedBecause).toMatch(/rate limited/)
    const doneAfterFirst = Object.keys(state.lookups)
    expect(doneAfterFirst.length).toBeGreaterThan(0)
    expect(doneAfterFirst.length).toBeLessThan(5)

    const fetchImpl = vi.fn(async (url) => fakeComicVine(url))
    const second = await lookupComics(db, { state, apiKey: 'k', fetchImpl, ...noWait })
    expect(second.stoppedBecause).toBe('done')
    expect(Object.keys(state.lookups)).toHaveLength(5)
    expect(second.processed).toBe(5 - doneAfterFirst.length)
  })

  it('stops before a lookup that could exceed the request budget', async () => {
    const state = createState()
    const run = await lookupComics(db, { state, apiKey: 'k', fetchImpl: async (url) => fakeComicVine(url), maxRequests: 3, ...noWait })
    expect(run).toMatchObject({ processed: 1, stoppedBecause: 'request budget reached' })
  })

  it('dry-run apply reports changes without writing', async () => {
    const state = createState()
    await lookupComics(db, { state, apiKey: 'k', fetchImpl: async (url) => fakeComicVine(url), ...noWait })

    const dry = await applyLookups(db, { state, fillMissing: true })

    expect(dry).toMatchObject({ wouldUpdate: 3, updated: 0, conflict: 0 })
    expect(await db.collection('comics').countDocuments({ comicVineId: null })).toBe(5)
  })

  it('confirmed apply upgrades identity, fills only empty fields, and skips conflicts', async () => {
    const state = createState()
    await lookupComics(db, { state, apiKey: 'k', fetchImpl: async (url) => fakeComicVine(url), ...noWait })
    // This account already owns Black Panther (1998) #1 under the ComicVine identity
    await db.collection('comics').insertOne({ userId: 'user_a', series: 'Black Panther', issueNumber: '1', comicVineId: '2002', identityKey: 'comicvine|2002' })

    const applied = await applyLookups(db, { state, confirm: true, fillMissing: true })
    expect(applied).toMatchObject({ updated: 2, conflict: 1 })

    const get = (i) => db.collection('comics').findOne({ _id: new ObjectId(ids[i]) })
    const saga1 = await get(SAGA_1)
    expect(saga1).toMatchObject({ comicVineId: '1001', identityKey: 'comicvine|1001', publisher: 'Image Comics', year: 2012, month: 3, volumeId: '43460' })
    const saga2 = await get(SAGA_2)
    expect(saga2).toMatchObject({ comicVineId: '1002', publisher: 'Image', year: 2012, month: 4 })
    expect((await get(BP_1998)).comicVineId).toBeNull()

    const again = await applyLookups(db, { state, confirm: true, fillMissing: true })
    expect(again.updated).toBe(0)
  })

  it('skips a comic edited after its lookup and re-queries it on the next lookup', async () => {
    const state = createState()
    const fetchImpl = vi.fn(async (url) => fakeComicVine(url))
    await lookupComics(db, { state, apiKey: 'k', fetchImpl, ...noWait })
    expect(state.lookups[ids[SAGA_1]].match.comicVineId).toBe('1001')

    // Saga #1 is edited to #2 between lookup and apply
    await db.collection('comics').updateOne({ _id: new ObjectId(ids[SAGA_1]) }, { $set: { issueNumber: '2' } })

    const dry = await applyLookups(db, { state })
    expect(dry).toMatchObject({ stale: 1, wouldUpdate: 2 })
    expect(state.lookups[ids[SAGA_1]].status).toBe('matched') // dry run changes nothing

    const applied = await applyLookups(db, { state, confirm: true })
    expect(applied).toMatchObject({ stale: 1, updated: 2 })
    expect((await db.collection('comics').findOne({ _id: new ObjectId(ids[SAGA_1]) })).comicVineId).toBeNull()
    expect(state.lookups[ids[SAGA_1]].status).toBe('stale')

    fetchImpl.mockClear()
    const rerun = await lookupComics(db, { state, apiKey: 'k', fetchImpl, ...noWait })
    expect(rerun.processed).toBe(1)
    expect(state.lookups[ids[SAGA_1]]).toMatchObject({ status: 'matched', match: { comicVineId: '1002' } })
  })

  it('re-queries a comic edited before the next lookup even if it was matched', async () => {
    const state = createState()
    await lookupComics(db, { state, apiKey: 'k', fetchImpl: async (url) => fakeComicVine(url), ...noWait })
    await db.collection('comics').updateOne({ _id: new ObjectId(ids[BP_NO_YEAR]) }, { $set: { year: 1988 } })

    const rerun = await lookupComics(db, { state, apiKey: 'k', fetchImpl: async (url) => fakeComicVine(url), ...noWait })
    expect(rerun.processed).toBe(1)
    expect(state.lookups[ids[BP_NO_YEAR]]).toMatchObject({ status: 'matched', match: { comicVineId: '2001' } })
  })

  it('without fillMissing only sets the ComicVine identity', async () => {
    const state = createState()
    await lookupComics(db, { state, apiKey: 'k', fetchImpl: async (url) => fakeComicVine(url), ...noWait })
    const applied = await applyLookups(db, { state, confirm: true })

    expect(applied.updated).toBe(3)
    expect(applied.changes.find((c) => c.comicId === ids[SAGA_2]).set).toEqual({ comicVineId: '1002', identityKey: 'comicvine|1002' })
  })
})

describe('lookup fixes from the first production run (COM-48)', () => {
  let db
  let stop
  const seed = (comics) => db.collection('comics').insertMany(comics.map((c) => ({
    userId: 'user_b', publisher: 'Marvel', year: null, comicVineId: null, identityKey: `manual|${c.series}|${c.issueNumber}`, ...c,
  })))
  const lookupAll = async (state, options = {}) => {
    const fetchImpl = vi.fn(async (url) => fakeComicVine(url))
    const run = await lookupComics(db, { state, apiKey: 'k', fetchImpl, ...noWait, ...options })
    return { run, fetchImpl, urls: fetchImpl.mock.calls.map(([u]) => decodeURIComponent(u)) }
  }
  const only = (state) => Object.values(state.lookups)[0]

  beforeAll(async () => {
    ({ db, stop } = await startTestDb())
  })

  afterAll(async () => {
    await stop()
  })

  beforeEach(async () => {
    await db.collection('comics').deleteMany({})
  })

  it('reads a January cover date as that year in any timezone', async () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      await seed([{ series: 'The Spectacular Spider-Man', issueNumber: '120', year: 1987 }])
      const state = createState()
      await lookupAll(state, { volumeOverrides: { 'the spectacular spider-man': '139754' } })
      expect(only(state)).toMatchObject({ status: 'matched', match: { comicVineId: '3002', year: 1987, month: 1 } })
    } finally {
      process.env.TZ = tz
    }
  })

  it('searches annuals the way the app does', async () => {
    await seed([{ series: 'Fantastic Four', issueNumber: 'Annual 18', year: 1984 }])
    const state = createState()
    const { urls } = await lookupAll(state)

    expect(urls[0]).toContain('query=Fantastic+Four+Annual')
    expect(urls[1]).toContain('issue_number:18')
    expect(only(state)).toMatchObject({ status: 'matched', match: { comicVineId: '3001' } })
  })

  it('uses a series volume override instead of the name search', async () => {
    await seed([{ series: 'The Spectacular Spider-Man', issueNumber: '120', year: 1987 }])

    const without = createState()
    await lookupAll(without)
    expect(only(without).status).toBe('no-match')

    const state = createState()
    const { urls } = await lookupAll(state, { volumeOverrides: { 'the spectacular spider-man': '139754' } })
    expect(urls.some((u) => u.includes('/api/search/'))).toBe(false)
    expect(only(state)).toMatchObject({ status: 'matched', volumeOverride: '139754', match: { volumeId: '139754' } })
  })

  it('accepts a list of volumes for a run ComicVine splits', async () => {
    await seed([
      { series: 'The Spectacular Spider-Man', issueNumber: '120', year: 1987 },
      { series: 'The Spectacular Spider-Man', issueNumber: '178', year: 1991 },
    ])

    const single = createState()
    await lookupAll(single, { volumeOverrides: { 'The Spectacular Spider-Man': 2870 } })
    expect(Object.values(single.lookups).map((l) => l.status).sort()).toEqual(['matched', 'no-match'])

    const state = createState()
    await lookupAll(state, { volumeOverrides: { 'The Spectacular Spider-Man': [2870, 139754] } })
    const byIssue = Object.fromEntries(Object.values(state.lookups).map((l) => [l.issueNumber, l]))
    expect(byIssue['120']).toMatchObject({ status: 'matched', volumeOverride: '2870|139754', match: { volumeId: '139754' } })
    expect(byIssue['178']).toMatchObject({ status: 'matched', match: { volumeId: '2870' } })
  })

  it('does not apply a regular series override to that series\' annuals', async () => {
    await seed([{ series: 'The Spectacular Spider-Man', issueNumber: 'Annual 1', year: 1979 }])
    const state = createState()
    const { urls } = await lookupAll(state, { volumeOverrides: { 'the spectacular spider-man': '2870' } })

    expect(only(state).volumeOverride).toBeUndefined()
    expect(urls[0]).toContain('query=Spectacular+Spider-Man+Annual')
    expect(only(state).status).toBe('no-match') // not regular #1 from volume 2870
  })

  it('applies an annual override keyed by the annual series name', async () => {
    await seed([{ series: 'The Spectacular Spider-Man', issueNumber: 'Annual 1', year: 1979 }])
    const state = createState()
    const { urls } = await lookupAll(state, { volumeOverrides: { 'spectacular spider-man annual': '3012' } })

    expect(only(state).volumeOverride).toBe('3012')
    expect(urls.some((u) => u.includes('/api/search/'))).toBe(false)
    expect(urls.some((u) => u.includes('volume:3012,issue_number:1'))).toBe(true)
  })

  it('redo repeats lookups not yet applied, served from cache', async () => {
    await seed([{ series: 'The Transformers', issueNumber: '10', year: 1985 }])
    const state = createState()
    await lookupAll(state)
    expect(only(state)).toMatchObject({ status: 'matched', match: { volumeId: '2011' } }) // tie broken by publisher

    const skipped = await lookupAll(state)
    expect(skipped.run.processed).toBe(0)

    const redone = await lookupAll(state, { redo: true })
    expect(redone.run.processed).toBe(1)
    expect(redone.fetchImpl).not.toHaveBeenCalled()
  })
})
