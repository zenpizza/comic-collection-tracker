#!/usr/bin/env node

/**
 * Test Memory Stats Reporting Fix
 * 
 * Verifies that getCacheStats reports the actual LRU cache capacity
 * instead of the config value, which may be different.
 * 
 * Bug: getCacheStats reports config.maxMemoryItems instead of actual cache maxSize
 * Fix: Use this.memoryCache.maxSize for accurate capacity reporting
 */

console.log('🧪 Testing Memory Stats Reporting Fix...\n')

// Mock browser environment
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }
}
global.URL = global.window.URL

import ImageURLService from '../src/utils/ImageURLService.js'

async function testMemoryStatsAccuracy() {
  console.log('Test 1: Memory stats report actual cache capacity')
  
  // Get initial stats
  const initialStats = await ImageURLService.getCacheStats()
  const initialMaxItems = initialStats.memory.maxItems
  const actualCacheMaxSize = ImageURLService.memoryCache.maxSize
  const configMaxItems = ImageURLService.config.maxMemoryItems
  
  console.log(`   - Config maxMemoryItems: ${configMaxItems}`)
  console.log(`   - Actual cache maxSize: ${actualCacheMaxSize}`)
  console.log(`   - Reported maxItems: ${initialMaxItems}`)
  
  // Verify they match initially
  if (initialMaxItems === actualCacheMaxSize) {
    console.log('✅ Initial stats report actual cache capacity')
  } else {
    console.log('❌ Initial stats do NOT report actual cache capacity')
    return false
  }
  
  return true
}

async function testDynamicCapacityChanges() {
  console.log('\nTest 2: Stats reflect dynamic capacity changes')
  
  // Change the cache capacity directly (simulating runtime changes)
  const originalMaxSize = ImageURLService.memoryCache.maxSize
  const newMaxSize = originalMaxSize + 25
  
  console.log(`   - Original cache maxSize: ${originalMaxSize}`)
  console.log(`   - Setting new maxSize: ${newMaxSize}`)
  
  // Change cache capacity directly
  ImageURLService.memoryCache.maxSize = newMaxSize
  
  // Get stats after change
  const updatedStats = await ImageURLService.getCacheStats()
  const reportedMaxItems = updatedStats.memory.maxItems
  
  console.log(`   - Reported maxItems after change: ${reportedMaxItems}`)
  
  if (reportedMaxItems === newMaxSize) {
    console.log('✅ Stats correctly reflect dynamic capacity changes')
  } else {
    console.log('❌ Stats do NOT reflect dynamic capacity changes')
    console.log(`   - Expected: ${newMaxSize}`)
    console.log(`   - Actual: ${reportedMaxItems}`)
    return false
  }
  
  // Restore original capacity
  ImageURLService.memoryCache.maxSize = originalMaxSize
  
  return true
}

async function testConfigVsCacheCapacity() {
  console.log('\nTest 3: Config vs actual cache capacity independence')
  
  // Change config without updating cache
  const originalConfigMax = ImageURLService.config.maxMemoryItems
  const originalCacheMax = ImageURLService.memoryCache.maxSize
  
  console.log(`   - Original config maxMemoryItems: ${originalConfigMax}`)
  console.log(`   - Original cache maxSize: ${originalCacheMax}`)
  
  // Change config only (not cache)
  ImageURLService.config.maxMemoryItems = originalConfigMax + 50
  
  console.log(`   - Updated config maxMemoryItems: ${ImageURLService.config.maxMemoryItems}`)
  console.log(`   - Cache maxSize (unchanged): ${ImageURLService.memoryCache.maxSize}`)
  
  // Get stats - should report cache capacity, not config
  const stats = await ImageURLService.getCacheStats()
  const reportedMaxItems = stats.memory.maxItems
  
  console.log(`   - Reported maxItems: ${reportedMaxItems}`)
  
  if (reportedMaxItems === originalCacheMax && reportedMaxItems !== ImageURLService.config.maxMemoryItems) {
    console.log('✅ Stats report actual cache capacity, not config value')
    console.log('   - This proves the fix is working correctly')
  } else {
    console.log('❌ Stats report config value instead of actual cache capacity')
    console.log(`   - Cache maxSize: ${originalCacheMax}`)
    console.log(`   - Config maxMemoryItems: ${ImageURLService.config.maxMemoryItems}`)
    console.log(`   - Reported maxItems: ${reportedMaxItems}`)
    return false
  }
  
  // Restore original config
  ImageURLService.config.maxMemoryItems = originalConfigMax
  
  return true
}

async function testUpdateConfigMethod() {
  console.log('\nTest 4: updateConfig method synchronizes cache and config')
  
  const originalCacheMax = ImageURLService.memoryCache.maxSize
  const newConfigMax = originalCacheMax + 30
  
  console.log(`   - Original cache maxSize: ${originalCacheMax}`)
  console.log(`   - Updating config maxMemoryItems to: ${newConfigMax}`)
  
  // Use updateConfig method (should sync cache capacity)
  ImageURLService.updateConfig({ maxMemoryItems: newConfigMax })
  
  const updatedCacheMax = ImageURLService.memoryCache.maxSize
  const stats = await ImageURLService.getCacheStats()
  const reportedMaxItems = stats.memory.maxItems
  
  console.log(`   - Cache maxSize after updateConfig: ${updatedCacheMax}`)
  console.log(`   - Reported maxItems: ${reportedMaxItems}`)
  
  if (updatedCacheMax === newConfigMax && reportedMaxItems === newConfigMax) {
    console.log('✅ updateConfig synchronizes cache capacity and stats report correctly')
  } else {
    console.log('❌ updateConfig synchronization or stats reporting failed')
    console.log(`   - Expected cache maxSize: ${newConfigMax}`)
    console.log(`   - Actual cache maxSize: ${updatedCacheMax}`)
    console.log(`   - Reported maxItems: ${reportedMaxItems}`)
    return false
  }
  
  // Restore original capacity
  ImageURLService.updateConfig({ maxMemoryItems: originalCacheMax })
  
  return true
}

async function testTrackedUrlsReporting() {
  console.log('\nTest 5: Tracked URLs reporting accuracy')
  
  // Clear any existing tracked URLs
  ImageURLService.createdUrls.clear()
  
  const initialStats = await ImageURLService.getCacheStats()
  const initialTrackedUrls = initialStats.memory.trackedUrls
  const initialMaxTrackedUrls = initialStats.memory.maxTrackedUrls
  
  console.log(`   - Initial tracked URLs: ${initialTrackedUrls}`)
  console.log(`   - Max tracked URLs: ${initialMaxTrackedUrls}`)
  
  if (initialTrackedUrls === 0 && initialMaxTrackedUrls === ImageURLService.config.maxTrackedUrls) {
    console.log('✅ Initial tracked URLs reporting is accurate')
  } else {
    console.log('❌ Initial tracked URLs reporting is inaccurate')
    return false
  }
  
  // Add some tracked URLs
  ImageURLService.createdUrls.add('blob:test1')
  ImageURLService.createdUrls.add('blob:test2')
  ImageURLService.createdUrls.add('blob:test3')
  
  const updatedStats = await ImageURLService.getCacheStats()
  const updatedTrackedUrls = updatedStats.memory.trackedUrls
  
  console.log(`   - Tracked URLs after adding 3: ${updatedTrackedUrls}`)
  
  if (updatedTrackedUrls === 3) {
    console.log('✅ Tracked URLs count is accurately reported')
  } else {
    console.log('❌ Tracked URLs count is NOT accurately reported')
    return false
  }
  
  // Clean up
  ImageURLService.createdUrls.clear()
  
  return true
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Memory Stats Reporting Tests\n')
  
  try {
    const test1Passed = await testMemoryStatsAccuracy()
    const test2Passed = await testDynamicCapacityChanges()
    const test3Passed = await testConfigVsCacheCapacity()
    const test4Passed = await testUpdateConfigMethod()
    const test5Passed = await testTrackedUrlsReporting()
    
    console.log('\n' + '='.repeat(60))
    
    if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
      console.log('🎉 All tests passed! Memory stats reporting is accurate.')
      console.log('\nKey improvements verified:')
      console.log('• Stats report actual cache capacity, not config values')
      console.log('• Dynamic capacity changes are reflected immediately')
      console.log('• Config and cache capacity can be independent')
      console.log('• updateConfig method properly synchronizes values')
      console.log('• Tracked URLs are accurately counted and reported')
      
      console.log('\n📊 Memory Stats Structure:')
      console.log('```javascript')
      console.log('memory: {')
      console.log('  items: this.memoryCache.size,           // Current items')
      console.log('  maxItems: this.memoryCache.maxSize,     // Actual capacity')
      console.log('  trackedUrls: this.createdUrls.size,     // Current tracked')
      console.log('  maxTrackedUrls: this.config.maxTrackedUrls // Config limit')
      console.log('}')
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