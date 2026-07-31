import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workspacePostCreateCommand, workspaceTemplates } from './workspace-config'

describe('workspacePostCreateCommand', () => {
  let dir: string
  let logged: unknown[][]
  let realConsoleError: typeof console.error

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-wspch-'))
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

  // HWC-02: the workspace file is a real declaration site for a named repo.
  it('returns the command mapped to the repo name', () => {
    writeConfig('{ "postCreateCommands": { "Code": ".\\\\SetupSkills.cmd < NUL" } }')

    expect(workspacePostCreateCommand(dir, 'Code')).toBe('.\\SetupSkills.cmd < NUL')
  })

  // HWC-08: per-repo keys only — an unlisted repo inherits nothing.
  it('returns null for a repo the map does not name', () => {
    writeConfig('{ "postCreateCommands": { "Code": "init.cmd" } }')

    expect(workspacePostCreateCommand(dir, 'Library')).toBeNull()
  })

  // HWC-08 (trim half).
  it('trims surrounding whitespace from the command', () => {
    writeConfig('{ "postCreateCommands": { "Code": "   init.cmd   " } }')

    expect(workspacePostCreateCommand(dir, 'Code')).toBe('init.cmd')
  })

  // HWC-08: blank and whitespace-only are declarations of nothing.
  it.each([
    ['empty string', '""'],
    ['whitespace only', '"   "']
  ])('returns null when the mapped value is %s', (_label, value) => {
    writeConfig(`{ "postCreateCommands": { "Code": ${value} } }`)

    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
  })

  // HWC-08: a non-string entry is not a command.
  it.each([
    ['a number', '42'],
    ['an object', '{ "cmd": "init.cmd" }'],
    ['an array', '["init.cmd"]'],
    ['null', 'null'],
    ['a boolean', 'true']
  ])('returns null when the mapped value is %s', (_label, value) => {
    writeConfig(`{ "postCreateCommands": { "Code": ${value} } }`)

    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
  })

  // HWC-07: the map itself may be absent or the wrong shape — never a throw.
  it.each([
    ['absent', '{ "branchTemplate": "task/{id}" }'],
    ['null', '{ "postCreateCommands": null }'],
    ['a string', '{ "postCreateCommands": "init.cmd" }'],
    ['a number', '{ "postCreateCommands": 7 }'],
    ['an array', '{ "postCreateCommands": ["init.cmd"] }']
  ])('returns null when postCreateCommands is %s', (_label, content) => {
    writeConfig(content)

    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
  })

  // HWC-05: absent/unreadable degrades silently — nothing to report.
  it('returns null and logs nothing when the workspace has no .app directory', () => {
    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
    expect(logged).toHaveLength(0)
  })

  it('returns null and logs nothing when .app exists but config.json does not', () => {
    mkdirSync(join(dir, '.app'))

    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
    expect(logged).toHaveLength(0)
  })

  it('returns null and logs nothing for a workspace path that does not exist', () => {
    expect(workspacePostCreateCommand(join(dir, 'nope'), 'Code')).toBeNull()
    expect(logged).toHaveLength(0)
  })

  // HWC-06: malformed JSON is the one silent-fallback case that must be visible.
  it('returns null and logs the file once on malformed JSON', () => {
    writeConfig('{ this is not json')

    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).toContain(join(dir, '.app', 'config.json'))
  })

  // HWC-09: a case slip on a case-insensitive filesystem still resolves.
  it('matches a case-variant key when it is the only one', () => {
    writeConfig('{ "postCreateCommands": { "code": "init.cmd" } }')

    expect(workspacePostCreateCommand(dir, 'Code')).toBe('init.cmd')
    expect(logged).toHaveLength(0)
  })

  // HWC-09: exact wins, so a variant can never shadow the literal key.
  it('prefers the exact key over a case variant', () => {
    writeConfig('{ "postCreateCommands": { "code": "variant.cmd", "Code": "exact.cmd" } }')

    expect(workspacePostCreateCommand(dir, 'Code')).toBe('exact.cmd')
  })

  // HWC-09: ambiguity resolves to "no command", not to an arbitrary winner.
  it('returns null and logs once when two case variants match and none is exact', () => {
    writeConfig('{ "postCreateCommands": { "code": "one.cmd", "CODE": "two.cmd" } }')

    expect(workspacePostCreateCommand(dir, 'Code')).toBeNull()
    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).toContain('Code')
  })

  // HWC-10: one file, two readers, disjoint keys — proven from both directions.
  it('ignores the template keys, and workspaceTemplates ignores the command map', () => {
    writeConfig(
      '{ "branchTemplate": "task/{id}", "worktreeTemplate": "{id}", "postCreateCommands": { "Code": "init.cmd" } }'
    )

    expect(workspacePostCreateCommand(dir, 'branchTemplate')).toBeNull()
    expect(workspacePostCreateCommand(dir, 'Code')).toBe('init.cmd')
    expect(workspaceTemplates(dir)).toEqual({
      branchTemplate: 'task/{id}',
      worktreeTemplate: '{id}'
    })
  })

  // A repo named after an Object.prototype member must not match the prototype.
  it('does not match inherited object properties', () => {
    writeConfig('{ "postCreateCommands": { "Code": "init.cmd" } }')

    expect(workspacePostCreateCommand(dir, 'toString')).toBeNull()
    expect(workspacePostCreateCommand(dir, 'constructor')).toBeNull()
  })
})
