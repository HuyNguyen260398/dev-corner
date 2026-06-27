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
})
