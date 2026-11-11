import React from 'react'
import CoverImage from './CoverImage'
import { creatorSeriesGroups } from '../utils/creators'
import './CreatorDetail.css'

/**
 * Right-hand panel in Creators mode (COM-59): one creator's issues in the
 * collection, grouped by series with their roles there. Clicking a cover
 * opens the usual comic detail view. Uses the collection view's styles for
 * the header and cover cells.
 */
function CreatorDetail({ creator, onOpenComic }) {
  const groups = creatorSeriesGroups(creator)

  return (
    <div className="creator-detail">
      <div className="ucv__detail-header">
        <h2 className="ucv__detail-title">{creator.name}</h2>
        <p className="ucv__detail-meta">{creator.roleSummary.join(' · ')}</p>
        <div className="ucv__detail-pills">
          <span className="ucv__pill">
            {creator.comicCount} issue{creator.comicCount !== 1 ? 's' : ''} in your collection
          </span>
          {groups.length > 1 && <span className="ucv__pill">{groups.length} series</span>}
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.seriesName} className="creator-detail__group" aria-label={`${group.seriesName}: ${group.roles.join(', ')}`}>
          <h3 className="creator-detail__series">
            {group.seriesName}
            <span className="creator-detail__roles"> · {group.roles.join(', ')}</span>
          </h3>
          <div className="creator-detail__covers">
            {group.comics.map((comic) => (
              <button
                key={comic.id}
                type="button"
                className="ucv__issue-cell"
                onClick={() => onOpenComic(comic)}
                aria-label={`${group.seriesName} #${comic.issueNumber}: view details`}
              >
                <CoverImage
                  comicId={comic.id}
                  comic={comic}
                  size="medium"
                  lazy={true}
                  className="ucv__cover"
                  alt={`${group.seriesName} #${comic.issueNumber}`}
                />
                <span className="ucv__issue-label">#{comic.issueNumber}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default CreatorDetail
