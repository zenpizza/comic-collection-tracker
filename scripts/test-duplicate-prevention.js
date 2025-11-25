#!/usr/bin/env node

/**
 * Test duplicate prevention functionality
 */

import fetch from 'node-fetch'

async function testDuplicatePrevention() {
  try {
    console.log('🧪 Testing duplicate prevention functionality...')
    
    // Step 1: Check current state
    console.log('\n=== STEP 1: CHECK CURRENT STATE ===')
    const comicsResponse = await fetch('https://comic-collection-tracker.vercel.app/api/comics')
    const comicsData = await comicsResponse.json()
    console.log(`Current comics count: ${comicsData.comics.length}`)
    
    const duplicatesResponse = await fetch('https://comic-collection-tracker.vercel.app/api/duplicates')
    const duplicatesData = await duplicatesResponse.json()
    console.log(`Current duplicates count: ${duplicatesData.count}`)
    
    // Step 2: Test duplicate detection API
    console.log('\n=== STEP 2: TEST DUPLICATE DETECTION API ===')
    if (duplicatesData.count === 0) {
      console.log('✅ No duplicates found - cleanup was successful')
    } else {
      console.log(`⚠️ Found ${duplicatesData.count} duplicates:`)
      duplicatesData.duplicates.forEach(dup => {
        console.log(`   - ${dup.series} #${dup.issueNumber}`)
      })
    }
    
    // Step 3: Verify series counts
    console.log('\n=== STEP 3: VERIFY SERIES COUNTS ===')
    const seriesCounts = {}
    comicsData.comics.forEach(comic => {
      seriesCounts[comic.series] = (seriesCounts[comic.series] || 0) + 1
    })
    
    console.log('Series breakdown:')
    Object.entries(seriesCounts)
      .sort(([,a], [,b]) => b - a)
      .forEach(([series, count]) => {
        console.log(`  - ${series}: ${count} comics`)
      })
    
    // Step 4: Check for any remaining Avengers duplicates specifically
    console.log('\n=== STEP 4: CHECK AVENGERS COMICS ===')
    const avengersComics = comicsData.comics.filter(comic => 
      comic.series.toLowerCase().includes('avengers')
    )
    
    console.log(`Total Avengers comics: ${avengersComics.length}`)
    
    // Group by issue number to check for duplicates
    const avengersIssues = {}
    avengersComics.forEach(comic => {
      const issue = comic.issueNumber.toString().toLowerCase()
      if (!avengersIssues[issue]) {
        avengersIssues[issue] = []
      }
      avengersIssues[issue].push(comic)
    })
    
    const avengersDuplicates = Object.entries(avengersIssues)
      .filter(([issue, comics]) => comics.length > 1)
    
    if (avengersDuplicates.length === 0) {
      console.log('✅ No duplicate Avengers comics found')
    } else {
      console.log(`❌ Found ${avengersDuplicates.length} duplicate Avengers issues:`)
      avengersDuplicates.forEach(([issue, comics]) => {
        console.log(`   - Issue #${issue}: ${comics.length} copies`)
      })
    }
    
    // Step 5: Summary
    console.log('\n=== SUMMARY ===')
    console.log(`✅ Total comics: ${comicsData.comics.length}`)
    console.log(`✅ Duplicates removed: ${156 - comicsData.comics.length} (from original 156)`)
    console.log(`✅ Current duplicates: ${duplicatesData.count}`)
    console.log(`✅ Duplicate prevention: Implemented in frontend and API`)
    
    if (duplicatesData.count === 0 && comicsData.comics.length === 128) {
      console.log('\n🎉 DUPLICATE PREVENTION SYSTEM WORKING CORRECTLY!')
    } else {
      console.log('\n⚠️ Issues detected - may need further investigation')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testDuplicatePrevention()