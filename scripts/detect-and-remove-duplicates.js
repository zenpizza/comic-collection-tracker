#!/usr/bin/env node

/**
 * Detect and remove duplicate comics from the database
 */

import { MongoClient } from 'mongodb'

// Use the production MongoDB URI from Vercel
const MONGODB_URI = "mongodb+srv://Vercel-Admin-comic-collection-tracker:6wxqoG86JNapg630@comic-collection-tracke.aufn0iz.mongodb.net/?retryWrites=true&w=majority&appName=comic-collection-tracker"

async function detectAndRemoveDuplicates() {
  let client
  
  try {
    console.log('🔍 Detecting and removing duplicate comics...')
    
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    const db = client.db('comic-collection')
    const collection = db.collection('comics')

    // Get all individual comic documents
    const allComics = await collection.find({ 
      _id: { $type: 'number' }
    }).toArray()

    console.log(`📊 Total comics found: ${allComics.length}`)

    // Group comics by series + issue number to find duplicates
    const comicGroups = {}
    const duplicates = []

    allComics.forEach(comic => {
      const key = `${comic.series}|${comic.issueNumber}`.toLowerCase()
      
      if (!comicGroups[key]) {
        comicGroups[key] = []
      }
      comicGroups[key].push(comic)
    })

    // Find groups with more than one comic (duplicates)
    Object.entries(comicGroups).forEach(([key, comics]) => {
      if (comics.length > 1) {
        const [series, issueNumber] = key.split('|')
        duplicates.push({
          series: comics[0].series, // Use original case
          issueNumber: comics[0].issueNumber,
          count: comics.length,
          comics: comics
        })
      }
    })

    console.log(`🔍 Found ${duplicates.length} sets of duplicates:`)
    
    let totalDuplicatesToRemove = 0
    duplicates.forEach(duplicate => {
      console.log(`  - ${duplicate.series} #${duplicate.issueNumber}: ${duplicate.count} copies`)
      totalDuplicatesToRemove += duplicate.count - 1 // Keep one, remove the rest
    })

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!')
      return
    }

    console.log(`\n🗑️ Will remove ${totalDuplicatesToRemove} duplicate comics`)
    console.log('📋 Duplicate removal strategy: Keep the oldest copy (earliest dateAdded)')

    // Remove duplicates - keep the oldest copy of each
    const comicsToRemove = []
    
    duplicates.forEach(duplicate => {
      // Sort by dateAdded to keep the oldest
      const sortedComics = duplicate.comics.sort((a, b) => 
        new Date(a.dateAdded) - new Date(b.dateAdded)
      )
      
      // Keep the first (oldest), remove the rest
      const toRemove = sortedComics.slice(1)
      comicsToRemove.push(...toRemove)
      
      console.log(`  📌 ${duplicate.series} #${duplicate.issueNumber}:`)
      console.log(`     Keeping: ${sortedComics[0]._id} (${sortedComics[0].dateAdded})`)
      toRemove.forEach(comic => {
        console.log(`     Removing: ${comic._id} (${comic.dateAdded})`)
      })
    })

    // Perform the removal
    if (comicsToRemove.length > 0) {
      const idsToRemove = comicsToRemove.map(comic => comic._id)
      
      const deleteResult = await collection.deleteMany({
        _id: { $in: idsToRemove }
      })
      
      console.log(`\n✅ Removed ${deleteResult.deletedCount} duplicate comics`)
    }

    // Verify final count
    const finalCount = await collection.countDocuments({ 
      _id: { $type: 'number' }
    })
    
    console.log(`📊 Final comic count: ${finalCount}`)
    console.log(`📉 Reduced from ${allComics.length} to ${finalCount} comics`)
    
    // Show remaining series counts
    console.log('\n📈 Series summary after cleanup:')
    const remainingComics = await collection.find({ 
      _id: { $type: 'number' }
    }).toArray()
    
    const seriesCounts = {}
    remainingComics.forEach(comic => {
      seriesCounts[comic.series] = (seriesCounts[comic.series] || 0) + 1
    })
    
    Object.entries(seriesCounts)
      .sort(([,a], [,b]) => b - a)
      .forEach(([series, count]) => {
        console.log(`  - ${series}: ${count} comics`)
      })
    
  } catch (error) {
    console.error('❌ Duplicate removal failed:', error.message)
  } finally {
    if (client) {
      await client.close()
    }
  }
}

detectAndRemoveDuplicates()