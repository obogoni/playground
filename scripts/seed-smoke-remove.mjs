/* Seeds a throwaway workspace for scripts/smoke-remove.mjs and registers it in
 * the app config so tree:get sees it. Layout (a workspace folder whose name
 * starts with wtm-smoke-, holding the `api` repo and two flat-sibling worktrees):
 *
 *   <base>/wtm-smoke-seed/
 *     api/              git repo, branch main, committed a.txt + b.txt
 *     api-feature-42/   clean worktree, branch feature/42
 *     api-chore-wip/    dirty worktree, branch chore/wip — mixed dirt:
 *                        a.txt modified, b.txt deleted, c.txt untracked
 *
 * Usage:
 *   node scripts/seed-smoke-remove.mjs [baseDir]
 *
 * Then start the app with --remote-debugging-port=9222 and run:
 *   node scripts/smoke-remove.mjs
 *
 * IMPORTANT: the app must NOT be running when this writes config.json — it loads
 * config once at startup and would overwrite this on its next patch. Seed first,
 * then launch. Override the config path with SMOKE_CONFIG if your userData dir
 * differs from %APPDATA%/playground.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

const base = resolve(process.argv[2] ?? tmpdir())
const wsPath = join(base, 'wtm-smoke-seed')
const repo = join(wsPath, 'api')
const cleanWt = join(wsPath, 'api-feature-42')
const dirtyWt = join(wsPath, 'api-chore-wip')

// Fresh on every run so the dirty state is deterministic.
rmSync(wsPath, { recursive: true, force: true })
mkdirSync(repo, { recursive: true })

git(repo, 'init', '-b', 'main')
git(repo, 'config', 'user.email', 'smoke@test.local')
git(repo, 'config', 'user.name', 'Smoke')
writeFileSync(join(repo, 'a.txt'), 'alpha\n')
writeFileSync(join(repo, 'b.txt'), 'beta\n')
git(repo, 'add', '.')
git(repo, 'commit', '-m', 'init')

// Clean sibling worktree (feature/42).
git(repo, 'worktree', 'add', cleanWt, '-b', 'feature/42')

// Dirty sibling worktree (chore/wip) with one of each tracked status.
git(repo, 'worktree', 'add', dirtyWt, '-b', 'chore/wip')
writeFileSync(join(dirtyWt, 'a.txt'), 'alpha edited\n') // modified
rmSync(join(dirtyWt, 'b.txt')) // deleted
writeFileSync(join(dirtyWt, 'c.txt'), 'scratch\n') // untracked

// Register the workspace folder in the app config. Mirrors WorkspaceRegistry.add:
// id = lowercased absolute path, displayName = folder basename.
const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
const configPath = process.env.SMOKE_CONFIG ?? join(appData, 'playground', 'config.json')

let config = {}
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    config = {} // unreadable: start fresh (the app backs up corrupt files itself)
  }
}
if (!Array.isArray(config.workspaces)) config.workspaces = []

const entry = { id: wsPath.toLowerCase(), path: wsPath, displayName: 'wtm-smoke-seed' }
config.workspaces = [...config.workspaces.filter((w) => w.id !== entry.id), entry]

mkdirSync(dirname(configPath), { recursive: true })
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')

console.log('Seeded workspace:  ', wsPath)
console.log('  repo:            ', repo, '(main)')
console.log('  clean worktree:  ', cleanWt, '(feature/42)')
console.log(
  '  dirty worktree:  ',
  dirtyWt,
  '(chore/wip — a.txt modified, b.txt deleted, c.txt untracked)'
)
console.log('Registered in:     ', configPath)
console.log('')
console.log('Next: start the app with --remote-debugging-port=9222, then run')
console.log('  node scripts/smoke-remove.mjs')
