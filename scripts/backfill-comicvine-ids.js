/**
 * Backfill comicVineId for comics that don't have one (COM-48).
 * Logic lives in api/lib/backfillComicVineIds.js; this is the CLI around it.
 *
 *   node scripts/backfill-comicvine-ids.js count  --env <file>
 *   node scripts/backfill-comicvine-ids.js lookup --env <file> [--interval-sec 36] [--max-requests N] [--redo]
 *   node scripts/backfill-comicvine-ids.js report
 *   node scripts/backfill-comicvine-ids.js apply  --env <file> [--fill-missing] [--confirm]
 *
 * count   Read-only: comics needing a lookup, distinct series, request estimate.
 * lookup  Queries ComicVine, one request per --interval-sec (default 36s,
 *         i.e. ≤100/hour, half ComicVine's per-resource cap, leaving the rest
 *         for live cover search on the same key). Saves progress after every
 *         comic; stops at the first rate-limit response. Re-run to resume.
 *         --redo repeats every lookup not yet applied (cheap: responses are
 *         cached in the state file, so only new URLs cost requests).
 *         Series → volume overrides are read from --volumes (default
 *         .backfill/volume-overrides.json), e.g.
 *           { "The Spectacular Spider-Man": 2870 }
 *         for series the name search can't find or can't tell apart.
 * report  Summarizes the state file. No database or ComicVine access.
 * apply   Writes matched lookups to the database — dry run unless --confirm.
 *         --fill-missing also fills empty publisher/year/month/volume.
 *         Makes no ComicVine calls.
 *
 * --env is required for commands that touch the database, so the target is
 * always explicit. State defaults to .backfill/comicvine-state.json
 * (gitignored — it contains collection data); override with --state.
 */

import dotenv from 'dotenv'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { MongoClient } from 'mongodb'
import { createState, lookupComics, applyLookups, normalizeSeriesKey } from '../api/lib/backfillComicVineIds.js'


function parseArgs(argv) {
  const [command, ...rest] = argv
  const flags = {}
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i].replace(/^--/, '')
    const next = rest[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next
      i++
    } else {
      flags[name] = true
    }
  }
  return { command, flags }
}

function loadState(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : createState()
}

function loadVolumeOverrides(flags) {
  const path = resolve(typeof flags.volumes === 'string' ? flags.volumes : '.backfill/volume-overrides.json')
  if (!existsSync(path)) {
    if (typeof flags.volumes === 'string') throw new Error(`${path} not found`)
    return {}
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return Object.fromEntries(Object.entries(raw).map(([series, volumeId]) => [normalizeSeriesKey(series), String(volumeId)]))
}

function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, path) // atomic, so an interrupted save never corrupts the file
}

async function withDatabase(flags, fn) {
  if (!flags.env || flags.env === true) {
    throw new Error('--env <file> is required (e.g. --env .env.production.local)')
  }
  const envPath = resolve(flags.env)
  if (!existsSync(envPath)) throw new Error(`${envPath} not found`)

  // api/config.js loads .env.local on import, filling any variable not already
  // set. Require the target's own MONGODB_URI so the database can't silently
  // come from .env.local, and set the file's values before importing it.
  const fileEnv = dotenv.parse(readFileSync(envPath))
  if (!fileEnv.MONGODB_URI) throw new Error(`${flags.env} does not define MONGODB_URI`)
  Object.assign(process.env, fileEnv)
  const { getMongoDBUri, getDatabaseName } = await import('../api/config.js')
  flags.fileEnv = fileEnv
  const client = new MongoClient(getMongoDBUri())
  await client.connect()
  try {
    const dbName = getDatabaseName()
    console.log(`Database: ${dbName} (from ${flags.env})\n`)
    return await fn(client.db(dbName))
  } finally {
    await client.close()
  }
}

const hours = (requests, intervalSec) => ((requests * intervalSec) / 3600).toFixed(1)

async function count(flags) {
  await withDatabase(flags, async (db) => {
    const comics = db.collection('comics')
    const query = { comicVineId: null }
    const [total, pending, series, perUser, filled] = await Promise.all([
      comics.countDocuments({}),
      comics.countDocuments(query),
      comics.distinct('series', query),
      comics.aggregate([{ $match: query }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).toArray(),
      Promise.all(['volumeId', 'year', 'publisher', 'month'].map((field) =>
        comics.countDocuments({ ...query, [field]: { $nin: [null, ''] } }))),
    ])
    const distinctSeries = new Set(series.map((s) => String(s).trim().toLowerCase())).size
    // Per series: 1 volume search + 1 publisher lookup; per comic: 1 issues call
    const estimate = pending + 2 * distinctSeries
    const interval = Number(flags['interval-sec'] || 36)

    console.log(`Comics: ${total} total, ${pending} without comicVineId (${perUser.length} account(s))`)
    console.log(`Distinct series among them: ${distinctSeries}`)
    console.log(`Already have: volumeId ${filled[0]}, year ${filled[1]}, publisher ${filled[2]}, month ${filled[3]}`)
    console.log(`Estimated ComicVine requests: ~${estimate} (vs ${pending * 3} uncached)`)
    console.log(`At one request per ${interval}s: ~${hours(estimate, interval)} hours`)
  })
}

async function lookup(flags, statePath) {
  // Only the env file's own key, never one picked up from .env.local
  const apiKey = () => flags.fileEnv.COMICVINE_API_KEY
  await withDatabase(flags, async (db) => {
    if (!apiKey()) throw new Error(`${flags.env} does not define COMICVINE_API_KEY`)
    const intervalSec = Number(flags['interval-sec'] || 36)
    const maxRequests = flags['max-requests'] ? Number(flags['max-requests']) : Infinity
    const state = loadState(statePath)
    const before = Object.keys(state.lookups).length
    const volumeOverrides = loadVolumeOverrides(flags)
    const redo = flags.redo === true

    console.log(`State: ${statePath} (${before} comics already looked up, ${state.requests} requests so far)`)
    console.log(`Pacing: one request per ${intervalSec}s${maxRequests < Infinity ? `, at most ${maxRequests} this run` : ''}`)
    if (Object.keys(volumeOverrides).length) console.log(`Volume overrides: ${Object.keys(volumeOverrides).length} series`)
    if (redo) console.log('Redoing every lookup not yet applied (cached responses cost no requests).')
    console.log('Progress is saved after every comic; Ctrl-C is safe, re-run to resume.\n')

    const started = Date.now()
    const run = await lookupComics(db, {
      state,
      apiKey: apiKey(),
      intervalMs: intervalSec * 1000,
      maxRequests,
      volumeOverrides,
      redo,
      onProgress: (s, last) => {
        saveState(statePath, s)
        if (last) console.log(`[${new Date().toISOString()}] ${last.series} #${last.issueNumber}: ${last.status}${last.reason ? ` (${last.reason})` : ''}`)
      },
    })

    const minutes = ((Date.now() - started) / 60000).toFixed(1)
    console.log(`\nLooked up ${run.processed} comics with ${run.requests} requests in ${minutes} min — ${run.stoppedBecause}.`)
    if (run.stoppedBecause !== 'done') {
      console.log('Re-run the same command to continue (wait an hour after a rate limit).')
    }
    console.log('Next: `report`, then `apply` (dry run) and `apply --confirm`.')
  })
}

function report(flags, statePath) {
  if (!existsSync(statePath)) throw new Error(`${statePath} not found — run lookup first`)
  const state = loadState(statePath)
  const lookups = Object.values(state.lookups)
  const by = (status) => lookups.filter((l) => l.status === status)

  console.log(`State: ${statePath}`)
  console.log(`${lookups.length} comics looked up with ${state.requests} ComicVine requests\n`)
  for (const status of ['matched', 'needs-review', 'no-match', 'stale', 'error']) {
    console.log(`${status.padEnd(13)} ${by(status).length}`)
  }
  console.log(`applied       ${lookups.filter((l) => l.appliedAt).length}`)

  const list = (title, rows, format) => {
    if (rows.length === 0) return
    console.log(`\n## ${title}`)
    rows.forEach((row) => console.log(format(row)))
  }
  const candidate = (c) => `${c.volumeName} (${c.year ?? '?'}, ${c.publisher ?? '?'}) → ${c.comicVineId}`

  list('Needs review', by('needs-review'), (l) =>
    `- ${l.series} #${l.issueNumber} [${l.comicId}]: ${l.reason}\n    ${l.candidates.map(candidate).join('\n    ')}`)
  list('No match', by('no-match'), (l) => `- ${l.series} #${l.issueNumber} [${l.comicId}]`)
  list('Stale (edited after lookup; re-queried on next lookup)', by('stale'), (l) => `- ${l.series} #${l.issueNumber} [${l.comicId}]`)
  list('Errors (retried on next lookup)', by('error'), (l) => `- ${l.series} #${l.issueNumber}: ${l.reason}`)
  if (flags.matched) {
    list('Matched', by('matched'), (l) => `- ${l.series} #${l.issueNumber} → ${candidate(l.match)}`)
  }
}

async function apply(flags, statePath) {
  if (!existsSync(statePath)) throw new Error(`${statePath} not found — run lookup first`)
  const state = loadState(statePath)
  const confirm = flags.confirm === true
  const fillMissing = flags['fill-missing'] === true

  await withDatabase(flags, async (db) => {
    console.log(confirm ? 'Applying changes.' : 'Dry run — nothing is written. Add --confirm to apply.')
    console.log(fillMissing ? 'Filling empty publisher/year/month/volume fields.\n' : 'Setting ComicVine identity only (add --fill-missing to fill empty fields).\n')

    const result = await applyLookups(db, { state, confirm, fillMissing, onProgress: (s) => saveState(statePath, s) })
    for (const change of result.changes) {
      const label = `${change.series} #${change.issueNumber}`
      if (change.stale) {
        console.log(`- STALE ${label}: edited since lookup — skipped; re-run lookup to refresh it`)
      } else if (change.conflictWith) {
        console.log(`- CONFLICT ${label}: account already owns ${change.conflictWith} with that identity — skipped`)
      } else {
        const fields = Object.entries(change.set).filter(([k]) => k !== 'identityKey').map(([k, v]) => `${k}=${v}`).join(', ')
        console.log(`- ${label}: ${fields}`)
      }
    }
    console.log(`\n${confirm ? `Updated ${result.updated}` : `Would update ${result.wouldUpdate}`}, conflicts ${result.conflict}, stale ${result.stale}, skipped ${result.skipped}.`)
    if (confirm) saveState(statePath, state)
  })
}

const { command, flags } = parseArgs(process.argv.slice(2))
const statePath = resolve(typeof flags.state === 'string' ? flags.state : '.backfill/comicvine-state.json')

const commands = {
  count: () => count(flags),
  lookup: () => lookup(flags, statePath),
  report: () => report(flags, statePath),
  apply: () => apply(flags, statePath),
}

if (!commands[command]) {
  console.error('Usage: node scripts/backfill-comicvine-ids.js <count|lookup|report|apply> [--env <file>] [options]')
  console.error('See the comment at the top of this file for options.')
  process.exit(1)
}

try {
  await commands[command]()
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
