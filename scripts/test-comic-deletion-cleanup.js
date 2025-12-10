/**
 * Test script to verify that comic deletion properly cleans up associated images
 */

import { storeCoverImages, getCoverImages, deleteCoverImages } from '../api/db-image-storage.js'

const TEST_COMIC_ID = 'test-comic-deletion-' + Date.now()
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-app.vercel.app' 
  : 'http://localhost:3000'

async function testComicDeletionCleanup() {
  console.log('🧪 Testing comic deletion with image cleanup...\n')
  
  try {
    // Step 1: Create a test comic
    console.log('1️⃣ Creating test comic...')
    const createResponse = await fetch(`${API_BASE_URL}/api/comics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        series: 'Test Series',
        issueNumber: '1',
        publisher: 'Test Publisher'
      })
    })
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create comic: ${createResponse.status}`)
    }
    
    const createResult = await createResponse.json()
    const comicId = createResult.comic.id
    console.log(`✅ Created comic with ID: ${comicId}`)
    
    // Step 2: Add cover images to the comic
    console.log('\n2️⃣ Adding cover images...')
    const testImages = {
      thumbnail: Buffer.from('fake-thumbnail-data'),
      medium: Buffer.from('fake-medium-data'),
      full: Buffer.from('fake-full-data')
    }
    
    await storeCoverImages(comicId, testImages)
    console.log('✅ Cover images stored')
    
    // Step 3: Verify images exist
    console.log('\n3️⃣ Verifying images exist...')
    const imagesBeforeDeletion = await getCoverImages(comicId)
    if (imagesBeforeDeletion) {
      console.log('✅ Images found before deletion')
    } else {
      throw new Error('Images not found after creation')
    }
    
    // Step 4: Delete the comic (this should also delete images)
    console.log('\n4️⃣ Deleting comic...')
    const deleteResponse = await fetch(`${API_BASE_URL}/api/comics/${comicId}`, {
      method: 'DELETE'
    })
    
    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete comic: ${deleteResponse.status}`)
    }
    
    const deleteResult = await deleteResponse.json()
    console.log(`✅ Comic deleted: ${deleteResult.message}`)
    
    // Step 5: Verify images are also deleted
    console.log('\n5️⃣ Verifying images are cleaned up...')
    const imagesAfterDeletion = await getCoverImages(comicId)
    if (imagesAfterDeletion === null) {
      console.log('✅ Images properly cleaned up')
    } else {
      console.log('❌ Images still exist after comic deletion!')
      console.log('   This indicates the cleanup is not working properly')
      return false
    }
    
    console.log('\n🎉 Test passed! Comic deletion properly cleans up images.')
    return true
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    
    // Cleanup attempt
    try {
      console.log('\n🧹 Attempting cleanup...')
      await deleteCoverImages(TEST_COMIC_ID)
    } catch (cleanupError) {
      console.warn('Cleanup failed:', cleanupError.message)
    }
    
    return false
  }
}

// Run the test
testComicDeletionCleanup()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('Unexpected error:', error)
    process.exit(1)
  })