import { selectDigest } from '../lib/selection'
import type { Post, Source } from '../lib/types'
import { PostCard } from './PostCard'

interface DailyPostsTabProps {
  crawlInProgress: boolean
  posts: Post[] | undefined
  sources: Source[] | undefined
  today: string
  favoriteUrls: ReadonlySet<string>
  pendingUrls: ReadonlySet<string>
  onToggleFavorite: (post: Post) => void
}

export function DailyPostsTab({
  crawlInProgress,
  posts,
  sources,
  today,
  favoriteUrls,
  pendingUrls,
  onToggleFavorite,
}: DailyPostsTabProps) {
  const sourceCount = sources?.length ?? 0
  const postCount = posts?.length ?? 0
  const heroSubtitle = digestSummary(sourceCount, postCount, crawlInProgress)

  return (
    <section className="tab-panel digest-panel" aria-labelledby="digest-heading">
      <div className="hero-copy">
        <div>
          <p className="eyebrow accent">Daily digest</p>
          <h1 id="digest-heading">Morning brief</h1>
        </div>
        {heroSubtitle && <p className="hero-subtitle">{heroSubtitle}</p>}
      </div>

      <div className="status-pills" aria-label="Digest status">
        <span>Local only</span>
        <span>07:00 crawl</span>
        <span>5 min read</span>
      </div>

      <DigestPreview
        crawlInProgress={crawlInProgress}
        posts={posts}
        sources={sources}
        today={today}
        favoriteUrls={favoriteUrls}
        pendingUrls={pendingUrls}
        onToggleFavorite={onToggleFavorite}
      />
    </section>
  )
}

function DigestPreview({
  crawlInProgress,
  posts,
  sources,
  today,
  favoriteUrls,
  pendingUrls,
  onToggleFavorite,
}: DailyPostsTabProps) {
  if (crawlInProgress) {
    return (
      <div className="loading-card" role="status">
        <p>Refreshing latest posts...</p>
        <div
          className="crawl-progress"
          role="progressbar"
          aria-label="Refreshing latest posts progress"
          aria-valuetext="Refreshing latest posts"
        />
      </div>
    )
  }

  if (sources === undefined || posts === undefined) {
    return (
      <div className="loading-card" role="status">
        <p>Loading digest...</p>
        <span />
        <span />
        <span />
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No sources saved yet.</p>
        <p>Add the current page or use the right-click menu to build tomorrow's brief.</p>
      </div>
    )
  }

  const digest = selectDigest(posts, sources, today)
  if (digest.length > 0) {
    return (
      <ul className="digest-list" aria-label="Today's digest">
        {digest.map((post, index) => {
          const source = sources.find((candidate) => candidate.id === post.sourceId)
          return (
            <li key={post.postUrl}>
              <PostCard
                post={{
                  postUrl: post.postUrl,
                  title: post.title,
                  summary: post.summary,
                  ...(post.thumbnail !== undefined ? { thumbnail: post.thumbnail } : {}),
                  sourceTitle: source?.title ?? hostLabel(post.sourceUrl),
                  timestamp: post.publishedAt ?? post.crawledAt,
                }}
                favorite={favoriteUrls.has(post.postUrl)}
                pending={pendingUrls.has(post.postUrl)}
                featured={index === 0}
                onToggleFavorite={() => onToggleFavorite(post)}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  const failures = sources.filter((source) => source.lastError)
  if (failures.length === sources.length) {
    return (
      <div className="alert" role="alert">
        <p>All sources failed to crawl.</p>
        <ul>
          {failures.map((source) => (
            <li key={source.id ?? source.url}>
              {source.title}: {source.lastError}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <p className="empty-title">No posts crawled for today yet.</p>
      <p>Refresh the digest or wait for the next scheduled crawl.</p>
    </div>
  )
}

function digestSummary(
  sourceCount: number,
  postCount: number,
  crawlInProgress: boolean,
): string | null {
  if (crawlInProgress) return 'Refreshing your saved sources'
  if (sourceCount === 0) return 'Save a developer blog to start your local brief'
  if (postCount === 0) return `${sourceCount} saved ${pluralize('source', sourceCount)} ready`
  return null
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Saved source'
  }
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`
}
