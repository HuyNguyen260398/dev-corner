export type PopupTab = 'daily' | 'favorites' | 'sources'

interface BottomNavProps {
  activeTab: PopupTab
  onSelect: (tab: PopupTab) => void
}

const items = [
  { id: 'daily', label: 'Daily Posts' },
  { id: 'favorites', label: 'Favorite Posts' },
  { id: 'sources', label: 'Sources' },
] as const

export function BottomNav({ activeTab, onSelect }: BottomNavProps) {
  return (
    <nav aria-label="Main views" className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={activeTab === item.id ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <NavIcon tab={item.id} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function NavIcon({ tab }: { tab: PopupTab }) {
  if (tab === 'daily') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }

  if (tab === 'favorites') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}
