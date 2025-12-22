#!/usr/bin/env node
/**
 * Migration Script: MongoDB Base64 Images to S3
 * 
 * Migrates existing base64-encoded images from MongoDB to S3 storage.
 * Preserves legacy data and supports resumable execution.
 * 
 * Usage:
 *   node scripts/migrate-images-to-s3.js [options]
 * 
 * Options:
 *   --dry-run           Preview changes without writing to S3 or MongoDB
 *   --concurrency <n>   Number of concurrent uploads (default: 5)
 *   --resume            Resume from last checkpoint
 *   --only <comicId>    Migrate a single comic (for testing)
 *   --batch-size <n>    Documents per batch (default: 100)
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

// Set dummy MONGODB_URI if not set (for config.js)
if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required')
  process.exit(1)
}

import { getS3Client } from '../api/s3-client.js'
import { serializeS3Reference } from '../api/s3-serialization.js'
import { getMongoDBUri, getDatabaseName } from '../api/config.js'

const program = new Command()

program
  .name('migrate-images-to-s3')
  .description('Migrate MongoDB base64 images to S3 storage')
  .option('--dry-run', 'Preview changes without writing')
  .option('--concurrency <n>', 'Concurrent uploads', '5')
  .option('--resume', 'Resume from last checkpoint')
  .option('--only <comicId>', 'Migrate single comic')
  .option('--batch-size <n>', 'Documents per batch', '100')
  .option('--verbose', 'Enable detailed logging')
  .parse()

const options = program.opts()

// Configuration
const config = {
  dryRun: options.dryRun || false,
  concurrency: parseInt(options.concurrency, 10),
  resume: options.resume || false,
  onlyComicId: options.only || null,
  batchSize: parseInt(options.batchSize, 10),
  verbose: options.verbose || false,
}

function log(...args) {
  console.log('[Migration]', ...args)
}

function verbose(...args) {
  if (config.verbose) {
    console.log('[Migration:Verbose]', ...args)
  }
}


/**
 * Get or create migration checkpoint
 */
async function getCheckpoint(db) {
  const collection = db.collection('migrations')
  let checkpoint = await collection.findOne({ name: 'images-to-s3' })
  
  if (!checkpoint) {
    checkpoint = {
      name: 'images-to-s3',
      status: 'not_started',
      lastProcessedId: null,
      totalDocuments: 0,
      migratedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failedIds: [],
      startedAt: null,
      updatedAt: null,
      completedAt: null,
    }
  }
  
  return checkpoint
}

/**
 * Update migration checkpoint
 */
async function updateCheckpoint(db, updates) {
  const collection = db.collection('migrations')
  await collection.updateOne(
    { name: 'images-to-s3' },
    { 
      $set: { 
        ...updates, 
        updatedAt: new Date().toISOString() 
      } 
    },
    { upsert: true }
  )
}

/**
 * Migrate a single document
 */
async function migrateDocument(db, s3Client, doc) {
  const comicId = doc.comicId
  const images = doc.images
  
  if (!images || typeof images !== 'object') {
    verbose(`Skipping ${comicId}: no images object`)
    return { status: 'skipped', reason: 'no_images' }
  }
  
  // Check if already migrated (has S3 URLs)
  const hasS3Refs = Object.values(images).some(img => img && img.url && img.key)
  if (hasS3Refs) {
    verbose(`Skipping ${comicId}: already has S3 references`)
    return { status: 'skipped', reason: 'already_migrated' }
  }
  
  // Check if has base64 data
  const hasBase64 = Object.values(images).some(img => img && img.data)
  if (!hasBase64) {
    verbose(`Skipping ${comicId}: no base64 data`)
    return { status: 'skipped', reason: 'no_base64_data' }
  }
  
  const s3Refs = {}
  const sizes = ['thumbnail', 'medium', 'full']
  
  for (const size of sizes) {
    const sizeData = images[size]
    if (!sizeData || !sizeData.data) {
      verbose(`Skipping ${comicId}/${size}: no data`)
      continue
    }
    
    // Convert base64 to buffer
    const buffer = Buffer.from(sizeData.data, 'base64')
    const contentType = sizeData.mimeType || 'image/jpeg'
    
    if (config.dryRun) {
      log(`[DRY-RUN] Would upload ${comicId}/${size} (${buffer.length} bytes)`)
      s3Refs[size] = {
        key: s3Client.keyFor(comicId, size),
        url: s3Client.urlFor(s3Client.keyFor(comicId, size)),
        contentType,
        size: buffer.length,
        etag: 'dry-run',
        uploadedAt: new Date().toISOString(),
      }
    } else {
      // Upload to S3
      const s3Ref = await s3Client.uploadImage(comicId, size, buffer, contentType)
      s3Refs[size] = serializeS3Reference(s3Ref)
      verbose(`Uploaded ${comicId}/${size}: ${s3Ref.key}`)
    }
  }
  
  if (Object.keys(s3Refs).length === 0) {
    return { status: 'skipped', reason: 'no_valid_sizes' }
  }
  
  // Update MongoDB document with S3 refs (preserve base64 data)
  if (!config.dryRun) {
    const collection = db.collection('cover_images')
    
    // Merge S3 refs into existing images (preserve base64 data)
    const updatedImages = {}
    for (const size of sizes) {
      if (images[size]) {
        updatedImages[size] = {
          ...images[size], // Keep existing base64 data
          ...s3Refs[size], // Add S3 refs
        }
      }
    }
    
    await collection.updateOne(
      { comicId },
      { 
        $set: { 
          images: updatedImages,
          migratedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } 
      }
    )
  } else {
    log(`[DRY-RUN] Would update MongoDB for ${comicId}`)
  }
  
  return { status: 'migrated', s3Refs }
}


/**
 * Process a batch of documents with concurrency control
 */
async function processBatch(db, s3Client, documents) {
  const results = {
    migrated: 0,
    skipped: 0,
    failed: 0,
    failedIds: [],
  }
  
  // Process with concurrency limit
  const chunks = []
  for (let i = 0; i < documents.length; i += config.concurrency) {
    chunks.push(documents.slice(i, i + config.concurrency))
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (doc) => {
      try {
        const result = await migrateDocument(db, s3Client, doc)
        return { comicId: doc.comicId, ...result }
      } catch (error) {
        return { comicId: doc.comicId, status: 'failed', error: error.message }
      }
    })
    
    const chunkResults = await Promise.all(promises)
    
    for (const result of chunkResults) {
      if (result.status === 'migrated') {
        results.migrated++
      } else if (result.status === 'skipped') {
        results.skipped++
      } else if (result.status === 'failed') {
        results.failed++
        results.failedIds.push(result.comicId)
        log(`Failed to migrate ${result.comicId}: ${result.error}`)
      }
    }
  }
  
  return results
}

/**
 * Main migration function
 */
async function runMigration() {
  log('Starting S3 migration...')
  log('Configuration:', config)
  
  // Check S3 configuration
  const s3Client = getS3Client()
  if (!s3Client.isConfigured()) {
    console.error('Error: S3 is not configured. Set AWS environment variables.')
    process.exit(1)
  }
  
  // Connect to MongoDB
  const client = new MongoClient(getMongoDBUri())
  await client.connect()
  const db = client.db(getDatabaseName())
  
  log(`Connected to database: ${getDatabaseName()}`)
  
  try {
    // Get or create checkpoint
    let checkpoint = await getCheckpoint(db)
    
    if (config.resume && checkpoint.status === 'in_progress') {
      log(`Resuming from checkpoint: ${checkpoint.lastProcessedId}`)
    } else {
      // Start fresh
      checkpoint = {
        ...checkpoint,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        migratedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failedIds: [],
      }
      await updateCheckpoint(db, checkpoint)
    }
    
    const collection = db.collection('cover_images')
    
    // Build query
    let query = {}
    
    if (config.onlyComicId) {
      query.comicId = config.onlyComicId
    } else if (config.resume && checkpoint.lastProcessedId) {
      query._id = { $gt: checkpoint.lastProcessedId }
    }
    
    // Count total documents
    const totalCount = await collection.countDocuments(query)
    log(`Found ${totalCount} documents to process`)
    
    if (!config.dryRun) {
      await updateCheckpoint(db, { totalDocuments: totalCount })
    }
    
    // Process in batches
    let processedCount = 0
    let cursor = collection.find(query).sort({ _id: 1 }).batchSize(config.batchSize)
    
    let batch = []
    
    for await (const doc of cursor) {
      batch.push(doc)
      
      if (batch.length >= config.batchSize) {
        const results = await processBatch(db, s3Client, batch)
        
        processedCount += batch.length
        checkpoint.migratedCount += results.migrated
        checkpoint.skippedCount += results.skipped
        checkpoint.failedCount += results.failed
        checkpoint.failedIds.push(...results.failedIds)
        checkpoint.lastProcessedId = batch[batch.length - 1]._id
        
        if (!config.dryRun) {
          await updateCheckpoint(db, checkpoint)
        }
        
        log(`Progress: ${processedCount}/${totalCount} (${checkpoint.migratedCount} migrated, ${checkpoint.skippedCount} skipped, ${checkpoint.failedCount} failed)`)
        
        batch = []
      }
    }
    
    // Process remaining documents
    if (batch.length > 0) {
      const results = await processBatch(db, s3Client, batch)
      
      processedCount += batch.length
      checkpoint.migratedCount += results.migrated
      checkpoint.skippedCount += results.skipped
      checkpoint.failedCount += results.failed
      checkpoint.failedIds.push(...results.failedIds)
    }
    
    // Mark as complete
    checkpoint.status = 'completed'
    checkpoint.completedAt = new Date().toISOString()
    
    if (!config.dryRun) {
      await updateCheckpoint(db, checkpoint)
    }
    
    // Print summary
    log('\n' + '='.repeat(50))
    log('Migration Summary:')
    log(`  Total processed: ${processedCount}`)
    log(`  Migrated: ${checkpoint.migratedCount}`)
    log(`  Skipped: ${checkpoint.skippedCount}`)
    log(`  Failed: ${checkpoint.failedCount}`)
    
    if (checkpoint.failedIds.length > 0) {
      log(`  Failed IDs: ${checkpoint.failedIds.join(', ')}`)
    }
    
    if (config.dryRun) {
      log('\n[DRY-RUN] No changes were made.')
    }
    
    log('='.repeat(50))
    
  } finally {
    await client.close()
  }
}

// Run migration
runMigration().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
