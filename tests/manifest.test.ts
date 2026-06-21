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
