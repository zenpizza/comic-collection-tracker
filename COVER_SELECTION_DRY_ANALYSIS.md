# Cover Selection DRY Analysis

## Current State

### Duplicate Logic Identified

#### 1. **Smart Matching / Title Filtering**
Found in multiple places with similar but not identical logic:

**BulkCoverManager.jsx** (lines 333-351):
```javascript
const selectBestCover = (searchResults, comic) => {
  // Smart matching - prefer exact series matches (with flexible title matching)
  if (smartMatching) {
    const comicSeriesLower = comic.series.toLowerCase().trim()
    const comicSeriesNormalized = comicSeriesLower.replace(/^(the|a|an)\s+/i, '')
    
    const exactMatches = filteredResults.filter(result => {
      const resultTitle = (result.metadata?.title || '').toLowerCase().trim()
      const resultTitleNormalized = resultTitle.replace(/^(the|a|an)\s+/i, '')
      
      return resultTitle === comicSeriesLower || 
             resultTitleNormalized === comicSeriesNormalized ||
             resultTitle.includes(comicSeriesLower) ||
             comicSeriesLower.includes(resultTitle)
    })
    
    if (exactMatches.length > 0) {
      filteredResults = exactMatches
    }
  }
}
```

**coverAPIService.js** (lines 540-580):
```javascript
// THIRD: Prioritize by title relevance (exact series match)
const aRelevance = this.calculateRelevance(a.metadata.title, series)
const bRelevance = this.calculateRelevance(b.metadata.title, series)

calculateRelevance(title, targetSeries) {
  // Different implementation but same goal
}
```

#### 2. **Cover Search with Issue Parsing**
Found in 3 places with nearly identical code:

**ComicDetailView.jsx** (lines 111-135):
```javascript
const handleSearchCovers = async () => {
  const { parseComicIssueForSearch } = await import('../utils/issueParser')
  const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)
  
  const results = await coverAPIService.searchCovers(
    searchSeries,
    searchIssue,
    comic.publisher,
    comic.year
  )
}
```

**ComicForm.jsx** (lines 242-268):
```javascript
const searchForCovers = async () => {
  const { parseIssueForSearch } = await import('../utils/issueParser')
  const { series: searchSeries, issue: searchIssue } = parseIssueForSearch(formData.series, formData.issueNumber)
  
  const results = await coverAPIService.searchCovers(
    searchSeries,
    searchIssue,
    formData.publisher,
    formData.year
  )
}
```

**BulkCoverManager.jsx** (lines 245-260):
```javascript
const fetchCoverForComic = async (comic, retryCount = 0) => {
  const { series: searchSeries, issue: searchIssue } = parseComicIssueForSearch(comic)
  
  const searchResults = await coverAPIService.searchCovers(
    searchSeries,
    searchIssue,
    comic.publisher,
    comic.year
  )
}
```

#### 3. **Quality Filtering**
**BulkCoverManager.jsx** has quality filtering that could be useful elsewhere:
```javascript
if (qualityFilter !== 'any') {
  filteredResults = filteredResults.filter(result => 
    result.quality === qualityFilter || 
    (qualityFilter === 'medium' && ['medium', 'high'].includes(result.quality))
  )
}
```

## Recommendations

### 1. Create `coverSelectionService.js`
Extract common cover selection logic:

```javascript
// src/utils/coverSelectionService.js
export default {
  /**
   * Normalize title by removing articles
   */
  normalizeTitle(title) {
    return title.toLowerCase().trim().replace(/^(the|a|an)\s+/i, '')
  },

  /**
   * Check if two titles match (flexible matching)
   */
  titlesMatch(title1, title2) {
    const t1Lower = title1.toLowerCase().trim()
    const t2Lower = title2.toLowerCase().trim()
    const t1Normalized = this.normalizeTitle(title1)
    const t2Normalized = this.normalizeTitle(title2)
    
    return t1Lower === t2Lower || 
           t1Normalized === t2Normalized ||
           t1Lower.includes(t2Lower) ||
           t2Lower.includes(t1Lower)
  },

  /**
   * Filter results by title match
   */
  filterByTitleMatch(results, targetSeries) {
    return results.filter(result => 
      this.titlesMatch(result.metadata?.title || '', targetSeries)
    )
  },

  /**
   * Filter results by quality
   */
  filterByQuality(results, qualityFilter) {
    if (qualityFilter === 'any') return results
    
    return results.filter(result => 
      result.quality === qualityFilter || 
      (qualityFilter === 'medium' && ['medium', 'high'].includes(result.quality))
    )
  },

  /**
   * Select best cover from search results
   * API already sorts by publisher, language, and year
   * This applies additional client-side filtering
   */
  selectBestCover(searchResults, options = {}) {
    const {
      targetSeries,
      qualityFilter = 'any',
      smartMatching = true
    } = options
    
    let filteredResults = [...searchResults]

    // Apply quality filter
    filteredResults = this.filterByQuality(filteredResults, qualityFilter)

    // Apply smart matching
    if (smartMatching && targetSeries) {
      const matches = this.filterByTitleMatch(filteredResults, targetSeries)
      if (matches.length > 0) {
        filteredResults = matches
      }
    }

    // Return first result (API already sorted by priority)
    return filteredResults[0] || null
  }
}
```

### 2. Update BulkCoverManager.jsx
Replace `selectBestCover` function with:
```javascript
import coverSelectionService from '../utils/coverSelectionService'

const selectBestCover = (searchResults, comic) => {
  return coverSelectionService.selectBestCover(searchResults, {
    targetSeries: comic.series,
    qualityFilter,
    smartMatching
  })
}
```

### 3. Optionally Update coverAPIService.js
The `calculateRelevance` method could use the same title matching logic:
```javascript
import coverSelectionService from './coverSelectionService'

calculateRelevance(title, targetSeries) {
  if (coverSelectionService.titlesMatch(title, targetSeries)) {
    return 100 // High relevance
  }
  // ... other relevance calculations
}
```

## Benefits

1. **Single Source of Truth**: Title matching logic in one place
2. **Consistency**: All components use the same matching rules
3. **Testability**: Easier to unit test the selection logic
4. **Maintainability**: Changes to matching logic only need to be made once
5. **Reusability**: Can be used in future features

## Impact

- **Low Risk**: The new service wraps existing logic
- **No Breaking Changes**: Existing behavior is preserved
- **Easy Rollback**: Can revert to inline logic if needed
