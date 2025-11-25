#!/usr/bin/env node

/**
 * Debug the save format mismatch between frontend and API
 */

import fetch from 'node-fetch'

async function debugSaveFormat() {
  try {
    console.log('🔍 Debugging save format mismatch...')
    
    // Step 1: Get current data from API
    console.log('\n=== STEP 1: GET DATA FROM API ===')
    const response = await fetch('https://comic-collection-tracker.vercel.app/api/comics')
    const apiData = await response.json()
    
    console.log('API Response format:')
    console.log(`- Comics count: ${apiData.comics.length}`)
    console.log(`- Version: ${apiData.version}`)
    console.log(`- Sample comic from API:`, JSON.stringify(apiData.comics[0], null, 2))
    
    // Step 2: Simulate what frontend would send
    console.log('\n=== STEP 2: FRONTEND SAVE FORMAT ===')
    
    // This is what the frontend dataStore.saveComics() would send
    const frontendSaveData = {
      version: '2.0',
      lastUpdated: new Date().toISOString(),
      comics: apiData.comics, // Using the same comics we got from API
      metadata: {
        totalComics: apiData.comics.length,
        seriesCount: new Set(apiData.comics.map(c => c.series)).size,
        publishers: [...new Set(apiData.comics.map(c => c.publisher).filter(Boolean))]
      }
    }
    
    console.log('Frontend would send:')
    console.log(`- Data structure: {version, lastUpdated, comics[], metadata}`)
    console.log(`- Comics count: ${frontendSaveData.comics.length}`)
    console.log(`- Sample comic frontend sends:`, JSON.stringify(frontendSaveData.comics[0], null, 2))
    
    // Step 3: Check what API expects
    console.log('\n=== STEP 3: API EXPECTATIONS ===')
    console.log('API POST handler expects:')
    console.log('- data.comics[] where each comic has:')
    console.log('  - id (not _id) - used as _id: comic.id')
    console.log('  - series, issueNumber, publisher, year, variant, notes, dateAdded')
    
    // Step 4: Identify the mismatch
    console.log('\n=== STEP 4: MISMATCH ANALYSIS ===')
    const sampleComic = apiData.comics[0]
    
    console.log('Issues found:')
    if (sampleComic._id && !sampleComic.id) {
      console.log('❌ MISMATCH: Comic has _id but API expects id')
      console.log(`   Comic._id: ${sampleComic._id}`)
      console.log(`   Comic.id: ${sampleComic.id || 'undefined'}`)
    }
    
    if (sampleComic.id) {
      console.log('✅ Comic has id field')
    }
    
    // Step 5: Test the normalization
    console.log('\n=== STEP 5: NORMALIZATION TEST ===')
    
    const normalizeComics = (comics) => {
      return comics.map(comic => {
        // If comic has _id instead of id, convert it
        if (comic._id !== undefined && !comic.id) {
          const normalized = {
            ...comic,
            id: comic._id
          }
          delete normalized._id // Remove _id to avoid confusion
          return normalized
        }
        return comic
      }).filter(comic => comic.id !== undefined && comic.id !== null)
    }
    
    const normalizedComics = normalizeComics(apiData.comics)
    console.log(`Normalized comics count: ${normalizedComics.length}`)
    console.log(`Sample normalized comic:`, JSON.stringify(normalizedComics[0], null, 2))
    
    // Step 6: Test what would happen if we sent this to API
    console.log('\n=== STEP 6: SIMULATED API PROCESSING ===')
    const testComic = normalizedComics[0]
    if (testComic) {
      const apiProcessedComic = {
        _id: testComic.id,
        series: testComic.series,
        issueNumber: testComic.issueNumber,
        publisher: testComic.publisher,
        year: testComic.year,
        variant: testComic.variant || "",
        notes: testComic.notes || "",
        dateAdded: testComic.dateAdded
      }
      console.log('API would create document:', JSON.stringify(apiProcessedComic, null, 2))
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message)
  }
}

debugSaveFormat()