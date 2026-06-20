// Daily 5-post digest selection (DEVELOPMENT_PLAN §4, REQ-F11). Pure logic, no
// chrome.* (GUD-001). Randomness is seeded by the date so the list is stable
// across popup re-opens (PAT-002).

import type { Post, Source } from './types'

const DIGEST_SIZE = 5

/**
 * Pick the day's digest from today's posts.
 * @param posts   All posts crawled for today (≤5 per source).
 * @param sources Sources, used to resolve names for ordering.
 * @param dateSeed 'YYYY-MM-DD' local — seeds the deterministic randomness.
 */
export function selectDigest(posts: Post[], sources: Source[], dateSeed: string): Post[] {
  const rng = mulberry32(hashSeed(dateSeed))
  const nameById = new Map(sources.map((s) => [s.id, s.title]))
  const groups = groupBySource(posts)
  const n = groups.size

  if (n === 0) return []

  let picks: Post[]
  if (n === DIGEST_SIZE) {
    picks = [...groups.values()].map(newest)
  } else if (n < DIGEST_SIZE) {
    picks = fillFromPool([...groups.values()].map(newest), posts, rng)
  } else {
    picks = selectWhenManySources(groups, rng)
  }

  return orderForDisplay(picks, nameById)
}

/** N < 5: one newest per source, then random distinct posts from the rest. */
function fillFromPool(picks: Post[], allPosts: Post[], rng: () => number): Post[] {
  const taken = new Set(picks.map((p) => p.postUrl))
  const pool = allPosts.filter((p) => !taken.has(p.postUrl))
  const remaining = DIGEST_SIZE - picks.length
  return [...picks, ...shuffle(pool, rng).slice(0, remaining)]
}

/**
 * N > 5 — Q1 resolution (a): pick 5 random sources and take the newest post
 * from each (honors F11's "show 5"). Isolated so reverting to the literal
 * one-post spec is a one-line change. See CLAUDE.md / DEVELOPMENT_PLAN §4 Q1.
 */
function selectWhenManySources(groups: Map<number, Post[]>, rng: () => number): Post[] {
  const ids = shuffle([...groups.keys()], rng).slice(0, DIGEST_SIZE)
  return ids.map((id) => newest(groups.get(id) as Post[]))
}

function groupBySource(posts: Post[]): Map<number, Post[]> {
  const groups = new Map<number, Post[]>()
  for (const p of posts) {
    const bucket = groups.get(p.sourceId)
    if (bucket) bucket.push(p)
    else groups.set(p.sourceId, [p])
  }
  return groups
}

/** Newest post in a (non-empty) group: publishedAt desc, then postUrl asc. */
function newest(posts: Post[]): Post {
  return posts.reduce((best, p) => (isNewer(p, best) ? p : best))
}

function isNewer(a: Post, b: Post): boolean {
  const ta = a.publishedAt ?? -Infinity
  const tb = b.publishedAt ?? -Infinity
  return ta !== tb ? ta > tb : a.postUrl < b.postUrl
}

/** Final ordering: publishedAt desc, then source name asc (§4). */
function orderForDisplay(picks: Post[], nameById: Map<number | undefined, string>): Post[] {
  return [...picks].sort((a, b) => {
    const ta = a.publishedAt ?? -Infinity
    const tb = b.publishedAt ?? -Infinity
    if (ta !== tb) return tb - ta
    return (nameById.get(a.sourceId) ?? '').localeCompare(nameById.get(b.sourceId) ?? '')
  })
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

/** Deterministic 32-bit PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a 'YYYY-MM-DD' string into a 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}
