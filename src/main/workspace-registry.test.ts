import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigStore } from './config-store'
import { WorkspaceRegistry } from './workspace-registry'

describe('WorkspaceRegistry', () => {
  let configDir: string
  let workspaceDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'wtm-registry-'))
    workspaceDir = mkdtempSync(join(tmpdir(), 'wtm-workspace-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  const registry = (): WorkspaceRegistry => new WorkspaceRegistry(new ConfigStore(configDir))

  it('adds a workspace with folder basename as display name and persists it', () => {
    const target = join(workspaceDir, 'acme-platform')
    mkdirSync(target)

    const entry = registry().add(target)

    expect(entry).toMatchObject({ path: target, displayName: 'acme-platform' })
    // a fresh store on the same dir sees the persisted entry
    expect(registry().list()).toEqual([entry])
  })

  it('rejects a duplicate path that differs only in case or trailing separator', () => {
    const target = join(workspaceDir, 'Tools')
    mkdirSync(target)
    const reg = registry()

    expect(reg.add(target)).not.toBeNull()
    expect(reg.add(target.toUpperCase())).toBeNull()
    expect(reg.add(target + sep)).toBeNull()
    expect(reg.list()).toHaveLength(1)
  })

  it('removes a workspace by id and persists the removal', () => {
    const target = join(workspaceDir, 'proj')
    mkdirSync(target)
    const reg = registry()
    const entry = reg.add(target)!

    reg.remove(entry.id)

    expect(reg.list()).toEqual([])
    expect(registry().list()).toEqual([])
  })

  it('never touches the workspace folder on disk when removing', () => {
    const target = join(workspaceDir, 'precious')
    mkdirSync(target)
    writeFileSync(join(target, 'keep.txt'), 'data', 'utf8')
    const reg = registry()
    const entry = reg.add(target)!

    reg.remove(entry.id)

    expect(existsSync(join(target, 'keep.txt'))).toBe(true)
  })

  it('keeps registration order stable across restarts', () => {
    const a = join(workspaceDir, 'zeta')
    const b = join(workspaceDir, 'alpha')
    mkdirSync(a)
    mkdirSync(b)
    const reg = registry()
    reg.add(a)
    reg.add(b)

    expect(
      registry()
        .list()
        .map((ws) => ws.displayName)
    ).toEqual(['zeta', 'alpha'])
  })

  it('removing an unknown id is a harmless no-op', () => {
    const target = join(workspaceDir, 'only')
    mkdirSync(target)
    const reg = registry()
    reg.add(target)

    reg.remove('c:\\does\\not\\exist')

    expect(reg.list()).toHaveLength(1)
  })
})
