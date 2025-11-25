#!/usr/bin/env node

/**
 * Production feature test script
 * Tests various components of the comic covers system
 */

import fetch from 'node-fetch'

const FRONTEND_URL = 'http://localhost:5173'
const BACKEND_URL = 'http://localhost:3001'

async function testFrontendServer() {
  console.log('🌐 Testing Frontend Server...')
  try {
    const response = await fetch(FRONTEND_URL)
    if (response.ok) {
      console.log('✅ Frontend server is running')
      return true
    } else {
      console.log('❌ Frontend server returned:', response.status)
      return false
    }
  } catch (error) {
    console.log('❌ Frontend server not accessible:', error.message)
    return false
  }
}

async function testBackendServer() {
  console.log('🔧 Testing Backend Server...')
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`)
    if (response.ok) {
      console.log('✅ Backend server is running')
      return true
    } else {
      console.log('❌ Backend server returned:', response.status)
      return false
    }
  } catch (error) {
    console.log('❌ Backend server not accessible:', error.message)
    return false
  }
}

async function testMongoDBConnection() {
  console.log('🗄️ Testing MongoDB Connection...')
  try {
    const response = await fetch(`${BACKEND_URL}/api/images/stats`)
    const data = await response.json()
    
    if (response.ok && data.success) {
      console.log('✅ MongoDB connection working')
      console.log('   Database stats:', data.stats)
      return true
    } else {
      console.log('❌ MongoDB connection failed:', data.error || data.details)
      console.log('   This is expected if using MongoDB Atlas without proper configuration')
      return false
    }
  } catch (error) {
    console.log('❌ MongoDB test failed:', error.message)
    return false
  }
}

async function testCoverAPIService() {
  console.log('🎨 Testing Cover API Service...')
  try {
    const response = await fetch(`${BACKEND_URL}/api/cover-proxy/comicvine/search?series=Spider-Man&issue=1`)
    
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.results) {
        console.log('✅ Cover API service working')
        console.log(`   Found ${data.results.length} covers`)
        return true
      } else {
        console.log('❌ Cover API returned no results:', data.error)
        return false
      }
    } else {
      console.log('❌ Cover API service failed:', response.status)
      return false
    }
  } catch (error) {
    console.log('❌ Cover API test failed:', error.message)
    return false
  }
}

async function testEnvironmentConfig() {
  console.log('⚙️ Testing Environment Configuration...')
  
  // Check if Comic Vine API key is configured
  const hasComicVineKey = process.env.VITE_COMICVINE_API_KEY && process.env.VITE_COMICVINE_API_KEY.length > 10
  console.log(hasComicVineKey ? '✅ Comic Vine API key configured' : '❌ Comic Vine API key missing or invalid')
  
  // Check MongoDB URI
  const mongoUri = process.env.MONGODB_URI
  if (mongoUri) {
    if (mongoUri.includes('mongodb+srv://')) {
      console.log('✅ MongoDB Atlas URI configured')
    } else if (mongoUri.includes('localhost')) {
      console.log('⚠️ Local MongoDB URI configured (may not work in production)')
    } else {
      console.log('✅ Custom MongoDB URI configured')
    }
  } else {
    console.log('❌ MongoDB URI not configured')
  }
  
  return { hasComicVineKey, hasMongoUri: !!mongoUri }
}

async function runProductionTests() {
  console.log('🚀 Running Production Feature Tests...\n')
  
  const results = {
    frontend: false,
    backend: false,
    mongodb: false,
    coverAPI: false,
    environment: {}
  }
  
  // Test environment configuration
  results.environment = await testEnvironmentConfig()
  console.log()
  
  // Test servers
  results.frontend = await testFrontendServer()
  results.backend = await testBackendServer()
  console.log()
  
  // Test database connection
  if (results.backend) {
    results.mongodb = await testMongoDBConnection()
    console.log()
  }
  
  // Test cover API
  if (results.backend && results.environment.hasComicVineKey) {
    results.coverAPI = await testCoverAPIService()
    console.log()
  }
  
  // Summary
  console.log('📊 Test Results Summary:')
  console.log('=' .repeat(40))
  console.log(`Frontend Server:     ${results.frontend ? '✅ Working' : '❌ Failed'}`)
  console.log(`Backend Server:      ${results.backend ? '✅ Working' : '❌ Failed'}`)
  console.log(`MongoDB Connection:  ${results.mongodb ? '✅ Working' : '❌ Failed'}`)
  console.log(`Cover API Service:   ${results.coverAPI ? '✅ Working' : '❌ Failed'}`)
  console.log(`Comic Vine API Key:  ${results.environment.hasComicVineKey ? '✅ Configured' : '❌ Missing'}`)
  
  console.log('\n🎯 Production Readiness:')
  
  if (results.frontend && results.backend) {
    console.log('✅ Core application is ready')
    
    if (results.mongodb) {
      console.log('✅ Full backend storage available')
    } else {
      console.log('⚠️ Backend storage not available - local storage only')
      console.log('   To enable: Configure MongoDB Atlas URI in .env file')
    }
    
    if (results.coverAPI) {
      console.log('✅ Automatic cover fetching available')
    } else {
      console.log('⚠️ Cover API not available - manual upload only')
      console.log('   To enable: Check Comic Vine API key configuration')
    }
  } else {
    console.log('❌ Core application has issues - check server configuration')
  }
  
  console.log('\n📋 Next Steps:')
  if (!results.mongodb) {
    console.log('1. Configure MongoDB Atlas URI in .env file')
    console.log('2. Restart backend server: npm run server')
  }
  if (!results.coverAPI) {
    console.log('3. Verify Comic Vine API key in .env file')
  }
  console.log('4. Open http://localhost:5173 to test the application')
  console.log('5. Use the "🧪 Test Errors" tab to test error handling')
}

// Load environment variables
import dotenv from 'dotenv'
dotenv.config()

// Run tests
runProductionTests().catch(console.error)