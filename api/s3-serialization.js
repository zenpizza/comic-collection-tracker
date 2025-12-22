/**
 * S3 Reference Serialization Utilities
 * 
 * Handles serialization and deserialization of S3 image references
 * for storage in MongoDB and API responses.
 * 
 * @see .kiro/specs/s3-image-storage/design.md for data model definitions
 */

/**
 * Required fields for a valid S3 image reference
 */
const REQUIRED_FIELDS = ['key', 'url', 'contentType', 'size', 'uploadedAt']

/**
 * Optional fields that may be present in an S3 image reference
 */
const OPTIONAL_FIELDS = ['etag']

/**
 * Valid image sizes
 */
const VALID_SIZES = ['thumbnail', 'medium', 'full']

/**
 * Serialize an S3 image reference to a plain object for MongoDB storage
 * 
 * @param {Object} reference - The S3 image reference object
 * @param {string} reference.key - S3 object key
 * @param {string} reference.url - CloudFront/S3 public URL
 * @param {string} reference.contentType - MIME type (e.g., 'image/jpeg')
 * @param {number} reference.size - File size in bytes
 * @param {string} [reference.etag] - S3 ETag (optional)
 * @param {string} reference.uploadedAt - ISO timestamp
 * @returns {Object} Serialized reference object
 * @throws {Error} If required fields are missing
 */
export function serializeS3Reference(reference) {
  if (!reference || typeof reference !== 'object') {
    throw new Error('Reference must be an object')
  }

  // Validate required fields
  for (const field of REQUIRED_FIELDS) {
    if (reference[field] === undefined || reference[field] === null) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  // Validate field types
  if (typeof reference.key !== 'string' || reference.key.length === 0) {
    throw new Error('key must be a non-empty string')
  }
  if (typeof reference.url !== 'string' || reference.url.length === 0) {
    throw new Error('url must be a non-empty string')
  }
  if (typeof reference.contentType !== 'string' || reference.contentType.length === 0) {
    throw new Error('contentType must be a non-empty string')
  }
  if (typeof reference.size !== 'number' || reference.size < 0) {
    throw new Error('size must be a non-negative number')
  }
  if (typeof reference.uploadedAt !== 'string' || reference.uploadedAt.length === 0) {
    throw new Error('uploadedAt must be a non-empty string')
  }

  // Build serialized object with only valid fields
  const serialized = {
    key: reference.key,
    url: reference.url,
    contentType: reference.contentType,
    size: reference.size,
    uploadedAt: reference.uploadedAt,
  }

  // Include optional fields if present
  if (reference.etag !== undefined && reference.etag !== null) {
    serialized.etag = String(reference.etag)
  }

  return serialized
}

/**
 * Deserialize an S3 image reference from MongoDB storage
 * 
 * @param {Object} data - The stored reference data
 * @returns {Object} Deserialized reference object
 * @throws {Error} If required fields are missing or invalid
 */
export function deserializeS3Reference(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Data must be an object')
  }

  // Validate required fields
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  // Build deserialized object
  const deserialized = {
    key: String(data.key),
    url: String(data.url),
    contentType: String(data.contentType),
    size: Number(data.size),
    uploadedAt: String(data.uploadedAt),
  }

  // Include optional fields if present
  if (data.etag !== undefined && data.etag !== null) {
    deserialized.etag = String(data.etag)
  }

  return deserialized
}

/**
 * Serialize a complete images object (all size variants) for MongoDB storage
 * 
 * @param {Object} images - Object with size keys (thumbnail, medium, full)
 * @returns {Object} Serialized images object
 * @throws {Error} If any reference is invalid
 */
export function serializeImages(images) {
  if (!images || typeof images !== 'object') {
    throw new Error('Images must be an object')
  }

  const serialized = {}

  for (const size of VALID_SIZES) {
    if (images[size]) {
      serialized[size] = serializeS3Reference(images[size])
    }
  }

  return serialized
}

/**
 * Deserialize a complete images object from MongoDB storage
 * 
 * @param {Object} data - Stored images data
 * @returns {Object} Deserialized images object
 */
export function deserializeImages(data) {
  if (!data || typeof data !== 'object') {
    return {}
  }

  const deserialized = {}

  for (const size of VALID_SIZES) {
    if (data[size]) {
      try {
        deserialized[size] = deserializeS3Reference(data[size])
      } catch (error) {
        // Skip invalid references, log warning
        console.warn(`[S3 Serialization] Invalid reference for size ${size}:`, error.message)
      }
    }
  }

  return deserialized
}

/**
 * Check if an images object has valid S3 references for all sizes
 * 
 * @param {Object} images - Images object to check
 * @returns {boolean} True if all three sizes have valid S3 references
 */
export function hasCompleteS3References(images) {
  if (!images || typeof images !== 'object') {
    return false
  }

  for (const size of VALID_SIZES) {
    const ref = images[size]
    if (!ref || !ref.key || !ref.url) {
      return false
    }
  }

  return true
}

/**
 * Check if an image reference is an S3 reference (has url field)
 * vs a legacy base64 reference (has data field)
 * 
 * @param {Object} reference - Image reference to check
 * @returns {boolean} True if this is an S3 reference
 */
export function isS3Reference(reference) {
  return reference && typeof reference.url === 'string' && reference.url.length > 0
}

/**
 * Check if an image reference is a legacy base64 reference
 * 
 * @param {Object} reference - Image reference to check
 * @returns {boolean} True if this is a legacy base64 reference
 */
export function isLegacyReference(reference) {
  return reference && typeof reference.data === 'string' && reference.data.length > 0
}

export {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  VALID_SIZES,
}

export default {
  serializeS3Reference,
  deserializeS3Reference,
  serializeImages,
  deserializeImages,
  hasCompleteS3References,
  isS3Reference,
  isLegacyReference,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  VALID_SIZES,
}
