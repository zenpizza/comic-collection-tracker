import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ObjectId } from 'mongodb'
import { startTestDb } from './testDb.js'
import { ensureIndexes as ensureAssetIndexes, createAsset, findAssetByIdentityKey } from '../coverAssets.js'
import {
  ensureIndexes,
  buildIdentityKey,
  addComic,
  listComics,
  getComic,
  updateComic,
  removeComic,
  attachCoverAsset,
  detachCover,
  DuplicateComicError,
} from '../comics.js'

describe('buildIdentityKey', () => {
  it('prefers the ComicVine issue id when available', () => {
    expect(buildIdentityKey({ comicVineId: '12345', series: 'Saga', issueNumber: '1' }))
      .toBe('comicvine|12345')
  })

  it('falls back to a normalized manual composite when there is no ComicVine id', () => {
    const key = buildIdentityKey({
      series: '  Amazing Spider-Man  ', issueNumber: '1', publisher: 'Marvel', variant: 'Variant B', year: 2022,
    })
    expect(key).toBe('manual|amazing spider-man|1|marvel|variant b|2022')
  })

  it('prefers volumeId over year in the manual fallback when both are present', () => {
    const key = buildIdentityKey({ series: 'X', issueNumber: '1', volumeId: 'vol-9', year: 2022 })
    expect(key).toBe('manual|x|1|||vol-9')
  })
})

describe('comics + coverAssets integration', () => {
  let db
  let stop

  beforeAll(async () => {
    const testDb = await startTestDb()
    db = testDb.db
    stop = testDb.stop
    await ensureIndexes(db)
    await ensureAssetIndexes(db)
  })

  afterAll(async () => {
    await stop()
  })

  it('creates a comic with no cover when nothing shared exists yet', async () => {
    const comic = await addComic(db, {
      userId: 'user_a',
      comic: { series: 'Saga', issueNumber: '1', publisher: 'Image', year: 2012 },
    })

    expect(comic.userId).toBe('user_a')
    expect(comic.coverAssetId).toBeNull()
    expect(comic.hasCover).toBe(false)
  })

  it('a second account adding the same issue reuses the existing shared cover asset', async () => {
    const metadata = { series: 'Invincible', issueNumber: '1', publisher: 'Image', year: 2003 }
    const asset = await createAsset(db, { identityKey: buildIdentityKey(metadata), images: { medium: { data: 'x' } } })

    const comicB = await addComic(db, { userId: 'user_b', comic: metadata })

    expect(comicB.coverAssetId).toBe(asset._id.toString())
    expect(comicB.hasCover).toBe(true)
  })

  it('keeps each account isolated even when they reference the same shared asset', async () => {
    const metadata = { series: 'Watchmen', issueNumber: '1', publisher: 'DC', year: 1986 }
    await addComic(db, { userId: 'user_d', comic: metadata })
    await addComic(db, { userId: 'user_e', comic: metadata })

    const collectionD = await listComics(db, 'user_d')
    const collectionE = await listComics(db, 'user_e')

    expect(collectionD).toHaveLength(1)
    expect(collectionE).toHaveLength(1)
    expect(collectionD[0].id).not.toBe(collectionE[0].id)
    expect(collectionD[0].coverAssetId).toBe(collectionE[0].coverAssetId)
  })

  it('rejects adding the same issue twice for the same account', async () => {
    const metadata = { series: 'Sandman', issueNumber: '1', publisher: 'DC', year: 1989 }
    await addComic(db, { userId: 'user_f', comic: metadata })

    await expect(addComic(db, { userId: 'user_f', comic: metadata })).rejects.toThrow(DuplicateComicError)

    const count = await db.collection('comics').countDocuments({ userId: 'user_f' })
    expect(count).toBe(1)
  })

  it('editing a non-identity canonical field (publisher) on a ComicVine-identified comic keeps its comicvine identity and cover', async () => {
    const comic = await addComic(db, {
      userId: 'user_cv',
      comic: { comicVineId: '176826', series: 'Groo the Wanderer', issueNumber: '1' },
    })
    const asset = await createAsset(db, { identityKey: comic.identityKey, images: { medium: { data: 'g' } } })
    await db.collection('comics').updateOne(
      { _id: new ObjectId(comic.id) },
      { $set: { coverAssetId: asset._id, hasCover: true } }
    )

    const updated = await updateComic(db, { userId: 'user_cv', comicId: comic.id, updates: { publisher: 'Indie' } })

    expect(updated.publisher).toBe('Indie')
    expect(updated.identityKey).toBe('comicvine|176826')
    expect(updated.coverAssetId).toBe(asset._id.toString())
    expect(updated.hasCover).toBe(true)
  })

  it('updateComic on a personal field (notes) does not touch identityKey or coverAssetId', async () => {
    const comic = await addComic(db, {
      userId: 'user_g',
      comic: { series: 'East of West', issueNumber: '1', publisher: 'Image', year: 2013 },
    })

    const updated = await updateComic(db, { userId: 'user_g', comicId: comic.id, updates: { notes: 'great issue' } })

    expect(updated.notes).toBe('great issue')
    expect(updated.identityKey).toBe(comic.identityKey)
    expect(updated.coverAssetId).toBe(comic.coverAssetId)
  })

  it('editing a canonical field to match another existing identity adopts that identity\'s shared asset', async () => {
    const targetMetadata = { series: 'Paper Girls', issueNumber: '1', publisher: 'Image', year: 2015 }
    const asset = await createAsset(db, { identityKey: buildIdentityKey(targetMetadata), images: { medium: { data: 'y' } } })

    const comic = await addComic(db, {
      userId: 'user_h',
      comic: { series: 'Paper Girls', issueNumber: '2', publisher: 'Image', year: 2015 },
    })
    expect(comic.coverAssetId).toBeNull()

    const updated = await updateComic(db, { userId: 'user_h', comicId: comic.id, updates: { issueNumber: '1' } })

    expect(updated.coverAssetId).toBe(asset._id.toString())
  })

  it('rejects editing into an identity the same account already owns', async () => {
    const userId = 'user_i'
    await addComic(db, { userId, comic: { series: 'Rat Queens', issueNumber: '1', publisher: 'Image', year: 2013 } })
    const second = await addComic(db, { userId, comic: { series: 'Rat Queens', issueNumber: '2', publisher: 'Image', year: 2013 } })

    await expect(
      updateComic(db, { userId, comicId: second.id, updates: { issueNumber: '1' } })
    ).rejects.toThrow(DuplicateComicError)
  })

  it('removeComic deletes only the owner\'s row and never touches the shared asset', async () => {
    const metadata = { series: 'Y: The Last Man', issueNumber: '1', publisher: 'Vertigo', year: 2002 }
    const asset = await createAsset(db, { identityKey: buildIdentityKey(metadata), images: { medium: { data: 'z' } } })
    const comicJ = await addComic(db, { userId: 'user_j', comic: metadata })
    await addComic(db, { userId: 'user_k', comic: metadata })

    const deletedByWrongUser = await removeComic(db, { userId: 'user_other', comicId: comicJ.id })
    expect(deletedByWrongUser).toBe(false)

    const deleted = await removeComic(db, { userId: 'user_j', comicId: comicJ.id })
    expect(deleted).toBe(true)

    const stillThereForK = await listComics(db, 'user_k')
    expect(stillThereForK).toHaveLength(1)

    const assetStillExists = await db.collection('coverAssets').findOne({ _id: asset._id })
    expect(assetStillExists).not.toBeNull()
  })

  it('detachCover only nulls the owning account\'s pointer, leaving other accounts and the asset untouched', async () => {
    const metadata = { series: 'Hellboy', issueNumber: '1', publisher: 'Dark Horse', year: 1994 }
    const asset = await createAsset(db, { identityKey: buildIdentityKey(metadata), images: { medium: { data: 'h' } } })
    const comicL = await addComic(db, { userId: 'user_l', comic: metadata })
    const comicM = await addComic(db, { userId: 'user_m', comic: metadata })

    await detachCover(db, { userId: 'user_l', comicId: comicL.id })

    const updatedL = await getComic(db, { userId: 'user_l', comicId: comicL.id })
    const updatedM = await getComic(db, { userId: 'user_m', comicId: comicM.id })

    expect(updatedL.coverAssetId).toBeNull()
    expect(updatedL.hasCover).toBe(false)
    expect(updatedM.coverAssetId).toBe(asset._id.toString())
    expect(updatedM.hasCover).toBe(true)
  })

  it('attachCoverAsset (replace) only points the owning account\'s row at the new asset', async () => {
    const metadata = { series: 'Locke & Key', issueNumber: '1', publisher: 'IDW', year: 2008 }
    const oldAsset = await createAsset(db, { identityKey: buildIdentityKey(metadata), images: { medium: { data: 'old' } } })
    const comicN = await addComic(db, { userId: 'user_n', comic: metadata })
    const comicO = await addComic(db, { userId: 'user_o', comic: metadata })

    const newAsset = await createAsset(db, { identityKey: 'manual|locke-and-key-replacement', images: { medium: { data: 'new' } } })
    await attachCoverAsset(db, { userId: 'user_n', comicId: comicN.id, assetId: newAsset._id })

    const updatedN = await getComic(db, { userId: 'user_n', comicId: comicN.id })
    const updatedO = await getComic(db, { userId: 'user_o', comicId: comicO.id })

    expect(updatedN.coverAssetId).toBe(newAsset._id.toString())
    expect(updatedO.coverAssetId).toBe(oldAsset._id.toString())
  })
})
