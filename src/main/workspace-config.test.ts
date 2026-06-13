import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workspaceBranchTemplate } from './workspace-config'

describe('workspaceBranchTemplate', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-wsconfig-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const writeOverride = (content: string): void => {
    mkdirSync(join(dir, '.app'), { recursive: true })
    writeFileSync(join(dir, '.app', 'config.json'), content, 'utf8')
  }

  it('returns the template from .app/config.json', () => {
    writeOverride('{ "branchTemplate": "task/{id}-{slug}" }')

    expect(workspaceBranchTemplate(dir)).toBe('task/{id}-{slug}')
  })

  it('trims surrounding whitespace from the value', () => {
    writeOverride('{ "branchTemplate": "  task/{id}  " }')

    expect(workspaceBranchTemplate(dir)).toBe('task/{id}')
  })

  it('returns null when the workspace has no .app directory', () => {
    expect(workspaceBranchTemplate(dir)).toBeNull()
  })

  it('returns null when .app exists but config.json does not', () => {
    mkdirSync(join(dir, '.app'))

    expect(workspaceBranchTemplate(dir)).toBeNull()
  })

  it('returns null when the branchTemplate key is missing', () => {
    writeOverride('{ "somethingElse": true }')

    expect(workspaceBranchTemplate(dir)).toBeNull()
  })

  it('returns null when the value is blank', () => {
    writeOverride('{ "branchTemplate": "   " }')

    expect(workspaceBranchTemplate(dir)).toBeNull()
  })

  it('returns null when the value is not a string', () => {
    writeOverride('{ "branchTemplate": 42 }')

    expect(workspaceBranchTemplate(dir)).toBeNull()
  })

  it('returns null without throwing on malformed JSON', () => {
    writeOverride('{ this is not json')

    expect(workspaceBranchTemplate(dir)).toBeNull()
  })

  it('returns null for a workspace path that does not exist', () => {
    expect(workspaceBranchTemplate(join(dir, 'nope'))).toBeNull()
  })
})
