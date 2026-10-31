import { describe, expect, it } from 'vitest'
import { deepestContaining, launchedIn, workCwdOf } from './worktree-match'

const ROOT = 'D:\\work\\acme'
const FIX = 'D:\\work\\acme\\.wt-app-4821-fix-login'

describe('deepestContaining', () => {
  it('matches a file in a subfolder of a worktree, returning the worktree as given', () => {
    expect(deepestContaining([FIX], 'D:\\work\\acme\\.wt-app-4821-fix-login\\src\\login.ts')).toBe(
      FIX
    )
  })

  it('matches the worktree path itself', () => {
    expect(deepestContaining([FIX], FIX)).toBe(FIX)
  })

  it('ignores letter case (SFWT-03)', () => {
    expect(deepestContaining([FIX], 'd:\\WORK\\Acme\\.WT-app-4821-fix-login\\README.md')).toBe(FIX)
  })

  it('treats forward and back slashes as the same separator', () => {
    expect(deepestContaining([FIX], 'D:/work/acme/.wt-app-4821-fix-login/README.md')).toBe(FIX)
    expect(deepestContaining(['D:/work/acme/.wt-a'], 'D:\\work\\acme\\.wt-a\\x.ts')).toBe(
      'D:/work/acme/.wt-a'
    )
  })

  it('matches only at a separator boundary, so .wt-a never claims .wt-ab (SFWT-03)', () => {
    const a = 'D:\\work\\acme\\.wt-a'
    const ab = 'D:\\work\\acme\\.wt-ab'
    expect(deepestContaining([a], 'D:\\work\\acme\\.wt-ab\\x.ts')).toBeNull()
    expect(deepestContaining([a, ab], 'D:\\work\\acme\\.wt-ab\\x.ts')).toBe(ab)
  })

  it('lets the deepest of nested worktrees win, whatever the list order', () => {
    const file = 'D:\\work\\acme\\.wt-app-4821-fix-login\\src\\login.ts'
    expect(deepestContaining([ROOT, FIX], file)).toBe(FIX)
    expect(deepestContaining([FIX, ROOT], file)).toBe(FIX)
    expect(deepestContaining([ROOT, FIX], 'D:\\work\\acme\\README.md')).toBe(ROOT)
  })

  it('returns null when no worktree contains the path', () => {
    expect(deepestContaining([ROOT, FIX], 'D:\\other\\README.md')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(deepestContaining([], 'D:\\work\\acme\\README.md')).toBeNull()
  })
})

describe('workCwdOf', () => {
  it('is the followed path when the session follows a worktree (SFWT-11)', () => {
    expect(workCwdOf({ cwd: ROOT, followedPath: FIX })).toBe(FIX)
  })

  it('is the launch folder when the session follows none (SFWT-11)', () => {
    expect(workCwdOf({ cwd: ROOT })).toBe(ROOT)
  })
})

describe('launchedIn', () => {
  const CART = 'D:\\work\\acme\\.wt-app-4822-cart'
  const sessions = [
    { id: 'follows-fix', cwd: ROOT, followedPath: FIX },
    { id: 'in-fix', cwd: FIX },
    { id: 'in-fix-follows-cart', cwd: FIX, followedPath: CART }
  ]

  it('keeps a session that only follows the worktree out of its removal (SFWT-15)', () => {
    expect(launchedIn(sessions, FIX).map((s) => s.id)).not.toContain('follows-fix')
  })

  it('stops every session whose terminal runs there, whatever it follows (SFWT-15)', () => {
    expect(launchedIn(sessions, FIX).map((s) => s.id)).toEqual(['in-fix', 'in-fix-follows-cart'])
  })
})
