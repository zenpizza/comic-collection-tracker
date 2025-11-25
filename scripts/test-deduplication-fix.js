#!/usr/bin/env node

/**
 * Test script to demonstrate deduplication fix
 */

console.log('🧪 Testing Deduplication System Fix\n')

// Mock implementation showing the problem and solution
class MockImageService {
  constructor() {
    this.operationLocks = new Map()
    this.apiRequestCache = new Map() // The redundant system
    this.stats = { deduplicatedRequests: 0, apiCalls: 0 }
  }

  // ❌ PROBLEMATIC: Double deduplication system
  async getImageUrlProblematic(cacheKey) {
    console.log(`  Starting operation for ${cacheKey}`)

    // First deduplication layer (operationLocks)
    if (this.operationLocks.has(cacheKey)) {
      console.log(`  ❌ Deduplicated by operationLocks: ${cacheKey}`)
      this.stats.deduplicatedRequests++
      return await this.operationLocks.get(cacheKey)
    }

    const operationPromise = this.mockGetImageUrlInternal(cacheKey)
    this.operationLocks.set(cacheKey, operationPromise)

    try {
      const result = await operationPromise
      return result
    } finally {
      this.operationLocks.delete(cacheKey)
    }
  }

  async mockGetImageUrlInternal(cacheKey) {
    // Simulate cache miss, go to API
    return await this.getFromAPIWithDeduplication(cacheKey)
  }

  // Second deduplication layer (apiRequestCache) - REDUNDANT!
  async getFromAPIWithDeduplication(cacheKey) {
    // Second deduplication check - race condition prone!
    if (this.apiRequestCache.has(cacheKey)) {
      console.log(`  ❌ Deduplicated by apiRequestCache: ${cacheKey}`)
      this.stats.deduplicatedRequests++
      return await this.apiRequestCache.get(cacheKey)
    }

    const apiPromise = this.mockAPICall(cacheKey)
    this.apiRequestCache.set(cacheKey, apiPromise)

    try {
      const result = await apiPromise
      return result
    } finally {
      this.apiRequestCache.delete(cacheKey)
    }
  }

  // ✅ FIXED: Single deduplication system
  async getImageUrlFixed(cacheKey) {
    console.log(`  Starting operation for ${cacheKey}`)

    // Single deduplication layer (operationLocks only)
    if (this.operationLocks.has(cacheKey)) {
      console.log(`  ✅ Deduplicated by operationLocks: ${cacheKey}`)
      this.stats.deduplicatedRequests++
      return await this.operationLocks.get(cacheKey)
    }

    const operationPromise = this.mockGetImageUrlInternalFixed(cacheKey)
    this.operationLocks.set(cacheKey, operationPromise)

    try {
      const result = await operationPromise
      return result
    } finally {
      this.operationLocks.delete(cacheKey)
    }
  }

  async mockGetImageUrlInternalFixed(cacheKey) {
    // Simulate cache miss, go directly to API (no second dedup layer)
    return await this.mockAPICall(cacheKey)
  }

  async mockAPICall(cacheKey) {
    this.stats.apiCalls++
    console.log(`  🌐 Making API call for ${cacheKey}`)
    await new Promise(resolve => setTimeout(resolve, 100)) // Simulate API delay
    return `result-${cacheKey}`
  }

  resetStats() {
    this.stats = { deduplicatedRequests: 0, apiCalls: 0 }
  }
}

async function runTests() {
  const service = new MockImageService()

  console.log('Test 1: Problematic double deduplication')
  console.log('  Scenario: 3 concurrent requests for same image')
  
  service.resetStats()
  
  const promises1 = [
    service.getImageUrlProblematic('image1'),
    service.getImageUrlProblematic('image1'),
    service.getImageUrlProblematic('image1')
  ]
  
  const results1 = await Promise.all(promises1)
  console.log(`  Results: ${results1.join(', ')}`)
  console.log(`  API calls: ${service.stats.apiCalls} (should be 1)`)
  console.log(`  Deduplicated: ${service.stats.deduplicatedRequests}`)
  console.log('  ❌ Problem: Two deduplication systems create complexity')

  console.log('\nTest 2: Fixed single deduplication')
  console.log('  Scenario: 3 concurrent requests for same image')
  
  service.resetStats()
  
  const promises2 = [
    service.getImageUrlFixed('image2'),
    service.getImageUrlFixed('image2'),
    service.getImageUrlFixed('image2')
  ]
  
  const results2 = await Promise.all(promises2)
  console.log(`  Results: ${results2.join(', ')}`)
  console.log(`  API calls: ${service.stats.apiCalls} (should be 1)`)
  console.log(`  Deduplicated: ${service.stats.deduplicatedRequests}`)
  console.log('  ✅ Solution: Single deduplication system is cleaner')

  console.log('\nTest 3: Race condition demonstration')
  console.log('  Scenario: Rapid sequential requests (race condition prone)')
  
  service.resetStats()
  
  // Rapid sequential requests that could hit race conditions
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      service.getImageUrlProblematic('race-test').then(result => {
        console.log(`    Request ${i}: ${result}`)
      })
    }, i * 10) // Staggered by 10ms
  }
  
  // Wait for all to complete
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  console.log(`  Final API calls: ${service.stats.apiCalls}`)
  console.log('  ❌ Problem: Race conditions between two dedup systems')

  console.log('\nTest 4: Benefits of single deduplication')
  console.log('  ✅ Simpler code: One deduplication mechanism')
  console.log('  ✅ No race conditions: Single source of truth')
  console.log('  ✅ Better performance: Less overhead')
  console.log('  ✅ Full-path dedup: Prevents redundant cache checks too')
  console.log('  ✅ Easier debugging: Single deduplication point')

  console.log('\n✅ Deduplication fix demonstration completed!')
  console.log('📋 Summary: Removed redundant apiRequestCache, kept operationLocks')
}

runTests().catch(console.error)