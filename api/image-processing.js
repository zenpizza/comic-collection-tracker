/**
 * Image processing utilities
 * This is a utility file, not a serverless endpoint
 */

/**
 * Process image blob for different sizes
 */
async function processImageBlob(blob, options = {}) {
  const {
    generateThumbnails = true,
    optimizeForWeb = true,
    maxWidth = 800,
    maxHeight = 1200,
    quality = 0.8
  } = options

  try {
    // Create canvas for image processing
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    // Create image from blob
    const img = new Image()
    const imageUrl = URL.createObjectURL(blob)
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          const { width, height } = img
          
          // Calculate dimensions
          const aspectRatio = width / height
          let newWidth = width
          let newHeight = height
          
          if (width > maxWidth) {
            newWidth = maxWidth
            newHeight = maxWidth / aspectRatio
          }
          
          if (newHeight > maxHeight) {
            newHeight = maxHeight
            newWidth = maxHeight * aspectRatio
          }
          
          // Set canvas size
          canvas.width = newWidth
          canvas.height = newHeight
          
          // Draw and compress image
          ctx.drawImage(img, 0, 0, newWidth, newHeight)
          
          // Convert to blob
          canvas.toBlob((processedBlob) => {
            URL.revokeObjectURL(imageUrl)
            
            const result = {
              processed: processedBlob,
              originalSize: blob.size,
              processedSize: processedBlob.size,
              dimensions: { width: newWidth, height: newHeight },
              compressionRatio: processedBlob.size / blob.size
            }
            
            resolve(result)
          }, 'image/jpeg', quality)
          
        } catch (error) {
          URL.revokeObjectURL(imageUrl)
          reject(error)
        }
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(imageUrl)
        reject(new Error('Failed to load image'))
      }
      
      img.src = imageUrl
    })
    
  } catch (error) {
    console.error('Image processing error:', error)
    throw error
  }
}

/**
 * Generate thumbnail from image blob
 */
async function generateThumbnail(blob, size = 150) {
  return processImageBlob(blob, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.7
  })
}

export {
  processImageBlob,
  generateThumbnail
}