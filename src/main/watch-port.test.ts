import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { WatchHandle } from './file-watcher'
import { watchPort } from './watch-port'

/** cmd's `%~s` modifier prints the 8.3 spelling of a path that exists. */
function shortName(path: string): string {
  return spawnSync('cmd', ['/d', '/s', '/c', `"for %I in ("${path}") do @echo %~sI"`], {
    encoding: 'utf8',
    windowsHide: true,
    windowsVerbatimArguments: true
  }).stdout.trim()
}

const dirs: string[] = []
const handles: WatchHandle[] = []

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * A directory whose name has a space, so the volume gives it an 8.3 alias,
 * and that alias; the alias equals the path where 8.3 names are disabled.
 */
function shortNamedDir(): { long: string; short: string } {
  const long = mkdtempSync(join(realpathSync.native(tmpdir()), 'watch port '))
  dirs.push(long)
  return { long, short: shortName(long) }
}

/** The first name the listener reports once a file is written, or null after 3 s. */
function firstEvent(path: string, recursive: boolean, write: () => void): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000)
    handles.push(
      watchPort(path, { recursive }, (relPath) => {
        clearTimeout(timer)
        resolve(relPath)
      })
    )
    setTimeout(write, 100)
  })
}

describe('watchPort', () => {
  // Before the fix, libuv's fs-event.c asserts on the first event under an 8.3
  // path and aborts the process: the test worker dies and the run fails.
  for (const recursive of [false, true]) {
    it(`watches a directory named through its 8.3 alias, recursive ${recursive} (#121)`, async (ctx) => {
      if (process.platform !== 'win32') ctx.skip('8.3 names exist only on Windows')
      const { long, short } = shortNamedDir()
      if (short === long) ctx.skip('this volume does not create 8.3 names')
      expect(short).toMatch(/~\d/)

      const name = await firstEvent(short, recursive, () =>
        writeFileSync(join(long, 'touched.txt'), 'x')
      )

      expect(name).toBe('touched.txt')
    })
  }

  it('gives a path that does not exist a handle that watches nothing', () => {
    const missing = join(realpathSync.native(tmpdir()), `watch-port-missing-${process.pid}`)
    let heard = false

    const handle = watchPort(missing, { recursive: true }, () => {
      heard = true
    })

    expect(() => handle.close()).not.toThrow()
    expect(heard).toBe(false)
  })
})
