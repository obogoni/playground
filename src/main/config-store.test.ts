import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../shared/config'
import { ConfigStore } from './config-store'

describe('ConfigStore', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-config-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when no config file exists', () => {
    const store = new ConfigStore(dir)

    expect(store.get()).toEqual(DEFAULT_CONFIG)
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
  })

  it('persists a patch and reads it back in a fresh instance', () => {
    new ConfigStore(dir).patch({ ui: { theme: 'light' } })

    const reloaded = new ConfigStore(dir)
    expect(reloaded.get().ui.theme).toBe('light')
    expect(reloaded.get().ui.direction).toBe('tree')
  })

  it('backs up a corrupt config file and starts with defaults', () => {
    writeFileSync(join(dir, 'config.json'), '{ this is not json', 'utf8')

    const store = new ConfigStore(dir)

    expect(store.get()).toEqual(DEFAULT_CONFIG)
    const backups = readdirSync(dir).filter((f) => f.startsWith('config.json.bak-'))
    expect(backups).toHaveLength(1)
    expect(readFileSync(join(dir, backups[0]), 'utf8')).toBe('{ this is not json')
  })

  it('writes atomically, leaving no tmp file and a parseable config', () => {
    new ConfigStore(dir).patch({ ui: { direction: 'board' } })

    const files = readdirSync(dir)
    expect(files).toContain('config.json')
    expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0)
    const onDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    expect(onDisk.ui.direction).toBe('board')
  })

  it('preserves unknown keys from newer app versions across a patch', () => {
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ ui: { theme: 'light', futureFlag: true }, workspaces: ['x'] }),
      'utf8'
    )

    new ConfigStore(dir).patch({ ui: { direction: 'board' } })

    const onDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    expect(onDisk.ui).toEqual({ theme: 'light', direction: 'board', futureFlag: true })
    expect(onDisk.workspaces).toEqual(['x'])
  })

  it('patch returns the merged config and get() reflects it immediately', () => {
    const store = new ConfigStore(dir)

    const result = store.patch({ ui: { theme: 'light' } })

    expect(result.ui).toEqual({ theme: 'light', direction: 'tree' })
    expect(store.get()).toBe(result)
  })
})
