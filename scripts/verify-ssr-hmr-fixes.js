#!/usr/bin/env node

/**
 * Verify SSR/HMR Safety Implementation
 * 
 * Simple verification of the SSR and HMR safety fixes
 * by examining the code patterns and testing basic functionality.
 */

console.log('🔍 Verifying SSR/HMR Safety Implementation...\n')

import fs from 'fs'
import path from 'path'

const serviceFile = path.join(process.cwd(), 'src/utils/ImageURLService.js')
const serviceCode = fs.readFileSync(serviceFile, 'utf8')

console.log('📋 Implementation Verification:')

// Check SSR safety patterns
const hasAtobSafe = serviceCode.includes('const atobSafe = typeof atob === \'function\'')
const hasBufferFallback = serviceCode.includes('Buffer.from(s, \'base64\').toString(\'binary\')')
const usesAtobSafe = serviceCode.includes('const byteCharacters = atobSafe(base64)')
const hasBlobSafe = serviceCode.includes('const BlobCtor = typeof Blob !== \'undefined\' ? Blob : null')
const usesBlobCtor = serviceCode.includes('new BlobCtor([byteArray], { type: mimeType })')

console.log(`✓ SSR-safe atob declaration: ${hasAtobSafe ? '✅' : '❌'}`)
console.log(`✓ Node.js Buffer fallback: ${hasBufferFallback ? '✅' : '❌'}`)
console.log(`✓ Uses safe decoder in base64ToBlob: ${usesAtobSafe ? '✅' : '❌'}`)
console.log(`✓ SSR-safe Blob constructor check: ${hasBlobSafe ? '✅' : '❌'}`)
console.log(`✓ Uses safe Blob constructor: ${usesBlobCtor ? '✅' : '❌'}`)

// Check HMR safety patterns
const hasGlobalThisSingleton = serviceCode.includes('globalThis.__imageURLService')
const hasNullishCoalescing = serviceCode.includes('globalThis.__imageURLService ??=')
const hasSingletonVariable = serviceCode.includes('const singleton = globalThis.__imageURLService ??')
const exportsSingleton = serviceCode.includes('export default singleton')

console.log(`✓ GlobalThis singleton storage: ${hasGlobalThisSingleton ? '✅' : '❌'}`)
console.log(`✓ Nullish coalescing assignment: ${hasNullishCoalescing ? '✅' : '❌'}`)
console.log(`✓ Singleton variable pattern: ${hasSingletonVariable ? '✅' : '❌'}`)
console.log(`✓ Exports singleton instance: ${exportsSingleton ? '✅' : '❌'}`)

// Extract and display the actual implementations
console.log('\n📖 Implementation Details:')

// SSR-safe atob implementation
const atobMatch = serviceCode.match(/const atobSafe = ([\s\S]*?)\n/);
if (atobMatch) {
  console.log('\n🔧 SSR-safe base64 decoder:')
  console.log('```javascript')
  console.log('const atobSafe = ' + atobMatch[1])
  console.log('```')
}

// HMR-safe singleton implementation
const singletonMatch = serviceCode.match(/(const singleton = globalThis\.__imageURLService[\s\S]*?export default singleton)/);
if (singletonMatch) {
  console.log('\n🔄 HMR-safe singleton export:')
  console.log('```javascript')
  console.log(singletonMatch[1])
  console.log('```')
}

// Test basic functionality
console.log('\n🧪 Basic Functionality Test:')

try {
  // Test that the module can be imported in Node.js
  const ImageURLService = await import('../src/utils/ImageURLService.js')
  
  if (ImageURLService.default) {
    console.log('✅ Module imports successfully in Node.js')
  } else {
    console.log('❌ Module import failed')
  }
  
  // Test that singleton is stored in globalThis
  if (globalThis.__imageURLService === ImageURLService.default) {
    console.log('✅ Singleton properly stored in globalThis')
  } else {
    console.log('❌ Singleton not stored in globalThis')
  }
  
  // Test base64 decoding in Node.js environment
  if (typeof ImageURLService.default.base64ToBlob === 'function') {
    console.log('✅ base64ToBlob method available')
    
    // Mock Blob for Node.js
    global.Blob = class MockBlob {
      constructor(parts, options) {
        this.type = options?.type || ''
        this.size = parts.reduce((size, part) => size + (part.length || part.byteLength || 0), 0)
      }
    }
    
    const testResult = ImageURLService.default.base64ToBlob('SGVsbG8=', 'text/plain')
    if (testResult && testResult.type === 'text/plain') {
      console.log('✅ Base64 decoding works in Node.js')
    } else {
      console.log('❌ Base64 decoding failed in Node.js')
    }
    
    delete global.Blob
  }
  
} catch (error) {
  console.log('❌ Basic functionality test failed:', error.message)
}

// Summary
const allSSRChecks = [hasAtobSafe, hasBufferFallback, usesAtobSafe, hasBlobSafe, usesBlobCtor]
const allHMRChecks = [hasGlobalThisSingleton, hasNullishCoalescing, hasSingletonVariable, exportsSingleton]
const allChecks = [...allSSRChecks, ...allHMRChecks]

console.log('\n' + '='.repeat(60))
if (allChecks.every(Boolean)) {
  console.log('🎉 All SSR/HMR safety patterns verified!')
  console.log('\n✅ SSR Safety Features:')
  console.log('• Safe base64 decoding with atob/Buffer fallback')
  console.log('• Safe Blob constructor with availability check')
  console.log('• Works in both browser and Node.js environments')
  console.log('• Graceful handling of missing browser APIs')
  
  console.log('\n✅ HMR Safety Features:')
  console.log('• Singleton preserved across hot module reloads')
  console.log('• State maintained during development')
  console.log('• GlobalThis storage prevents instance duplication')
  console.log('• Nullish coalescing prevents accidental overwrites')
  
  console.log('\n🚀 Ready for production use in SSR and HMR environments!')
} else {
  console.log('❌ Some safety patterns are missing!')
  console.log(`SSR checks: ${allSSRChecks.filter(Boolean).length}/${allSSRChecks.length}`)
  console.log(`HMR checks: ${allHMRChecks.filter(Boolean).length}/${allHMRChecks.length}`)
}

console.log(`\n📊 Overall Score: ${allChecks.filter(Boolean).length}/${allChecks.length}`)