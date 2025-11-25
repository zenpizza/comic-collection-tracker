/**
 * Data Model Migration Script
 * 
 * This script fixes data model inconsistencies:
 * 1. Migrates ObjectId _id comics to use numeric _id
 * 2. Removes redundant 'id' field after migration
 * 3. Migrates old coverData field to cover_images collection
 * 4. Removes coverData field after migration
 * 5. Syncs cover flags (hasCover, etc.) with cover_images collection
 * 
 * Run with: node scripts/migrate-data-model.js
 */

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function migrateDataModel() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db('comic-collection')
    const comicsCollection = db.collection('comics')
    const coverImagesCollection = db.collection('cover_images')
    
    console.log('=' .repeat(70))
    console.log('🔄 DATA MODEL MIGRATION')
    console.log('='.repeat(70))
    
    // Step 1: Migrate ObjectId comics to numeric _id
    console.log('\n📝 Step 1: Migrating ObjectId comics to numeric _id...')
    const objectIdComics = await comicsCollection.find({ 
      _id: { $type: 'objectId' } 
    }).toArray()
    
    console.log(`Found ${objectIdComics.length} comics with ObjectId _id`)
    
    let migratedIds = 0
    for (const comic of objectIdComics) {
      if (!comic.id) {
        console.log(`⚠️  Skipping ${comic.series} #${comic.issueNumber} - no numeric id field`)
        continue
      }
      
      const oldId = comic._id
      const newId = comic.id
      
      // Check if numeric ID already exists
      const existing = await comicsCollection.findOne({ _id: newId })
      if (existing && existing._id.toString() !== oldId.toString()) {
        console.log(`❌ Cannot migrate ${comic.series} #${comic.issueNumber} - numeric ID ${newId} already exists`)
        continue
      }
      
      // Create new document with numeric _id
      const newDoc = { ...comic, _id: newId }
      delete newDoc.id // Remove redundant id field
      
      // Insert new document
      await comicsCollection.insertOne(newDoc)
      
      // Delete old document
      await comicsCollection.deleteOne({ _id: oldId })
      
      console.log(`✅ Migrated: ${comic.series} #${comic.issueNumber}`)
      console.log(`   Old _id: ${oldId} (ObjectId)`)
      console.log(`   New _id: ${newId} (number)`)
      console.log(`   Removed redundant 'id' field`)
      
      migratedIds++
    }
    
    console.log(`\n✅ Migrated ${migratedIds} comics to numeric _id`)
    
    // Step 2: Remove redundant 'id' field from remaining comics
    console.log('\n📝 Step 2: Removing redundant "id" field from comics...')
    const comicsWithIdField = await comicsCollection.find({ 
      id: { $exists: true },
      $expr: { $eq: ['$_id', '$id'] } // Only remove if id matches _id
    }).toArray()
    
    console.log(`Found ${comicsWithIdField.length} comics with redundant id field`)
    
    let removedIdFields = 0
    for (const comic of comicsWithIdField) {
      await comicsCollection.updateOne(
        { _id: comic._id },
        { $unset: { id: '' } }
      )
      removedIdFields++
    }
    
    console.log(`✅ Removed redundant id field from ${removedIdFields} comics`)
    
    // Step 3: Migrate old coverData to cover_images collection
    console.log('\n📝 Step 3: Migrating old coverData to cover_images...')
    const comicsWithCoverData = await comicsCollection.find({ 
      coverData: { $exists: true } 
    }).toArray()
    
    console.log(`Found ${comicsWithCoverData.length} comics with old coverData field`)
    
    let migratedCovers = 0
    let skippedCovers = 0
    
    for (const comic of comicsWithCoverData) {
      const comicId = comic._id
      
      // Check if cover already exists in cover_images
      const existingCover = await coverImagesCollection.findOne({ comicId })
      
      if (existingCover) {
        console.log(`⚠️  ${comic.series} #${comic.issueNumber} - cover already in cover_images, removing coverData`)
        
        // Just remove the old coverData field
        await comicsCollection.updateOne(
          { _id: comicId },
          { $unset: { coverData: '' } }
        )
        
        skippedCovers++
        continue
      }
      
      // Extract cover data from old structure
      const coverData = comic.coverData
      const metadata = coverData.metadata || {}
      
      // Create new cover_images document
      const coverImageDoc = {
        comicId: comicId,
        source: metadata.source || 'upload',
        originalUrl: metadata.originalUrl || null,
        thumbnailUrl: coverData.urls?.sizes?.thumbnail || null,
        mediumUrl: coverData.urls?.sizes?.medium || null,
        fullUrl: coverData.urls?.optimized || null,
        attribution: metadata.attribution || null,
        licenseInfo: metadata.licenseInfo || null,
        sourceDetails: {
          apiProvider: metadata.provider || metadata.providerName || null,
          provider: metadata.provider || null,
          apiId: metadata.apiId || null,
          variant: metadata.variant || null,
          quality: metadata.quality || 'medium',
          dimensions: metadata.dimensions || { width: 0, height: 0 }
        },
        metadata: {
          original: metadata.original || {},
          optimized: metadata.optimized || {},
          sizes: metadata.sizes || {}
        },
        lastUpdated: metadata.downloadedAt || comic.dateAdded || new Date().toISOString(),
        createdAt: comic.dateAdded || new Date().toISOString()
      }
      
      // Insert into cover_images collection
      await coverImagesCollection.insertOne(coverImageDoc)
      
      // Update comic with new cover fields and remove old coverData
      await comicsCollection.updateOne(
        { _id: comicId },
        { 
          $set: {
            coverId: comicId,
            coverUrl: null,
            hasCover: true,
            coverSource: metadata.source || 'api',
            coverSourceProvider: metadata.provider || metadata.providerName || null,
            coverOriginalUrl: metadata.originalUrl || null,
            coverLastUpdated: metadata.downloadedAt || new Date().toISOString(),
            coverAttribution: metadata.attribution || null
          },
          $unset: { coverData: '' }
        }
      )
      
      console.log(`✅ Migrated: ${comic.series} #${comic.issueNumber}`)
      console.log(`   Created cover_images entry`)
      console.log(`   Updated comic cover fields`)
      console.log(`   Removed old coverData field`)
      
      migratedCovers++
    }
    
    console.log(`\n✅ Migrated ${migratedCovers} covers from coverData`)
    console.log(`⚠️  Skipped ${skippedCovers} (already in cover_images)`)
    
    // Step 4: Sync cover flags with cover_images collection
    console.log('\n📝 Step 4: Syncing cover flags with cover_images...')
    
    const allComics = await comicsCollection.find({}).toArray()
    let syncedCovers = 0
    let clearedFlags = 0
    
    for (const comic of allComics) {
      const comicId = comic._id
      const coverImage = await coverImagesCollection.findOne({ comicId })
      
      if (coverImage) {
        // Comic has a cover, ensure flags are correct
        const needsUpdate = 
          !comic.hasCover || 
          !comic.coverId || 
          !comic.coverSource ||
          !comic.coverLastUpdated
        
        if (needsUpdate) {
          await comicsCollection.updateOne(
            { _id: comicId },
            { 
              $set: {
                coverId: comicId,
                coverUrl: null,
                hasCover: true,
                coverSource: coverImage.source || 'api',
                coverSourceProvider: coverImage.sourceDetails?.apiProvider || coverImage.sourceDetails?.provider || null,
                coverOriginalUrl: coverImage.originalUrl || null,
                coverLastUpdated: coverImage.lastUpdated || new Date().toISOString(),
                coverAttribution: coverImage.attribution || null
              }
            }
          )
          
          syncedCovers++
        }
      } else {
        // No cover image, ensure flags are cleared
        if (comic.hasCover) {
          await comicsCollection.updateOne(
            { _id: comicId },
            { 
              $set: { 
                hasCover: false,
                coverId: null,
                coverUrl: null,
                coverSource: null,
                coverSourceProvider: null,
                coverOriginalUrl: null,
                coverLastUpdated: null,
                coverAttribution: null
              } 
            }
          )
          
          clearedFlags++
        }
      }
    }
    
    console.log(`✅ Synced ${syncedCovers} comics with covers`)
    console.log(`✅ Cleared ${clearedFlags} false positive flags`)
    
    // Final summary
    console.log('\n' + '='.repeat(70))
    console.log('📊 MIGRATION SUMMARY')
    console.log('='.repeat(70))
    console.log(`✅ Migrated ${migratedIds} comics from ObjectId to numeric _id`)
    console.log(`✅ Removed ${removedIdFields} redundant id fields`)
    console.log(`✅ Migrated ${migratedCovers} covers from coverData to cover_images`)
    console.log(`✅ Synced ${syncedCovers} cover flags`)
    console.log(`✅ Cleared ${clearedFlags} false positive flags`)
    console.log('\n🎉 Migration complete! Data model is now consistent.')
    
  } catch (error) {
    console.error('❌ Migration error:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the migration
migrateDataModel()
