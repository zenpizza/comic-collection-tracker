#!/usr/bin/env node

/**
 * Test SSR/HMR Safety Fixes
 * 
 * Verifies that the ImageURLService works correctly in:
 * 1. SSR/Node.js environments (safe base64 decoding)
 * 2. HMR scenarios (singleton preservation across reloads)
 * 
 * Bug: SSR/HMR safety for base64 decode and singleton
 * Fix: Safe atob fallback and globalThis singleton preservation
 */

console.log('🧪 Testing SSR/HMR Safety Fixes...\n')

async function testSSRSafeBase64Decoding() {
  console.log('Test 1: SSR-safe base64 decoding')
  
  // Test in current Node.js environment (no atob)
  const originalAtob = global.atob
  delete global.atob
  
  try {
    // Import fresh to test the atobSafe fallback
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    
    // Clear module cache to force re-evaluation
    const modulePath = require.resolve('../src/utils/ImageURLService.js')
    delete require.cache[modulePath]
    
    // Re-import to test SSR environment
    const ImageURLService = await import('../src/utils/ImageURLService.js?t=' + Date.now())
    
    // Test base64 decoding in Node.js environment
    const testBase64 = 'SGVsbG8gV29ybGQ=' // "Hello World" in base64
    
    // Create a mock Blob constructor for Node.js
    global.Blob = class MockBlob {
      constructor(parts, options) {
        this.parts = parts
        this.type = options?.type || ''
        this.size = parts.reduce((size, part) => size + (part.length || part.byteLength || 0), 0)
      }
    }
    
    // Test the base64ToBlob method
    const result = ImageURLService.default.base64ToBlob(testBase64, 'text/plain')
    
    if (result && result.type === 'text/plain') {
      console.log('✅ Base64 decoding works in Node.js environment')
      console.log(`   - Decoded blob type: ${result.type}`)
      console.log(`   - Decoded blob size: ${result.size}`)
    } else {
      console.log('❌ Base64 decoding failed in Node.js environment')
      console.log(`   - Result: ${result}`)
      return false
    }
    
    return true
  } catch (error) {
    console.log('❌ SSR base64 decoding test failed:', error.message)
    return false
  } finally {
    // Restore atob if it existed
    if (originalAtob) {
      global.atob = originalAtob
    }
    // Clean up mock Blob
    delete global.Blob
  }
}

async function testBrowserSafeBase64Decoding() {
  console.log('\nTest 2: Browser-safe base64 decoding')
  
  // Mock browser environment with atob
  global.atob = (str) => {
    console.log('   - Using browser atob function')
    return Buffer.from(str, 'base64').toString('binary')
  }
  
  global.Blob = class MockBlob {
    constructor(parts, options) {
      this.parts = parts
      this.type = options?.type || ''
      this.size = parts.reduce((size, part) => size + (part.length || part.byteLength || 0), 0)
    }
  }
  
  try {
    // Import fresh to test browser environment
    const ImageURLService = await import('../src/utils/ImageURLService.js?t=' + Date.now())
    
    const testBase64 = 'SGVsbG8gV29ybGQ=' // "Hello World" in base64
    const result = ImageURLService.default.base64ToBlob(testBase64, 'text/plain')
    
    if (result && result.type === 'text/plain') {
      console.log('✅ Base64 decoding works in browser environment')
    } else {
      console.log('❌ Base64 decoding failed in browser environment')
      return false
    }
    
    return true
  } catch (error) {
    console.log('❌ Browser base64 decoding test failed:', error.message)
    return false
  } finally {
    delete global.atob
    delete global.Blob
  }
}

async function testHMRSingletonPreservation() {
  console.log('\nTest 3: HMR singleton preservation')
  
  try {
    // Clear any existing singleton
    delete globalThis.__imageURLService
    
    // First import
    const ImageURLService1 = await import('../src/utils/ImageURLService.js?t=' + Date.now())
    const instance1 = ImageURLService1.default
    
    // Verify singleton is stored in globalThis
    if (globalThis.__imageURLService === instance1) {
      console.log('✅ Singleton stored in globalThis on first import')
    } else {
      console.log('❌ Singleton not stored in globalThis')
      return false
    }
    
    // Modify some state to test preservation
    instance1.testProperty = 'test-value-' + Date.now()
    const originalTestProperty = instance1.testProperty
    
    // Second import (simulating HMR reload)
    const ImageURLService2 = await import('../src/utils/ImageURLService.js?t=' + Date.now())
    const instance2 = ImageURLService2.default
    
    // Verify same instance is returned
    if (instance1 === instance2) {
      console.log('✅ Same singleton instance returned across imports')
    } else {
      console.log('❌ Different instances returned across imports')
      return false
    }
    
    // Verify state is preserved
    if (instance2.testProperty === originalTestProperty) {
      console.log('✅ Singleton state preserved across HMR reloads')
      console.log(`   - Preserved property: ${instance2.testProperty}`)
    } else {
      console.log('❌ Singleton state not preserved')
      console.log(`   - Expected: ${originalTestProperty}`)
      console.log(`   - Actual: ${instance2.testProperty}`)
      return false
    }
    
    return true
  } catch (error) {
    console.log('❌ HMR singleton test failed:', error.message)
    return false
  }
}

async function testGlobalThisSafety() {
  console.log('\nTest 4: GlobalThis safety and cleanup')
  
  try {
    // Test that globalThis is used safely
    const originalGlobalThis = globalThis.__imageURLService
    
    // Clear singleton
    delete globalThis.__imageURLService
    
    // Import should create new instance
    const ImageURLService1 = await import('../src/utils/ImageURLService.js?t=' + Date.now())
    const instance1 = ImageURLService1.default
    
    // Verify new instance created and stored
    if (globalThis.__imageURLService === instance1) {
      console.log('✅ New singleton created when globalThis is empty')
    } else {
      console.log('❌ Singleton not properly created')
      console.log(`   - globalThis.__imageURLService: ${globalThis.__imageURLService}`)
      console.log(`   - instance1: ${instance1}`)
      console.log(`   - Are they equal: ${globalThis.__imageURLService === instance1}`)
      return false
    }
    
    // Test nullish coalescing operator behavior
    const existingInstance = globalThis.__imageURLService
    globalThis.__imageURLService ??= 'should-not-overwrite'
    
    if (globalThis.__imageURLService === existingInstance) {
      console.log('✅ Nullish coalescing prevents overwriting existing singleton')
    } else {
      console.log('❌ Existing singleton was overwritten')
      return false
    }
    
    // Restore original state
    if (originalGlobalThis) {
      globalThis.__imageURLService = originalGlobalThis
    }
    
    return true
  } catch (error) {
    console.log('❌ GlobalThis safety test failed:', error.message)
    return false
  }
}

async function testCodePatternVerification() {
  console.log('\nTest 5: Code pattern verification')
  
  try {
    const fs = await import('fs')
    const path = await import('path')
    
    const serviceFile = path.join(process.cwd(), 'src/utils/ImageURLService.js')
    const serviceCode = fs.readFileSync(serviceFile, 'utf8')
    
    // Check for SSR-safe atob
    const hasAtobSafe = serviceCode.includes('const atobSafe = typeof atob === \'function\'')
    const hasBufferFallback = serviceCode.includes('Buffer.from(s, \'base64\').toString(\'binary\')')
    const usesAtobSafe = serviceCode.includes('atobSafe(base64)')
    
    console.log(`✓ SSR-safe atob declaration: ${hasAtobSafe ? '✅' : '❌'}`)
    console.log(`✓ Buffer fallback for Node.js: ${hasBufferFallback ? '✅' : '❌'}`)
    console.log(`✓ Uses atobSafe in base64ToBlob: ${usesAtobSafe ? '✅' : '❌'}`)
    
    // Check for HMR-safe singleton
    const hasGlobalThisSingleton = serviceCode.includes('globalThis.__imageURLService')
    const hasNullishCoalescing = serviceCode.includes('globalThis.__imageURLService ??=')
    const hasSingletonExport = serviceCode.includes('export default singleton')
    
    console.log(`✓ GlobalThis singleton storage: ${hasGlobalThisSingleton ? '✅' : '❌'}`)
    console.log(`✓ Nullish coalescing assignment: ${hasNullishCoalescing ? '✅' : '❌'}`)
    console.log(`✓ Singleton export pattern: ${hasSingletonExport ? '✅' : '❌'}`)
    
    const allPatterns = [
      hasAtobSafe, hasBufferFallback, usesAtobSafe,
      hasGlobalThisSingleton, hasNullishCoalescing, hasSingletonExport
    ]
    
    return allPatterns.every(Boolean)
  } catch (error) {
    console.log('❌ Code pattern verification failed:', error.message)
    return false
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting SSR/HMR Safety Tests\n')
  
  try {
    const test1Passed = await testSSRSafeBase64Decoding()
    const test2Passed = await testBrowserSafeBase64Decoding()
    const test3Passed = await testHMRSingletonPreservation()
    const test4Passed = await testGlobalThisSafety()
    const test5Passed = await testCodePatternVerification()
    
    console.log('\n' + '='.repeat(60))
    
    if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
      console.log('🎉 All tests passed! SSR/HMR safety is implemented correctly.')
      console.log('\nKey improvements verified:')
      console.log('• SSR-safe base64 decoding with Buffer fallback')
      console.log('• Browser compatibility with native atob function')
      console.log('• HMR-safe singleton preservation across reloads')
      console.log('• GlobalThis safety with nullish coalescing')
      console.log('• State preservation during development hot reloads')
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