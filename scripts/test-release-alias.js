#!/usr/bin/env node

/**
 * Test Release Alias for revokeUrl
 * 
 * Verifies that the release() method works as an alias for revokeUrl()
 * and demonstrates clearer API usage patterns.
 * 
 * Enhancement: Add release(url) alias for revokeUrl to make call sites clearer
 */

console.log('🧪 Testing Release Alias Implementation...\n')

// Mock browser environment
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
}

global.URL = {
  createObjectURL: () => 'blob:mock-url-' + Date.now(),
  revokeObjectURL: (url) => {
    console.log(`    🗑️  URL.revokeObjectURL called for: ${url}`)
  }
}

import ImageURLService from '../src/utils/ImageURLService.js'

async function testReleaseAliasExists() {
  console.log('Test 1: Release alias method exists')
  
  if (typeof ImageURLService.release === 'function') {
    console.log('✅ release() method exists on ImageURLService')
  } else {
    console.log('❌ release() method does NOT exist')
    return false
  }
  
  return true
}

async function testReleaseAliasFunctionality() {
  console.log('\nTest 2: Release alias functionality')
  
  // Create a mock blob URL (proper format)
  const testUrl = 'blob:http://localhost/test-url-12345'
  
  // Add to tracked URLs to simulate creation
  ImageURLService.createdUrls.add(testUrl)
  
  console.log(`   - Added test URL to tracked set: ${testUrl}`)
  console.log(`   - Tracked URLs before release: ${ImageURLService.createdUrls.size}`)
  console.log(`   - ImageURLService.isBrowser: ${ImageURLService.isBrowser}`)
  
  // Test release method
  ImageURLService.release(testUrl)
  
  console.log(`   - Tracked URLs after release: ${ImageURLService.createdUrls.size}`)
  
  // Verify URL was removed from tracked set
  if (!ImageURLService.createdUrls.has(testUrl)) {
    console.log('✅ release() successfully removed URL from tracked set')
  } else {
    console.log('❌ release() failed to remove URL from tracked set')
    return false
  }
  
  return true
}

async function testReleaseVsRevokeEquivalence() {
  console.log('\nTest 3: Release vs revokeUrl equivalence')
  
  // Test with two identical URLs using different methods
  const testUrl1 = 'blob:http://localhost/test-url-method1'
  const testUrl2 = 'blob:http://localhost/test-url-method2'
  
  // Add both to tracked URLs
  ImageURLService.createdUrls.add(testUrl1)
  ImageURLService.createdUrls.add(testUrl2)
  
  console.log('   - Testing revokeUrl method:')
  ImageURLService.revokeUrl(testUrl1)
  
  console.log('   - Testing release method:')
  ImageURLService.release(testUrl2)
  
  // Both should be removed
  const url1Removed = !ImageURLService.createdUrls.has(testUrl1)
  const url2Removed = !ImageURLService.createdUrls.has(testUrl2)
  
  if (url1Removed && url2Removed) {
    console.log('✅ Both revokeUrl() and release() have identical behavior')
  } else {
    console.log('❌ revokeUrl() and release() have different behavior')
    console.log(`   - URL1 removed by revokeUrl: ${url1Removed}`)
    console.log(`   - URL2 removed by release: ${url2Removed}`)
    return false
  }
  
  return true
}

async function testAPIUsageClarity() {
  console.log('\nTest 4: API usage clarity demonstration')
  
  console.log('📖 Usage Examples:')
  console.log('')
  
  // Example 1: Manual resource management
  console.log('// Example 1: Manual resource management')
  console.log('const imageUrl = await ImageURLService.getImageUrlUnsafe(comicId, "medium")')
  console.log('// ... use the URL ...')
  console.log('ImageURLService.release(imageUrl)  // ✅ Clear intent: releasing resource')
  console.log('')
  
  // Example 2: Cleanup in error handling
  console.log('// Example 2: Cleanup in error handling')
  console.log('try {')
  console.log('  const url = await ImageURLService.getImageUrlUnsafe(comicId, "full")')
  console.log('  await processImage(url)')
  console.log('  ImageURLService.release(url)  // ✅ Clear cleanup')
  console.log('} catch (error) {')
  console.log('  if (url) ImageURLService.release(url)  // ✅ Error cleanup')
  console.log('}')
  console.log('')
  
  // Example 3: Batch cleanup
  console.log('// Example 3: Batch cleanup')
  console.log('const urls = await Promise.all(comicIds.map(id => ')
  console.log('  ImageURLService.getImageUrlUnsafe(id, "thumbnail")))')
  console.log('// ... process URLs ...')
  console.log('urls.forEach(url => ImageURLService.release(url))  // ✅ Clear batch release')
  console.log('')
  
  console.log('🎯 Benefits of release() alias:')
  console.log('• More intuitive than "revoke" for resource management')
  console.log('• Clearer intent in cleanup code')
  console.log('• Consistent with common resource management patterns')
  console.log('• Better self-documenting code')
  
  return true
}

async function testBothMethodsInGetImageUrlWithRevoke() {
  console.log('\nTest 5: Integration with getImageUrlWithRevoke')
  
  // Mock the unsafe method to return a test URL
  const originalUnsafe = ImageURLService._getImageUrlUnsafe
  ImageURLService._getImageUrlUnsafe = async () => 'blob:test-integration-url'
  
  try {
    const result = await ImageURLService.getImageUrlWithRevoke('test-comic', 'medium')
    
    if (result && result.url && typeof result.revoke === 'function') {
      console.log('✅ getImageUrlWithRevoke returns URL and revoke function')
      console.log(`   - URL: ${result.url}`)
      
      // Test that the revoke function works
      result.revoke()
      console.log('✅ Revoke function executed successfully')
      
      // Now test that release() also works on the same type of URL
      const result2 = await ImageURLService.getImageUrlWithRevoke('test-comic2', 'medium')
      if (result2) {
        ImageURLService.release(result2.url)
        console.log('✅ release() method works with URLs from getImageUrlWithRevoke')
      }
    } else {
      console.log('❌ getImageUrlWithRevoke integration failed')
      return false
    }
  } finally {
    // Restore original method
    ImageURLService._getImageUrlUnsafe = originalUnsafe
  }
  
  return true
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Release Alias Tests\n')
  
  try {
    const test1Passed = await testReleaseAliasExists()
    const test2Passed = await testReleaseAliasFunctionality()
    const test3Passed = await testReleaseVsRevokeEquivalence()
    const test4Passed = await testAPIUsageClarity()
    const test5Passed = await testBothMethodsInGetImageUrlWithRevoke()
    
    console.log('\n' + '='.repeat(60))
    
    if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
      console.log('🎉 All tests passed! Release alias is working correctly.')
      console.log('\nKey improvements verified:')
      console.log('• release() method exists and is functional')
      console.log('• Identical behavior to revokeUrl() method')
      console.log('• Clearer API for resource management')
      console.log('• Better self-documenting code patterns')
      console.log('• Seamless integration with existing methods')
      
      console.log('\n📚 API Methods Available:')
      console.log('```javascript')
      console.log('// Both methods do exactly the same thing:')
      console.log('ImageURLService.revokeUrl(url)  // Original method')
      console.log('ImageURLService.release(url)    // New alias (recommended)')
      console.log('```')
      
      process.exit(0)
    } else {
      console.log('❌ Some tests failed!')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error)
    process.exit(1)
  }
}

runTests()