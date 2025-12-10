/**
 * Dedicated Image Upload API endpoint
 * POST /api/images/upload
 * 
 * Handles image uploads to MongoDB storage using multipart/form-data
 */

import Busboy from 'busboy'
import sharp from 'sharp'
import { MongoClient, ObjectId } from 'mongodb'
import { storeCoverImages } from '../db-image-storage.js'
import { getMongoDBUri, getDatabaseName } from '../config.js'

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

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    })
  }

  try {
    const { imageBuffer, comicId, metadata } = await parseMultipartForm(req)
    
    if (!comicId || !imageBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: comicId and image file'
      })
    }
    
    console.log(`[Upload] Starting upload for comic: ${comicId}`)
    console.log(`[Upload] Image buffer size: ${imageBuffer.length} bytes`)
    
    // Process image into size variants using sharp
    const processedImages = await processImageSizes(imageBuffer)
    
    console.log(`[Upload] Processed images:`, {
      sizes: Object.keys(processedImages),
      totalSize: Object.values(processedImages).reduce((sum, img) => sum + img.size, 0)
    })
    
    // Store the image in MongoDB
    const result = await storeCoverImages(comicId, processedImages, {
      source: metadata?.source || 'upload',
      ...metadata,
      uploadedAt: new Date().toISOString()
    })
    
    console.log(`[Upload] Image upload successful for comic: ${comicId}, result: ${result}`)
    
    // Update the comic's hasCover flag
    try {
      const database = await connectToDatabase()
      const comicsCollection = database.collection('comics')
      
      if (ObjectId.isValid(comicId) && comicId.length === 24) {
        // Prepare update fields
        const updateFields = {
          hasCover: true,
          coverLastUpdated: new Date().toISOString()
        }
        
        // Add volume metadata if provided (these belong on comic record)
        if (metadata.volumeId) {
          updateFields.volumeId = metadata.volumeId
        }
        if (metadata.volumeName) {
          updateFields.volumeName = metadata.volumeName
        }
        
        // Note: Cover-specific metadata (coverSource, coverSourceProvider, 
        // coverOriginalUrl, coverAttribution) is stored in cover_images collection,
        // not on the comic record. Only hasCover, coverLastUpdated, and volume
        // metadata belong on the comic record.
        
        await comicsCollection.updateOne(
          { _id: new ObjectId(comicId) },
          { $set: updateFields }
        )
        console.log(`[Upload] Updated comic metadata for: ${comicId}`, updateFields)
      }
    } catch (error) {
      console.warn(`[Upload] Failed to update hasCover flag:`, error.message)
      // Don't fail the upload if this fails
    }
    
    return res.status(200).json({
      success: true,
      imageId: result,
      comicId: comicId,
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
 * Process image into multiple sizes using sharp
 */
async function processImageSizes(imageBuffer) {
  const sizes = {
    thumbnail: { width: 150, height: 225 },
    medium: { width: 300, height: 450 },
    full: { width: 300, height: 450 }
  }
  
  const processedImages = {}
  
  // Process each size
  for (const [sizeName, dimensions] of Object.entries(sizes)) {
    const processed = await sharp(imageBuffer)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer()
    
    processedImages[sizeName] = {
      data: processed.toString('base64'),
      mimeType: 'image/jpeg',
      size: processed.length
    }
  }
  
  // Also store original (but compressed)
  const original = await sharp(imageBuffer)
    .jpeg({ quality: 90 })
    .toBuffer()
  
  processedImages.original = {
    data: original.toString('base64'),
    mimeType: 'image/jpeg',
    size: original.length
  }
  
  return processedImages
}