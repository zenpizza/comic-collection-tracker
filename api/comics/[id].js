/**
 * RESTful endpoint for individual comic operations
 * GET /api/comics/[id] - Get a specific comic
 * PUT /api/comics/[id] - Update a specific comic
 * DELETE /api/comics/[id] - Delete a specific comic
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'
import { getComic, updateComic, removeComic, DuplicateComicError } from '../lib/comics.js'

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
    const comic = await getComic(database, { userId: req.userId, comicId: id })

    if (!comic) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }

    return res.status(200).json({ success: true, comic })
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
    const updated = await updateComic(database, { userId: req.userId, comicId: id, updates: comic })

    return res.status(200).json({
      success: true,
      comic: updated,
      message: 'Comic updated successfully'
    })
  } catch (error) {
    if (error instanceof DuplicateComicError) {
      return res.status(409).json({ success: false, error: error.message })
    }
    if (error.message === 'Comic not found in this account\'s collection') {
      return res.status(404).json({ success: false, error: 'Comic not found' })
    }

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
    const deleted = await removeComic(database, { userId: req.userId, comicId: id })

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }

    // Shared cover assets are intentionally left in place — see COM-45
    // (garbage collection is deferred; an asset with no remaining
    // references is harmless to leave around for now).

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
