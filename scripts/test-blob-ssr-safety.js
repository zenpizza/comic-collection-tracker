#!/usr/bin/env node

/**
 * Test Blob SSR Safety Fix
 * 
 * Verifies that base64ToBlob method safely handles environments
 * where the Blob constructor is not available (SSR/Node.js).
 * 
 * Bug: base64ToBlob crashes in SSR when Blob constructor is undefined
 * Fix: Defensive check for Blob availability before usage
 */

console.log('🧪 Testing Blob SSR Safety Fix...\n')

// Mock browser environment initially
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }
}
global.URL = global.window.URL

import ImageURLService from '../src/utils/ImageURLService.js'

async function testBlobAvailabilityCheck() {
  console.log('Test 1: Blob availability detection')
  
  // Test with Blob available (browser environment)
  global.Blob = class MockBlob {
    constructor(parts, options) {
      this.parts = parts
      this.type = options?.type || ''
      this.size = parts.reduce((size, part) => size + (part.length || part.byteLength || 0), 0)
    }
  }
  
  const testBase64 = 'SGVsbG8gV29ybGQ=' // "Hello World" in base64
  
  console.log('   - Testing with Blob constructor available')
  const resultWithBlob = ImageURLService.base64ToBlob(testBase64, 'text/plain')
  
  if (resultWithBlob && resultWithBlob.type === 'text/plain') {
    console.log('✅ Works correctly when Blob is available')
    console.log(`   - Created blob with type: ${resultWithBlob.type}`)
  } else {
    console.log('❌ Failed when Blob is available')
    console.log(`   - Result: ${resultWithBlob}`)
    return false
  }
  
  return true
}

async function testBlobUnavailabilityHandling() {
  console.log('\nTest 2: Blob unavailability handling (SSR simulation)')
  
  // Remove Blob to simulate SSR environment
  const originalBlob = global.Blob
  delete global.Blob
  
  try {
    const testBase64 = 'SGVsbG8gV29ybGQ=' // "Hello World" in base64
    
    console.log('   - Testing with Blob constructor unavailable (SSR)')
    const resultWithoutBlob = ImageURLService.base64ToBlob(testBase64, 'text/plain')
    
    if (resultWithoutBlob === null) {
      console.log('✅ Gracefully returns null when Blob is unavailable')
      console.log('   - No crash or error thrown')
    } else {
      console.log('❌ Did not handle Blob unavailability correctly')
      console.log(`   - Expected: null, Got: ${resultWithoutBlob}`)
      return false
    }
    
    return true
  } catch (error) {
    console.log('❌ Threw error when Blob unavailable:', error.message)
    return false
  } finally {
    // Restore Blob
    if (originalBlob) {
      global.Blob = originalBlob
    }
  }
}

async function testErrorHandling() {
  console.log('\nTest 3: Error handling with invalid input')
  
  // Restore Blob for this test
  global.Blob = class MockBlob {
    constructor(parts, options) {
      this.parts = parts
      this.type = options?.type || ''
    }
  }
  
  console.log('   - Testing with invalid base64 input')
  const resultWithInvalidInput = ImageURLService.base64ToBlob('invalid-base64!@#', 'text/plain')
  
  if (resultWithInvalidInput === null) {
    console.log('✅ Handles invalid base64 gracefully')
  } else {
    console.log('❌ Did not handle invalid input correctly')
    return false
  }
  
  return true
}

async function testDefensiveCheckPattern() {
  console.log('\nTest 4: Defensive check pattern verification')
  
  // Check the actual code pattern
  const fs = await import('fs')
  const path = await import('path')
  
  const serviceFile = path.join(process.cwd(), 'src/utils/ImageURLService.js')
  const serviceCode = fs.readFileSync(serviceFile, 'utf8')
  
  // Check for defensive Blob check
  const hasBlobCheck = serviceCode.includes('const BlobCtor = typeof Blob !== \'undefined\' ? Blob : null')
  const hasNullCheck = serviceCode.includes('if (!BlobCtor) return null')
  const usesBlobCtor = serviceCode.includes('new BlobCtor([byteArray], { type: mimeType })')
  
  console.log(`✓ Blob availability check: ${hasBlobCheck ? '✅' : '❌'}`)
  console.log(`✓ Null check and early return: ${hasNullCheck ? '✅' : '❌'}`)
  console.log(`✓ Uses BlobCtor instead of Blob: ${usesBlobCtor ? '✅' : '❌'}`)
  
  if (hasBlobCheck && hasNullCheck && usesBlobCtor) {
    console.log('✅ Defensive check pattern implemented correctly')
    return true
  } else {
    console.log('❌ Defensive check pattern incomplete')
    return false
  }
}

async function testConsistencyWithAtobSafety() {
  console.log('\nTest 5: Consistency with atob safety pattern')
  
  const fs = await import('fs')
  const path = await import('path')
  
  const serviceFile = path.join(process.cwd(), 'src/utils/ImageURLService.js')
  const serviceCode = fs.readFileSync(serviceFile, 'utf8')
  
  // Check that both atob and Blob have similar safety patterns
  const hasAtobSafe = serviceCode.includes('const atobSafe = typeof atob === \'function\'')
  const hasBlobSafe = serviceCode.includes('const BlobCtor = typeof Blob !== \'undefined\'')
  
  console.log(`✓ atob safety pattern: ${hasAtobSafe ? '✅' : '❌'}`)
  console.log(`✓ Blob safety pattern: ${hasBlobSafe ? '✅' : '❌'}`)
  
  if (hasAtobSafe && hasBlobSafe) {
    console.log('✅ Consistent SSR safety patterns for both atob and Blob')
    return true
  } else {
    console.log('❌ Inconsistent SSR safety patterns')
    return false
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Blob SSR Safety Tests\n')
  
  try {
    const test1Passed = await testBlobAvailabilityCheck()
    const test2Passed = await testBlobUnavailabilityHandling()
    const test3Passed = await testErrorHandling()
    const test4Passed = await testDefensiveCheckPattern()
    const test5Passed = await testConsistencyWithAtobSafety()
    
    console.log('\n' + '='.repeat(60))
    
    if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
      console.log('🎉 All tests passed! Blob SSR safety is implemented correctly.')
      console.log('\nKey improvements verified:')
      console.log('• Defensive check for Blob constructor availability')
      console.log('• Graceful handling when Blob is undefined (SSR/Node.js)')
      console.log('• No crashes or errors in server-side environments')
      console.log('• Consistent safety patterns with atob handling')
      console.log('• Proper error handling for invalid inputs')
      
      console.log('\n🔧 Implementation Pattern:')
      console.log('```javascript')
      console.log('const BlobCtor = typeof Blob !== \'undefined\' ? Blob : null')
      console.log('if (!BlobCtor) return null')
      console.log('return new BlobCtor([byteArray], { type: mimeType })')
      console.log('```')
      
      console.log('\n🌐 SSR Compatibility: Full support for server-side rendering')
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