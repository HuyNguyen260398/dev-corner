import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// crxjs wires the MV3 manifest (service worker, popup, content scripts) into the
// Vite build; React powers the popup UI.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
})
