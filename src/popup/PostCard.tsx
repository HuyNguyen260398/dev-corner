import { useState } from 'react'
import { PLACEHOLDER_THUMBNAIL, renderableThumbnail } from '../lib/thumbnail-policy'

export interface PostCardData {
  postUrl: string
  title: string
  summary: string
  thumbnail?: string
  sourceUrl: string
  sourceTitle: string
  timestamp: number
}

interface PostCardProps {
  post: PostCardData
  favorite: boolean
  pending: boolean
  featured?: boolean
  onToggleFavorite: (postUrl: string) => void
}

export function PostCard({
  post,
  favorite,
  pending,
  featured = false,
  onToggleFavorite,
}: PostCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const thumbnail = renderableThumbnail(post.thumbnail, post.sourceUrl)
  const showImage = !imageFailed

  return (
    <article className={featured ? 'post-card featured-post' : 'post-card'}>
      {showImage ? (
        <img
          src={thumbnail}
          alt={thumbnail === PLACEHOLDER_THUMBNAIL ? '' : `${post.title} thumbnail`}
          width="72"
          height="72"
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="thumbnail-fallback" aria-hidden="true">
          {sourceInitial(post.sourceTitle)}
        </div>
      )}
      <div className="post-content">
        <div className="post-meta">
          <span>{post.sourceTitle || hostLabel(post.postUrl)}</span>
          <span>{relativeTime(post.timestamp)}</span>
        </div>
        <h2>
          <a href={post.postUrl} target="_blank" rel="noreferrer">
            {post.title}
          </a>
        </h2>
        <p>{post.summary}</p>
      </div>
      <button
        type="button"
        className={favorite ? 'favorite-button is-favorite' : 'favorite-button'}
        aria-label={
          favorite ? `Remove ${post.title} from favorites` : `Add ${post.title} to favorites`
        }
        aria-pressed={favorite}
        disabled={pending}
        onClick={() => onToggleFavorite(post.postUrl)}
      >
        <FavoriteIcon filled={favorite} />
      </button>
    </article>
  )
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Saved source'
  }
}

function sourceInitial(sourceTitle: string): string {
  return sourceTitle.trim().slice(0, 1).toUpperCase() || 'S'
}

function FavoriteIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  )
}
