#!/usr/bin/env node

/**
 * Test script to verify production deployment includes new features
 */

import fetch from 'node-fetch'

const PRODUCTION_URL = 'https://comic-collection-tracker.vercel.app'

async function testProductionDeployment() {
  console.log('🚀 Testing Production Deployment...\n')

  try {
    // Test 1: Check if main app loads
    console.log('1️⃣ Testing main app load...')
    const appResponse = await fetch(PRODUCTION_URL)
    const appHtml = await appResponse.text()
    
    if (appHtml.includes('Comic Collection')) {
      console.log('✅ Main app loads successfully')
    } else {
      console.log('❌ Main app failed to load')
      return
    }

    // Test 2: Check if new error handling test tab exists
    console.log('\n2️⃣ Testing for new features in HTML...')
    if (appHtml.includes('Test Errors') || appHtml.includes('🧪')) {
      console.log('✅ Error handling test feature detected')
    } else {
      console.log('⚠️ Error handling test feature not found in HTML')
    }

    // Test 3: Check if images API endpoint exists
    console.log('\n3️⃣ Testing images API endpoint...')
    const apiResponse = await fetch(`${PRODUCTION_URL}/api/images/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localImages: [] })
    })
    
    if (apiResponse.ok) {
      const apiData = await apiResponse.json()
      console.log('✅ Images API endpoint working')
      console.log(`   Response: ${JSON.stringify(apiData)}`)
    } else {
      console.log(`❌ Images API endpoint failed: ${apiResponse.status}`)
    }

    // Test 4: Check if cover proxy endpoint exists
    console.log('\n4️⃣ Testing cover proxy endpoint...')
    const proxyResponse = await fetch(`${PRODUCTION_URL}/api/cover-proxy`)
    
    if (proxyResponse.status === 400 || proxyResponse.status === 405) {
      console.log('✅ Cover proxy endpoint exists (expected 400/405 without params)')
    } else {
      console.log(`⚠️ Cover proxy endpoint status: ${proxyResponse.status}`)
    }

    // Test 5: Check for React error boundary and error handling
    console.log('\n5️⃣ Testing for error handling components...')
    if (appHtml.includes('ErrorFeedback') || appHtml.includes('error-feedback')) {
      console.log('✅ Error handling components detected')
    } else {
      console.log('⚠️ Error handling components not found in initial HTML')
    }

    console.log('\n🎉 Production deployment test completed!')
    console.log(`\n🌐 Visit: ${PRODUCTION_URL}`)
    console.log('📋 Manual testing checklist:')
    console.log('   1. Check if "🧪 Test Errors" tab appears in navigation')
    console.log('   2. Try adding a comic and uploading a cover image')
    console.log('   3. Test the error handling scenarios in the Test Errors tab')
    console.log('   4. Verify cover images display properly')
    console.log('   5. Test view mode switching (grid/list)')

  } catch (error) {
    console.error('❌ Production test failed:', error.message)
    process.exit(1)
  }
}

testProductionDeployment().catch(console.error)