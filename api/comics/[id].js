/**
 * RESTful endpoint for individual comic operations
 * GET /api/comics/[id] - Get a specific comic
 * PUT /api/comics/[id] - Update a specific comic  
 * DELETE /api/comics/[id] - Delete a specific comic
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { getCoverImages, deleteCoverImages } from '../db-image-storage.js'
import { getS3Client } from '../s3-client.js'
import { isS3Reference } from '../s3-serialization.js'
import { requireAuth } from '../auth.js'
import {
  getCollectionItem,
  removeFromCollection,
  countCollectionsReferencing,
  upsertItem,
} from '../lib/userComics.js'

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

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  // Support both Vercel (req.query) and Express (req.params)
  const id = req.query?.id || req.params?.id

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Comic ID is required'
    })
  }

  try {
    switch (req.method) {
      case 'GET':
        return handleGetComic(req, res, id)
      case 'PUT':
        return handleUpdateComic(req, res, id)
      case 'DELETE':
        return handleDeleteComic(req, res, id)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Comic API Error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

async function handleGetComic(req, res, id) {
  try {
    if (!ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comic ID format'
      })
    }

    const database = await connectToDatabase()
    const item = await getCollectionItem(database, { userId: req.userId, userComicId: id })

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }

    const metadata = await database.collection('comicMetadata').findOne({ _id: item.comicMetadataId })

    return res.status(200).json({
      success: true,
      comic: {
        id: item._id.toString(),
        comicMetadataId: metadata._id.toString(),
        series: String(metadata.series || ''),
        issueNumber: String(metadata.issueNumber || ''),
        publisher: metadata.publisher,
        year: metadata.year,
        variant: metadata.variant,
        volumeId: metadata.volumeId,
        volumeName: metadata.volumeName,
        hasCover: metadata.hasCover,
        coverLastUpdated: metadata.coverLastUpdated,
        notes: item.notes,
        dateAdded: item.dateAdded
      }
    })
  } catch (error) {
    console.error('Error fetching comic:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch comic',
      details: error.message
    })
  }
}

async function handleUpdateComic(req, res, id) {
  try {
    const comic = req.body

    if (!comic) {
      return res.status(400).json({
        success: false,
        error: 'Comic data is required'
      })
    }

    if (!ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comic ID format'
      })
    }

    const database = await connectToDatabase()
    const existing = await getCollectionItem(database, { userId: req.userId, userComicId: id })

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }

    const updatedComic = await upsertItem(database, { userId: req.userId, userComicId: id, comic })

    return res.status(200).json({
      success: true,
      comic: updatedComic,
      message: 'Comic updated successfully'
    })
  } catch (error) {
    console.error('Error updating comic:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to update comic',
      details: error.message
    })
  }
}

async function handleDeleteComic(req, res, id) {
  try {
    if (!ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comic ID format'
      })
    }

    const database = await connectToDatabase()
    const item = await getCollectionItem(database, { userId: req.userId, userComicId: id })

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }

    const comicMetadataId = item.comicMetadataId.toString()

    await removeFromCollection(database, { userId: req.userId, userComicId: id })

    // The cover/metadata is shared — only clean it up once no account
    // references it anymore.
    const remainingReferences = await countCollectionsReferencing(database, comicMetadataId)
    if (remainingReferences === 0) {
      try {
        const coverData = await getCoverImages(comicMetadataId)
        const hasS3Refs = coverData?.images &&
          Object.values(coverData.images).some(img => isS3Reference(img))

        const s3Client = getS3Client()
        if (s3Client.isConfigured() && hasS3Refs) {
          try {
            await s3Client.deleteImages(comicMetadataId)
            console.log(`[Comic Delete] Deleted S3 images for metadata: ${comicMetadataId}`)
          } catch (s3Error) {
            console.warn(`[Comic Delete] S3 deletion warning for metadata ${comicMetadataId}:`, s3Error.message)
          }
        }

        await deleteCoverImages(comicMetadataId)
        console.log(`[Comic Delete] Deleted cover images from MongoDB for metadata: ${comicMetadataId}`)
      } catch (imageError) {
        console.warn(`Failed to delete cover images for metadata ${comicMetadataId}:`, imageError)
      }

      await database.collection('comicMetadata').deleteOne({ _id: item.comicMetadataId })
    }

    return res.status(200).json({
      success: true,
      message: 'Comic removed from collection successfully'
    })
  } catch (error) {
    console.error('Error deleting comic:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to delete comic',
      details: error.message
    })
  }
}