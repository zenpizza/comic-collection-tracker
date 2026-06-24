import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startTestDb } from './testDb.js'
import { buildDedupeKey, findOrCreateComicMetadata } from '../comicMetadata.js'

describe('buildDedupeKey', () => {
  it('lowercases and trims series/issueNumber/publisher/variant into a stable key', () => {
    const key = buildDedupeKey({
      series: '  Amazing Spider-Man  ',
      issueNumber: '1',
      publisher: 'Marvel',
      variant: 'Variant B',
    })

    expect(key).toBe('amazing spider-man|1|marvel|variant b')
  })

  it('treats a missing variant the same as an empty string', () => {
    const withMissing = buildDedupeKey({ series: 'X-Men', issueNumber: '1', publisher: 'Marvel' })
    const withEmpty = buildDedupeKey({ series: 'X-Men', issueNumber: '1', publisher: 'Marvel', variant: '' })

    expect(withMissing).toBe(withEmpty)
  })
})

describe('findOrCreateComicMetadata', () => {
  let db
  let stop

  beforeAll(async () => {
    const testDb = await startTestDb()
    db = testDb.db
    stop = testDb.stop
  })

  afterAll(async () => {
    await stop()
  })

  const comic = { series: 'Amazing Spider-Man', issueNumber: '1', publisher: 'Marvel', year: 2022 }

  it('creates a new comicMetadata document when none exists for the dedupe key', async () => {
    const metadata = await findOrCreateComicMetadata(db, comic)

    expect(metadata._id).toBeTruthy()
    expect(metadata.series).toBe('Amazing Spider-Man')
    expect(metadata.dedupeKey).toBe('amazing spider-man|1|marvel|')
  })

  it('reuses the existing record for the same series/issue/publisher across different calls (avoids duplicate ComicVine-sourced records)', async () => {
    const first = await findOrCreateComicMetadata(db, comic)
    const second = await findOrCreateComicMetadata(db, { ...comic, year: 2022 })

    expect(second._id.toString()).toBe(first._id.toString())

    const count = await db.collection('comicMetadata').countDocuments({ dedupeKey: first.dedupeKey })
    expect(count).toBe(1)
  })

  it('treats a different variant as a distinct metadata record', async () => {
    const regular = await findOrCreateComicMetadata(db, comic)
    const variant = await findOrCreateComicMetadata(db, { ...comic, variant: 'Variant B' })

    expect(variant._id.toString()).not.toBe(regular._id.toString())
  })
})
