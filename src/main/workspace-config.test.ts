import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workspaceTemplates } from './workspace-config'

describe('workspaceTemplates', () => {
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

  it('returns both templates from .app/config.json', () => {
    writeOverride('{ "branchTemplate": "task/{id}-{slug}", "worktreeTemplate": "{id}" }')

    expect(workspaceTemplates(dir)).toEqual({
      branchTemplate: 'task/{id}-{slug}',
      worktreeTemplate: '{id}'
    })
  })

  it('trims surrounding whitespace from each value', () => {
    writeOverride('{ "branchTemplate": "  task/{id}  ", "worktreeTemplate": "  {id}  " }')

    expect(workspaceTemplates(dir)).toEqual({
      branchTemplate: 'task/{id}',
      worktreeTemplate: '{id}'
    })
  })

  it('returns a template independently when only one key is present', () => {
    writeOverride('{ "worktreeTemplate": "{repo}-{id}" }')

    expect(workspaceTemplates(dir)).toEqual({
      branchTemplate: null,
      worktreeTemplate: '{repo}-{id}'
    })
  })

  it('returns both null when the workspace has no .app directory', () => {
    expect(workspaceTemplates(dir)).toEqual({ branchTemplate: null, worktreeTemplate: null })
  })

  it('returns both null when .app exists but config.json does not', () => {
    mkdirSync(join(dir, '.app'))

    expect(workspaceTemplates(dir)).toEqual({ branchTemplate: null, worktreeTemplate: null })
  })

  it('returns both null when neither template key is present', () => {
    writeOverride('{ "somethingElse": true }')

    expect(workspaceTemplates(dir)).toEqual({ branchTemplate: null, worktreeTemplate: null })
  })

  it('treats a blank value as null', () => {
    writeOverride('{ "branchTemplate": "   ", "worktreeTemplate": "" }')

    expect(workspaceTemplates(dir)).toEqual({ branchTemplate: null, worktreeTemplate: null })
  })

  it('treats a non-string value as null', () => {
    writeOverride('{ "branchTemplate": 42, "worktreeTemplate": { "x": 1 } }')

    expect(workspaceTemplates(dir)).toEqual({ branchTemplate: null, worktreeTemplate: null })
  })

  it('returns both null without throwing on malformed JSON', () => {
    writeOverride('{ this is not json')

    expect(workspaceTemplates(dir)).toEqual({ branchTemplate: null, worktreeTemplate: null })
  })

  it('returns both null for a workspace path that does not exist', () => {
    expect(workspaceTemplates(join(dir, 'nope'))).toEqual({
      branchTemplate: null,
      worktreeTemplate: null
    })
  })
})
