#!/usr/bin/env node
/**
 * Cleanup Script: Remove Legacy Base64 Data from MongoDB
 * 
 * Removes base64 image data from MongoDB documents that have been
 * successfully migrated to S3. Only removes data after verifying
 * all S3 size variants exist.
 * 
 * Usage:
 *   node scripts/cleanup-legacy-images.js [options]
 * 
 * Options:
 *   --dry-run           Preview changes without modifying MongoDB
 *   --verify-s3         HEAD request to verify S3 objects exist (slower but safer)
 *   --batch-size <n>    Documents per batch (default: 100)
 *   --concurrency <n>   Concurrent S3 HEAD requests (default: 10)
 *   --verbose           Enable detailed logging
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { MongoClient } from 'mongodb'
import { Command } from 'commander'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required')
  process.exit(1)
}

import { getS3Client } from '../api/s3-client.js'
import { hasCompleteS3References } from '../api/s3-serialization.js'
import { getMongoDBUri, getDatabaseName } from '../api/config.js'

const program = new Command()

program
  .name('cleanup-legacy-images')
  .description('Remove legacy base64 data from migrated MongoDB documents')
  .option('--dry-run', 'Preview changes without modifying')
  .option('--verify-s3', 'Verify S3 objects exist before cleanup')
  .option('--batch-size <n>', 'Documents per batch', '100')
  .option('--concurrency <n>', 'Concurrent S3 HEAD requests', '10')
  .option('--verbose', 'Enable detailed logging')
  .parse()

const options = program.opts()

const config = {
  dryRun: options.dryRun || false,
  verifyS3: options.verifyS3 || false,
  batchSize: parseInt(options.batchSize, 10),
  concurrency: parseInt(options.concurrency, 10),
  verbose: options.verbose || false,
}

function log(...args) {
  console.log('[Cleanup]', ...args)
}

function verbose(...args) {
  if (config.verbose) {
    console.log('[Cleanup:Verbose]', ...args)
  }
}

const VALID_SIZES = ['thumbnail', 'medium', 'full']


/**
 * Verify S3 objects exist for a document
 */
async function verifyS3Objects(s3Client, doc) {
  const comicId = doc.comicId
  const results = {}
  
  for (const size of VALID_SIZES) {
    try {
      const exists = await s3Client.imageExists(comicId, size)
      results[size] = exists
    } catch (error) {
      verbose(`S3 verification error for ${comicId}/${size}: ${error.message}`)
      results[size] = false
    }
  }
  
  return results
}

/**
 * Process a single document for cleanup
 */
async function cleanupDocument(db, s3Client, doc) {
  const comicId = doc.comicId
  const images = doc.images
  
  // Check if already cleaned up
  if (doc.legacyRemoved) {
    verbose(`Skipping ${comicId}: already cleaned up`)
    return { status: 'skipped', reason: 'already_cleaned' }
  }
  
  // Check if migrated
  if (!doc.migratedAt) {
    verbose(`Skipping ${comicId}: not migrated yet`)
    return { status: 'skipped', reason: 'not_migrated' }
  }
  
  // Check if has complete S3 references in MongoDB
  if (!hasCompleteS3References(images)) {
    verbose(`Skipping ${comicId}: incomplete S3 references`)
    return { status: 'skipped', reason: 'incomplete_s3_refs' }
  }
  
  // Optionally verify S3 objects actually exist
  if (config.verifyS3) {
    const s3Exists = await verifyS3Objects(s3Client, doc)
    const allExist = VALID_SIZES.every(size => s3Exists[size])
    
    if (!allExist) {
      const missing = VALID_SIZES.filter(size => !s3Exists[size])
      verbose(`Skipping ${comicId}: missing S3 objects: ${missing.join(', ')}`)
      return { status: 'skipped', reason: 'missing_s3_objects', missing }
    }
  }
  
  // Check if has base64 data to remove
  const hasBase64 = Object.values(images).some(img => img && img.data)
  if (!hasBase64) {
    verbose(`Skipping ${comicId}: no base64 data to remove`)
    return { status: 'skipped', reason: 'no_base64_data' }
  }
  
  if (config.dryRun) {
    log(`[DRY-RUN] Would remove base64 data from ${comicId}`)
    return { status: 'cleaned', dryRun: true }
  }
  
  // Remove base64 data from each size
  const collection = db.collection('cover_images')
  
  const unsetFields = {}
  for (const size of VALID_SIZES) {
    if (images[size] && images[size].data) {
      unsetFields[`images.${size}.data`] = ''
    }
  }
  
  await collection.updateOne(
    { comicId },
    {
      $unset: unsetFields,
      $set: {
        legacyRemoved: true,
        legacyRemovedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  )
  
  verbose(`Cleaned up ${comicId}`)
  return { status: 'cleaned' }
}

/**
 * Process a batch of documents with concurrency control
 */
async function processBatch(db, s3Client, documents) {
  const results = {
    cleaned: 0,
    skipped: 0,
    failed: 0,
    skipReasons: {},
  }
  
  // Process with concurrency limit for S3 verification
  const chunks = []
  for (let i = 0; i < documents.length; i += config.concurrency) {
    chunks.push(documents.slice(i, i + config.concurrency))
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (doc) => {
      try {
        const result = await cleanupDocument(db, s3Client, doc)
        return { comicId: doc.comicId, ...result }
      } catch (error) {
        return { comicId: doc.comicId, status: 'failed', error: error.message }
      }
    })
    
    const chunkResults = await Promise.all(promises)
    
    for (const result of chunkResults) {
      if (result.status === 'cleaned') {
        results.cleaned++
      } else if (result.status === 'skipped') {
        results.skipped++
        results.skipReasons[result.reason] = (results.skipReasons[result.reason] || 0) + 1
      } else if (result.status === 'failed') {
        results.failed++
        log(`Failed to cleanup ${result.comicId}: ${result.error}`)
      }
    }
  }
  
  return results
}


/**
 * Main cleanup function
 */
async function runCleanup() {
  log('Starting legacy image cleanup...')
  log('Configuration:', config)
  
  const s3Client = getS3Client()
  
  if (config.verifyS3 && !s3Client.isConfigured()) {
    console.error('Error: S3 is not configured but --verify-s3 was specified')
    process.exit(1)
  }
  
  // Connect to MongoDB
  const client = new MongoClient(getMongoDBUri())
  await client.connect()
  const db = client.db(getDatabaseName())
  
  log(`Connected to database: ${getDatabaseName()}`)
  
  const totals = {
    processed: 0,
    cleaned: 0,
    skipped: 0,
    failed: 0,
    skipReasons: {},
  }
  
  try {
    const collection = db.collection('cover_images')
    
    // Query for migrated documents that haven't been cleaned up
    const query = {
      migratedAt: { $exists: true },
      legacyRemoved: { $ne: true },
    }
    
    const totalCount = await collection.countDocuments(query)
    log(`Found ${totalCount} documents to process`)
    
    // Process in batches
    let cursor = collection.find(query).sort({ _id: 1 }).batchSize(config.batchSize)
    let batch = []
    
    for await (const doc of cursor) {
      batch.push(doc)
      
      if (batch.length >= config.batchSize) {
        const results = await processBatch(db, s3Client, batch)
        
        totals.processed += batch.length
        totals.cleaned += results.cleaned
        totals.skipped += results.skipped
        totals.failed += results.failed
        
        // Merge skip reasons
        for (const [reason, count] of Object.entries(results.skipReasons)) {
          totals.skipReasons[reason] = (totals.skipReasons[reason] || 0) + count
        }
        
        log(`Progress: ${totals.processed}/${totalCount} (${totals.cleaned} cleaned, ${totals.skipped} skipped, ${totals.failed} failed)`)
        
        batch = []
      }
    }
    
    // Process remaining documents
    if (batch.length > 0) {
      const results = await processBatch(db, s3Client, batch)
      
      totals.processed += batch.length
      totals.cleaned += results.cleaned
      totals.skipped += results.skipped
      totals.failed += results.failed
      
      for (const [reason, count] of Object.entries(results.skipReasons)) {
        totals.skipReasons[reason] = (totals.skipReasons[reason] || 0) + count
      }
    }
    
    // Print summary
    log('\n' + '='.repeat(50))
    log('Cleanup Summary:')
    log(`  Total processed: ${totals.processed}`)
    log(`  Successfully cleaned: ${totals.cleaned}`)
    log(`  Skipped: ${totals.skipped}`)
    log(`  Failed: ${totals.failed}`)
    
    if (Object.keys(totals.skipReasons).length > 0) {
      log('\nSkip reasons:')
      for (const [reason, count] of Object.entries(totals.skipReasons)) {
        log(`  ${reason}: ${count}`)
      }
    }
    
    if (config.dryRun) {
      log('\n[DRY-RUN] No changes were made.')
    }
    
    log('='.repeat(50))
    
  } finally {
    await client.close()
  }
}

// Run cleanup
runCleanup().catch((error) => {
  console.error('Cleanup failed:', error)
  process.exit(1)
})
