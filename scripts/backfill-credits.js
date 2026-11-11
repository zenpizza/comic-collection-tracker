/**
 * Batch-fill creator credits for comics that have a ComicVine id (COM-59).
 * Logic lives in api/lib/backfillCredits.js; this is the CLI around it.
 *
 *   node scripts/backfill-credits.js count --env <file>
 *   node scripts/backfill-credits.js run   --env <file> [--interval-sec 36] [--max-requests N]
 *
 * count  Read-only: how many comics still need credits, and roughly how long.
 * run    One ComicVine request per --interval-sec (default 36s, ≤100/hour on
 *        the `issue` resource, leaving room for the app's own lookups). Only
 *        fills comics whose credits are still empty — never overwrites — and
 *        stops at the first rate-limit response. Re-run to continue.
 *
 * --env is required and must define its own MONGODB_URI and COMICVINE_API_KEY
 * (api/config.js loads .env.local on import, so the target is never implied).
 */

import dotenv from 'dotenv'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { MongoClient } from 'mongodb'
import { fillMissingCredits, creditsCandidatesQuery } from '../api/lib/backfillCredits.js'

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

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))
  if (!['count', 'run'].includes(command)) {
    throw new Error('Usage: node scripts/backfill-credits.js <count|run> --env <file> [--interval-sec 36] [--max-requests N]')
  }
  if (!flags.env || flags.env === true) throw new Error('--env <file> is required (e.g. --env .env.production.local)')
  const envPath = resolve(flags.env)
  if (!existsSync(envPath)) throw new Error(`${envPath} not found`)

  const fileEnv = dotenv.parse(readFileSync(envPath))
  if (!fileEnv.MONGODB_URI) throw new Error(`${flags.env} does not define MONGODB_URI`)
  Object.assign(process.env, fileEnv)
  const { getDatabaseName } = await import('../api/config.js')

  const intervalSec = Number(flags['interval-sec'] || 36)
  const client = new MongoClient(fileEnv.MONGODB_URI)
  await client.connect()
  try {
    const db = client.db(getDatabaseName())
    console.log(`Database: ${db.databaseName} (from ${flags.env})\n`)
    const pending = await db.collection('comics').countDocuments(creditsCandidatesQuery())

    if (command === 'count') {
      console.log(`Comics still needing credits: ${pending}`)
      console.log(`At one request per ${intervalSec}s: ~${((pending * intervalSec) / 3600).toFixed(1)} hours`)
      return
    }

    if (!fileEnv.COMICVINE_API_KEY) throw new Error(`${flags.env} does not define COMICVINE_API_KEY`)
    const maxRequests = flags['max-requests'] ? Number(flags['max-requests']) : Infinity
    console.log(`Filling credits for ${pending} comics, one request per ${intervalSec}s${maxRequests < Infinity ? ` (at most ${maxRequests})` : ''}.`)
    console.log('Ctrl-C is safe; re-run to continue.\n')

    const started = Date.now()
    const result = await fillMissingCredits(db, {
      apiKey: fileEnv.COMICVINE_API_KEY,
      intervalMs: intervalSec * 1000,
      maxRequests,
      onProgress: ({ series, issueNumber, status }) =>
        console.log(`[${new Date().toISOString()}] ${series} #${issueNumber}: ${status}`),
    })

    const minutes = ((Date.now() - started) / 60000).toFixed(1)
    console.log(`\n${result.processed} comics in ${minutes} min with ${result.requests} requests — ${result.stoppedBecause}.`)
    console.log(`Filled ${result.filled}, none on ComicVine ${result.empty}, already saved ${result.skipped}, errors ${result.errors.length}.`)
    result.errors.forEach((e) => console.log(`  error: ${e.series} #${e.issueNumber} — ${e.error}`))
    if (result.stoppedBecause !== 'done' || result.errors.length) {
      console.log('Re-run the same command to continue (wait an hour after a rate limit).')
    }
  } finally {
    await client.close()
  }
}

try {
  await main()
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
