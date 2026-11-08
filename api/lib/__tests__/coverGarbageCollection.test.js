import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { startTestDb } from './testDb.js'
import { findOrphans, deleteOrphans } from '../coverGarbageCollection.js'

const NOW = new Date('2026-11-08T00:00:00Z').getTime()
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()
const s3Ref = (id, size) => ({ key: `production/covers/${id}/${size}.jpg` })
const imagesFor = (id) => ({ thumbnail: s3Ref(id, 'thumbnail'), medium: s3Ref(id, 'medium'), full: s3Ref(id, 'full') })

function fakeStorage(objects) {
  const store = new Map(objects.map((o) => [o.key, o]))
  return {
    store,
    deleted: [],
    async listKeys(prefix) {
      return [...store.values()].filter((o) => o.key.startsWith(prefix))
    },
    async getObject(key) {
      return Buffer.from(`bytes of ${key}`)
    },
    async deleteKeys(keys) {
      keys.forEach((k) => { store.delete(k); this.deleted.push(k) })
    },
  }
}

describe('cover garbage collection (COM-45)', () => {
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
    await Promise.all(['comics', 'coverAssets', 'cover_images'].map((c) => db.collection(c).deleteMany({})))
    ids = { used: new ObjectId(), oldOrphan: new ObjectId(), youngOrphan: new ObjectId(), privateOrphan: new ObjectId() }

    await db.collection('coverAssets').insertMany([
      { _id: ids.used, identityKey: 'comicvine|1', createdAt: daysAgo(300) },
      { _id: ids.oldOrphan, identityKey: 'manual|the avengers|1|marvel||', createdAt: daysAgo(234) },
      { _id: ids.youngOrphan, identityKey: 'comicvine|17091', createdAt: daysAgo(14) },
      { _id: ids.privateOrphan, identityKey: null, createdAt: daysAgo(60) }, // no images record
    ])
    await db.collection('cover_images').insertMany([
      { comicId: String(ids.used), images: imagesFor(ids.used), createdAt: daysAgo(300) },
      { comicId: String(ids.oldOrphan), images: imagesFor(ids.oldOrphan), createdAt: daysAgo(234) },
      { comicId: String(ids.youngOrphan), images: imagesFor(ids.youngOrphan), createdAt: daysAgo(14) },
      { comicId: 1761334467758, images: {}, createdAt: daysAgo(370) }, // empty stray
      { comicId: 'legacy-1', images: imagesFor('legacy-1'), createdAt: daysAgo(360) }, // stray with files
    ])
    await db.collection('comics').insertOne({ userId: 'u', series: 'X', issueNumber: '1', coverAssetId: ids.used })
  })

  const allKeys = () => [ids.used, ids.oldOrphan, ids.youngOrphan, 'legacy-1']
    .flatMap((id) => ['thumbnail', 'medium', 'full'].map((size) => s3Ref(id, size).key))

  const storageWithExtras = () => fakeStorage([
    ...allKeys().map((key) => ({ key, lastModified: daysAgo(200) })),
    { key: 'production/covers/failed-upload/full.jpg', lastModified: daysAgo(90) },
    { key: 'production/covers/in-flight/full.jpg', lastModified: daysAgo(0) },
    { key: 'preview/covers/other-env/full.jpg', lastModified: daysAgo(90) },
  ])

  it('finds orphaned assets and strays, with the grace period applied', async () => {
    const orphans = await findOrphans(db, { now: NOW, graceDays: 30 })

    const assets = Object.fromEntries(orphans.orphanAssets.map((o) => [o.id, o]))
    expect(Object.keys(assets).sort()).toEqual([ids.oldOrphan, ids.youngOrphan, ids.privateOrphan].map(String).sort())
    expect(assets[ids.oldOrphan]).toMatchObject({ eligible: true, ageDays: 234, s3Keys: expect.arrayContaining([s3Ref(ids.oldOrphan, 'full').key]) })
    expect(assets[ids.youngOrphan]).toMatchObject({ eligible: false, ageDays: 14 })
    expect(assets[ids.privateOrphan]).toMatchObject({ eligible: true, s3Keys: [] })

    expect(orphans.strays.map((s) => s.imagesKey).sort()).toEqual([1761334467758, 'legacy-1'].sort())
    expect(orphans.s3Orphans).toBeNull()
  })

  it('scans S3 only under the prefix and skips files any record mentions', async () => {
    const orphans = await findOrphans(db, { now: NOW, storage: storageWithExtras(), s3Prefix: 'production' })

    expect(orphans.s3Orphans.map((o) => [o.id, o.eligible])).toEqual([
      ['production/covers/failed-upload/full.jpg', true],
      ['production/covers/in-flight/full.jpg', false],
    ])
    await expect(findOrphans(db, { storage: storageWithExtras() })).rejects.toThrow(/prefix/)
  })

  it('dry run changes nothing and leaves S3-only orphans out unless asked', async () => {
    const storage = storageWithExtras()
    const orphans = await findOrphans(db, { now: NOW, storage, s3Prefix: 'production' })

    const dry = await deleteOrphans(db, { orphans, storage })
    expect(dry.wouldDelete.map((o) => o.kind).sort()).toEqual(['asset', 'asset', 'stray', 'stray'])
    expect(storage.deleted).toEqual([])
    expect(await db.collection('coverAssets').countDocuments()).toBe(4)

    const withS3 = await deleteOrphans(db, { orphans, storage, includeS3Orphans: true })
    expect(withS3.wouldDelete.filter((o) => o.kind === 's3').map((o) => o.id)).toEqual(['production/covers/failed-upload/full.jpg'])
  })

  it('deletes eligible orphans and their files, backing each up first', async () => {
    const storage = storageWithExtras()
    const orphans = await findOrphans(db, { now: NOW, storage, s3Prefix: 'production' })
    const events = []
    const backup = async (o) => { events.push(`backup ${o.id}`) }
    const realDelete = storage.deleteKeys.bind(storage)
    storage.deleteKeys = async (keys) => { events.push(`delete ${keys[0]}`); return realDelete(keys) }

    const result = await deleteOrphans(db, { orphans, storage, confirm: true, backup })

    expect(result.deleted).toHaveLength(4)
    expect(await db.collection('coverAssets').find().map((a) => String(a._id)).toArray()).toEqual([String(ids.used), String(ids.youngOrphan)])
    expect(await db.collection('cover_images').countDocuments()).toBe(2) // used + young
    expect(storage.deleted).toHaveLength(6) // old orphan 3 + legacy stray 3
    expect(storage.store.has(s3Ref(ids.used, 'full').key)).toBe(true)
    expect(storage.store.has('production/covers/failed-upload/full.jpg')).toBe(true) // S3-only kept
    // Each orphan's backup happens before its files are deleted
    expect(events.indexOf(`backup ${ids.oldOrphan}`)).toBeLessThan(events.indexOf(`delete ${s3Ref(ids.oldOrphan, 'thumbnail').key}`))
  })

  it('restores an asset that a comic attached during cleanup and keeps its images', async () => {
    const storage = storageWithExtras()
    const orphans = await findOrphans(db, { now: NOW, storage, s3Prefix: 'production' })
    // Simulate a comic being added (reusing the asset by identity) mid-cleanup
    const backup = async (o) => {
      if (o.id === String(ids.oldOrphan)) {
        await db.collection('comics').insertOne({ userId: 'u', series: 'The Avengers', issueNumber: '1', coverAssetId: ids.oldOrphan })
      }
    }

    const result = await deleteOrphans(db, { orphans, storage, confirm: true, backup })

    expect(result.skipped.find((o) => o.id === String(ids.oldOrphan)).reason).toMatch(/restored/)
    expect(await db.collection('coverAssets').findOne({ _id: ids.oldOrphan })).toMatchObject({ identityKey: 'manual|the avengers|1|marvel||' })
    expect(await db.collection('cover_images').findOne({ comicId: String(ids.oldOrphan) })).toBeTruthy()
    expect(storage.store.has(s3Ref(ids.oldOrphan, 'full').key)).toBe(true)
  })

  it('restores as private when the asset\'s identity is claimed while it was deleted', async () => {
    await db.collection('coverAssets').createIndex(
      { identityKey: 1 },
      { unique: true, partialFilterExpression: { identityKey: { $type: 'string' } } }
    )
    const storage = storageWithExtras()
    const orphans = await findOrphans(db, { now: NOW, storage, s3Prefix: 'production' })
    const identity = 'manual|the avengers|1|marvel||'
    // A comic attaches the old asset during backup...
    const backup = async (o) => {
      if (o.id === String(ids.oldOrphan)) {
        await db.collection('comics').insertOne({ userId: 'u', series: 'The Avengers', issueNumber: '1', coverAssetId: ids.oldOrphan })
      }
    }
    // ...and an upload claims the same identity right after GC deletes the record
    const racingDb = {
      collection(name) {
        const real = db.collection(name)
        if (name !== 'coverAssets') return real
        return new Proxy(real, {
          get(target, prop) {
            if (prop === 'deleteOne') {
              return async (...args) => {
                const out = await target.deleteOne(...args)
                if (String(args[0]._id) === String(ids.oldOrphan)) {
                  await target.insertOne({ identityKey: identity, createdAt: daysAgo(0) })
                }
                return out
              }
            }
            const value = target[prop]
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      },
    }

    const result = await deleteOrphans(racingDb, { orphans, storage, confirm: true, backup })

    expect(result.skipped.find((o) => o.id === String(ids.oldOrphan)).reason).toMatch(/restored as private/)
    expect(await db.collection('coverAssets').findOne({ _id: ids.oldOrphan })).toMatchObject({ identityKey: null })
    expect(storage.store.has(s3Ref(ids.oldOrphan, 'full').key)).toBe(true)
    await db.collection('coverAssets').dropIndexes()
  })

  it('never treats images a comic points to as a stray, even without an asset record', async () => {
    const danglingId = new ObjectId()
    await db.collection('cover_images').insertOne({ comicId: String(danglingId), images: imagesFor(danglingId), createdAt: daysAgo(400) })
    await db.collection('comics').insertOne({ userId: 'u', series: 'Rom', issueNumber: '1', coverAssetId: danglingId })
    const storage = storageWithExtras()

    const orphans = await findOrphans(db, { now: NOW, storage, s3Prefix: 'production' })
    expect(orphans.dangling.map((d) => d.imagesKey)).toEqual([String(danglingId)])
    expect(orphans.strays.some((s) => s.imagesKey === String(danglingId))).toBe(false)

    await deleteOrphans(db, { orphans, storage, confirm: true })
    expect(await db.collection('cover_images').findOne({ comicId: String(danglingId) })).toBeTruthy()
  })

  it('skips orphans with S3 files when there is no S3 access, but still clears the rest', async () => {
    const orphans = await findOrphans(db, { now: NOW })

    const result = await deleteOrphans(db, { orphans, confirm: true })

    expect(result.skipped.map((o) => o.reason)).toEqual(['has S3 files but no S3 access configured', 'has S3 files but no S3 access configured'])
    expect(result.deleted.map((o) => o.kind).sort()).toEqual(['asset', 'stray']) // private asset + empty stray
    expect(await db.collection('coverAssets').findOne({ _id: ids.oldOrphan })).toBeTruthy()
  })

  it('skips a stray whose asset record appeared since it was found', async () => {
    const storage = storageWithExtras()
    const strayId = new ObjectId()
    await db.collection('cover_images').insertOne({ comicId: String(strayId), images: {}, createdAt: daysAgo(40) })
    const orphans = await findOrphans(db, { now: NOW, storage, s3Prefix: 'production' })
    await db.collection('coverAssets').insertOne({ _id: strayId, identityKey: null, createdAt: daysAgo(0) })

    const result = await deleteOrphans(db, { orphans, storage, confirm: true })

    expect(result.skipped.find((o) => o.imagesKey === String(strayId)).reason).toMatch(/now has a coverAssets record/)
    expect(await db.collection('cover_images').findOne({ comicId: String(strayId) })).toBeTruthy()
  })
})
