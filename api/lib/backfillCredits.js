import { createPacedFetch } from './backfillComicVineIds.js'
import { fetchIssueCredits } from './comicVineSearch.js'
import { normalizeCredits } from './comics.js'

/**
 * Batch-fill creator credits (COM-59) for comics that have a ComicVine id but
 * no credits yet. The app otherwise fetches credits only the first time a
 * comic is opened (COM-55), which leaves browse/search-by-creator nearly empty.
 *
 * One request per comic on ComicVine's per-issue endpoint, paced and stopped
 * at the first rate-limit response (createPacedFetch). Resumable without a
 * state file: each run only picks up comics whose credits are still empty.
 * Writes are conditional on credits still being empty and the comic still
 * having the ComicVine id that was looked up, so credits saved meanwhile (by
 * hand, or the app's fill-on-open) are never overwritten, and an id corrected
 * meanwhile never gets the old issue's credits.
 */

const MISSING_CREDITS = { credits: { $not: { $type: 'array' } } }

export function creditsCandidatesQuery() {
  return { comicVineId: { $ne: null }, ...MISSING_CREDITS }
}

export async function fillMissingCredits(db, {
  apiKey,
  intervalMs,
  maxRequests = Infinity,
  fetchImpl = fetch,
  sleep,
  now,
  onProgress = () => {},
}) {
  const comics = db.collection('comics')
  const pacedFetch = createPacedFetch({ cache: {}, intervalMs, fetchImpl, sleep, now })
  const candidates = await comics
    .find(creditsCandidatesQuery(), { projection: { series: 1, issueNumber: 1, comicVineId: 1 } })
    .sort({ _id: 1 })
    .toArray()

  const result = { processed: 0, filled: 0, empty: 0, skipped: 0, errors: [], stoppedBecause: 'done' }

  for (const comic of candidates) {
    if (pacedFetch.requestCount() + 1 > maxRequests) {
      result.stoppedBecause = 'request budget reached'
      break
    }

    const label = { id: String(comic._id), series: comic.series, issueNumber: comic.issueNumber }
    try {
      const credits = normalizeCredits(await fetchIssueCredits({ issueId: comic.comicVineId, apiKey, fetchImpl: pacedFetch }))
      const write = await comics.updateOne(
        { _id: comic._id, comicVineId: comic.comicVineId, ...MISSING_CREDITS },
        { $set: { credits, updatedAt: new Date().toISOString() } }
      )
      if (write.modifiedCount === 0) {
        result.skipped++ // credits saved, or ComicVine id changed, meanwhile
        onProgress({ ...label, status: 'skipped (comic changed meanwhile)' })
      } else if (credits.length === 0) {
        result.empty++
        onProgress({ ...label, status: 'no credits on ComicVine' })
      } else {
        result.filled++
        onProgress({ ...label, status: `${credits.length} credits` })
      }
    } catch (error) {
      if (error.rateLimited) {
        result.stoppedBecause = `rate limited (${error.message})`
        break
      }
      // Left empty, so the next run retries it
      result.errors.push({ ...label, error: error.message })
      onProgress({ ...label, status: `error: ${error.message}` })
    }
    result.processed++
  }

  result.requests = pacedFetch.requestCount()
  return result
}
