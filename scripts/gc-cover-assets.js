/**
 * Clean up orphaned cover storage (COM-45). Logic lives in
 * api/lib/coverGarbageCollection.js; this is the CLI around it.
 *
 *   node scripts/gc-cover-assets.js --env <file> [--grace-days 30] [--scan-s3] [--include-s3-orphans] [--confirm]
 *
 * Without --confirm it only reports. It finds:
 *   - cover assets no comic points to
 *   - cover_images records with no cover asset (pre-migration leftovers)
 *   - with --scan-s3: S3 files under <AWS_S3_KEY_PREFIX>/covers/ that no
 *     record mentions
 * Only things older than --grace-days (default 30) are deleted, since an
 * upload in progress writes S3 files and records a few moments apart.
 *
 * S3-only orphans are reported but kept unless --include-s3-orphans is
 * given: another database (e.g. preview) may reference files in this bucket.
 *
 * With --confirm, every record is saved and every S3 file downloaded to
 * --backup-dir (default .gc/backup-<timestamp>, gitignored) before it is
 * deleted.
 *
 * --env is required and must define MONGODB_URI. S3 access needs
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET and
 * AWS_S3_KEY_PREFIX in the same file; without the keys, orphans with S3 files
 * are skipped rather than half-deleted.
 */

import dotenv from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { MongoClient } from 'mongodb'
import { findOrphans, deleteOrphans, createS3Storage } from '../api/lib/coverGarbageCollection.js'

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '')
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next
      i++
    } else {
      flags[name] = true
    }
  }
  return flags
}

const isSet = (value) => value && value !== '[SENSITIVE]'

function describe(orphan) {
  const age = orphan.ageDays === null ? 'age unknown' : `${orphan.ageDays}d old`
  const files = orphan.s3Keys.length ? `${orphan.s3Keys.length} S3 file(s)` : 'no S3 files'
  const label = orphan.kind === 'asset'
    ? `asset ${orphan.id} (${orphan.identityKey || 'private'})`
    : orphan.kind === 'stray'
      ? `cover_images ${orphan.id} (key ${orphan.imagesKey})`
      : `S3 ${orphan.id}`
  return `${label}: ${age}, ${files}${orphan.eligible ? '' : ' — within grace period, kept'}`
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  if (!flags.env || flags.env === true) throw new Error('--env <file> is required (e.g. --env .env.production.local)')
  const envPath = resolve(flags.env)
  if (!existsSync(envPath)) throw new Error(`${envPath} not found`)

  // api/config.js loads .env.local on import; require the target's own
  // MONGODB_URI so the database can't silently come from there.
  const fileEnv = dotenv.parse(readFileSync(envPath))
  if (!fileEnv.MONGODB_URI) throw new Error(`${flags.env} does not define MONGODB_URI`)
  Object.assign(process.env, fileEnv)
  const { getDatabaseName } = await import('../api/config.js')

  const graceDays = Number(flags['grace-days'] ?? 30)
  const confirm = flags.confirm === true
  const scanS3 = flags['scan-s3'] === true
  const includeS3Orphans = flags['include-s3-orphans'] === true
  const s3Prefix = fileEnv.AWS_S3_KEY_PREFIX || null

  const hasS3Keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET'].every((k) => isSet(fileEnv[k]))
  if (scanS3 && !hasS3Keys) throw new Error(`--scan-s3 needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION and AWS_S3_BUCKET in ${flags.env}`)
  if (scanS3 && !s3Prefix) throw new Error(`--scan-s3 needs AWS_S3_KEY_PREFIX in ${flags.env}, so it never scans the whole bucket`)
  if (includeS3Orphans && !scanS3) throw new Error('--include-s3-orphans needs --scan-s3')

  const storage = hasS3Keys
    ? await createS3Storage({
      region: fileEnv.AWS_REGION,
      bucket: fileEnv.AWS_S3_BUCKET,
      accessKeyId: fileEnv.AWS_ACCESS_KEY_ID,
      secretAccessKey: fileEnv.AWS_SECRET_ACCESS_KEY,
    })
    : null

  const client = new MongoClient(fileEnv.MONGODB_URI)
  await client.connect()
  try {
    const db = client.db(getDatabaseName())
    console.log(`Database: ${db.databaseName} (from ${flags.env})`)
    console.log(`S3: ${storage ? `${fileEnv.AWS_S3_BUCKET}, prefix "${s3Prefix}"` : 'no access (keys not set) — orphans with S3 files will be skipped'}`)
    console.log(`Grace period: ${graceDays} days\n`)

    const orphans = await findOrphans(db, { graceDays, storage: scanS3 ? storage : null, s3Prefix })
    const section = (title, list) => {
      if (list === null) return
      console.log(`## ${title}: ${list.length}`)
      list.forEach((o) => console.log(`- ${describe(o)}`))
      console.log()
    }
    section('Cover assets no comic uses', orphans.orphanAssets)
    section('cover_images records with no asset', orphans.strays)
    section(`S3 files no record mentions${includeS3Orphans ? '' : ' (reported only; add --include-s3-orphans to delete)'}`, orphans.s3Orphans)

    let backupDir = null
    let backup = async () => {}
    if (confirm) {
      backupDir = resolve(typeof flags['backup-dir'] === 'string' ? flags['backup-dir'] : `.gc/backup-${new Date().toISOString().replace(/[:.]/g, '-')}`)
      mkdirSync(backupDir, { recursive: true })
      backup = async (orphan) => {
        const { asset, imagesDoc } = orphan
        appendFileSync(join(backupDir, 'records.jsonl'), JSON.stringify({ kind: orphan.kind, id: orphan.id, asset, imagesDoc }) + '\n')
        for (const key of orphan.s3Keys) {
          const file = join(backupDir, 's3', key)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, await storage.getObject(key))
        }
      }
    }

    const result = await deleteOrphans(db, { orphans, storage, confirm, includeS3Orphans, backup })
    const files = (list) => list.reduce((n, o) => n + o.s3Keys.length, 0)

    if (!confirm) {
      console.log(`Dry run — nothing deleted. Would delete ${result.wouldDelete.length} item(s) with ${files(result.wouldDelete)} S3 file(s).`)
      result.skipped.forEach((o) => console.log(`  would skip ${describe(o)}: ${o.reason}`))
      console.log('Add --confirm to delete (everything is backed up first).')
    } else {
      console.log(`Deleted ${result.deleted.length} item(s) with ${files(result.deleted)} S3 file(s). Backup: ${backupDir}`)
      result.skipped.forEach((o) => console.log(`  skipped ${describe(o)}: ${o.reason}`))
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
