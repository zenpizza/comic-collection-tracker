/**
 * Comics API endpoint - handles all comic operations with MongoDB
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from './config.js'
import { requireAuth } from './auth.js'
import { getOrCreateAccount } from './lib/accounts.js'
import { addComic, listComics, DuplicateComicError } from './lib/comics.js'

let client
let db

/**
 * Connect to MongoDB database
 */
async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    const uri = getMongoDBUri()
    const dbName = getDatabaseName()

    client = new MongoClient(uri)
    await client.connect()
    db = client.db(dbName)

    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  try {
    switch (req.method) {
      case 'GET':
        return handleGetComics(req, res)
      case 'POST':
        return handleCreateComic(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Comics API Error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

async function handleGetComics(req, res) {
  try {
    const database = await connectToDatabase()

    // Lazily create the account record on first authenticated request
    await getOrCreateAccount(database, { userId: req.userId, email: req.userEmail })

    const comics = await listComics(database, req.userId)

    return res.status(200).json({
      success: true,
      comics
    })
  } catch (error) {
    console.error('Error fetching comics:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch comics',
      details: error.message
    })
  }
}

async function handleCreateComic(req, res) {
  try {
    const comic = req.body

    if (!comic) {
      return res.status(400).json({
        success: false,
        error: 'Comic data is required'
      })
    }

    const database = await connectToDatabase()
    const created = await addComic(database, { userId: req.userId, comic })

    return res.status(201).json({
      success: true,
      comic: created,
      message: 'Comic created successfully'
    })
  } catch (error) {
    if (error instanceof DuplicateComicError) {
      return res.status(409).json({
        success: false,
        error: error.message
      })
    }

    console.error('Error creating comic:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to create comic',
      details: error.message
    })
  }
}
