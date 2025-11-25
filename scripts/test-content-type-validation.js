#!/usr/bin/env node

/**
 * Test script to demonstrate content-type validation fix
 */

console.log('🧪 Testing Content-Type Validation Fix\n')

// Mock implementation showing the security issue and fix
class MockImageService {
  constructor() {
    this.stats = { errors: 0 }
  }

  // ❌ VULNERABLE VERSION: Only checks for JSON
  async processResponseVulnerable(mockResponse) {
    const { contentType, body, status } = mockResponse
    
    console.log(`  Processing response with Content-Type: ${contentType || 'none'}`)
    
    if (!status || status !== 200) {
      throw new Error(`HTTP ${status}`)
    }

    // VULNERABLE: Only checks for JSON, ignores other non-image types
    if (contentType && contentType.includes('application/json')) {
      console.log('  ❌ Detected JSON error response')
      const errorData = JSON.parse(body)
      throw new Error(errorData.error || 'Unknown API error')
    }

    // DANGEROUS: Assumes anything non-JSON is an image!
    console.log('  ❌ Assuming response is an image (DANGEROUS!)')
    console.log(`  ❌ Would process as blob: ${body.substring(0, 50)}...`)
    
    return {
      success: true,
      warning: 'Processed non-image content as image!'
    }
  }

  // ✅ SECURE VERSION: Validates all content types
  async processResponseSecure(mockResponse) {
    const { contentType, body, status } = mockResponse
    
    console.log(`  Processing response with Content-Type: ${contentType || 'none'}`)
    
    if (!status || status !== 200) {
      throw new Error(`HTTP ${status}`)
    }

    const ct = contentType || ''

    // Handle JSON error responses
    if (ct.includes('application/json')) {
      console.log('  ✅ Detected JSON error response')
      const errorData = JSON.parse(body)
      throw new Error(errorData.error || 'Unknown API error')
    }

    // SECURE: Validate that response is actually an image
    if (!ct.startsWith('image/')) {
      const error = `Unexpected content-type: ${ct}. Expected image/* but got ${ct || 'no content-type'}`
      console.log(`  ✅ Rejected non-image content: ${error}`)
      throw new Error(error)
    }

    console.log('  ✅ Valid image content-type, processing as image')
    return {
      success: true,
      contentType: ct
    }
  }

  trackError(context, error) {
    this.stats.errors++
    console.log(`    📊 Error tracked: ${context} - ${error.message}`)
  }
}

async function runTests() {
  const service = new MockImageService()

  console.log('Test 1: Vulnerable version with malicious responses')
  
  const maliciousResponses = [
    {
      name: 'HTML Error Page',
      contentType: 'text/html',
      body: '<html><body><h1>404 Not Found</h1><script>alert("XSS")</script></body></html>',
      status: 200
    },
    {
      name: 'Plain Text Response',
      contentType: 'text/plain',
      body: 'Error: Image not found. Please contact administrator.',
      status: 200
    },
    {
      name: 'XML Response',
      contentType: 'application/xml',
      body: '<?xml version="1.0"?><error><message>Access denied</message></error>',
      status: 200
    },
    {
      name: 'Binary Data (not image)',
      contentType: 'application/octet-stream',
      body: 'BINARY_DATA_THAT_IS_NOT_AN_IMAGE_BUT_COULD_BE_MALICIOUS',
      status: 200
    },
    {
      name: 'No Content-Type',
      contentType: null,
      body: 'Response with no content-type header - could be anything!',
      status: 200
    }
  ]

  for (const response of maliciousResponses) {
    console.log(`\n  Testing: ${response.name}`)
    try {
      const result = await service.processResponseVulnerable(response)
      console.log(`  ❌ SECURITY RISK: ${result.warning}`)
    } catch (error) {
      console.log(`  ❌ Error (but still processed): ${error.message}`)
    }
  }

  console.log('\n\nTest 2: Secure version with same responses')
  
  for (const response of maliciousResponses) {
    console.log(`\n  Testing: ${response.name}`)
    try {
      const result = await service.processResponseSecure(response)
      console.log(`  ❌ Should have been rejected: ${result.success}`)
    } catch (error) {
      console.log(`  ✅ Properly rejected: ${error.message}`)
    }
  }

  console.log('\n\nTest 3: Valid image responses')
  
  const validImageResponses = [
    {
      name: 'JPEG Image',
      contentType: 'image/jpeg',
      body: 'FAKE_JPEG_BINARY_DATA',
      status: 200
    },
    {
      name: 'PNG Image',
      contentType: 'image/png',
      body: 'FAKE_PNG_BINARY_DATA',
      status: 200
    },
    {
      name: 'WebP Image',
      contentType: 'image/webp',
      body: 'FAKE_WEBP_BINARY_DATA',
      status: 200
    },
    {
      name: 'SVG Image',
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>',
      status: 200
    }
  ]

  for (const response of validImageResponses) {
    console.log(`\n  Testing: ${response.name}`)
    try {
      const result = await service.processResponseSecure(response)
      console.log(`  ✅ Accepted valid image: ${result.contentType}`)
    } catch (error) {
      console.log(`  ❌ Incorrectly rejected: ${error.message}`)
    }
  }

  console.log('\n\nTest 4: JSON error responses (should still work)')
  
  const jsonResponses = [
    {
      name: 'JSON Error',
      contentType: 'application/json',
      body: '{"success": false, "error": "Image storage not configured"}',
      status: 200
    },
    {
      name: 'JSON Error with charset',
      contentType: 'application/json; charset=utf-8',
      body: '{"success": false, "error": "Access denied"}',
      status: 200
    }
  ]

  for (const response of jsonResponses) {
    console.log(`\n  Testing: ${response.name}`)
    try {
      const result = await service.processResponseSecure(response)
      console.log(`  ❌ Should have thrown error: ${result.success}`)
    } catch (error) {
      console.log(`  ✅ Properly handled JSON error: ${error.message}`)
    }
  }

  console.log('\n\nTest 5: Security implications')
  console.log('  🚨 Security Risks of Vulnerable Version:')
  console.log('    - HTML responses could contain XSS payloads')
  console.log('    - Binary data could be malicious executables')
  console.log('    - Text responses could leak sensitive information')
  console.log('    - XML responses could contain XXE attacks')
  console.log('    - No content-type validation allows any content')
  console.log('')
  console.log('  🛡️  Security Benefits of Fixed Version:')
  console.log('    - Only image/* content-types accepted')
  console.log('    - Clear error messages for debugging')
  console.log('    - Prevents processing of malicious content')
  console.log('    - Maintains JSON error handling compatibility')
  console.log('    - Explicit validation of expected content')

  console.log('\n✅ Content-Type validation fix demonstration completed!')
  console.log('📋 Summary: Added proper image/* validation to prevent security issues')
}

runTests().catch(console.error)