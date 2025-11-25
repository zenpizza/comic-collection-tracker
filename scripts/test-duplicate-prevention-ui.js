#!/usr/bin/env node

/**
 * Test the UI duplicate prevention by simulating adding a duplicate
 */

import fetch from 'node-fetch'

async function testUIDuplicatePrevention() {
  try {
    console.log('🧪 Testing UI duplicate prevention...')
    
    // Get current comics to find one to duplicate
    const response = await fetch('https://comic-collection-tracker.vercel.app/api/comics')
    const data = await response.json()
    
    console.log(`Current comics count: ${data.comics.length}`)
    
    // Find an Avengers comic to test with
    const avengersComic = data.comics.find(comic => 
      comic.series === "The Avengers" && comic.issueNumber === "275"
    )
    
    if (avengersComic) {
      console.log(`Found test comic: ${avengersComic.series} #${avengersComic.issueNumber}`)
      console.log('✅ This comic exists in the database')
      console.log('🎯 When you try to add this comic again in the UI, you should now see a confirmation dialog')
      console.log('📋 Test steps:')
      console.log('   1. Go to the "Add Comic" tab')
      console.log('   2. Enter: Series = "The Avengers", Issue = "275"')
      console.log('   3. You should see a confirmation dialog asking if you want to add the duplicate')
      console.log('   4. Click "Cancel" to prevent the duplicate')
      console.log('   5. Or click "OK" to add it anyway (then use Duplicates tab to clean up)')
    } else {
      console.log('❌ Could not find Avengers #275 for testing')
    }
    
    // Check current duplicates
    const duplicatesResponse = await fetch('https://comic-collection-tracker.vercel.app/api/duplicates')
    const duplicatesData = await duplicatesResponse.json()
    
    console.log(`\nCurrent duplicates in database: ${duplicatesData.count}`)
    
    if (duplicatesData.count > 0) {
      console.log('Found duplicates:')
      duplicatesData.duplicates.forEach(dup => {
        console.log(`  - ${dup.series} #${dup.issueNumber}`)
      })
      console.log('💡 You can use the "Duplicates" tab to clean these up')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testUIDuplicatePrevention()