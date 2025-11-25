/**
 * Image utilities index - exports all image-related utilities
 */

export { default as imageStorage } from './imageStorage.js'
export { default as imageProcessor } from './imageProcessing.js'
export { IMAGE_CONFIG, getImageSize, isSupportedFormat, getFileExtension, isValidFileSize, formatFileSize, calculateAspectRatio, calculateDimensions } from '../config/imageConfig.js'