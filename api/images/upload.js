/**
 * Dedicated Image Upload API endpoint
 * POST /api/images/upload
 * 
 * Handles image uploads to S3 (with MongoDB fallback) using multipart/form-data
 * or by downloading from a provided imageUrl (ComicVine flow).
 * 
 * Supports two upload modes:
 * 1. File upload: multipart/form-data with image file
 * 2. URL download: JSON body with imageUrl field (ComicVine flow)
 */

import Busboy from 'busboy'
import sharp from 'sharp'
import { MongoClient, ObjectId } from 'mongodb'
import { storeCoverImages } from '../db-image-storage.js'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { getS3Client } from '../s3-client.js'
import { serializeS3Reference } from '../s3-serialization.js'
import { requireAuth } from '../auth.js'
import { getComic, attachCoverAsset } from '../lib/comics.js'
import { createAsset, findAssetByIdentityKey } from '../lib/coverAssets.js'

let client
let db

async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    client = new MongoClient(getMongoDBUri())
    await client.connect()
    db = client.db(getDatabaseName())
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for multipart
  },
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    })
  }

  try {
    // Determine content type and parse accordingly
    const contentType = req.headers['content-type'] || ''
    let imageBuffer, comicId, metadata
    
    if (contentType.includes('multipart/form-data')) {
      // File upload mode
      const parsed = await parseMultipartForm(req)
      imageBuffer = parsed.imageBuffer
      comicId = parsed.comicId
      metadata = parsed.metadata
    } else if (contentType.includes('application/json')) {
      // URL download mode (ComicVine flow)
      const body = await parseJsonBody(req)
      comicId = body.comicId
      metadata = body.metadata || {}
      
      if (body.imageUrl) {
        console.log(`[Upload] Downloading image from URL: ${body.imageUrl}`)
        imageBuffer = await downloadImage(body.imageUrl)
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported content type. Use multipart/form-data or application/json.'
      })
    }
    
    if (!comicId || !imageBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: comicId and image (file or imageUrl)'
      })
    }

    const database = await connectToDatabase()
    const comic = ObjectId.isValid(comicId)
      ? await getComic(database, { userId: req.userId, comicId })
      : null
    if (!comic) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found in your collection'
      })
    }

    console.log(`[Upload] Starting upload for comic: ${comicId}`)
    console.log(`[Upload] Image buffer size: ${imageBuffer.length} bytes`)

    const isReplacement = !!comic.coverAssetId

    // Process image into size variants using sharp
    const processedBuffers = await processImageBuffers(imageBuffer)

    console.log(`[Upload] Processed images:`, {
      sizes: Object.keys(processedBuffers),
      totalSize: Object.values(processedBuffers).reduce((sum, buf) => sum + buf.length, 0)
    })

    // The uploaded bytes always become a new asset (the user explicitly
    // chose this image) — only claim the shared identityKey if nobody has
    // claimed it yet, so a future account adding this issue can reuse it.
    // Replacing an existing cover always creates a private asset
    // (identityKey: null) so other accounts' covers are unaffected
    // (copy-on-write).
    let claimIdentityKey = null
    if (!isReplacement) {
      const existingSharedAsset = await findAssetByIdentityKey(database, comic.identityKey)
      claimIdentityKey = existingSharedAsset ? null : comic.identityKey
    }

    const assetId = new ObjectId()
    const storageKey = assetId.toString()

    // Try S3 upload first, fall back to MongoDB
    const s3Client = getS3Client()
    let storageType = 'MongoDB'
    let imageData = {}

    if (s3Client.isConfigured()) {
      console.log(`[Upload] S3 configured, uploading to S3...`)
      storageType = 'S3'

      // Upload all size variants to S3
      for (const [sizeName, buffer] of Object.entries(processedBuffers)) {
        if (sizeName === 'original') continue // Skip original for S3

        const s3Ref = await s3Client.uploadImage(storageKey, sizeName, buffer, 'image/jpeg')
        imageData[sizeName] = serializeS3Reference(s3Ref)
        console.log(`[Upload] Uploaded ${sizeName} to S3: ${s3Ref.key}`)
      }
    } else {
      console.log(`[Upload] S3 not configured, using MongoDB storage`)
      // Fall back to MongoDB base64 storage
      for (const [sizeName, buffer] of Object.entries(processedBuffers)) {
        imageData[sizeName] = {
          data: buffer.toString('base64'),
          mimeType: 'image/jpeg',
          size: buffer.length
        }
      }
    }

    // Store the actual bytes/refs keyed by the new asset id
    await storeCoverImages(storageKey, imageData, {
      source: metadata?.source || 'upload',
      ...metadata,
      storageType,
      uploadedAt: new Date().toISOString()
    })

    // Register the asset (identity + reuse layer) and point only this
    // account's comic at it
    const asset = await createAsset(database, { _id: assetId, identityKey: claimIdentityKey })
    await attachCoverAsset(database, { userId: req.userId, comicId, assetId: asset._id })

    // Volume info from the cover search result, if any — purely
    // informational, so this doesn't touch identityKey/coverAssetId
    if (metadata.volumeId || metadata.volumeName) {
      await database.collection('comics').updateOne(
        { _id: new ObjectId(comicId), userId: req.userId },
        { $set: {
          ...(metadata.volumeId && { volumeId: metadata.volumeId }),
          ...(metadata.volumeName && { volumeName: metadata.volumeName }),
          updatedAt: new Date().toISOString(),
        } }
      )
    }

    console.log(`[Upload] Image upload successful for comic: ${comicId}, storage: ${storageType}`)

    return res.status(200).json({
      success: true,
      comicId,
      coverAssetId: asset._id.toString(),
      storage: storageType,
      message: 'Image uploaded successfully'
    })
  } catch (error) {
    console.error('Image upload error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      details: error.message
    })
  }
}


/**
 * Parse JSON body from request
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

const ALLOWED_IMAGE_DOMAINS = [
  'comicvine.gamespot.com',
  'static.comicvine.com',
  'covers.openlibrary.org',
]

/**
 * Download image from URL
 */
async function downloadImage(url) {
  const MAX_REDIRECTS = 5
  let currentUrl = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let urlObj
    try {
      urlObj = new URL(currentUrl)
    } catch {
      throw new Error('Invalid image URL')
    }

    if (!ALLOWED_IMAGE_DOMAINS.includes(urlObj.hostname)) {
      throw new Error(`Image domain not allowed: ${urlObj.hostname}`)
    }

    const response = await fetch(currentUrl, { redirect: 'manual' })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirect with no Location header')
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  throw new Error('Too many redirects')
}

/**
 * Parse multipart form data
 */
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers })
    
    let imageBuffer = null
    let comicId = null
    let metadata = {}
    
    busboy.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info
      console.log(`[Upload] Receiving file: ${filename}, type: ${mimeType}`)
      
      const chunks = []
      file.on('data', (chunk) => {
        chunks.push(chunk)
      })
      
      file.on('end', () => {
        imageBuffer = Buffer.concat(chunks)
        console.log(`[Upload] File received: ${imageBuffer.length} bytes`)
      })
    })
    
    busboy.on('field', (fieldname, value) => {
      if (fieldname === 'comicId') {
        comicId = value
      } else if (fieldname === 'metadata') {
        try {
          metadata = JSON.parse(value)
          console.log('[Upload] Received metadata:', metadata)
        } catch (e) {
          console.warn('Failed to parse metadata:', e)
        }
      }
    })
    
    busboy.on('finish', () => {
      resolve({ imageBuffer, comicId, metadata })
    })
    
    busboy.on('error', (error) => {
      reject(error)
    })
    
    req.pipe(busboy)
  })
}

/**
 * Process image into multiple size buffers using sharp
 * Returns raw buffers (not base64) for S3 upload
 */
async function processImageBuffers(imageBuffer) {
  // Canonical size definitions — must stay in sync with src/config/imageConfig.js
  const sizes = {
    thumbnail: { width: 150, height: 225 },
    medium: { width: 300, height: 450 },
    full: { width: 600, height: 900 }
  }
  
  const processedBuffers = {}
  
  // Process each size
  for (const [sizeName, dimensions] of Object.entries(sizes)) {
    const processed = await sharp(imageBuffer)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer()
    
    processedBuffers[sizeName] = processed
  }
  
  // Also store original (but compressed)
  const original = await sharp(imageBuffer)
    .jpeg({ quality: 90 })
    .toBuffer()
  
  processedBuffers.original = original
  
  return processedBuffers
}
