import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { startTestDb } from '../../lib/__tests__/testDb.js'
import { addComic, listComics } from '../../lib/comics.js'

// Drive the real bulk-import handler against an in-memory database, signed
// in as whichever user the test sets
let db
let signedInAs = 'user_owner'
vi.mock('../../lib/mongo.js', () => ({ connectToDatabase: async () => db }))
vi.mock('../../auth.js', () => ({
  requireAuth: async (req) => { req.userId = signedInAs; return true },
}))
const { default: bulkHandler } = await import('../bulk.js')

const importComics = async (comics) => {
  const res = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    end() { return this },
  }
  await bulkHandler({ method: 'POST', headers: {}, body: { comics } }, res)
  return res
}

const credits = [
  { name: 'Chris Claremont', roles: ['writer'] },
  { name: 'John Byrne', roles: ['artist', 'penciler'] },
  { name: 'Terry Austin', roles: ['inker'] },
]

// The fields an export → import round trip must keep (month: COM-51,
// credits: COM-55). The export is listComics, which GET /api/comics returns.
const kept = ({ series, issueNumber, publisher, year, month, variant, notes, volumeId, volumeName, comicVineId, credits }) =>
  ({ series, issueNumber, publisher, year, month, variant, notes, volumeId, volumeName, comicVineId, credits })

describe('Data Manager export → import round trip (bulk import)', () => {
  let stop

  beforeAll(async () => {
    ({ db, stop } = await startTestDb())
  })

  afterAll(async () => {
    await stop()
  })

  beforeEach(async () => {
    await db.collection('comics').deleteMany({})
    signedInAs = 'user_owner'
    await addComic(db, {
      userId: 'user_owner',
      comic: {
        series: 'The Uncanny X-Men', issueNumber: '137', publisher: 'Marvel', year: 1980, month: 9,
        variant: null, notes: 'Phoenix', volumeId: '3092', volumeName: 'The Uncanny X-Men', comicVineId: '26919', credits,
      },
    })
    await addComic(db, {
      userId: 'user_owner',
      comic: { series: 'Hamsters', issueNumber: '7', publisher: 'Eclipse', notes: 'no ComicVine data' },
    })
  })

  it('re-importing an export into the same account keeps month and credits', async () => {
    const exported = await listComics(db, 'user_owner')
    // Wipe the fields, as if they'd been lost, so the import has to restore them
    await db.collection('comics').updateMany({}, { $set: { month: null, credits: null } })

    const res = await importComics(exported)

    expect(res.statusCode).toBe(200)
    expect(res.body.stats).toMatchObject({ modified: 2, upserted: 0 })
    const after = await listComics(db, 'user_owner')
    expect(after.map(kept)).toEqual(exported.map(kept))
    expect(after.find((c) => c.issueNumber === '137')).toMatchObject({ month: 9, credits })
  })

  it('importing an export into another account keeps month and credits', async () => {
    const exported = await listComics(db, 'user_owner')

    signedInAs = 'user_other' // ids from the source account aren't found here, so these are added
    const res = await importComics(exported)

    expect(res.statusCode).toBe(200)
    expect(res.body.stats).toMatchObject({ upserted: 2 })
    const imported = await listComics(db, 'user_other')
    const byIssue = (list) => [...list].sort((a, b) => a.issueNumber.localeCompare(b.issueNumber)).map(kept)
    expect(byIssue(imported)).toEqual(byIssue(exported))
  })

  it('keeps "never looked up" (null) distinct from "none on ComicVine" ([])', async () => {
    await db.collection('comics').updateOne({ issueNumber: '7' }, { $set: { credits: [] } })
    const exported = await listComics(db, 'user_owner')

    signedInAs = 'user_other'
    await importComics(exported)

    const imported = await listComics(db, 'user_other')
    expect(imported.find((c) => c.issueNumber === '7').credits).toEqual([])
  })
})
