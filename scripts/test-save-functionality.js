#!/usr/bin/env node

/**
 * Test the save functionality with current data
 */

import fetch from 'node-fetch'

async function testSaveFunctionality() {
  try {
    console.log('🧪 Testing save functionality...')
    
    // Step 1: Get current data
    console.log('\n=== STEP 1: GET CURRENT DATA ===')
    const response = await fetch('https://comic-collection-tracker.vercel.app/api/comics')
    const apiData = await response.json()
    console.log(`Loaded ${apiData.comics.length} comics`)
    
    // Step 2: Prepare save data (simulate what frontend sends)
    console.log('\n=== STEP 2: PREPARE SAVE DATA ===')
    const saveData = {
      version: '2.0',
      lastUpdated: new Date().toISOString(),
      comics: apiData.comics, // Use the same comics (they have _id)
      metadata: {
        totalComics: apiData.comics.length,
        seriesCount: new Set(apiData.comics.map(c => c.series)).size,
        publishers: [...new Set(apiData.comics.map(c => c.publisher).filter(Boolean))]
      }
    }
    
    console.log('Save data prepared:')
    console.log(`- Comics count: ${saveData.comics.length}`)
    console.log(`- Sample comic:`, JSON.stringify(saveData.comics[0], null, 2))
    
    // Step 3: Test save
    console.log('\n=== STEP 3: TEST SAVE ===')
    const saveResponse = await fetch('https://comic-collection-tracker.vercel.app/api/comics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(saveData)
    })
    
    console.log(`Save response status: ${saveResponse.status}`)
    
    if (saveResponse.ok) {
      const saveResult = await saveResponse.json()
      console.log('✅ Save successful!')
      console.log('Save result:', JSON.stringify(saveResult, null, 2))
    } else {
      const errorText = await saveResponse.text()
      console.log('❌ Save failed!')
      console.log('Error response:', errorText)
    }
    
    // Step 4: Verify data is still there
    console.log('\n=== STEP 4: VERIFY DATA ===')
    const verifyResponse = await fetch('https://comic-collection-tracker.vercel.app/api/comics')
    const verifyData = await verifyResponse.json()
    console.log(`After save test: ${verifyData.comics.length} comics`)
    
    if (verifyData.comics.length === apiData.comics.length) {
      console.log('✅ Data preserved correctly')
    } else {
      console.log('❌ Data count changed!')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testSaveFunctionality()