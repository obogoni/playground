import { describe, expect, it } from 'vitest'
import type { PathCheckRequest } from '../../../shared/worktrees'
import { PATH_CHECK_DELAY_MS, pathCheckKey, problemFor } from './path-check'

const BASE: PathCheckRequest = {
  repoPath: 'C:\\r\\api',
  branch: 'user/dev/1-x/2-y',
  baseBranch: 'main',
  worktreeTemplate: '{repo}-{id}'
}

const REF_MESSAGE =
  "The branch's ref path is 287 characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository."

describe('PATH_CHECK_DELAY_MS', () => {
  it('asks 250 ms after the last change (BSLG-23)', () => {
    expect(PATH_CHECK_DELAY_MS).toBe(250)
  })
})

describe('pathCheckKey', () => {
  it('is the same for the same four values', () => {
    expect(pathCheckKey({ ...BASE })).toBe(pathCheckKey(BASE))
  })

  it.each([
    ['repoPath', { repoPath: 'C:\\r\\web' }],
    ['branch', { branch: 'user/dev/1-x/2-z' }],
    ['baseBranch', { baseBranch: 'develop' }],
    ['worktreeTemplate', { worktreeTemplate: '{repo}-{branch}' }]
  ] as const)('changes when only %s changes (BSLG-23)', (_name, change) => {
    expect(pathCheckKey({ ...BASE, ...change })).not.toBe(pathCheckKey(BASE))
  })

  it('treats an absent and an empty baseBranch alike', () => {
    const absent: PathCheckRequest = { ...BASE, baseBranch: undefined }
    expect(pathCheckKey({ ...BASE, baseBranch: '' })).toBe(pathCheckKey(absent))
  })

  it('treats an absent and an empty worktreeTemplate alike', () => {
    const absent: PathCheckRequest = { ...BASE, worktreeTemplate: undefined }
    expect(pathCheckKey({ ...BASE, worktreeTemplate: '' })).toBe(pathCheckKey(absent))
  })

  it('keeps a value from bleeding into its neighbour', () => {
    expect(pathCheckKey({ ...BASE, repoPath: 'a', branch: 'b|c' })).not.toBe(
      pathCheckKey({ ...BASE, repoPath: 'a|b', branch: 'c' })
    )
  })
})

describe('problemFor', () => {
  const key = pathCheckKey(BASE)

  it("returns the answer's problem when it was given for the current values", () => {
    expect(problemFor({ key, problem: REF_MESSAGE }, key)).toBe(REF_MESSAGE)
  })

  it('ignores an answer given for other values (BSLG-42)', () => {
    const stale = pathCheckKey({ ...BASE, branch: 'user/dev/1-x/2-old' })
    expect(problemFor({ key: stale, problem: REF_MESSAGE }, key)).toBeNull()
  })

  it('returns null with no answer yet', () => {
    expect(problemFor(null, key)).toBeNull()
  })

  it('returns null for a current answer with no problem', () => {
    expect(problemFor({ key, problem: null }, key)).toBeNull()
  })
})
