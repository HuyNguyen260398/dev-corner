import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// Popup entry. The popup only reads IndexedDB and messages the worker — it never
// crawls (GUD-002). The daily digest UI is implemented in Phase 6 (TASK-033+).
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
