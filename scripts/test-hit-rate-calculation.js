#!/usr/bin/env node

/**
 * Test Hit-Rate Calculation Fix
 * 
 * Verifies that the hit-rate calculation correctly includes errors
 * in the total request count for accurate statistics reporting.
 * 
 * Bug: Hit-rate math excludes errors from total, skewing statistics
 * Fix: Include errors in total: hits / (hits + misses + errors)
 */

console.log('🧪 Testing Hit-Rate Calculation Fix...\n')

// Mock browser environment for testing
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  URL: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  }
}
global.URL = global.window.URL

// Import ImageURLService
import ImageURLService from '../src/utils/ImageURLService.js'

async function testHitRateCalculation() {
  console.log('Test 1: Hit-rate calculation with various scenarios')
  
  // Reset stats for clean testing
  ImageURLService.resetStats()
  
  // Test 1: Empty stats should return 0.00
  let hitRate = ImageURLService.calculateHitRate()
  if (hitRate === '0.00') {
    console.log('✅ Empty stats correctly return 0.00% hit rate')
  } else {
    console.log(`❌ Empty stats returned ${hitRate}, expected 0.00`)
    return false
  }
  
  // Test 2: Only hits (100% hit rate)
  ImageURLService.stats.memoryHits = 5
  ImageURLService.stats.indexedDBHits = 3
  ImageURLService.stats.apiHits = 2
  // Total hits: 10, Total requests: 10, Hit rate: 100%
  
  hitRate = ImageURLService.calculateHitRate()
  if (hitRate === '100.00') {
    console.log('✅ Only hits correctly return 100.00% hit rate')
  } else {
    console.log(`❌ Only hits returned ${hitRate}, expected 100.00`)
    return false
  }
  
  // Test 3: Hits and misses (no errors)
  ImageURLService.stats.misses = 5
  // Total hits: 10, Total requests: 15, Hit rate: 66.67%
  
  hitRate = ImageURLService.calculateHitRate()
  if (hitRate === '66.67') {
    console.log('✅ Hits and misses correctly return 66.67% hit rate')
  } else {
    console.log(`❌ Hits and misses returned ${hitRate}, expected 66.67`)
    return false
  }
  
  // Test 4: Hits, misses, and errors (the key fix)
  ImageURLService.stats.errors = 5
  // Total hits: 10, Total requests: 20, Hit rate: 50%
  
  hitRate = ImageURLService.calculateHitRate()
  if (hitRate === '50.00') {
    console.log('✅ Hits, misses, and errors correctly return 50.00% hit rate')
    console.log('   - This verifies errors are included in total requests')
  } else {
    console.log(`❌ Hits, misses, and errors returned ${hitRate}, expected 50.00`)
    console.log('   - This indicates errors are NOT included in total requests')
    return false
  }
  
  // Test 5: Only errors (0% hit rate)
  ImageURLService.resetStats()
  ImageURLService.stats.errors = 10
  // Total hits: 0, Total requests: 10, Hit rate: 0%
  
  hitRate = ImageURLService.calculateHitRate()
  if (hitRate === '0.00') {
    console.log('✅ Only errors correctly return 0.00% hit rate')
  } else {
    console.log(`❌ Only errors returned ${hitRate}, expected 0.00`)
    return false
  }
  
  return true
}

async function testCacheStatsConsistency() {
  console.log('\nTest 2: Cache stats consistency with hit-rate calculation')
  
  // Reset and set up test data
  ImageURLService.resetStats()
  ImageURLService.stats.memoryHits = 8
  ImageURLService.stats.indexedDBHits = 4
  ImageURLService.stats.apiHits = 3
  ImageURLService.stats.misses = 3
  ImageURLService.stats.errors = 2
  
  const stats = await ImageURLService.getCacheStats()
  const calculatedHitRate = ImageURLService.calculateHitRate()
  
  // Note: getCacheStats may increment errors due to IndexedDB unavailability in Node.js
  // So we calculate expected total based on actual stats after the call
  const actualStats = ImageURLService.stats
  const expectedTotal = actualStats.memoryHits + actualStats.indexedDBHits + 
                       actualStats.apiHits + actualStats.misses + actualStats.errors
  const actualTotal = stats.performance.totalRequests
  
  if (actualTotal === expectedTotal) {
    console.log('✅ getCacheStats totalRequests includes errors')
    console.log(`   - Total requests: ${actualTotal} (includes ${actualStats.errors} errors)`)
  } else {
    console.log('❌ getCacheStats totalRequests does NOT include errors')
    console.log(`   - Expected total: ${expectedTotal}`)
    console.log(`   - Actual total: ${actualTotal}`)
    console.log(`   - Stats after getCacheStats:`, actualStats)
    return false
  }
  
  // Check that hitRate in stats matches calculateHitRate
  if (stats.performance.hitRate === calculatedHitRate) {
    console.log('✅ getCacheStats hitRate matches calculateHitRate')
    console.log(`   - Hit rate: ${stats.performance.hitRate}%`)
  } else {
    console.log('❌ getCacheStats hitRate does NOT match calculateHitRate')
    console.log(`   - getCacheStats: ${stats.performance.hitRate}%`)
    console.log(`   - calculateHitRate: ${calculatedHitRate}%`)
    return false
  }
  
  return true
}

async function testEdgeCases() {
  console.log('\nTest 3: Edge cases and precision')
  
  // Test precision with decimal results
  ImageURLService.resetStats()
  ImageURLService.stats.memoryHits = 1
  ImageURLService.stats.misses = 2
  // Total hits: 1, Total requests: 3, Hit rate: 33.33%
  
  const hitRate = ImageURLService.calculateHitRate()
  if (hitRate === '33.33') {
    console.log('✅ Decimal precision correctly handled (33.33%)')
  } else {
    console.log(`❌ Decimal precision issue: ${hitRate}, expected 33.33`)
    return false
  }
  
  // Test very large numbers
  ImageURLService.resetStats()
  ImageURLService.stats.memoryHits = 999999
  ImageURLService.stats.errors = 1
  // Total hits: 999999, Total requests: 1000000, Hit rate: 99.9999% -> 100.00%
  
  const largeHitRate = ImageURLService.calculateHitRate()
  if (largeHitRate === '100.00') {
    console.log('✅ Large numbers handled correctly with rounding')
  } else {
    console.log(`❌ Large numbers issue: ${largeHitRate}, expected 100.00`)
    return false
  }
  
  return true
}

async function testRealWorldScenario() {
  console.log('\nTest 4: Real-world scenario simulation')
  
  // Simulate realistic usage patterns
  ImageURLService.resetStats()
  
  // Simulate cache hits and misses over time
  const scenarios = [
    { memory: 50, indexedDB: 30, api: 15, misses: 4, errors: 1 }, // 95% hit rate
    { memory: 20, indexedDB: 20, api: 20, misses: 20, errors: 20 }, // 60% hit rate
    { memory: 10, indexedDB: 5, api: 5, misses: 30, errors: 50 }, // 20% hit rate
  ]
  
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    ImageURLService.resetStats()
    
    ImageURLService.stats.memoryHits = scenario.memory
    ImageURLService.stats.indexedDBHits = scenario.indexedDB
    ImageURLService.stats.apiHits = scenario.api
    ImageURLService.stats.misses = scenario.misses
    ImageURLService.stats.errors = scenario.errors
    
    const hits = scenario.memory + scenario.indexedDB + scenario.api
    const total = hits + scenario.misses + scenario.errors
    const expectedRate = ((hits / total) * 100).toFixed(2)
    const actualRate = ImageURLService.calculateHitRate()
    
    if (actualRate === expectedRate) {
      console.log(`✅ Scenario ${i + 1}: ${actualRate}% hit rate calculated correctly`)
    } else {
      console.log(`❌ Scenario ${i + 1}: Expected ${expectedRate}%, got ${actualRate}%`)
      return false
    }
  }
  
  return true
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Hit-Rate Calculation Tests\n')
  
  try {
    const test1Passed = await testHitRateCalculation()
    const test2Passed = await testCacheStatsConsistency()
    const test3Passed = await testEdgeCases()
    const test4Passed = await testRealWorldScenario()
    
    console.log('\n' + '='.repeat(60))
    
    if (test1Passed && test2Passed && test3Passed && test4Passed) {
      console.log('🎉 All tests passed! Hit-rate calculation is fixed.')
      console.log('\nKey improvements verified:')
      console.log('• Errors are included in total request count')
      console.log('• Hit rate calculation is mathematically accurate')
      console.log('• getCacheStats and calculateHitRate are consistent')
      console.log('• Edge cases and precision are handled correctly')
      console.log('• Real-world scenarios produce expected results')
      
      console.log('\n📊 Formula: hits / (hits + misses + errors) * 100')
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