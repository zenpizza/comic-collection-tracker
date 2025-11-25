#!/usr/bin/env node

/**
 * Test script to check if all imports work correctly
 */

import dotenv from 'dotenv'
dotenv.config()

console.log('🧪 Testing imports...')

try {
  console.log('1️⃣ Testing db-image-storage imports...')
  const dbStorage = await import('../api/db-image-storage.js')
  console.log('✅ db-image-storage imported successfully')
  
  console.log('2️⃣ Testing image-processing imports...')
  const imageProcessing = await import('../api/image-processing.js')
  console.log('✅ image-processing imported successfully')
  
  console.log('3️⃣ Testing cloud-storage imports...')
  const cloudStorage = await import('../api/cloud-storage.js')
  console.log('✅ cloud-storage imported successfully')
  
  console.log('4️⃣ Testing images handler imports...')
  const imagesHandler = await import('../api/images.js')
  console.log('✅ images handler imported successfully')
  
  console.log('🎉 All imports successful!')
  
} catch (error) {
  console.error('❌ Import failed:', error)
  console.error(`   Error type: ${error.constructor.name}`)
  console.error(`   Message: ${error.message}`)
  console.error(`   Stack: ${error.stack}`)
}