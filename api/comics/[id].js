/**
 * RESTful endpoint for individual comic operations
 * GET /api/comics/[id] - Get a specific comic
 * PUT /api/comics/[id] - Update a specific comic  
 * DELETE /api/comics/[id] - Delete a specific comic
 */

import { MongoClient, ObjectId } from 'mongodb'
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

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

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
    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    // Parse as ObjectId
    if (!ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comic ID format'
      })
    }
    
    const comic = await collection.findOne({ _id: new ObjectId(id) })
    
    if (!comic) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }
    
    // Normalize the comic data
    const normalizedComic = {
      ...comic,
      // Convert ObjectId to string for frontend
      id: comic._id.toString(),
      series: String(comic.series || ''),
      issueNumber: String(comic.issueNumber || ''),
      publisher: comic.publisher ? String(comic.publisher) : comic.publisher
    }
    
    return res.status(200).json({
      success: true,
      comic: normalizedComic
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

    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    // Parse as ObjectId
    if (!ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comic ID format'
      })
    }
    
    // Normalize data types for consistency
    const normalizedComic = {
      ...comic,
      series: String(comic.series || ''),
      issueNumber: String(comic.issueNumber || ''),
      publisher: comic.publisher ? String(comic.publisher) : comic.publisher,
      year: comic.year && !isNaN(comic.year) ? Number(comic.year) : comic.year,
      updatedAt: new Date().toISOString()
    }
    
    // Remove MongoDB _id and id fields to prevent immutable field error
    const { _id, id: comicId, ...comicWithoutId } = normalizedComic
    
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: comicWithoutId }
    )
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }
    
    // Fetch the updated comic to return
    const updatedComic = await collection.findOne({ _id: new ObjectId(id) })
    
    return res.status(200).json({
      success: true,
      comic: {
        ...updatedComic,
        // Convert ObjectId to string for frontend
        id: updatedComic._id.toString()
      },
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
    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    // Parse as ObjectId
    if (!ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comic ID format'
      })
    }
    
    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Comic not found'
      })
    }
    
    return res.status(200).json({
      success: true,
      message: 'Comic deleted successfully'
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