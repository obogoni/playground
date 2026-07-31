import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repoPostCreateCommand, resolvePostCreateCommand } from './repo-config'
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

describe('resolvePostCreateCommand', () => {
  let workspace: string
  let repo: string
  let logged: unknown[][]
  let realConsoleError: typeof console.error

  beforeEach(() => {
    // The real shape scanRepos produces: the repo is a direct child of the
    // workspace, so both levels are derivable from the repo path alone.
    workspace = mkdtempSync(join(tmpdir(), 'wtm-resolve-'))
    repo = join(workspace, 'Code')
    mkdirSync(repo)
    logged = []
    realConsoleError = console.error
    console.error = (...args: unknown[]): void => {
      logged.push(args)
    }
  })

  afterEach(() => {
    console.error = realConsoleError
    rmSync(workspace, { recursive: true, force: true })
  })

  const writeRepoConfig = (content: string): void => {
    mkdirSync(join(repo, '.app'), { recursive: true })
    writeFileSync(join(repo, '.app', 'config.json'), content, 'utf8')
  }

  const writeWorkspaceConfig = (content: string): void => {
    mkdirSync(join(workspace, '.app'), { recursive: true })
    writeFileSync(join(workspace, '.app', 'config.json'), content, 'utf8')
  }

  // HWC-02/HWC-03: the workspace declaration reaches the repo by name alone.
  it('falls back to the workspace command keyed by the repo folder name', () => {
    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "workspace.cmd" } }')

    expect(resolvePostCreateCommand(repo)).toBe('workspace.cmd')
  })

  // HWC-01: repo wins, and the workspace value for the same repo is not used.
  it('prefers the repo command over the workspace command for the same repo', () => {
    writeRepoConfig('{ "postCreateCommand": "repo.cmd" }')
    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "workspace.cmd" } }')

    expect(resolvePostCreateCommand(repo)).toBe('repo.cmd')
  })

  // HWC-02: "declares nothing" includes every WPC-06 shape, not just an absent file.
  it.each([
    ['the file is absent', null],
    ['the key is absent', '{ "branchTemplate": "task/{id}" }'],
    ['the command is blank', '{ "postCreateCommand": "   " }'],
    ['the command is not a string', '{ "postCreateCommand": 42 }'],
    ['the file is malformed JSON', '{ this is not json']
  ])('falls back to the workspace command when %s in the repo', (_label, repoContent) => {
    if (repoContent !== null) writeRepoConfig(repoContent)
    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "workspace.cmd" } }')

    expect(resolvePostCreateCommand(repo)).toBe('workspace.cmd')
  })

  // HWC-04: neither level declaring anything is the pre-feature state.
  it('returns null when neither level declares a command', () => {
    expect(resolvePostCreateCommand(repo)).toBeNull()
  })

  it('returns null when the workspace names other repos but not this one', () => {
    writeWorkspaceConfig('{ "postCreateCommands": { "Library": "other.cmd" } }')

    expect(resolvePostCreateCommand(repo)).toBeNull()
  })

  // HWC-11: a trailing separator must not change which keys are consulted.
  it('resolves identically when the repo path has a trailing separator', () => {
    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "workspace.cmd" } }')

    expect(resolvePostCreateCommand(`${repo}${sep}`)).toBe('workspace.cmd')
  })

  // HWC-12: a path with no repo name to key on resolves to nothing, not a throw.
  it.each([['a drive root', 'M:\\'], ['an empty string', ''], ['a root slash', sep]])(
    'returns null without throwing for %s',
    (_label, degenerate) => {
      expect(resolvePostCreateCommand(degenerate)).toBeNull()
    }
  )

  // HWC-13: derivation is lexical — a repo outside any configured workspace is
  // simply unmatched, with no registry lookup and no error.
  it('returns null for a repo whose parent has no workspace config', () => {
    const orphan = join(workspace, 'nested', 'Deep')
    mkdirSync(orphan, { recursive: true })
    writeWorkspaceConfig('{ "postCreateCommands": { "Deep": "workspace.cmd" } }')

    // Its lexical parent is `nested`, not the workspace that names it.
    expect(resolvePostCreateCommand(orphan)).toBeNull()
    expect(logged).toHaveLength(0)
  })

  // HWC-14: read on use — no caching at either level.
  it('observes a workspace config edit without restarting', () => {
    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "first.cmd" } }')
    expect(resolvePostCreateCommand(repo)).toBe('first.cmd')

    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "second.cmd" } }')
    expect(resolvePostCreateCommand(repo)).toBe('second.cmd')
  })

  // HWC-14: and a repo declaration added later immediately takes precedence.
  it('observes a repo config added after a workspace resolution', () => {
    writeWorkspaceConfig('{ "postCreateCommands": { "Code": "workspace.cmd" } }')
    expect(resolvePostCreateCommand(repo)).toBe('workspace.cmd')

    writeRepoConfig('{ "postCreateCommand": "repo.cmd" }')
    expect(resolvePostCreateCommand(repo)).toBe('repo.cmd')
  })
})
