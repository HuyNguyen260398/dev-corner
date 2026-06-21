import { db } from '../lib/db'
import { originPatternForUrl } from '../lib/permissions'
import type { SourcePermissionState } from '../lib/types'

export async function hasSourcePermission(sourceUrl: string): Promise<boolean> {
  return containsOrigin(originPatternForUrl(sourceUrl))
}

export async function requestAndMarkSourcePermission(
  sourceId: number,
  sourceUrl: string,
): Promise<boolean> {
  const granted = await requestOrigin(originPatternForUrl(sourceUrl))
  await markSourcePermissionState(sourceId, granted ? 'granted' : 'needsPermission')
  return granted
}

export async function requestStoredSourcePermission(sourceId: number): Promise<boolean> {
  const source = await db.sources.get(sourceId)
  if (source === undefined) {
    throw new Error(`Source ${sourceId} was not found`)
  }
  return requestAndMarkSourcePermission(sourceId, source.url)
}

export async function markSourcePermissionResult(
  sourceId: number,
  granted: boolean,
): Promise<boolean> {
  await markSourcePermissionState(sourceId, granted ? 'granted' : 'needsPermission')
  return granted
}

export async function ensureSourcePermission(sourceId: number, sourceUrl: string): Promise<boolean> {
  const granted = await hasSourcePermission(sourceUrl)
  await markSourcePermissionState(sourceId, granted ? 'granted' : 'needsPermission')
  return granted
}

function containsOrigin(origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [origin] }, resolve)
  })
}

function requestOrigin(origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [origin] }, resolve)
  })
}

function markSourcePermissionState(sourceId: number, state: SourcePermissionState): Promise<number> {
  return db.sources.where(':id').equals(sourceId).modify((source) => {
    source.permissionState = state
  })
}
