/**
 * Cleanup script to remove redundant volume metadata from cover image records
 * 
 * Issue: Volume metadata (volumeId, volumeName) was being stored in both:
 * - Comic records (correct - for display and future features)  
 * - Cover image records (incorrect - redundant and causes consistency issues)
 * 
 * This script removes volume metadata from cover image records while preserving
 * it on comic records where it belongs.
 */

import { connectToDatabase } from '../api/db-image-storage.js'

async function cleanupVolumeDuplication() {
  console.log('🧹 Cleaning up redundant volume metadata from cover images...\n')
  
  try {
    const database = await connectToDatabase()
    const coverImagesCollection = database.collection('cover_images')
    
    // Find all cover images that have volume metadata
    console.log('1️⃣ Finding cover images with volume metadata...')
    const coverImagesWithVolume = await coverImagesCollection.find({
      $or: [
        { 'metadata.volumeId': { $exists: true } },
        { 'metadata.volumeName': { $exists: true } }
      ]
    }).toArray()
    
    console.log(`   Found ${coverImagesWithVolume.length} cover images with volume metadata`)
    
    if (coverImagesWithVolume.length === 0) {
      console.log('✅ No cleanup needed - no cover images have volume metadata')
      return
    }
    
    // Show some examples
    console.log('\n📋 Examples of redundant data:')
    coverImagesWithVolume.slice(0, 3).forEach((cover, index) => {
      console.log(`   ${index + 1}. Comic ID: ${cover.comicId}`)
      console.log(`      Volume ID: ${cover.metadata.volumeId || 'N/A'}`)
      console.log(`      Volume Name: ${cover.metadata.volumeName || 'N/A'}`)
    })
    
    // Confirm cleanup
    console.log(`\n⚠️  This will remove volumeId and volumeName from ${coverImagesWithVolume.length} cover image records`)
    console.log('   Volume metadata will remain on comic records where it belongs')
    console.log('   This cleanup is safe and recommended to prevent data consistency issues')
    
    // In a real environment, you might want to add a confirmation prompt here
    // For now, we'll proceed with the cleanup
    
    console.log('\n2️⃣ Removing volume metadata from cover images...')
    
    const updateResult = await coverImagesCollection.updateMany(
      {
        $or: [
          { 'metadata.volumeId': { $exists: true } },
          { 'metadata.volumeName': { $exists: true } }
        ]
      },
      {
        $unset: {
          'metadata.volumeId': '',
          'metadata.volumeName': ''
        }
      }
    )
    
    console.log(`✅ Updated ${updateResult.modifiedCount} cover image records`)
    
    // Verify cleanup
    console.log('\n3️⃣ Verifying cleanup...')
    const remainingWithVolume = await coverImagesCollection.countDocuments({
      $or: [
        { 'metadata.volumeId': { $exists: true } },
        { 'metadata.volumeName': { $exists: true } }
      ]
    })
    
    if (remainingWithVolume === 0) {
      console.log('✅ Cleanup verified - no cover images have volume metadata')
    } else {
      console.log(`⚠️  ${remainingWithVolume} cover images still have volume metadata`)
    }
    
    // Show final stats
    console.log('\n📊 Cleanup Summary:')
    console.log(`   - Cover images processed: ${coverImagesWithVolume.length}`)
    console.log(`   - Records updated: ${updateResult.modifiedCount}`)
    console.log(`   - Remaining with volume data: ${remainingWithVolume}`)
    
    console.log('\n🎉 Volume metadata cleanup completed!')
    console.log('   Volume information is now stored only on comic records')
    console.log('   This prevents data duplication and consistency issues')
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error)
    throw error
  }
}

// Run the cleanup
cleanupVolumeDuplication()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })