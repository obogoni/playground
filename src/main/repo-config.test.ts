import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repoPostCreateCommand } from './repo-config'
import { workspaceTemplates } from './workspace-config'

describe('repoPostCreateCommand', () => {
  let dir: string
  let logged: unknown[][]
  let realConsoleError: typeof console.error

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-repoconfig-'))
    // Hand-rolled capture rather than a mocking library (no vi.mock in this repo).
    logged = []
    realConsoleError = console.error
    console.error = (...args: unknown[]): void => {
      logged.push(args)
    }
  })

  afterEach(() => {
    console.error = realConsoleError
    rmSync(dir, { recursive: true, force: true })
  })

  const writeConfig = (content: string): void => {
    mkdirSync(join(dir, '.app'), { recursive: true })
    writeFileSync(join(dir, '.app', 'config.json'), content, 'utf8')
  }

  it('returns the postCreateCommand from .app/config.json', () => {
    writeConfig('{ "postCreateCommand": "SetupSkills.cmd" }')

    expect(repoPostCreateCommand(dir)).toBe('SetupSkills.cmd')
  })

  it('trims surrounding whitespace from the command', () => {
    writeConfig('{ "postCreateCommand": "   SetupSkills.cmd   " }')

    expect(repoPostCreateCommand(dir)).toBe('SetupSkills.cmd')
  })

  it('returns null when the repo has no .app directory', () => {
    expect(repoPostCreateCommand(dir)).toBeNull()
  })

  it('returns null when .app exists but config.json does not', () => {
    mkdirSync(join(dir, '.app'))

    expect(repoPostCreateCommand(dir)).toBeNull()
  })

  it('returns null when postCreateCommand is absent', () => {
    writeConfig('{ "somethingElse": true }')

    expect(repoPostCreateCommand(dir)).toBeNull()
  })

  it('returns null for a blank command', () => {
    writeConfig('{ "postCreateCommand": "   " }')

    expect(repoPostCreateCommand(dir)).toBeNull()
  })

  it('returns null for a non-string command', () => {
    writeConfig('{ "postCreateCommand": 42 }')
    expect(repoPostCreateCommand(dir)).toBeNull()

    writeConfig('{ "postCreateCommand": { "cmd": "SetupSkills.cmd" } }')
    expect(repoPostCreateCommand(dir)).toBeNull()
  })

  it('returns null and logs the ignored file on malformed JSON', () => {
    writeConfig('{ this is not json')

    expect(repoPostCreateCommand(dir)).toBeNull()
    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).toContain(join(dir, '.app', 'config.json'))
  })

  it('keeps the hook command and the template keys independent', () => {
    writeConfig(
      '{ "postCreateCommand": "SetupSkills.cmd", "branchTemplate": "task/{id}", "worktreeTemplate": "{id}" }'
    )

    expect(repoPostCreateCommand(dir)).toBe('SetupSkills.cmd')
    expect(workspaceTemplates(dir)).toEqual({
      branchTemplate: 'task/{id}',
      worktreeTemplate: '{id}'
    })
  })

  it('returns null for a repo path that does not exist', () => {
    expect(repoPostCreateCommand(join(dir, 'nope'))).toBeNull()
  })
})
