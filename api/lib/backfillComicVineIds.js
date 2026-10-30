import { ObjectId } from 'mongodb'
import { searchComicVineIssues } from './comicVineSearch.js'
import { findAssetByIdentityKey } from './coverAssets.js'
import { parseIssueForSearch } from '../../src/utils/issueParser.js'

/**
 * Backfill comicVineId for comics that don't have one (COM-48), e.g. those
 * migrated from the legacy schema. Upgrades identityKey from the manual
 * composite to comicvine|<id>, the stronger identity used for cross-account
 * cover sharing.
 *
 * Runs in two phases so ComicVine is only queried once:
 *   1. lookupComics — paced, cached ComicVine lookups. Results go into a
 *      `state` object (persisted by the caller), which doubles as the dry-run
 *      report and lets an interrupted run resume where it stopped.
 *   2. applyLookups — writes confident matches to the database from `state`.
 *      Makes no ComicVine calls.
 *
 * ComicVine allows ~200 requests per resource per hour and also blocks bursts
 * (the 2026-06 migration run was blocked after ~34 requests at 1.5s spacing).
 * The backfill shares the production API key with live cover search, so it
 * paces itself well under the cap and stops at the first rate-limit response.
 */

// ComicVine returns HTTP 420 (or 429) when blocking, or status_code 107 in an
// otherwise normal JSON response when the hourly limit is hit.
const RATE_LIMIT_STATUSES = new Set([420, 429])
const COMICVINE_RATE_LIMIT_CODE = 107

// Most requests a single comic's lookup can make (volume search, issues,
// volume publishers).
const MAX_REQUESTS_PER_LOOKUP = 3

export class RateLimitError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RateLimitError'
    this.rateLimited = true
  }
}

const cacheKey = (url) => {
  const parsed = new URL(url)
  parsed.searchParams.delete('api_key')
  return parsed.toString()
}

/**
 * fetch replacement for searchComicVineIssues that spaces network requests at
 * least `intervalMs` apart, serves repeats from `cache` (a plain object, so it
 * can be saved with the state), and throws RateLimitError when ComicVine
 * pushes back. Successful responses are cached by URL without the API key.
 */
export function createPacedFetch({
  cache = {},
  intervalMs,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}) {
  let lastRequestAt = null
  let requests = 0

  const pacedFetch = async (url, options) => {
    const key = cacheKey(url)
    if (key in cache) {
      const data = cache[key]
      return { ok: true, status: 200, json: async () => data }
    }

    if (lastRequestAt !== null) {
      const wait = lastRequestAt + intervalMs - now()
      if (wait > 0) await sleep(wait)
    }
    lastRequestAt = now()
    requests++

    const response = await fetchImpl(url, options)
    if (RATE_LIMIT_STATUSES.has(response.status)) {
      throw new RateLimitError(`ComicVine responded with HTTP ${response.status}`)
    }
    if (!response.ok) {
      return response
    }

    const data = await response.json()
    if (data.status_code === COMICVINE_RATE_LIMIT_CODE) {
      throw new RateLimitError(`ComicVine rate limit: ${data.error}`)
    }
    if (data.error === 'OK') {
      cache[key] = data
    }
    return { ok: true, status: response.status, json: async () => data }
  }

  pacedFetch.requestCount = () => requests
  return pacedFetch
}

const sameText = (a, b) => {
  const x = String(a || '').toLowerCase().trim()
  const y = String(b || '').toLowerCase().trim()
  return x.includes(y) || y.includes(x)
}

const distinctVolumes = (results) => new Set(results.map((r) => r.metadata.volumeId)).size

const samePublisherExactly = (comic, result) =>
  String(comic.publisher || '').toLowerCase().trim() === String(result.metadata.publisher || '').toLowerCase().trim()

// Several volumes fit (e.g. Marvel's Transformers and Marvel UK's reprint, both
// 1985). If exactly one volume's publisher equals the comic's, that's the one.
const breakTieByPublisher = (comic, results) => {
  if (!comic.publisher) return null
  const exact = results.filter((r) => samePublisherExactly(comic, r))
  return exact.length > 0 && distinctVolumes(exact) === 1 ? exact[0] : null
}

/**
 * Pick the ComicVine result for a comic, or explain why a person should
 * review it. A wrong match would give the comic another issue's identity
 * (and possibly its shared cover), so anything ambiguous is left for review
 * rather than taking the top-ranked result.
 */
export function chooseMatch(comic, results) {
  if (results.length === 0) {
    return { status: 'no-match' }
  }

  let match
  if (comic.volumeId) {
    match = results.find((r) => r.metadata.volumeId === String(comic.volumeId))
    if (!match) return { status: 'needs-review', reason: 'comic\'s volume not among results' }
  } else if (comic.year) {
    const inYear = results.filter((r) => String(r.metadata.year) === String(comic.year))
    if (inYear.length === 0) return { status: 'needs-review', reason: `no result from ${comic.year}` }
    match = distinctVolumes(inYear) > 1 ? breakTieByPublisher(comic, inYear) : inYear[0]
    if (!match) return { status: 'needs-review', reason: `several volumes in ${comic.year}` }
  } else {
    match = distinctVolumes(results) > 1 ? breakTieByPublisher(comic, results) : results[0]
    if (!match) return { status: 'needs-review', reason: 'no year and several volumes' }
  }

  if (comic.publisher && match.metadata.publisher && !sameText(comic.publisher, match.metadata.publisher)) {
    return { status: 'needs-review', reason: `publisher ${match.metadata.publisher} ≠ ${comic.publisher}` }
  }

  return { status: 'matched', match }
}

const summarize = (result) => ({
  comicVineId: result.id,
  volumeId: result.metadata.volumeId,
  volumeName: result.metadata.volumeName,
  publisher: result.metadata.publisher || null,
  year: result.metadata.year,
  month: result.metadata.month ?? null,
})

// The comic fields a lookup's result depends on. Saved with each lookup so a
// comic edited afterwards (the phases can be hours apart) is re-queried
// instead of receiving a match for its old values.
const LOOKUP_INPUTS = ['series', 'issueNumber', 'publisher', 'year', 'volumeId']

const lookupInputs = (comic) =>
  Object.fromEntries(LOOKUP_INPUTS.map((field) => [field, String(comic[field] ?? '').trim()]))

const inputsChanged = (lookup, comic) => {
  const current = lookupInputs(comic)
  return !lookup.inputs || LOOKUP_INPUTS.some((field) => lookup.inputs[field] !== current[field])
}

// Statuses lookupComics retries on its next run
const RETRY_STATUSES = new Set(['error', 'stale'])

export function createState() {
  return { version: 1, createdAt: new Date().toISOString(), requests: 0, lookups: {}, cache: {} }
}

export const normalizeSeriesKey = (series) => String(series || '').trim().toLowerCase()

/**
 * Phase 1: look up every comic without a comicVineId that `state` doesn't
 * already have a result for. Calls `onProgress(state, record)` after each
 * comic (and `onProgress(state)` once at the end) so the caller can save it. Stops early — leaving state consistent — when
 * ComicVine rate-limits, or before a lookup that could exceed `maxRequests`.
 *
 * `volumeOverrides` maps a series name (any case) to the ComicVine volume id
 * it belongs to, for series the name search can't find or can't tell apart;
 * those comics are matched within that volume only. `redo` repeats every
 * lookup not yet applied — cheap after a fix, since responses are cached.
 */
export async function lookupComics(db, {
  state,
  apiKey,
  intervalMs,
  maxRequests = Infinity,
  volumeOverrides = {},
  redo = false,
  fetchImpl = fetch,
  sleep,
  now,
  onProgress = () => {},
}) {
  const pacedFetch = createPacedFetch({ cache: state.cache, intervalMs, fetchImpl, sleep, now })
  const comics = await db.collection('comics')
    .find({ comicVineId: null })
    .sort({ series: 1, _id: 1 })
    .toArray()

  const requestsBeforeRun = state.requests
  let processed = 0
  let stoppedBecause = 'done'

  for (const comic of comics) {
    const id = comic._id.toString()
    const previous = state.lookups[id]
    if (previous?.appliedAt) continue
    if (previous && !redo && !RETRY_STATUSES.has(previous.status) && !inputsChanged(previous, comic)) continue

    if (pacedFetch.requestCount() + MAX_REQUESTS_PER_LOOKUP > maxRequests) {
      stoppedBecause = 'request budget reached'
      break
    }

    const record = {
      comicId: id,
      userId: comic.userId,
      series: comic.series,
      issueNumber: comic.issueNumber,
      inputs: lookupInputs(comic),
      lookedUpAt: new Date().toISOString(),
    }

    const override = volumeOverrides[normalizeSeriesKey(comic.series)]
    if (override) record.volumeOverride = String(override)

    try {
      // Same parsing the app does before searching ("Annual 18" → series "X Annual", issue 18)
      const { series, issue } = parseIssueForSearch(comic.series, comic.issueNumber)
      const results = await searchComicVineIssues({
        series,
        issue,
        publisher: comic.publisher,
        year: comic.year,
        apiKey,
        fetchImpl: pacedFetch,
        volumeIds: override ? [override] : undefined,
      })
      const { status, reason, match } = chooseMatch(override && !comic.volumeId ? { ...comic, volumeId: override } : comic, results)
      Object.assign(record, {
        status,
        reason: reason || null,
        match: match ? summarize(match) : null,
        candidates: results.slice(0, 5).map(summarize),
      })
    } catch (error) {
      if (error.rateLimited) {
        stoppedBecause = `rate limited (${error.message})`
        break
      }
      Object.assign(record, { status: 'error', reason: error.message })
    }

    state.lookups[id] = record
    state.requests = requestsBeforeRun + pacedFetch.requestCount()
    processed++
    onProgress(state, record)
  }

  state.requests = requestsBeforeRun + pacedFetch.requestCount()
  onProgress(state)
  return { processed, requests: pacedFetch.requestCount(), stoppedBecause }
}

const isEmpty = (value) => value === null || value === undefined || String(value).trim() === ''

/**
 * Phase 2: apply `matched` lookups. Without `confirm` it only reports what it
 * would change. With `fillMissing`, empty publisher/year/month/volume fields
 * are also filled from the match (month only if the year agrees); existing
 * values are never overwritten. Makes no ComicVine calls.
 */
export async function applyLookups(db, { state, confirm = false, fillMissing = false, onProgress = () => {} }) {
  const comicsCollection = db.collection('comics')
  const outcomes = { updated: 0, wouldUpdate: 0, conflict: 0, stale: 0, skipped: 0 }
  const changes = []

  for (const lookup of Object.values(state.lookups)) {
    if (lookup.status !== 'matched' || lookup.appliedAt) continue

    const comic = await comicsCollection.findOne({ _id: new ObjectId(lookup.comicId) })
    if (!comic || comic.comicVineId) {
      outcomes.skipped++
      continue
    }
    if (inputsChanged(lookup, comic)) {
      // Edited since the lookup — the match may be for its old values
      if (confirm) {
        Object.assign(lookup, { status: 'stale', reason: 'comic changed since lookup' })
        onProgress(state)
      }
      outcomes.stale++
      changes.push({ comicId: lookup.comicId, series: comic.series, issueNumber: comic.issueNumber, stale: true })
      continue
    }

    const { match } = lookup
    const identityKey = `comicvine|${match.comicVineId}`
    const conflict = await comicsCollection.findOne({ userId: comic.userId, identityKey, _id: { $ne: comic._id } })
    if (conflict) {
      outcomes.conflict++
      changes.push({ comicId: lookup.comicId, series: comic.series, issueNumber: comic.issueNumber, conflictWith: conflict._id.toString() })
      continue
    }

    const set = { comicVineId: String(match.comicVineId), identityKey }
    if (fillMissing) {
      if (isEmpty(comic.publisher) && match.publisher) set.publisher = match.publisher
      if (isEmpty(comic.year) && match.year) set.year = match.year
      const year = set.year ?? comic.year
      if (isEmpty(comic.month) && match.month && String(year) === String(match.year)) set.month = match.month
      if (isEmpty(comic.volumeId) && match.volumeId) {
        set.volumeId = match.volumeId
        set.volumeName = match.volumeName
      }
    }
    changes.push({ comicId: lookup.comicId, series: comic.series, issueNumber: comic.issueNumber, set })

    if (!confirm) {
      outcomes.wouldUpdate++
      continue
    }

    await comicsCollection.updateOne(
      { _id: comic._id },
      { $set: { ...set, updatedAt: new Date().toISOString() } }
    )

    // Claim the new identity on this comic's own cover asset, but only if
    // nothing else already has it — never force a collision.
    if (comic.coverAssetId && !(await findAssetByIdentityKey(db, identityKey))) {
      await db.collection('coverAssets').updateOne(
        { _id: comic.coverAssetId },
        { $set: { identityKey, updatedAt: new Date().toISOString() } }
      )
    }

    lookup.appliedAt = new Date().toISOString()
    outcomes.updated++
    onProgress(state)
  }

  return { ...outcomes, changes }
}
