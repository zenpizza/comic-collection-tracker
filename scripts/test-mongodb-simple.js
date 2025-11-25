#!/usr/bin/env node

/**
 * Simple MongoDB connection test to identify issues quickly
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

// Load environment variables
dotenv.config()

async function testConnection() {
  console.log('🔍 Testing MongoDB connection...')
  
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment')
    process.exit(1)
  }

  console.log(`📡 Connecting to: ${process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`)

  let client
  try {
    // Set a shorter timeout for testing
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // 10 seconds
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000
    })

    console.log('⏳ Attempting connection...')
    await client.connect()
    console.log('✅ Connected to MongoDB!')

    const db = client.db('comic-collection')
    console.log(`📚 Database: ${db.databaseName}`)

    // Test basic operation
    console.log('🧪 Testing basic database operation...')
    const collections = await db.listCollections().toArray()
    console.log(`📋 Found ${collections.length} collections:`)
    collections.forEach(col => console.log(`   - ${col.name}`))

    // Test cover_images collection specifically
    console.log('🖼️ Testing cover_images collection...')
    const coverCollection = db.collection('cover_images')
    const count = await coverCollection.countDocuments()
    console.log(`📊 Cover images collection has ${count} documents`)

    console.log('🎉 All basic tests passed!')

  } catch (error) {
    console.error('❌ Connection failed:', error.message)
    
    if (error.name === 'MongoServerSelectionError') {
      console.error('🔧 This looks like a network/connection issue')
      console.error('   - Check if MongoDB Atlas is accessible')
      console.error('   - Verify IP whitelist settings')
      console.error('   - Check network connectivity')
    } else if (error.name === 'MongoAuthenticationError') {
      console.error('🔐 This looks like an authentication issue')
      console.error('   - Check username/password in connection string')
      console.error('   - Verify database user permissions')
    }
    
    process.exit(1)
  } finally {
    if (client) {
      console.log('🔌 Closing connection...')
      await client.close()
    }
  }
}

console.log('🚀 Starting simple MongoDB test...\n')
testConnection().catch(console.error)