import { describe, expect, it } from 'vitest'
import { KnownWorktrees } from './known-worktrees'

const ACME = 'D:\\work\\acme'
const APP = 'D:\\work\\acme\\app'
const FIX = 'D:\\work\\acme\\.wt-app-4821-fix-login'
const FIX_FILE = 'D:\\work\\acme\\.wt-app-4821-fix-login\\src\\login.ts'
const BETA = 'D:\\work\\beta'
const BETA_APP = 'D:\\work\\beta\\app'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface Harness {
  known: KnownWorktrees
  rereads: string[]
  errors: unknown[]
}

function setup(reread: (workspacePath: string) => Promise<string[]>): Harness {
  const rereads: string[] = []
  const errors: unknown[] = []
  const known = new KnownWorktrees({
    reread: (workspacePath) => {
      rereads.push(workspacePath)
      return reread(workspacePath)
    },
    logError: (err) => {
      errors.push(err)
    }
  })
  return { known, rereads, errors }
}

describe('KnownWorktrees', () => {
  it('resolves an edit in a known worktree from the cache, without a re-read', async () => {
    const h = setup(() => Promise.resolve([]))
    h.known.replace({ workspaces: [ACME], worktrees: [APP, FIX] })
    expect(h.known.match(FIX_FILE)).toBe(FIX)
    expect(await h.known.resolve(FIX_FILE)).toBe(FIX)
    expect(h.rereads).toEqual([])
  })

  it('re-reads the workspace once on a miss inside it and matches the new worktree (SFWT-12)', async () => {
    const h = setup(() => Promise.resolve([APP, FIX]))
    h.known.replace({ workspaces: [ACME], worktrees: [APP] })
    expect(await h.known.resolve(FIX_FILE)).toBe(FIX)
    expect(h.rereads).toEqual([ACME])
    // Merged into the cache: the next edit there needs no re-read.
    expect(h.known.match(FIX_FILE)).toBe(FIX)
  })

  it('answers null when the re-read does not list the path either', async () => {
    const h = setup(() => Promise.resolve([APP]))
    h.known.replace({ workspaces: [ACME], worktrees: [APP] })
    expect(await h.known.resolve(FIX_FILE)).toBeNull()
    expect(h.rereads).toEqual([ACME])
  })

  it('lets two concurrent misses share one re-read (SFWT-13)', async () => {
    const read = deferred<string[]>()
    const h = setup(() => read.promise)
    h.known.replace({ workspaces: [ACME], worktrees: [APP] })
    const first = h.known.resolve(FIX_FILE)
    const second = h.known.resolve('D:\\work\\acme\\.wt-app-4821-fix-login\\README.md')
    read.resolve([APP, FIX])
    expect(await first).toBe(FIX)
    expect(await second).toBe(FIX)
    expect(h.rereads).toEqual([ACME])
  })

  it('starts no second re-read while one is in flight, even for another workspace (SFWT-13)', async () => {
    const read = deferred<string[]>()
    const h = setup(() => read.promise)
    h.known.replace({ workspaces: [ACME, BETA], worktrees: [APP] })
    const first = h.known.resolve(FIX_FILE)
    const second = h.known.resolve('D:\\work\\beta\\app\\README.md')
    read.resolve([APP, FIX])
    expect(await first).toBe(FIX)
    expect(await second).toBeNull()
    expect(h.rereads).toEqual([ACME])
  })

  it('never re-reads for an edit outside every registered workspace (SFWT-13)', async () => {
    const h = setup(() => Promise.resolve([APP, FIX]))
    h.known.replace({ workspaces: [ACME], worktrees: [APP] })
    expect(await h.known.resolve('E:\\scratch\\notes.md')).toBeNull()
    expect(h.rereads).toEqual([])
  })

  it('answers null and logs the error when the re-read fails (SFWT-14)', async () => {
    const failure = new Error('git worktree list failed')
    const h = setup(() => Promise.reject(failure))
    h.known.replace({ workspaces: [ACME], worktrees: [APP] })
    expect(await h.known.resolve(FIX_FILE)).toBeNull()
    expect(h.errors).toEqual([failure])
  })

  it('drops the paths a newer snapshot no longer lists', () => {
    const h = setup(() => Promise.resolve([]))
    h.known.replace({ workspaces: [ACME, BETA], worktrees: [APP, FIX, BETA_APP] })
    h.known.replace({ workspaces: [ACME], worktrees: [APP] })
    expect(h.known.match(FIX_FILE)).toBeNull()
    expect(h.known.match('D:\\work\\beta\\app\\README.md')).toBeNull()
    expect(h.known.match('D:\\work\\acme\\app\\README.md')).toBe(APP)
  })
})
