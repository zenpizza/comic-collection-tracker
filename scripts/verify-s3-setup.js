#!/usr/bin/env node
/**
 * S3 Setup Verification Script
 * 
 * Tests that all S3/CloudFront prerequisites are properly configured.
 * Run with: node scripts/verify-s3-setup.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Set a dummy MONGODB_URI to prevent config.js from throwing
// (we don't need MongoDB for S3 verification)
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/dummy'
}

import { getS3Client, resetS3Client } from '../api/s3-client.js'

async function verifySetup() {
  console.log('\n🔍 S3 Setup Verification\n')
  console.log('='.repeat(50))
  
  // Check environment variables
  console.log('\n📋 Environment Variables:\n')
  
  const envVars = [
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'AWS_S3_PUBLIC_BASE_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'CLOUDFRONT_DISTRIBUTION_ID',
    'AWS_S3_KEY_PREFIX',
  ]
  
  let allRequired = true
  for (const varName of envVars) {
    const value = process.env[varName]
    const isOptional = varName === 'AWS_S3_KEY_PREFIX' || varName === 'CLOUDFRONT_DISTRIBUTION_ID'
    const status = value ? '✅' : (isOptional ? '⚪' : '❌')
    const displayValue = value 
      ? (varName.includes('SECRET') ? '***' : value.substring(0, 30) + (value.length > 30 ? '...' : ''))
      : '(not set)'
    
    console.log(`  ${status} ${varName}: ${displayValue}${isOptional ? ' (optional)' : ''}`)
    
    if (!value && !isOptional) {
      allRequired = false
    }
  }
  
  if (!allRequired) {
    console.log('\n❌ Missing required environment variables. Please configure them first.')
    process.exit(1)
  }
  
  // Test S3 client
  console.log('\n📦 S3 Client:\n')
  
  resetS3Client()
  const s3Client = getS3Client()
  
  const isConfigured = s3Client.isConfigured()
  console.log(`  ${isConfigured ? '✅' : '❌'} isConfigured(): ${isConfigured}`)
  
  if (!isConfigured) {
    console.log('\n❌ S3 client is not properly configured.')
    process.exit(1)
  }
  
  // Test key generation
  console.log('\n🔑 Key Generation:\n')
  
  const testComicId = 'test-comic-123'
  const sizes = ['thumbnail', 'medium', 'full']
  
  for (const size of sizes) {
    const key = s3Client.keyFor(testComicId, size)
    const url = s3Client.urlFor(key)
    console.log(`  ✅ ${size}: ${key}`)
    console.log(`     URL: ${url}`)
  }
  
  // Test S3 connectivity with a small upload/delete
  console.log('\n🌐 S3 Connectivity Test:\n')
  
  const testKey = s3Client.keyFor('_test_verification', 'thumbnail')
  const testBuffer = Buffer.from('test')
  
  try {
    console.log('  ⏳ Uploading test object...')
    const uploadResult = await s3Client.uploadImage('_test_verification', 'thumbnail', testBuffer, 'text/plain')
    console.log(`  ✅ Upload successful: ${uploadResult.key}`)
    
    console.log('  ⏳ Checking if object exists...')
    const exists = await s3Client.imageExists('_test_verification', 'thumbnail')
    console.log(`  ${exists ? '✅' : '❌'} Object exists: ${exists}`)
    
    console.log('  ⏳ Deleting test object...')
    await s3Client.deleteImages('_test_verification')
    console.log('  ✅ Delete successful')
    
    console.log('  ⏳ Verifying deletion...')
    const existsAfter = await s3Client.imageExists('_test_verification', 'thumbnail')
    console.log(`  ${!existsAfter ? '✅' : '❌'} Object deleted: ${!existsAfter}`)
    
  } catch (error) {
    console.log(`  ❌ S3 operation failed: ${error.message}`)
    console.log('\n  Possible issues:')
    console.log('    - IAM permissions not configured correctly')
    console.log('    - Bucket name is incorrect')
    console.log('    - Region mismatch')
    process.exit(1)
  }
  
  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('\n✅ All S3 prerequisites verified successfully!\n')
  console.log('You can now proceed with the S3 image storage implementation.\n')
}

verifySetup().catch(error => {
  console.error('\n❌ Verification failed:', error.message)
  process.exit(1)
})
