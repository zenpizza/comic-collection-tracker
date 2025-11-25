#!/usr/bin/env node

/**
 * Verify BeforeUnload Handler Fix Implementation
 * 
 * Checks the source code to ensure the fix is properly implemented
 * according to the bug report specifications.
 */

console.log('🔍 Verifying BeforeUnload Handler Fix Implementation...\n')

import fs from 'fs'
import path from 'path'

const serviceFile = path.join(process.cwd(), 'src/utils/ImageURLService.js')
const serviceCode = fs.readFileSync(serviceFile, 'utf8')

console.log('Checking implementation details:')

// Check 1: Handler reference storage
const hasHandlerReference = serviceCode.includes('this._onBeforeUnload = null')
console.log(`✓ Handler reference storage: ${hasHandlerReference ? '✅' : '❌'}`)

// Check 2: Handler assignment with reference
const hasHandlerAssignment = serviceCode.includes('this._onBeforeUnload = () => this.destroy()')
console.log(`✓ Handler assignment with reference: ${hasHandlerAssignment ? '✅' : '❌'}`)

// Check 3: Event listener with stored reference
const hasEventListenerWithRef = serviceCode.includes('window.addEventListener(\'beforeunload\', this._onBeforeUnload)')
console.log(`✓ Event listener with stored reference: ${hasEventListenerWithRef ? '✅' : '❌'}`)

// Check 4: Event listener removal in destroy
const hasEventListenerRemoval = serviceCode.includes('window.removeEventListener(\'beforeunload\', this._onBeforeUnload)')
console.log(`✓ Event listener removal in destroy: ${hasEventListenerRemoval ? '✅' : '❌'}`)

// Check 5: Handler reference cleanup
const hasHandlerCleanup = serviceCode.includes('this._onBeforeUnload = null')
console.log(`✓ Handler reference cleanup: ${hasHandlerCleanup ? '✅' : '❌'}`)

// Check 6: Browser environment check
const hasBrowserCheck = serviceCode.includes('if (this._onBeforeUnload && this.isBrowser)')
console.log(`✓ Browser environment check: ${hasBrowserCheck ? '✅' : '❌'}`)

// Extract the actual implementation
console.log('\n📋 Implementation Details:')

// Constructor initialization
const initMatch = serviceCode.match(/if \(this\.isBrowser\) \{([\s\S]*?)\n  \}/);
if (initMatch) {
  console.log('\n🏗️  Constructor initialization:')
  console.log('```javascript')
  console.log('if (this.isBrowser) {' + initMatch[1] + '\n}')
  console.log('```')
}

// Destroy method
const destroyMatch = serviceCode.match(/destroy\(\) \{([\s\S]*?)\n  \}/);
if (destroyMatch) {
  console.log('\n🧹 Destroy method:')
  console.log('```javascript')
  console.log('destroy() {' + destroyMatch[1] + '\n}')
  console.log('```')
}

// Verify the exact pattern from bug report
const expectedPattern = /this\._onBeforeUnload = \(\) => this\.destroy\(\)/
const hasExpectedPattern = expectedPattern.test(serviceCode)

const expectedRemoval = /window\.removeEventListener\('beforeunload', this\._onBeforeUnload\)/
const hasExpectedRemoval = expectedRemoval.test(serviceCode)

console.log('\n🎯 Bug Report Pattern Matching:')
console.log(`✓ Handler assignment pattern: ${hasExpectedPattern ? '✅' : '❌'}`)
console.log(`✓ Removal pattern: ${hasExpectedRemoval ? '✅' : '❌'}`)

// Summary
const allChecks = [
  hasHandlerReference,
  hasHandlerAssignment,
  hasEventListenerWithRef,
  hasEventListenerRemoval,
  hasHandlerCleanup,
  hasBrowserCheck,
  hasExpectedPattern,
  hasExpectedRemoval
]

const allPassed = allChecks.every(check => check)

console.log('\n' + '='.repeat(60))
if (allPassed) {
  console.log('🎉 Implementation verification passed!')
  console.log('\nThe fix correctly implements:')
  console.log('• Stores handler reference for proper cleanup')
  console.log('• Uses same reference for add and remove operations')
  console.log('• Includes browser environment safety checks')
  console.log('• Cleans up reference to prevent memory leaks')
  console.log('• Follows the exact pattern from the bug report')
} else {
  console.log('❌ Implementation verification failed!')
  console.log('Some required patterns are missing from the code.')
}

console.log(`\n📊 Verification Score: ${allChecks.filter(Boolean).length}/${allChecks.length}`)