import { describe, expect, it } from 'vitest'
import {
  anchorFromSelection,
  classifyThread,
  iterationContextFor,
  pickRemoteRepos,
  rootCommentId,
  sourceRemote,
  toChangedPaths,
  visibleComments,
  voteLabel,
  type AdoComment,
  type AdoThread
} from './ado-pr-model'

// Every name here is fictitious: this repository is public and the spec's
// privacy guardrail forbids a real organisation, project or repository name.

const END_OF_LINE = 2147483647

function comment(overrides: Partial<AdoComment> = {}): AdoComment {
  return {
    id: 1,
    author: { displayName: 'Alex Contoso' },
    content: 'Could this be a constant?',
    publishedDate: '2026-10-01T12:00:00Z',
    commentType: 'text',
    ...overrides
  }
}

function thread(overrides: Partial<AdoThread> = {}): AdoThread {
  return { id: 100, status: 'active', comments: [comment()], ...overrides }
}

/** A thread context on the right side, as ADO returns it for the latest iteration. */
function onRight(start: [number, number], end: [number, number]): AdoThread['threadContext'] {
  return {
    filePath: '/src/app.ts',
    rightFileStart: { line: start[0], offset: start[1] },
    rightFileEnd: { line: end[0], offset: end[1] }
  }
}

describe('toChangedPaths', () => {
  // The shapes follow the reference's Iteration Changes example: ADO roots
  // every path at `/` and names the change type in words.
  it('maps each change type to the status the other modes use', () => {
    expect(
      toChangedPaths([
        { changeTrackingId: 1, changeType: 'add', item: { path: '/src/new.ts' } },
        { changeTrackingId: 2, changeType: 'edit', item: { path: '/src/app.ts' } },
        { changeTrackingId: 3, changeType: 'delete', item: { path: '/src/old.ts' } },
        {
          changeTrackingId: 4,
          changeType: 'rename',
          item: { path: '/src/moved.ts' },
          originalPath: '/src/before.ts'
        },
        {
          changeTrackingId: 5,
          changeType: 'edit, rename',
          item: { path: '/src/reworked.ts' },
          originalPath: '/src/draft.ts'
        }
      ]).map((file) => [file.path, file.status])
    ).toEqual([
      ['src/new.ts', 'added'],
      ['src/app.ts', 'modified'],
      ['src/old.ts', 'deleted'],
      ['src/moved.ts', 'renamed'],
      ['src/reworked.ts', 'renamed']
    ])
  })

  it("strips ADO's leading slash and keeps the original path and change tracking id", () => {
    expect(
      toChangedPaths([
        {
          changeTrackingId: 7,
          changeType: 'rename',
          item: { path: '/docs/guide.md' },
          originalPath: '/docs/readme.md'
        },
        { changeTrackingId: 8, changeType: 'edit', item: { path: '/package.json' } }
      ])
    ).toEqual([
      { path: 'docs/guide.md', status: 'renamed', oldPath: 'docs/readme.md', changeTrackingId: 7 },
      { path: 'package.json', status: 'modified', changeTrackingId: 8 }
    ])
  })
})

describe('voteLabel', () => {
  it('maps the five documented votes to their states', () => {
    expect([10, 5, 0, -5, -10].map(voteLabel)).toEqual([
      'approved',
      'approved-with-suggestions',
      'no-vote',
      'waiting-for-author',
      'rejected'
    ])
  })

  it('maps a vote the reference does not document to no vote', () => {
    expect(voteLabel(7)).toBe('no-vote')
    expect(voteLabel(-1)).toBe('no-vote')
  })
})

describe('pickRemoteRepos (FPRA-02/06)', () => {
  it('yields only the azure devops remote of a repository that also has a github one', () => {
    expect(
      pickRemoteRepos([
        { name: 'origin', url: 'https://github.com/acme/widget.git' },
        { name: 'fork', url: 'https://acme@dev.azure.com/acme/platform/_git/widget' }
      ])
    ).toEqual([{ name: 'fork', target: { org: 'acme', project: 'platform', repo: 'widget' } }])
  })

  it('yields none when no remote is on azure devops', () => {
    expect(
      pickRemoteRepos([
        { name: 'origin', url: 'https://github.com/acme/widget.git' },
        { name: 'mirror', url: 'https://git.example.com/acme/widget.git' }
      ])
    ).toEqual([])
  })
})

describe('sourceRemote (FPRA-02)', () => {
  const repos = [
    { name: 'origin', target: { org: 'acme', project: 'platform', repo: 'widget' } },
    { name: 'fork', target: { org: 'acme', project: 'platform', repo: 'widget-fork' } }
  ]

  it('is the azure devops remote the branch tracks, a fork included', () => {
    expect(sourceRemote('fork', repos)).toEqual(repos[1])
  })

  it('is none when the branch tracks nothing, or a remote not on azure devops', () => {
    expect(sourceRemote(null, repos)).toBeNull()
    expect(sourceRemote('github', repos)).toBeNull()
  })
})

describe('classifyThread', () => {
  it('sends a thread whose first comment is a system comment to Activity (FPRA-13)', () => {
    expect(
      classifyThread(thread({ comments: [comment({ commentType: 'system', content: 'Pushed' })] }))
    ).toEqual({ kind: 'system' })
  })

  it('sends a thread carrying a CodeReviewThreadType property to Activity (FPRA-13)', () => {
    expect(
      classifyThread(
        thread({
          properties: { CodeReviewThreadType: { $type: 'System.String', $value: 'VoteUpdate' } }
        })
      )
    ).toEqual({ kind: 'system' })
  })

  it('lists a thread with no file context as general (FPRA-11)', () => {
    expect(classifyThread(thread())).toEqual({ kind: 'general' })
  })

  // [owner 2026-10-10] A thread on a file with no line stays general, but
  // keeps the file's path so the Overview can name the file and open it.
  it('lists a thread on a file with no line as general, with the file path (FPRA-11)', () => {
    expect(classifyThread(thread({ threadContext: { filePath: '/src/app.ts' } }))).toEqual({
      kind: 'general',
      path: 'src/app.ts'
    })
  })

  it('places a right-anchored thread on the right, a left-only one on the left (FPRA-18)', () => {
    expect(classifyThread(thread({ threadContext: onRight([3, 34], [4, 39]) }))).toEqual({
      kind: 'placed',
      path: 'src/app.ts',
      side: 'right',
      startLine: 3,
      endLine: 4
    })
    expect(
      classifyThread(
        thread({
          threadContext: {
            filePath: '/src/app.ts',
            leftFileStart: { line: 8, offset: 1 },
            leftFileEnd: { line: 8, offset: 12 }
          }
        })
      )
    ).toEqual({ kind: 'placed', path: 'src/app.ts', side: 'left', startLine: 8, endLine: 8 })
  })

  // S3: a thread whose line was deleted comes back tracked, at an empty range.
  it('lists a tracked thread whose lines were deleted as outdated (FPRA-19)', () => {
    expect(
      classifyThread(
        thread({
          threadContext: onRight([2, 1], [2, 1]),
          pullRequestThreadContext: {
            trackingCriteria: {
              origRightFileStart: { line: 2, offset: 5 },
              origRightFileEnd: { line: 2, offset: 18 }
            }
          }
        })
      )
    ).toEqual({ kind: 'outdated', path: 'src/app.ts', line: 2 })
  })

  it('does not call a tracked thread outdated when its original range was empty too', () => {
    expect(
      classifyThread(
        thread({
          threadContext: onRight([6, 1], [6, 1]),
          pullRequestThreadContext: {
            trackingCriteria: {
              origRightFileStart: { line: 6, offset: 1 },
              origRightFileEnd: { line: 6, offset: 1 }
            }
          }
        })
      )
    ).toEqual({ kind: 'placed', path: 'src/app.ts', side: 'right', startLine: 6, endLine: 6 })
  })

  // S3: an untracked thread is where it was created; a tracked one comes back
  // at its current position, widened to the whole line when the line changed.
  it('places an untracked thread at its own position and a tracked one at its current position', () => {
    expect(classifyThread(thread({ threadContext: onRight([3, 10], [3, 20]) }))).toEqual({
      kind: 'placed',
      path: 'src/app.ts',
      side: 'right',
      startLine: 3,
      endLine: 3
    })
    expect(
      classifyThread(
        thread({
          threadContext: onRight([5, 1], [5, END_OF_LINE]),
          pullRequestThreadContext: {
            trackingCriteria: {
              origRightFileStart: { line: 3, offset: 10 },
              origRightFileEnd: { line: 3, offset: 20 }
            }
          }
        })
      )
    ).toEqual({ kind: 'placed', path: 'src/app.ts', side: 'right', startLine: 5, endLine: 5 })
  })

  // S9: deleting every comment marks the thread deleted; either signal is enough.
  it('drops a deleted thread, and a thread whose every comment is deleted', () => {
    expect(
      classifyThread(thread({ isDeleted: true, threadContext: onRight([3, 1], [3, 5]) }))
    ).toEqual({ kind: 'deleted' })
    expect(
      classifyThread(
        thread({
          threadContext: onRight([3, 1], [3, 5]),
          comments: [
            comment({ id: 1, isDeleted: true, content: undefined }),
            comment({ id: 2, isDeleted: true, content: undefined })
          ]
        })
      )
    ).toEqual({ kind: 'deleted' })
  })

  // Only every comment deleted drops the thread: one deleted reply leaves it in place.
  it('keeps a thread with one deleted reply among live comments', () => {
    expect(
      classifyThread(
        thread({
          threadContext: onRight([3, 1], [3, 5]),
          comments: [
            comment({ id: 1 }),
            comment({ id: 2, parentCommentId: 1, isDeleted: true, content: undefined })
          ]
        })
      )
    ).toEqual({ kind: 'placed', path: 'src/app.ts', side: 'right', startLine: 3, endLine: 3 })
  })
})

describe('visibleComments (FPRA-21)', () => {
  // S9: a deleted comment comes back flagged and without content.
  it('drops deleted comments and keeps the others with author, text and date', () => {
    expect(
      visibleComments(
        thread({
          comments: [
            comment({ id: 1, content: 'Why `List<string>` here?' }),
            comment({ id: 2, isDeleted: true, content: undefined }),
            comment({
              id: 3,
              author: { displayName: 'Sam Widget' },
              content: 'Fixed in the next push.',
              publishedDate: '2026-10-02T08:30:00Z'
            })
          ]
        })
      )
    ).toEqual([
      {
        id: 1,
        author: 'Alex Contoso',
        content: 'Why `List<string>` here?',
        at: Date.parse('2026-10-01T12:00:00Z')
      },
      {
        id: 3,
        author: 'Sam Widget',
        content: 'Fixed in the next push.',
        at: Date.parse('2026-10-02T08:30:00Z')
      }
    ])
  })
})

// [owner 2026-10-10] A reply answers the thread's root, which deleted comments
// must not hide: `comments[0]` of the visible ones can be a reply.
describe('rootCommentId (FPRA-25)', () => {
  it('is the comment with no parent, even when it was deleted', () => {
    expect(
      rootCommentId(
        thread({
          comments: [
            comment({ id: 4, parentCommentId: 0, isDeleted: true, content: undefined }),
            comment({ id: 5, parentCommentId: 4 }),
            comment({ id: 6, parentCommentId: 4 })
          ]
        })
      )
    ).toBe(4)
  })

  it('is the lowest id when no comment names its parent', () => {
    expect(rootCommentId(thread({ comments: [comment({ id: 9 }), comment({ id: 7 })] }))).toBe(7)
  })
})

describe('anchorFromSelection (FPRA-27)', () => {
  it("copies the selection's lines and columns across as the anchor", () => {
    expect(
      anchorFromSelection({
        path: 'src/app.ts',
        startLine: 5,
        startColumn: 1,
        endLine: 6,
        endColumn: 13
      })
    ).toEqual({ path: 'src/app.ts', startLine: 5, startOffset: 1, endLine: 6, endOffset: 13 })
  })

  // S1: ADO counts characters, not bytes. After a two-byte `á` a word at
  // characters 34..38 stays 34 → 39; a byte count would shift it to 35 → 40.
  it('keeps character columns after a two-byte character', () => {
    const line = 'Olá! ' + 'x'.repeat(28) + 'probe ok'
    const startColumn = line.indexOf('probe') + 1
    const endColumn = startColumn + 'probe'.length
    expect([startColumn, endColumn]).toEqual([34, 39])

    const anchor = anchorFromSelection({
      path: 'probe.txt',
      startLine: 3,
      startColumn,
      endLine: 3,
      endColumn
    })

    expect([anchor.startOffset, anchor.endOffset]).toEqual([34, 39])
  })

  it('normalizes a selection made bottom-up across lines', () => {
    expect(
      anchorFromSelection({
        path: 'src/app.ts',
        startLine: 6,
        startColumn: 13,
        endLine: 5,
        endColumn: 1
      })
    ).toEqual({ path: 'src/app.ts', startLine: 5, startOffset: 1, endLine: 6, endOffset: 13 })
  })

  it('normalizes a selection made right to left on one line', () => {
    expect(
      anchorFromSelection({
        path: 'src/app.ts',
        startLine: 4,
        startColumn: 20,
        endLine: 4,
        endColumn: 3
      })
    ).toEqual({ path: 'src/app.ts', startLine: 4, startOffset: 3, endLine: 4, endOffset: 20 })
  })
})

describe('iterationContextFor (FPRA-27)', () => {
  // S2: threads made in ADO's whole-PR view compare the iteration on screen with itself.
  it('compares the latest iteration with itself', () => {
    expect(iterationContextFor(4)).toEqual({
      firstComparingIteration: 4,
      secondComparingIteration: 4
    })
  })
})
