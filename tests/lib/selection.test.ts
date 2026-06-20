import { describe, it, expect } from 'vitest'
import { selectDigest } from '../../src/lib/selection'
import type { Post, Source } from '../../src/lib/types'

const DAY = '2026-06-20'

function src(id: number, title: string): Source {
  return { id, url: `https://s${id}.test`, title, addedAt: 0 }
}

function post(sourceId: number, slug: string, publishedAt?: number): Post {
  return {
    sourceId,
    sourceUrl: `https://s${sourceId}.test`,
    title: slug,
    summary: '',
    postUrl: `https://s${sourceId}.test/${slug}`,
    crawledAt: 0,
    crawlDay: DAY,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}

/** N sources, each with `perSource` posts of decreasing recency. */
function build(n: number, perSource: number): { posts: Post[]; sources: Source[] } {
  const sources: Source[] = []
  const posts: Post[] = []
  for (let s = 1; s <= n; s++) {
    sources.push(src(s, `Source ${String.fromCharCode(64 + s)}`))
    for (let p = 0; p < perSource; p++) {
      // higher base for higher source id, decreasing within a source
      posts.push(post(s, `p${p}`, s * 1000 - p))
    }
  }
  return { posts, sources }
}

describe('selectDigest — N == 0', () => {
  it('returns an empty list', () => {
    expect(selectDigest([], [], DAY)).toEqual([])
  })
})

describe('selectDigest — N == 5', () => {
  const { posts, sources } = build(5, 2)
  const result = selectDigest(posts, sources, DAY)

  it('returns exactly one post per source', () => {
    expect(result).toHaveLength(5)
    expect(new Set(result.map((p) => p.sourceId)).size).toBe(5)
  })

  it('chooses the newest post from each source', () => {
    for (const p of result) {
      expect(p.postUrl).toBe(`https://s${p.sourceId}.test/p0`) // p0 is newest
    }
  })

  it('orders the result by publishedAt descending', () => {
    const times = result.map((p) => p.publishedAt ?? 0)
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })
})

describe('selectDigest — N < 5', () => {
  it('takes one per source, then fills the remaining slots from the pool', () => {
    const { posts, sources } = build(2, 4) // 8 posts across 2 sources
    const result = selectDigest(posts, sources, DAY)
    expect(result).toHaveLength(5)
    // The newest of each source must be present.
    expect(result.map((p) => p.postUrl)).toEqual(
      expect.arrayContaining([
        'https://s1.test/p0',
        'https://s2.test/p0',
      ]),
    )
  })

  it('returns fewer than 5 when there are not enough posts to fill', () => {
    const { posts, sources } = build(2, 1) // only 2 posts total
    const result = selectDigest(posts, sources, DAY)
    expect(result).toHaveLength(2)
  })

  it('does not pick the same post twice', () => {
    const { posts, sources } = build(3, 3)
    const result = selectDigest(posts, sources, DAY)
    expect(new Set(result.map((p) => p.postUrl)).size).toBe(result.length)
  })
})

describe('selectDigest — N > 5 (Q1 resolution: 5 random sources, newest each)', () => {
  const { posts, sources } = build(8, 2)
  const result = selectDigest(posts, sources, DAY)

  it('returns 5 posts from 5 distinct sources', () => {
    expect(result).toHaveLength(5)
    expect(new Set(result.map((p) => p.sourceId)).size).toBe(5)
  })

  it('each chosen post is the newest of its source', () => {
    for (const p of result) {
      expect(p.postUrl).toBe(`https://s${p.sourceId}.test/p0`)
    }
  })
})

describe('selectDigest — determinism', () => {
  it('is stable across calls with the same date seed', () => {
    const { posts, sources } = build(8, 2)
    expect(selectDigest(posts, sources, DAY)).toEqual(selectDigest(posts, sources, DAY))
  })

  it('selects a different source set for a different date seed (N > 5)', () => {
    const { posts, sources } = build(8, 1)
    const a = selectDigest(posts, sources, '2026-06-20')
      .map((p) => p.sourceId)
      .sort()
    const b = selectDigest(posts, sources, '2026-07-15')
      .map((p) => p.sourceId)
      .sort()
    expect(a).not.toEqual(b)
  })
})

describe('selectDigest — ordering tiebreak by source name', () => {
  it('breaks publishedAt ties by source name ascending', () => {
    const sources = [src(1, 'Zebra'), src(2, 'Alpha')]
    const posts = [post(1, 'z', 500), post(2, 'a', 500)]
    const result = selectDigest(posts, sources, DAY)
    expect(result.map((p) => p.sourceId)).toEqual([2, 1]) // Alpha before Zebra
  })
})
