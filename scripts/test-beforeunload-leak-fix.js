#!/usr/bin/env node

/**
 * Test BeforeUnload Handler Leak Fix
 * 
 * Verifies that the beforeunload event listener is properly removed
 * when the ImageURLService is destroyed to prevent memory leaks.
 * 
 * Bug: beforeunload handler leak - event listener not removed on destroy
 * Fix: Store handler reference and remove listener in destroy()
 */

console.log('🧪 Testing BeforeUnload Handler Leak Fix...\n')

// Mock browser environment
global.window = {
  addEventListener: null,
  removeEventListener: null,
  URL: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  }
}

global.URL = global.window.URL

// Track event listener calls
let addEventListenerCalls = []
let removeEventListenerCalls = []

global.window.addEventListener = (event, handler, options) => {
  addEventListenerCalls.push({ event, handler, options })
  console.log(`📝 addEventListener called: ${event}`)
}

global.window.removeEventListener = (event, handler, options) => {
  removeEventListenerCalls.push({ event, handler, options })
  console.log(`🗑️  removeEventListener called: ${event}`)
}

// Import ImageURLService after setting up mocks
import ImageURLService from '../src/utils/ImageURLService.js'

async function testBeforeUnloadHandlerCleanup() {
  console.log('Test 1: BeforeUnload handler registration and cleanup')
  
  // Reset tracking
  addEventListenerCalls = []
  removeEventListenerCalls = []
  
  // Create a new service instance to test initialization
  const TestService = class extends ImageURLService.constructor {
    constructor() {
      super()
    }
  }
  
  const testService = new TestService()
  
  // Check if beforeunload listener was added
  const beforeUnloadAdded = addEventListenerCalls.some(call => call.event === 'beforeunload')
  
  if (beforeUnloadAdded) {
    console.log('✅ BeforeUnload event listener was registered during initialization')
  } else {
    console.log('❌ BeforeUnload event listener was NOT registered')
    return false
  }
  
  // Check if handler reference is stored
  if (testService._onBeforeUnload && typeof testService._onBeforeUnload === 'function') {
    console.log('✅ Handler reference is properly stored')
  } else {
    console.log('❌ Handler reference is missing or invalid')
    console.log(`   - _onBeforeUnload: ${testService._onBeforeUnload}`)
    return false
  }
  
  // Test destroy cleanup
  testService.destroy()
  
  // Check if beforeunload listener was removed
  const beforeUnloadRemoved = removeEventListenerCalls.some(call => call.event === 'beforeunload')
  
  if (beforeUnloadRemoved) {
    console.log('✅ BeforeUnload event listener was properly removed during destroy')
  } else {
    console.log('❌ BeforeUnload event listener was NOT removed during destroy')
    return false
  }
  
  // Check if handler reference was cleared
  if (testService._onBeforeUnload === null) {
    console.log('✅ Handler reference was properly cleared')
  } else {
    console.log('❌ Handler reference was not cleared')
    console.log(`   - _onBeforeUnload after destroy: ${testService._onBeforeUnload}`)
    return false
  }
  
  return true
}

async function testHandlerReferenceMatching() {
  console.log('\nTest 2: Handler reference matching')
  
  // Reset tracking
  addEventListenerCalls = []
  removeEventListenerCalls = []
  
  // Create service instance
  const TestService = class extends ImageURLService.constructor {
    constructor() {
      super()
    }
  }
  
  const testService = new TestService()
  
  // Get the handler that was added
  const addedCall = addEventListenerCalls.find(call => call.event === 'beforeunload')
  const addedHandler = addedCall ? addedCall.handler : null
  
  // Destroy and get the handler that was removed
  testService.destroy()
  
  const removedCall = removeEventListenerCalls.find(call => call.event === 'beforeunload')
  const removedHandler = removedCall ? removedCall.handler : null
  
  // Check if the same handler reference was used
  if (addedHandler && removedHandler && addedHandler === removedHandler) {
    console.log('✅ Same handler reference used for add and remove')
  } else {
    console.log('❌ Different handler references used for add and remove')
    console.log(`   - Added handler: ${addedHandler}`)
    console.log(`   - Removed handler: ${removedHandler}`)
    return false
  }
  
  return true
}

async function testMultipleDestroyCallsSafety() {
  console.log('\nTest 3: Multiple destroy calls safety')
  
  // Reset tracking
  addEventListenerCalls = []
  removeEventListenerCalls = []
  
  // Create service instance
  const TestService = class extends ImageURLService.constructor {
    constructor() {
      super()
    }
  }
  
  const testService = new TestService()
  
  // Call destroy multiple times
  testService.destroy()
  testService.destroy()
  testService.destroy()
  
  // Count removeEventListener calls for beforeunload
  const removeCount = removeEventListenerCalls.filter(call => call.event === 'beforeunload').length
  
  if (removeCount === 1) {
    console.log('✅ Multiple destroy calls are safe - listener removed only once')
  } else {
    console.log('❌ Multiple destroy calls caused issues')
    console.log(`   - removeEventListener called ${removeCount} times`)
    return false
  }
  
  return true
}

async function testNonBrowserEnvironmentSafety() {
  console.log('\nTest 4: Non-browser environment safety')
  
  // Temporarily remove window to simulate non-browser environment
  const originalWindow = global.window
  delete global.window
  
  try {
    // Create service in non-browser environment
    const TestService = class extends ImageURLService.constructor {
      constructor() {
        super()
      }
    }
    
    const testService = new TestService()
    
    // Check that isBrowser is false
    if (!testService.isBrowser) {
      console.log('✅ Non-browser environment detected correctly')
    } else {
      console.log('❌ Browser environment incorrectly detected')
      return false
    }
    
    // Check that _onBeforeUnload is null (not set)
    if (testService._onBeforeUnload === null) {
      console.log('✅ Handler reference not set in non-browser environment')
    } else {
      console.log('❌ Handler reference incorrectly set in non-browser environment')
      return false
    }
    
    // Destroy should not throw errors
    try {
      testService.destroy()
      console.log('✅ Destroy works safely in non-browser environment')
    } catch (error) {
      console.log('❌ Destroy failed in non-browser environment:', error.message)
      return false
    }
    
    return true
  } finally {
    // Restore window
    global.window = originalWindow
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting BeforeUnload Handler Leak Tests\n')
  
  try {
    const test1Passed = await testBeforeUnloadHandlerCleanup()
    const test2Passed = await testHandlerReferenceMatching()
    const test3Passed = await testMultipleDestroyCallsSafety()
    const test4Passed = await testNonBrowserEnvironmentSafety()
    
    console.log('\n' + '='.repeat(60))
    
    if (test1Passed && test2Passed && test3Passed && test4Passed) {
      console.log('🎉 All tests passed! BeforeUnload handler leak is fixed.')
      console.log('\nKey improvements verified:')
      console.log('• Handler reference properly stored and cleaned up')
      console.log('• Same handler used for addEventListener and removeEventListener')
      console.log('• Multiple destroy calls are safe')
      console.log('• Non-browser environments handled correctly')
      console.log('• No memory leaks from orphaned event listeners')
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