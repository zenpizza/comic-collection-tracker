#!/usr/bin/env node

/**
 * Test script to demonstrate timeout leak fix
 */

console.log('🧪 Testing Timeout Leak Fix\n')

// Mock implementation showing the bug and fix
class MockImageService {
  constructor() {
    this.operationLocks = new Map()
    this.config = { lockTimeout: 5000 }
    this.activeTimeouts = new Set() // Track timeouts for testing
  }

  // ❌ BUGGY VERSION: Timeout never cleared
  async getImageUrlBuggy(cacheKey) {
    const operationPromise = this.mockOperation()
    this.operationLocks.set(cacheKey, operationPromise)

    // BUG: Timeout is never cleared!
    const timeoutId = setTimeout(() => {
      this.operationLocks.delete(cacheKey)
      console.log(`  ❌ Timeout fired for ${cacheKey} (should have been cleared!)`)
    }, this.config.lockTimeout)
    
    this.activeTimeouts.add(timeoutId) // Track for testing

    try {
      const result = await operationPromise
      return result
    } catch (error) {
      return null
    } finally {
      // BUG: Timeout not cleared, will still fire!
      this.operationLocks.delete(cacheKey)
    }
  }

  // ✅ FIXED VERSION: Timeout properly cleared
  async getImageUrlFixed(cacheKey) {
    const operationPromise = this.mockOperation()
    this.operationLocks.set(cacheKey, operationPromise)

    // Set timeout for operation lock cleanup
    const timeoutId = setTimeout(() => {
      this.operationLocks.delete(cacheKey)
      console.log(`  ⚠️  Timeout fired for ${cacheKey} (operation took too long)`)
    }, this.config.lockTimeout)
    
    this.activeTimeouts.add(timeoutId) // Track for testing

    try {
      const result = await operationPromise
      return result
    } catch (error) {
      return null
    } finally {
      // FIX: Clear timeout and delete lock
      clearTimeout(timeoutId)
      this.activeTimeouts.delete(timeoutId)
      this.operationLocks.delete(cacheKey)
    }
  }

  async mockOperation() {
    // Simulate fast operation (completes before timeout)
    await new Promise(resolve => setTimeout(resolve, 100))
    return 'mock-result'
  }

  getActiveTimeoutCount() {
    return this.activeTimeouts.size
  }
}

async function runTests() {
  const service = new MockImageService()

  console.log('Test 1: Buggy version (timeout leak)')
  console.log('  Starting operation...')
  
  const result1 = await service.getImageUrlBuggy('test-key-1')
  console.log(`  Operation completed: ${result1}`)
  console.log(`  Active timeouts: ${service.getActiveTimeoutCount()} (should be 0, but isn't!)`)
  
  // Wait a bit to see if timeout fires
  console.log('  Waiting for leaked timeout to fire...')
  await new Promise(resolve => setTimeout(resolve, 200))
  
  console.log('\nTest 2: Fixed version (no leak)')
  console.log('  Starting operation...')
  
  const result2 = await service.getImageUrlFixed('test-key-2')
  console.log(`  Operation completed: ${result2}`)
  console.log(`  Active timeouts: ${service.getActiveTimeoutCount()} (should be 0)`)
  
  // Wait to confirm no timeout fires
  console.log('  Waiting to confirm no timeout fires...')
  await new Promise(resolve => setTimeout(resolve, 200))
  
  console.log('\nTest 3: Demonstrating the memory impact')
  console.log('  Simulating 100 rapid operations with buggy version...')
  
  const promises = []
  for (let i = 0; i < 100; i++) {
    promises.push(service.getImageUrlBuggy(`bulk-key-${i}`))
  }
  
  await Promise.all(promises)
  console.log(`  After 100 operations: ${service.getActiveTimeoutCount()} leaked timeouts!`)
  console.log('  Each timeout holds memory and will fire unnecessarily')
  
  console.log('\n✅ Timeout leak demonstration completed!')
  console.log('📋 Summary:')
  console.log('  - Buggy version: Timeouts never cleared, causing memory leaks')
  console.log('  - Fixed version: Timeouts properly cleared in finally block')
  console.log('  - Impact: Memory leaks, race conditions, resource waste')
}

runTests().catch(console.error)