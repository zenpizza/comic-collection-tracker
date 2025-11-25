#!/usr/bin/env node

/**
 * Test script to verify standardized cache expiry logic
 */

// Standardized isCacheExpired function
function isCacheExpired(imageData, cacheTTL = 24 * 60 * 60 * 1000) {
  // Use standardized cachedAt field (numeric timestamp)
  const cachedAt = imageData.metadata?.cachedAt ?? imageData.cachedAt

  if (!cachedAt || typeof cachedAt !== 'number') return false

  return Date.now() > cachedAt + cacheTTL
}

console.log('🧪 Testing Standardized Cache Expiry Logic\n')

// Test 1: Numeric timestamp (standard format)
console.log('Test 1: Numeric timestamp (standard)')
const test1 = {
  metadata: {
    cachedAt: Date.now() - 1000 // 1 second ago
  }
}
console.log('  Fresh item (1s old):', isCacheExpired(test1, 5000) ? '❌ EXPIRED' : '✅ VALID')

const test1b = {
  metadata: {
    cachedAt: Date.now() - 10000 // 10 seconds ago
  }
}
console.log('  Stale item (10s old, TTL 5s):', isCacheExpired(test1b, 5000) ? '✅ EXPIRED' : '❌ VALID')

// Test 2: Invalid timestamp types
console.log('\nTest 2: Invalid timestamp types')
const test2 = {
  metadata: {
    cachedAt: 'invalid-string'
  }
}
console.log('  String timestamp:', isCacheExpired(test2, 5000) ? '❌ EXPIRED' : '✅ VALID (never expires)')

const test2b = {
  metadata: {
    cachedAt: null
  }
}
console.log('  Null timestamp:', isCacheExpired(test2b, 5000) ? '❌ EXPIRED' : '✅ VALID (never expires)')

// Test 3: Root-level timestamp
console.log('\nTest 3: Root-level timestamp')
const test3 = {
  cachedAt: Date.now() - 1000
}
console.log('  Fresh item (1s old):', isCacheExpired(test3, 5000) ? '❌ EXPIRED' : '✅ VALID')

// Test 4: No timestamp
console.log('\nTest 4: No timestamp')
const test4 = {
  metadata: {}
}
console.log('  No timestamp:', isCacheExpired(test4, 5000) ? '❌ EXPIRED' : '✅ VALID (never expires)')

// Test 5: Priority order (metadata.cachedAt takes precedence)
console.log('\nTest 5: Priority order (metadata.cachedAt takes precedence)')
const test5 = {
  metadata: {
    cachedAt: Date.now() - 1000 // Fresh
  },
  cachedAt: Date.now() - 10000 // Stale (should be ignored)
}
console.log('  Should use metadata.cachedAt (fresh):', isCacheExpired(test5, 5000) ? '❌ EXPIRED' : '✅ VALID')

// Test 6: Edge case - zero timestamp
console.log('\nTest 6: Edge case - zero timestamp')
const test6 = {
  metadata: {
    cachedAt: 0
  }
}
console.log('  Zero timestamp (epoch):', isCacheExpired(test6, 5000) ? '✅ EXPIRED' : '❌ VALID (should be expired)')

console.log('\n✅ All standardized cache expiry tests completed!')
console.log('📋 Summary: Using cachedAt as numeric timestamp (Date.now()) throughout codebase')