/**
 * Cover Quality Assessment Utility
 * Analyzes cover images and provides quality ratings and upgrade suggestions
 */

class CoverQualityAssessment {
  constructor() {
    this.qualityThresholds = {
      dimensions: {
        thumbnail: { width: 150, height: 225 },
        small: { width: 300, height: 450 },
        medium: { width: 600, height: 900 },
        large: { width: 1200, height: 1800 }
      },
      fileSize: {
        tooSmall: 10 * 1024, // 10KB
        small: 50 * 1024, // 50KB
        medium: 200 * 1024, // 200KB
        large: 500 * 1024, // 500KB
        tooLarge: 2 * 1024 * 1024 // 2MB
      },
      aspectRatio: {
        ideal: 2/3, // Standard comic book ratio
        tolerance: 0.1
      }
    }
  }

  /**
   * Assess the quality of a cover image
   * @param {Object} imageData - Image data with dimensions, size, etc.
   * @param {Object} metadata - Additional metadata about the image
   * @returns {Object} Quality assessment result
   */
  async assessCoverQuality(imageData, metadata = {}) {
    const assessment = {
      overallScore: 0,
      grade: 'unknown',
      issues: [],
      strengths: [],
      recommendations: [],
      upgradePotential: false,
      details: {
        dimensions: null,
        fileSize: null,
        aspectRatio: null,
        source: null,
        age: null
      }
    }

    try {
      // Analyze dimensions
      const dimensionAnalysis = this.analyzeDimensions(imageData)
      assessment.details.dimensions = dimensionAnalysis
      assessment.overallScore += dimensionAnalysis.score

      // Analyze file size
      const fileSizeAnalysis = this.analyzeFileSize(imageData)
      assessment.details.fileSize = fileSizeAnalysis
      assessment.overallScore += fileSizeAnalysis.score

      // Analyze aspect ratio
      const aspectRatioAnalysis = this.analyzeAspectRatio(imageData)
      assessment.details.aspectRatio = aspectRatioAnalysis
      assessment.overallScore += aspectRatioAnalysis.score

      // Analyze source quality
      const sourceAnalysis = this.analyzeSource(metadata)
      assessment.details.source = sourceAnalysis
      assessment.overallScore += sourceAnalysis.score

      // Analyze age/freshness
      const ageAnalysis = this.analyzeAge(metadata)
      assessment.details.age = ageAnalysis
      assessment.overallScore += ageAnalysis.score

      // Calculate final score (out of 100)
      assessment.overallScore = Math.round((assessment.overallScore / 5) * 100)

      // Determine grade
      assessment.grade = this.calculateGrade(assessment.overallScore)

      // Collect issues and strengths
      this.collectIssuesAndStrengths(assessment)

      // Generate recommendations
      assessment.recommendations = this.generateRecommendations(assessment)

      // Determine upgrade potential
      assessment.upgradePotential = this.hasUpgradePotential(assessment)

    } catch (error) {
      console.error('Error assessing cover quality:', error)
      assessment.issues.push('Unable to analyze image quality')
    }

    return assessment
  }

  /**
   * Analyze image dimensions
   */
  analyzeDimensions(imageData) {
    const { width = 0, height = 0 } = imageData.dimensions || {}
    
    let score = 0
    let category = 'unknown'
    let issues = []
    let strengths = []

    if (width === 0 || height === 0) {
      issues.push('Dimensions not available')
      return { score: 0, category, issues, strengths, width, height }
    }

    // Determine size category
    if (width >= this.qualityThresholds.dimensions.large.width) {
      category = 'large'
      score = 100
      strengths.push('High resolution image')
    } else if (width >= this.qualityThresholds.dimensions.medium.width) {
      category = 'medium'
      score = 80
      strengths.push('Good resolution')
    } else if (width >= this.qualityThresholds.dimensions.small.width) {
      category = 'small'
      score = 60
      issues.push('Resolution could be higher')
    } else if (width >= this.qualityThresholds.dimensions.thumbnail.width) {
      category = 'thumbnail'
      score = 40
      issues.push('Low resolution image')
    } else {
      category = 'too-small'
      score = 20
      issues.push('Very low resolution')
    }

    return { score, category, issues, strengths, width, height }
  }

  /**
   * Analyze file size
   */
  analyzeFileSize(imageData) {
    const size = imageData.size || 0
    
    let score = 0
    let category = 'unknown'
    let issues = []
    let strengths = []

    if (size === 0) {
      issues.push('File size not available')
      return { score: 0, category, issues, strengths, size }
    }

    if (size > this.qualityThresholds.fileSize.tooLarge) {
      category = 'too-large'
      score = 60
      issues.push('File size is very large (may slow loading)')
    } else if (size > this.qualityThresholds.fileSize.large) {
      category = 'large'
      score = 90
      strengths.push('Good file size for quality')
    } else if (size > this.qualityThresholds.fileSize.medium) {
      category = 'medium'
      score = 100
      strengths.push('Optimal file size')
    } else if (size > this.qualityThresholds.fileSize.small) {
      category = 'small'
      score = 70
    } else if (size > this.qualityThresholds.fileSize.tooSmall) {
      category = 'too-small'
      score = 40
      issues.push('File size is small (may indicate low quality)')
    } else {
      category = 'very-small'
      score = 20
      issues.push('Very small file size (likely poor quality)')
    }

    return { score, category, issues, strengths, size, sizeFormatted: this.formatBytes(size) }
  }

  /**
   * Analyze aspect ratio
   */
  analyzeAspectRatio(imageData) {
    const { width = 0, height = 0 } = imageData.dimensions || {}
    
    let score = 0
    let category = 'unknown'
    let issues = []
    let strengths = []
    let ratio = 0

    if (width === 0 || height === 0) {
      issues.push('Cannot calculate aspect ratio')
      return { score: 0, category, issues, strengths, ratio }
    }

    ratio = width / height
    const idealRatio = this.qualityThresholds.aspectRatio.ideal
    const tolerance = this.qualityThresholds.aspectRatio.tolerance

    const difference = Math.abs(ratio - idealRatio)

    if (difference <= tolerance) {
      category = 'ideal'
      score = 100
      strengths.push('Perfect comic book aspect ratio')
    } else if (difference <= tolerance * 2) {
      category = 'good'
      score = 80
      strengths.push('Good aspect ratio')
    } else if (difference <= tolerance * 3) {
      category = 'acceptable'
      score = 60
      issues.push('Aspect ratio slightly off')
    } else {
      category = 'poor'
      score = 30
      issues.push('Aspect ratio significantly different from standard')
    }

    return { 
      score, 
      category, 
      issues, 
      strengths, 
      ratio: Math.round(ratio * 100) / 100,
      ideal: idealRatio 
    }
  }

  /**
   * Analyze source quality
   */
  analyzeSource(metadata) {
    const source = metadata.source || 'unknown'
    const provider = metadata.provider || metadata.sourceDetails?.apiProvider || 'unknown'
    
    let score = 0
    let category = 'unknown'
    let issues = []
    let strengths = []

    switch (source) {
      case 'api':
        score = 85
        category = 'api'
        strengths.push('Sourced from external API')
        
        // Provider-specific scoring
        switch (provider) {
          case 'comicvine':
            score = 90
            strengths.push('High-quality Comic Vine source')
            break
          case 'marvel':
            score = 95
            strengths.push('Official Marvel source')
            break
          case 'dc':
            score = 95
            strengths.push('Official DC source')
            break
          case 'lcg':
            score = 80
            strengths.push('Community-verified source')
            break
          default:
            score = 75
        }
        break

      case 'upload':
        score = 70
        category = 'upload'
        issues.push('User-uploaded image (quality varies)')
        break

      case 'manual':
        score = 60
        category = 'manual'
        issues.push('Manually added image (quality unknown)')
        break

      default:
        score = 50
        category = 'unknown'
        issues.push('Unknown image source')
    }

    return { score, category, issues, strengths, source, provider }
  }

  /**
   * Analyze image age/freshness
   */
  analyzeAge(metadata) {
    const uploadedAt = metadata.uploadedAt || metadata.cachedAt || metadata.createdAt
    
    let score = 0
    let category = 'unknown'
    let issues = []
    let strengths = []
    let ageInDays = 0

    if (!uploadedAt) {
      issues.push('Image age unknown')
      return { score: 50, category, issues, strengths, ageInDays }
    }

    const now = new Date()
    const uploadDate = new Date(uploadedAt)
    ageInDays = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24))

    if (ageInDays < 30) {
      category = 'fresh'
      score = 100
      strengths.push('Recently added image')
    } else if (ageInDays < 90) {
      category = 'recent'
      score = 90
      strengths.push('Relatively recent image')
    } else if (ageInDays < 365) {
      category = 'moderate'
      score = 80
    } else if (ageInDays < 730) {
      category = 'old'
      score = 70
      issues.push('Image is over a year old')
    } else {
      category = 'very-old'
      score = 60
      issues.push('Very old image (may have better versions available)')
    }

    return { score, category, issues, strengths, ageInDays }
  }

  /**
   * Calculate overall grade
   */
  calculateGrade(score) {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  /**
   * Collect issues and strengths from all analyses
   */
  collectIssuesAndStrengths(assessment) {
    const analyses = [
      assessment.details.dimensions,
      assessment.details.fileSize,
      assessment.details.aspectRatio,
      assessment.details.source,
      assessment.details.age
    ]

    assessment.issues = []
    assessment.strengths = []

    analyses.forEach(analysis => {
      if (analysis?.issues) {
        assessment.issues.push(...analysis.issues)
      }
      if (analysis?.strengths) {
        assessment.strengths.push(...analysis.strengths)
      }
    })
  }

  /**
   * Generate recommendations for improvement
   */
  generateRecommendations(assessment) {
    const recommendations = []
    const details = assessment.details

    // Dimension recommendations
    if (details.dimensions?.category === 'thumbnail' || details.dimensions?.category === 'too-small') {
      recommendations.push({
        type: 'upgrade',
        priority: 'high',
        message: 'Find a higher resolution version of this cover',
        action: 'search-higher-res'
      })
    }

    // File size recommendations
    if (details.fileSize?.category === 'too-small') {
      recommendations.push({
        type: 'upgrade',
        priority: 'high',
        message: 'Image file size is very small, likely indicating poor quality',
        action: 'find-better-quality'
      })
    } else if (details.fileSize?.category === 'too-large') {
      recommendations.push({
        type: 'optimize',
        priority: 'medium',
        message: 'Image could be compressed to reduce file size',
        action: 'compress-image'
      })
    }

    // Aspect ratio recommendations
    if (details.aspectRatio?.category === 'poor') {
      recommendations.push({
        type: 'replace',
        priority: 'medium',
        message: 'Aspect ratio is significantly off from standard comic proportions',
        action: 'find-correct-ratio'
      })
    }

    // Source recommendations
    if (details.source?.source === 'upload' || details.source?.source === 'manual') {
      recommendations.push({
        type: 'upgrade',
        priority: 'medium',
        message: 'Try finding an official API source for better quality',
        action: 'search-api-source'
      })
    }

    // Age recommendations
    if (details.age?.category === 'old' || details.age?.category === 'very-old') {
      recommendations.push({
        type: 'refresh',
        priority: 'low',
        message: 'Image is old, newer versions might be available',
        action: 'refresh-from-source'
      })
    }

    // Overall score recommendations
    if (assessment.overallScore < 60) {
      recommendations.push({
        type: 'replace',
        priority: 'high',
        message: 'Overall image quality is poor, consider replacing',
        action: 'full-replacement'
      })
    }

    return recommendations
  }

  /**
   * Determine if image has upgrade potential
   */
  hasUpgradePotential(assessment) {
    const highPriorityRecommendations = assessment.recommendations.filter(
      rec => rec.priority === 'high'
    )
    
    return highPriorityRecommendations.length > 0 || 
           assessment.overallScore < 75 ||
           assessment.details.dimensions?.category === 'thumbnail' ||
           assessment.details.dimensions?.category === 'too-small'
  }

  /**
   * Batch assess multiple covers
   */
  async batchAssessCovers(comicsWithCovers) {
    const assessments = []
    
    for (const comic of comicsWithCovers) {
      try {
        // Get image data (this would need to be implemented based on storage system)
        const imageData = await this.getImageDataForComic(comic)
        const metadata = await this.getImageMetadataForComic(comic)
        
        const assessment = await this.assessCoverQuality(imageData, metadata)
        
        assessments.push({
          comic,
          assessment,
          needsUpgrade: assessment.upgradePotential,
          score: assessment.overallScore,
          grade: assessment.grade
        })
      } catch (error) {
        console.error(`Error assessing cover for ${comic.series} #${comic.issueNumber}:`, error)
        assessments.push({
          comic,
          assessment: null,
          error: error.message,
          needsUpgrade: false,
          score: 0,
          grade: 'F'
        })
      }
    }

    return assessments
  }

  /**
   * Get upgrade suggestions for a batch of comics
   */
  getUpgradeSuggestions(assessments) {
    const suggestions = {
      highPriority: [],
      mediumPriority: [],
      lowPriority: [],
      statistics: {
        total: assessments.length,
        needsUpgrade: 0,
        averageScore: 0,
        gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 }
      }
    }

    let totalScore = 0
    
    assessments.forEach(({ comic, assessment }) => {
      if (!assessment) return

      totalScore += assessment.overallScore
      suggestions.statistics.gradeDistribution[assessment.grade]++

      if (assessment.upgradePotential) {
        suggestions.statistics.needsUpgrade++

        const highPriorityRecs = assessment.recommendations.filter(r => r.priority === 'high')
        const mediumPriorityRecs = assessment.recommendations.filter(r => r.priority === 'medium')
        const lowPriorityRecs = assessment.recommendations.filter(r => r.priority === 'low')

        if (highPriorityRecs.length > 0) {
          suggestions.highPriority.push({
            comic,
            assessment,
            recommendations: highPriorityRecs
          })
        } else if (mediumPriorityRecs.length > 0) {
          suggestions.mediumPriority.push({
            comic,
            assessment,
            recommendations: mediumPriorityRecs
          })
        } else {
          suggestions.lowPriority.push({
            comic,
            assessment,
            recommendations: lowPriorityRecs
          })
        }
      }
    })

    suggestions.statistics.averageScore = Math.round(totalScore / assessments.length)

    return suggestions
  }

  /**
   * Placeholder method to get image data for a comic
   * This would need to be implemented based on the actual storage system
   */
  async getImageDataForComic(comic) {
    // This is a placeholder - in real implementation, this would:
    // 1. Get the image from storage
    // 2. Extract dimensions, file size, etc.
    // 3. Return the data
    
    return {
      dimensions: { width: 400, height: 600 }, // Placeholder
      size: 150000, // Placeholder
      mimeType: 'image/jpeg'
    }
  }

  /**
   * Placeholder method to get image metadata for a comic
   */
  async getImageMetadataForComic(comic) {
    // This is a placeholder - in real implementation, this would:
    // 1. Get metadata from storage or comic data
    // 2. Return source, upload date, etc.
    
    return {
      source: comic.coverSource || 'unknown',
      provider: comic.coverSourceProvider || 'unknown',
      uploadedAt: comic.coverLastUpdated || comic.dateAdded,
      originalUrl: comic.coverOriginalUrl
    }
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

export default new CoverQualityAssessment()