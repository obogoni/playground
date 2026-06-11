import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigStore } from './config-store'
import { buildTree } from './tree'
import { WorkspaceRegistry } from './workspace-registry'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

const makeRepo = (workspace: string, name: string): string => {
  const repo = join(workspace, name)
  mkdirSync(repo)
  git(repo, 'init', '-b', 'main')
  git(repo, 'config', 'user.email', 'test@test.local')
  git(repo, 'config', 'user.name', 'Test')
  writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
  git(repo, 'add', '.')
  git(repo, 'commit', '-m', 'init')
  return repo
}

describe('buildTree', () => {
  let configDir: string
  let workspace: string
  let registry: WorkspaceRegistry

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'wtm-tree-cfg-'))
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'wtm-tree-ws-')))
    registry = new WorkspaceRegistry(new ConfigStore(configDir))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  it('snapshots a workspace with repos and their worktrees', async () => {
    const repo = makeRepo(workspace, 'api')
    git(repo, 'worktree', 'add', join(workspace, 'api-feature-7'), '-b', 'feature/7')
    registry.add(workspace)

    const tree = await buildTree(registry)

    expect(tree).toHaveLength(1)
    expect(tree[0].missing).toBeUndefined()
    // the linked worktree's folder has a .git file → not a repo, only 'api' is
    expect(tree[0].repos.map((r) => r.name)).toEqual(['api'])
    expect(tree[0].repos[0].worktrees.map((w) => w.branch)).toEqual(['main', 'feature/7'])
  })

  it('marks a workspace whose path vanished as missing without affecting others', async () => {
    makeRepo(workspace, 'api')
    registry.add(workspace)
    const ghost = join(workspace, '..', 'wtm-tree-ghost-' + Date.now())
    mkdirSync(ghost)
    registry.add(ghost)
    rmSync(ghost, { recursive: true, force: true })

    const tree = await buildTree(registry)

    expect(tree).toHaveLength(2)
    expect(tree[0].missing).toBeUndefined()
    expect(tree[0].repos.map((r) => r.name)).toEqual(['api'])
    expect(tree[1]).toMatchObject({ missing: true, repos: [] })
  })

  it('embeds a git failure as a repo-level error, leaving sibling repos intact', async () => {
    makeRepo(workspace, 'healthy')
    // a fake repo: .git directory exists but is not a valid gitdir
    mkdirSync(join(workspace, 'broken', '.git'), { recursive: true })
    registry.add(workspace)

    const tree = await buildTree(registry)
    const repos = tree[0].repos

    expect(repos.map((r) => r.name)).toEqual(['broken', 'healthy'])
    expect(repos[0].error).toBeTruthy()
    expect(repos[0].worktrees).toEqual([])
    expect(repos[1].error).toBeUndefined()
    expect(repos[1].worktrees).toHaveLength(1)
  })

  it('returns an empty snapshot when nothing is registered', async () => {
    expect(await buildTree(registry)).toEqual([])
  })
})
