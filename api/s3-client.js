/**
 * S3 Client Module for Comic Cover Image Storage
 * 
 * Centralized S3 operations using AWS SDK v3.
 * Handles image upload, deletion, existence checks, and CloudFront cache invalidation.
 * 
 * Environment Variables Required:
 * - AWS_REGION: AWS region (e.g., 'us-east-1')
 * - AWS_S3_BUCKET: S3 bucket name
 * - AWS_S3_PUBLIC_BASE_URL: CloudFront distribution URL
 * - AWS_ACCESS_KEY_ID: IAM access key
 * - AWS_SECRET_ACCESS_KEY: IAM secret key
 * - AWS_CLOUDFRONT_DISTRIBUTION_ID: CloudFront distribution ID (for cache invalidation)
 */

import {
  S3Client as AWSS3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'

import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront'

import { getEnvironment } from './config.js'

// Valid image sizes
const VALID_SIZES = ['thumbnail', 'medium', 'full']

// Cache-Control header value (30 days)
const CACHE_CONTROL = 'public, max-age=2592000'

/**
 * S3 Client class for managing comic cover images
 */
class S3ImageClient {
  constructor() {
    this._s3Client = null
    this._cloudFrontClient = null
    this._config = null
  }

  /**
   * Get S3 configuration from environment variables
   */
  _getConfig() {
    if (this._config) {
      return this._config
    }

    this._config = {
      region: process.env.AWS_REGION,
      bucket: process.env.AWS_S3_BUCKET,
      publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL,
      distributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      // Optional prefix for environment isolation (e.g., 'production', 'preview', 'development')
      keyPrefix: process.env.AWS_S3_KEY_PREFIX || '',
    }

    return this._config
  }


  /**
   * Check if S3 is properly configured with all required credentials
   * @returns {boolean} True if S3 is configured, false otherwise
   */
  isConfigured() {
    const config = this._getConfig()
    return !!(
      config.region &&
      config.bucket &&
      config.publicBaseUrl &&
      config.accessKeyId &&
      config.secretAccessKey
    )
  }

  /**
   * Get or create the S3 client instance
   * @returns {AWSS3Client} The S3 client
   * @throws {Error} If S3 is not configured in production
   */
  _getS3Client() {
    if (this._s3Client) {
      return this._s3Client
    }

    const config = this._getConfig()
    const env = getEnvironment()

    // Fail fast in production if not configured
    if (env.isProduction && !this.isConfigured()) {
      throw new Error(
        'S3 is not configured. Required environment variables: ' +
        'AWS_REGION, AWS_S3_BUCKET, AWS_S3_PUBLIC_BASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY'
      )
    }

    if (!this.isConfigured()) {
      return null
    }

    this._s3Client = new AWSS3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })

    return this._s3Client
  }

  /**
   * Get or create the CloudFront client instance
   * @returns {CloudFrontClient|null} The CloudFront client or null if not configured
   */
  _getCloudFrontClient() {
    if (this._cloudFrontClient) {
      return this._cloudFrontClient
    }

    const config = this._getConfig()

    if (!config.distributionId || !this.isConfigured()) {
      return null
    }

    this._cloudFrontClient = new CloudFrontClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })

    return this._cloudFrontClient
  }

  /**
   * Generate S3 key for an image
   * Pattern: {prefix}/covers/{comicId}/{size}.jpg
   * Where prefix is optional and set via AWS_S3_KEY_PREFIX env var
   * @param {string} comicId - The comic ID
   * @param {string} size - The image size (thumbnail, medium, full)
   * @returns {string} The S3 key
   */
  keyFor(comicId, size) {
    if (!comicId) {
      throw new Error('comicId is required')
    }
    if (!VALID_SIZES.includes(size)) {
      throw new Error(`Invalid size: ${size}. Must be one of: ${VALID_SIZES.join(', ')}`)
    }
    const config = this._getConfig()
    const prefix = config.keyPrefix ? `${config.keyPrefix}/` : ''
    return `${prefix}covers/${comicId}/${size}.jpg`
  }

  /**
   * Generate public URL for an S3 key
   * @param {string} key - The S3 key
   * @returns {string} The public CloudFront URL
   */
  urlFor(key) {
    const config = this._getConfig()
    if (!config.publicBaseUrl) {
      throw new Error('AWS_S3_PUBLIC_BASE_URL is not configured')
    }
    // Remove trailing slash from base URL if present
    const baseUrl = config.publicBaseUrl.replace(/\/$/, '')
    return `${baseUrl}/${key}`
  }


  /**
   * Upload an image buffer to S3
   * @param {string} comicId - The comic ID
   * @param {string} size - The image size (thumbnail, medium, full)
   * @param {Buffer} buffer - The image buffer
   * @param {string} contentType - The content type (e.g., 'image/jpeg')
   * @returns {Promise<Object>} S3 image reference with key, url, contentType, size, etag, uploadedAt
   */
  async uploadImage(comicId, size, buffer, contentType) {
    const s3Client = this._getS3Client()
    
    if (!s3Client) {
      const env = getEnvironment()
      if (env.isProduction) {
        throw new Error('S3 is not configured in production environment')
      }
      // Return null in dev/preview to signal fallback to MongoDB
      return null
    }

    const config = this._getConfig()
    const key = this.keyFor(comicId, size)

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: CACHE_CONTROL,
      Metadata: {
        'comic-id': String(comicId),
        'size': size,
      },
    })

    const response = await s3Client.send(command)

    return {
      key,
      url: this.urlFor(key),
      contentType,
      size: buffer.length,
      etag: response.ETag ? response.ETag.replace(/"/g, '') : null,
      uploadedAt: new Date().toISOString(),
    }
  }

  /**
   * Delete all size variants for a comic from S3
   * @param {string} comicId - The comic ID
   * @returns {Promise<void>}
   */
  async deleteImages(comicId) {
    const s3Client = this._getS3Client()
    
    if (!s3Client) {
      // S3 not configured, nothing to delete
      return
    }

    const config = this._getConfig()
    
    // Build list of all size variant keys
    const objects = VALID_SIZES.map(size => ({
      Key: this.keyFor(comicId, size),
    }))

    const command = new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: {
        Objects: objects,
        Quiet: true, // Don't return info about each deleted object
      },
    })

    try {
      await s3Client.send(command)
    } catch (error) {
      // Log but don't throw for NoSuchKey errors (idempotent deletion)
      if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
        console.log(`[S3] Objects already deleted for comic: ${comicId}`)
        return
      }
      throw error
    }
  }

  /**
   * Check if an image exists in S3
   * @param {string} comicId - The comic ID
   * @param {string} size - The image size (thumbnail, medium, full)
   * @returns {Promise<boolean>} True if the image exists
   */
  async imageExists(comicId, size) {
    const s3Client = this._getS3Client()
    
    if (!s3Client) {
      return false
    }

    const config = this._getConfig()
    const key = this.keyFor(comicId, size)

    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })

    try {
      await s3Client.send(command)
      return true
    } catch (error) {
      // AWS SDK v3 uses various error names/codes for "not found"
      // Note: S3 returns 403 for non-existent keys when s3:ListBucket is not granted
      // (to hide whether objects exist for security reasons)
      const httpStatus = error.$metadata?.httpStatusCode
      const errorName = error.name || ''
      
      if (httpStatus === 404 || 
          httpStatus === 403 ||
          errorName === 'NotFound' || 
          errorName === 'NoSuchKey' ||
          errorName === '404') {
        return false
      }
      throw error
    }
  }


  /**
   * Invalidate CloudFront cache for a comic's images
   * @param {string} comicId - The comic ID
   * @returns {Promise<void>}
   */
  async invalidateCache(comicId) {
    const cloudFrontClient = this._getCloudFrontClient()
    
    if (!cloudFrontClient) {
      console.log(`[S3] CloudFront invalidation skipped - not configured`)
      return
    }

    const config = this._getConfig()
    
    // Invalidate all size variants for this comic
    const paths = VALID_SIZES.map(size => `/${this.keyFor(comicId, size)}`)

    const command = new CreateInvalidationCommand({
      DistributionId: config.distributionId,
      InvalidationBatch: {
        CallerReference: `${comicId}-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    })

    try {
      await cloudFrontClient.send(command)
      console.log(`[S3] CloudFront cache invalidated for comic: ${comicId}`)
    } catch (error) {
      // Log but don't fail the operation if invalidation fails
      console.error(`[S3] CloudFront invalidation failed for comic ${comicId}:`, error.message)
    }
  }
}

// Singleton instance
let s3ClientInstance = null

/**
 * Get the S3 client singleton instance
 * @returns {S3ImageClient} The S3 client instance
 */
export function getS3Client() {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3ImageClient()
  }
  return s3ClientInstance
}

/**
 * Reset the S3 client instance (useful for testing)
 */
export function resetS3Client() {
  s3ClientInstance = null
}

// Export the class for testing
export { S3ImageClient, VALID_SIZES, CACHE_CONTROL }

export default {
  getS3Client,
  resetS3Client,
  S3ImageClient,
  VALID_SIZES,
  CACHE_CONTROL,
}
