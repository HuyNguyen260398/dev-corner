import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav } from '../../src/popup/BottomNav'
import { PostCard } from '../../src/popup/PostCard'

describe('BottomNav', () => {
  it('renders three destinations and reports selection', () => {
    const onSelect = vi.fn()
    render(<BottomNav activeTab="daily" onSelect={onSelect} />)
    expect(screen.getByRole('navigation', { name: 'Main views' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Daily Posts' }).getAttribute('aria-current')).toBe(
      'page',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Posts' }))
    expect(onSelect).toHaveBeenCalledWith('favorites')
    expect(screen.getByRole('button', { name: 'Sources' })).toBeTruthy()
  })
})

describe('PostCard', () => {
  it('opens the post and exposes favorite and pending state', () => {
    const onToggleFavorite = vi.fn()
    render(
      <PostCard
        post={{
          postUrl: 'https://source.test/post',
          title: 'Post title',
          summary: 'Summary',
          thumbnail: 'https://source.test/thumb.jpg',
          sourceUrl: 'https://source.test/feed',
          sourceTitle: 'Source',
          timestamp: 1,
        }}
        favorite
        pending
        onToggleFavorite={onToggleFavorite}
      />,
    )
    expect(screen.getByRole('link', { name: 'Post title' }).getAttribute('target')).toBe('_blank')
    const button = screen.getByRole('button', { name: 'Remove Post title from favorites' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button).toHaveProperty('disabled', true)
  })

  it('loads same-origin thumbnails lazily with asynchronous decoding', () => {
    render(
      <PostCard
        post={{
          postUrl: 'https://source.test/post',
          title: 'Post title',
          summary: 'Summary',
          thumbnail: 'https://source.test/thumb.jpg',
          sourceUrl: 'https://source.test/feed',
          sourceTitle: 'Source',
          timestamp: 1,
        }}
        favorite={false}
        pending={false}
        onToggleFavorite={vi.fn()}
      />,
    )

    const image = screen.getByRole('img', { name: 'Post title thumbnail' })
    expect(image.getAttribute('src')).toBe('https://source.test/thumb.jpg')
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(image.getAttribute('decoding')).toBe('async')
  })

  it('loads a thumbnail from a secure subdomain of the saved source host', () => {
    render(
      <PostCard
        post={{
          postUrl: 'https://dev.to/author/post',
          title: 'DEV post',
          summary: 'Summary',
          thumbnail: 'https://media2.dev.to/dynamic/image/post.webp',
          sourceUrl: 'https://dev.to/',
          sourceTitle: 'DEV Community',
          timestamp: 1,
        }}
        favorite={false}
        pending={false}
        onToggleFavorite={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'DEV post thumbnail' }).getAttribute('src')).toBe(
      'https://media2.dev.to/dynamic/image/post.webp',
    )
  })

  it('loads an HTTPS thumbnail selected from a third-party host', () => {
    render(
      <PostCard
        post={{
          postUrl: 'https://source.test/post',
          title: 'Post title',
          summary: 'Summary',
          thumbnail: 'https://cdn.test/thumb.jpg',
          sourceUrl: 'https://source.test/feed',
          sourceTitle: 'Source',
          timestamp: 1,
        }}
        favorite={false}
        pending={false}
        onToggleFavorite={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Post title thumbnail' }).getAttribute('src')).toBe(
      'https://cdn.test/thumb.jpg',
    )
  })
})
