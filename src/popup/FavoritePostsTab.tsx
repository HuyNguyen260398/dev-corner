import type { FavoritePost } from '../lib/types'
import { PostCard } from './PostCard'

interface FavoritePostsTabProps {
  favorites: FavoritePost[] | undefined
  pendingUrls: ReadonlySet<string>
  onRemoveFavorite: (postUrl: string) => void
}

export function FavoritePostsTab({
  favorites,
  pendingUrls,
  onRemoveFavorite,
}: FavoritePostsTabProps) {
  if (favorites === undefined) {
    return (
      <section className="tab-panel favorites-panel" aria-labelledby="favorites-heading">
        <h1 id="favorites-heading">Favorite Posts</h1>
        <div className="loading-card" role="status">
          <p>Loading favorite posts...</p>
        </div>
      </section>
    )
  }

  if (favorites.length === 0) {
    return (
      <section className="tab-panel favorites-panel" aria-labelledby="favorites-heading">
        <h1 id="favorites-heading">Favorite Posts</h1>
        <div className="empty-state">
          <p className="empty-title">No favorite posts yet.</p>
          <p>Add favorites from Daily Posts to keep them here.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="tab-panel favorites-panel" aria-labelledby="favorites-heading">
      <h1 id="favorites-heading">Favorite Posts</h1>
      <ul className="digest-list" aria-label="Favorite posts">
        {favorites.map((favorite) => (
          <li key={favorite.postUrl}>
            <PostCard
              post={{
                postUrl: favorite.postUrl,
                title: favorite.title,
                summary: favorite.summary,
                ...(favorite.thumbnail !== undefined ? { thumbnail: favorite.thumbnail } : {}),
                sourceTitle: favorite.sourceTitle,
                timestamp: favorite.publishedAt ?? favorite.crawledAt,
              }}
              favorite
              pending={pendingUrls.has(favorite.postUrl)}
              onToggleFavorite={onRemoveFavorite}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
