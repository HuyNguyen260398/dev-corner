import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest.config'

const iconSizes = ['16', '32', '48', '128'] as const
type ReleaseIconManifest = {
  icons?: Record<number, string>
  action?: {
    default_icon?: Record<number, string>
  }
}

describe('manifest release assets', () => {
  it('declares only exercised API permissions and an explicit MV3 CSP', async () => {
    const resolvedManifest = (await manifest) as {
      minimum_chrome_version?: string
      permissions?: string[]
      content_security_policy?: { extension_pages?: string }
    }

    expect(resolvedManifest.minimum_chrome_version).toBe('103')
    expect(resolvedManifest.permissions).toEqual([
      'activeTab',
      'storage',
      'alarms',
      'contextMenus',
      'notifications',
    ])
    expect(resolvedManifest.content_security_policy?.extension_pages).toBe(
      "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; connect-src https: http:; img-src 'self' data: https:",
    )
  })

  it('uses optional per-origin host permissions for Web Store least privilege', async () => {
    const resolvedManifest = (await manifest) as {
      host_permissions?: string[]
      optional_host_permissions?: string[]
    }

    expect(resolvedManifest.host_permissions).toBeUndefined()
    expect(resolvedManifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*'])
  })

  it('references packaged extension icons for Chrome and the toolbar action', async () => {
    const resolvedManifest = (await manifest) as ReleaseIconManifest

    expect(resolvedManifest.icons).toEqual({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    })
    expect(resolvedManifest.action?.default_icon).toEqual(resolvedManifest.icons)

    for (const size of iconSizes) {
      const iconPath = resolve(process.cwd(), 'public', 'icons', `icon-${size}.png`)
      expect(existsSync(iconPath), iconPath).toBe(true)
      expect(readPngSize(iconPath)).toEqual({ width: Number(size), height: Number(size) })
    }
  })
})

function readPngSize(path: string): { width: number; height: number } {
  const png = readFileSync(path)
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  }
}
