import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { git, isTimeout } from './git'
import {
  removeReleasedFolder,
  startWaitingRemote,
  trackWaitingRemote,
  type WaitingRemote
} from './waiting-remote.fixture'

const gitSync = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

describe('waiting remote fixture (CRTO-02)', () => {
  let root: string
  let repo: string
  let remote: WaitingRemote

  beforeEach(async () => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'waiting-remote-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    gitSync(repo, 'init', '-b', 'main')
    gitSync(repo, 'config', 'user.email', 'test@test.local')
    gitSync(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    gitSync(repo, 'add', '.')
    gitSync(repo, 'commit', '-m', 'init')
    remote = await startWaitingRemote()
    trackWaitingRemote(repo, remote.url)
  })

  afterEach(async () => {
    await remote.close()
    await removeReleasedFolder(root)
  })

  it('keeps a fetch waiting until its timeout kills git', async () => {
    const started = Date.now()

    const err = await git(repo, ['fetch', 'origin', 'main'], { timeoutMs: 3000 }).then(
      () => new Error('the fetch settled on its own'),
      (e: unknown) => e
    )

    expect(isTimeout(err)).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(3000)
  })
})
