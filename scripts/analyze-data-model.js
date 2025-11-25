/**
 * Analyze Data Model Inconsistencies
 * 
 * This script examines all comics to identify data model drift:
 * - Comics using ObjectId vs numeric _id
 * - Comics with old coverData field vs new cover fields
 * - Comics with mismatched id and _id fields
 */

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function analyzeDataModel() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    const comics = await comicsCollection.find({}).toArray()
    console.log(`📚 Analyzing ${comics.length} comics...\n`)
    
    // Categories
    const categories = {
      numericId: [],           // _id is a number
      objectId: [],            // _id is ObjectId
      hasIdField: [],          // Has separate 'id' field
      idMismatch: [],          // id and _id don't match
      hasCoverData: [],        // Has old coverData field
      hasNewCoverFields: [],   // Has new cover fields (hasCover, coverSource, etc)
      hasCoverInCollection: [], // Has entry in cover_images collection
      inconsistentCover: []    // Has cover in collection but hasCover=false
    }
    
    for (const comic of comics) {
      const analysis = {
        _id: comic._id,
        id: comic.id,
        series: comic.series,
        issue: comic.issueNumber,
        idType: comic._id instanceof ObjectId ? 'ObjectId' : typeof comic._id,
        hasIdField: !!comic.id,
        hasCoverData: !!comic.coverData,
        hasCover: comic.hasCover,
        coverSource: comic.coverSource,
        coverId: comic.coverId
      }
      
      // Check _id type
      if (comic._id instanceof ObjectId) {
        categories.objectId.push(analysis)
      } else if (typeof comic._id === 'number') {
        categories.numericId.push(analysis)
      }
      
      // Check for separate id field
      if (comic.id) {
        categories.hasIdField.push(analysis)
        
        // Check for mismatch
        if (comic._id.toString() !== comic.id.toString()) {
          categories.idMismatch.push(analysis)
        }
      }
      
      // Check for old coverData field
      if (comic.coverData) {
        categories.hasCoverData.push(analysis)
      }
      
      // Check for new cover fields
      if (comic.hasCover !== undefined || comic.coverSource || comic.coverId) {
        categories.hasNewCoverFields.push(analysis)
      }
      
      // Check for cover in cover_images collection
      let coverImage = await coverImagesCollection.findOne({ comicId: comic._id })
      if (!coverImage && comic.id) {
        coverImage = await coverImagesCollection.findOne({ comicId: comic.id })
      }
      
      if (coverImage) {
        categories.hasCoverInCollection.push({
          ...analysis,
          coverImageComicId: coverImage.comicId,
          coverImageComicIdType: typeof coverImage.comicId
        })
        
        // Check for inconsistency
        if (!comic.hasCover) {
          categories.inconsistentCover.push({
            ...analysis,
            coverImageComicId: coverImage.comicId
          })
        }
      }
    }
    
    // Print analysis
    console.log('=' .repeat(70))
    console.log('📊 DATA MODEL ANALYSIS')
    console.log('='.repeat(70))
    
    console.log('\n🔑 ID Field Analysis:')
    console.log(`  Numeric _id: ${categories.numericId.length} comics`)
    console.log(`  ObjectId _id: ${categories.objectId.length} comics`)
    console.log(`  Has separate 'id' field: ${categories.hasIdField.length} comics`)
    console.log(`  ID mismatch (id ≠ _id): ${categories.idMismatch.length} comics`)
    
    console.log('\n📦 Cover Data Structure:')
    console.log(`  Has old 'coverData' field: ${categories.hasCoverData.length} comics`)
    console.log(`  Has new cover fields: ${categories.hasNewCoverFields.length} comics`)
    console.log(`  Has cover in cover_images: ${categories.hasCoverInCollection.length} comics`)
    console.log(`  Inconsistent (cover exists but hasCover=false): ${categories.inconsistentCover.length} comics`)
    
    // Detailed breakdown
    if (categories.objectId.length > 0) {
      console.log('\n' + '='.repeat(70))
      console.log('🔍 COMICS WITH ObjectId _id:')
      console.log('='.repeat(70))
      categories.objectId.forEach(c => {
        console.log(`  ${c.series} #${c.issue}`)
        console.log(`    _id: ${c._id} (ObjectId)`)
        console.log(`    id: ${c.id || 'N/A'}`)
        console.log(`    hasCoverData: ${c.hasCoverData}`)
        console.log(`    hasCover: ${c.hasCover}`)
        console.log('')
      })
    }
    
    if (categories.idMismatch.length > 0) {
      console.log('\n' + '='.repeat(70))
      console.log('⚠️  COMICS WITH ID MISMATCH:')
      console.log('='.repeat(70))
      categories.idMismatch.forEach(c => {
        console.log(`  ${c.series} #${c.issue}`)
        console.log(`    _id: ${c._id}`)
        console.log(`    id: ${c.id}`)
        console.log('')
      })
    }
    
    if (categories.hasCoverData.length > 0) {
      console.log('\n' + '='.repeat(70))
      console.log('📦 COMICS WITH OLD coverData FIELD:')
      console.log('='.repeat(70))
      categories.hasCoverData.forEach(c => {
        console.log(`  ${c.series} #${c.issue}`)
        console.log(`    _id: ${c._id} (${c.idType})`)
        console.log(`    hasCover: ${c.hasCover}`)
        console.log(`    coverSource: ${c.coverSource || 'N/A'}`)
        console.log('')
      })
    }
    
    if (categories.inconsistentCover.length > 0) {
      console.log('\n' + '='.repeat(70))
      console.log('🔴 INCONSISTENT COVERS (needs fixing):')
      console.log('='.repeat(70))
      categories.inconsistentCover.forEach(c => {
        console.log(`  ${c.series} #${c.issue}`)
        console.log(`    _id: ${c._id} (${c.idType})`)
        console.log(`    id: ${c.id || 'N/A'}`)
        console.log(`    cover_images.comicId: ${c.coverImageComicId} (${c.coverImageComicIdType})`)
        console.log(`    hasCover: ${c.hasCover} ❌ Should be true`)
        console.log('')
      })
    }
    
    // Summary recommendations
    console.log('\n' + '='.repeat(70))
    console.log('💡 RECOMMENDATIONS:')
    console.log('='.repeat(70))
    
    if (categories.objectId.length > 0) {
      console.log('\n1. ObjectId Migration:')
      console.log(`   ${categories.objectId.length} comics use ObjectId instead of numeric _id`)
      console.log('   → Consider migrating to numeric _id for consistency')
      console.log('   → Or update cover_images to use ObjectId references')
    }
    
    if (categories.hasCoverData.length > 0) {
      console.log('\n2. CoverData Migration:')
      console.log(`   ${categories.hasCoverData.length} comics have old coverData field`)
      console.log('   → Migrate to cover_images collection')
      console.log('   → Remove coverData field after migration')
    }
    
    if (categories.inconsistentCover.length > 0) {
      console.log('\n3. Cover Flag Sync:')
      console.log(`   ${categories.inconsistentCover.length} comics have covers but hasCover=false`)
      console.log('   → Run sync-cover-flags.js to fix')
    }
    
    if (categories.idMismatch.length > 0) {
      console.log('\n4. ID Field Cleanup:')
      console.log(`   ${categories.idMismatch.length} comics have mismatched id and _id`)
      console.log('   → Decide on single ID strategy')
      console.log('   → Remove redundant id field or align values')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

analyzeDataModel()
