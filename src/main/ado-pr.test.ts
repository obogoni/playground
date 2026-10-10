import { afterEach, describe, expect, it } from 'vitest'
import type { PrRef } from '../shared/files'
import { AdoPrClient, openPrLink } from './ado-pr'
import type { GitRunner } from './git'

// Every name here is fictitious: this repository is public and the spec's
// privacy guardrail forbids a real organisation, project, repository or person.

const UPSTREAM = 'https://dev.azure.com/acme/platform/_git/widget'
const FORK = 'https://dev.azure.com/acme/platform/_git/widget-fork'
const PR: PrRef = { target: { org: 'acme', project: 'platform', repo: 'widget' }, id: 42 }

interface Sent {
  method: string
  url: URL
}

type Route = (url: URL) => Response | Promise<Response>

/**
 * A stand-in for Azure DevOps: answers by the request's path and records
 * every request, so a test can say what was asked for — and what was not.
 */
function fakeAdo(route: Route): { fetchFn: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    sent.push({ method: init?.method ?? 'GET', url })
    return route(url)
  }
  return { fetchFn, sent }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A repository as git would answer for it: its branch, remotes and the branch's tracked remote. */
function fakeGit(repo: {
  branch: string
  remotes: Record<string, string>
  upstream?: string
}): GitRunner {
  return async (_cwd, args) => {
    const command = args.join(' ')
    if (command === 'rev-parse --abbrev-ref HEAD') return { stdout: `${repo.branch}\n` }
    if (command === 'remote -v') {
      const lines = Object.entries(repo.remotes).flatMap(([name, url]) => [
        `${name}\t${url} (fetch)`,
        `${name}\t${url} (push)`
      ])
      return { stdout: lines.join('\n') + '\n' }
    }
    if (command === `config --get branch.${repo.branch}.remote`) {
      if (repo.upstream === undefined) throw new Error('exit 1')
      return { stdout: `${repo.upstream}\n` }
    }
    throw new Error(`unexpected git ${command}`)
  }
}

const token = async (): Promise<{ ok: true; token: string }> => ({ ok: true, token: 'test-token' })

/** Every request any read test sent, checked after each one: reads never write (FPRA-32). */
let readRequests: Sent[] = []
function client(route: Route, git?: GitRunner): AdoPrClient {
  const ado = fakeAdo(route)
  readRequests = ado.sent
  return new AdoPrClient({ getToken: token, fetchFn: ado.fetchFn, run: git })
}

afterEach(() => {
  expect(readRequests.filter((request) => request.method !== 'GET')).toEqual([])
  readRequests = []
})

function pullRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pullRequestId: 42,
    title: 'Fix login redirect',
    description: 'Short.',
    status: 'active',
    isDraft: false,
    createdBy: { displayName: 'Alex Contoso' },
    creationDate: '2026-10-01T12:00:00Z',
    sourceRefName: 'refs/heads/feature/login',
    targetRefName: 'refs/heads/main',
    reviewers: [],
    ...overrides
  }
}

const iterations = {
  value: [
    { id: 1, sourceRefCommit: { commitId: 'aaa1' }, commonRefCommit: { commitId: 'bbb1' } },
    { id: 3, sourceRefCommit: { commitId: 'aaa3' }, commonRefCommit: { commitId: 'bbb3' } },
    { id: 2, sourceRefCommit: { commitId: 'aaa2' }, commonRefCommit: { commitId: 'bbb2' } }
  ]
}

describe('AdoPrClient.findPrs (FPRA-02..08)', () => {
  it('searches every azure devops remote for active PRs from the branch in its source repository', async () => {
    // The fork flow: the branch is pushed to the fork, and its PR targets the upstream.
    const ado = client(
      (url) => {
        if (url.pathname.endsWith('/repositories/widget-fork')) return json({ id: 'fork-id' })
        if (url.pathname.endsWith('/repositories/widget/pullrequests')) {
          return json({ value: [pullRequest({ isDraft: true })] })
        }
        if (url.pathname.endsWith('/repositories/widget-fork/pullrequests')) {
          return json({
            value: [
              pullRequest({ pullRequestId: 7, title: 'Try it', targetRefName: 'refs/heads/dev' })
            ]
          })
        }
        return json({}, 500)
      },
      fakeGit({
        branch: 'feature/login',
        remotes: { origin: 'https://github.com/acme/widget.git', upstream: UPSTREAM, fork: FORK },
        upstream: 'fork'
      })
    )

    const result = await ado.findPrs('/repo')

    const searches = readRequests.filter((r) => r.url.pathname.endsWith('/pullrequests'))
    expect(searches.map((r) => r.url.pathname)).toEqual([
      '/acme/platform/_apis/git/repositories/widget/pullrequests',
      '/acme/platform/_apis/git/repositories/widget-fork/pullrequests'
    ])
    for (const search of searches) {
      expect(search.url.searchParams.get('searchCriteria.sourceRefName')).toBe(
        'refs/heads/feature/login'
      )
      expect(search.url.searchParams.get('searchCriteria.sourceRepositoryId')).toBe('fork-id')
      expect(search.url.searchParams.get('searchCriteria.status')).toBe('active')
    }
    expect(result).toEqual({
      kind: 'found',
      prs: [
        {
          provider: 'azure-devops',
          target: { org: 'acme', project: 'platform', repo: 'widget' },
          id: 42,
          title: 'Fix login redirect',
          targetBranch: 'main',
          isDraft: true
        },
        {
          provider: 'azure-devops',
          target: { org: 'acme', project: 'platform', repo: 'widget-fork' },
          id: 7,
          title: 'Try it',
          targetBranch: 'dev',
          isDraft: false
        }
      ]
    })
  })

  it('says there is no pull request, offering to create one, when the search finds none', async () => {
    const ado = client(
      (url) =>
        url.pathname.endsWith('/pullrequests') ? json({ value: [] }) : json({ id: 'widget-id' }),
      fakeGit({ branch: 'feature/login', remotes: { origin: UPSTREAM }, upstream: 'origin' })
    )

    expect(await ado.findPrs('/repo')).toEqual({ kind: 'none', createUrlAvailable: true })
  })

  it('says there is no azure devops remote instead of searching', async () => {
    const ado = client(
      () => json({}, 500),
      fakeGit({
        branch: 'feature/login',
        remotes: { origin: 'https://github.com/acme/widget.git' },
        upstream: 'origin'
      })
    )

    expect(await ado.findPrs('/repo')).toEqual({ kind: 'no-ado-remote' })
    expect(readRequests).toEqual([])
  })

  it('says there is no branch to look up when HEAD is detached', async () => {
    const ado = client(
      () => json({}, 500),
      fakeGit({ branch: 'HEAD', remotes: { origin: UPSTREAM } })
    )

    expect(await ado.findPrs('/repo')).toEqual({ kind: 'detached' })
    expect(readRequests).toEqual([])
  })

  it('yields the az login result without a token and an error on a timeout, never throwing', async () => {
    const git = fakeGit({
      branch: 'feature/login',
      remotes: { origin: UPSTREAM },
      upstream: 'origin'
    })
    const ado = fakeAdo(() => json({ id: 'widget-id' }))
    readRequests = ado.sent
    const noToken = new AdoPrClient({
      getToken: async () => ({ ok: false, error: 'Please run az login' }),
      fetchFn: ado.fetchFn,
      run: git
    })

    expect(await noToken.findPrs('/repo')).toEqual({ kind: 'auth' })
    expect(await noToken.getPr(PR)).toEqual({ kind: 'auth' })
    expect(ado.sent).toEqual([])

    // What `fetchWithTimeout` rejects with once its signal aborts.
    const timedOut = new AdoPrClient({
      getToken: token,
      fetchFn: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      },
      run: git
    })

    expect(await timedOut.findPrs('/repo')).toEqual({
      kind: 'error',
      message: 'The operation was aborted due to timeout'
    })
    expect(await timedOut.getPr(PR)).toEqual({
      kind: 'error',
      message: 'The operation was aborted due to timeout'
    })
    const sides = await timedOut.fileSides(PR, 'src/app.ts')
    expect(sides.original).toEqual({
      kind: 'error',
      message: 'The operation was aborted due to timeout'
    })
  })
})

describe('AdoPrClient.getPr (FPRA-09/10)', () => {
  it('reads the overview from the single-PR call, so a long description arrives whole', async () => {
    const description = 'd'.repeat(1000)
    const ado = client((url) => {
      const path = url.pathname
      if (path.endsWith('/pullrequests/42')) {
        return json(
          pullRequest({
            description,
            isDraft: true,
            reviewers: [
              { displayName: 'Robin Widget', vote: 10, isRequired: true },
              { displayName: '[platform]\\Reviewers', vote: -5, isContainer: true }
            ]
          })
        )
      }
      if (path.endsWith('/iterations')) return json(iterations)
      if (path.endsWith('/changes')) {
        return json({
          changeEntries: [
            { changeTrackingId: 1, changeType: 'edit', item: { path: '/src/app.ts' } }
          ]
        })
      }
      if (path.endsWith('/threads')) return json({ value: [] })
      return json({}, 500)
    })

    const result = await ado.getPr(PR)

    expect(readRequests.some((r) => r.url.pathname.endsWith('/pullrequests'))).toBe(false)
    expect(result).toEqual({
      kind: 'ok',
      detail: {
        provider: 'azure-devops',
        target: PR.target,
        id: 42,
        title: 'Fix login redirect',
        targetBranch: 'main',
        isDraft: true,
        status: 'active',
        author: 'Alex Contoso',
        description,
        createdAt: Date.parse('2026-10-01T12:00:00Z'),
        sourceBranch: 'feature/login',
        reviewers: [
          { name: 'Robin Widget', state: 'approved', isGroup: false, isRequired: true },
          {
            name: '[platform]\\Reviewers',
            state: 'waiting-for-author',
            isGroup: true,
            isRequired: false
          }
        ],
        iteration: 3,
        files: [{ path: 'src/app.ts', status: 'modified', changeTrackingId: 1 }],
        threads: []
      }
    })
  })
})

describe('AdoPrClient.changedFiles (FPRA-15; T1, S7)', () => {
  it('follows nextSkip / nextTop to the last page, which names neither', async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({
      changeTrackingId: i + 1,
      changeType: 'edit',
      item: { path: `/src/file-${i}.ts` }
    }))
    // Azure DevOps returns 100 entries a page whatever `$top` asks for.
    const ado = client((url) => {
      const skip = Number(url.searchParams.get('$skip') ?? 0)
      const page = all.slice(skip, skip + 100)
      const more = skip + 100 < all.length
      return json(
        more ? { changeEntries: page, nextSkip: skip + 100, nextTop: 100 } : { changeEntries: page }
      )
    })

    const result = await ado.changedFiles(PR, 3)

    expect(result.kind === 'ok' && result.value.map((f) => f.path)).toEqual(
      all.map((entry) => entry.item.path.slice(1))
    )
    expect(readRequests.map((r) => r.url.searchParams.get('$skip'))).toEqual([null, '100', '200'])
    expect(readRequests[0].url.pathname).toBe(
      '/acme/platform/_apis/git/repositories/widget/pullRequests/42/iterations/3/changes'
    )
    expect(readRequests[0].url.searchParams.get('$compareTo')).toBe('0')

    // A last page may also say so with zeros rather than by leaving the fields out.
    const zeros = fakeAdo((url) =>
      url.searchParams.get('$skip') === null
        ? json({ changeEntries: all.slice(0, 100), nextSkip: 100, nextTop: 100 })
        : json({ changeEntries: all.slice(100, 150), nextSkip: 0, nextTop: 0 })
    )
    const ended = await new AdoPrClient({ getToken: token, fetchFn: zeros.fetchFn }).changedFiles(
      PR,
      3
    )
    expect(ended.kind === 'ok' && ended.value.length).toBe(150)
    expect(zeros.sent).toHaveLength(2)
  })
})

describe('AdoPrClient.threads (FPRA-11, 13, 18, 19, 20)', () => {
  it('reads positions for the latest iteration against the merge base and maps each thread', async () => {
    const ado = client(() =>
      json({
        value: [
          {
            id: 1,
            status: 'active',
            comments: [
              {
                id: 1,
                author: { displayName: 'Robin Widget' },
                content: 'Rename this?',
                publishedDate: '2026-10-02T09:00:00Z',
                commentType: 'text'
              }
            ],
            threadContext: {
              filePath: '/src/app.ts',
              rightFileStart: { line: 4, offset: 1 },
              rightFileEnd: { line: 5, offset: 3 }
            }
          },
          {
            id: 2,
            status: 'fixed',
            comments: [
              {
                id: 1,
                author: { displayName: 'Robin Widget' },
                content: 'Done.',
                publishedDate: '2026-10-02T10:00:00Z',
                commentType: 'text'
              }
            ]
          }
        ]
      })
    )

    const result = await ado.threads(PR, 3)

    const sent = readRequests[0].url
    expect(sent.pathname).toBe(
      '/acme/platform/_apis/git/repositories/widget/pullRequests/42/threads'
    )
    expect(sent.searchParams.get('$iteration')).toBe('3')
    expect(sent.searchParams.get('$baseIteration')).toBe('0')
    expect(result).toEqual({
      kind: 'ok',
      value: [
        {
          id: 1,
          rootCommentId: 1,
          resolution: 'active',
          providerStatus: 'active',
          comments: [
            {
              id: 1,
              author: 'Robin Widget',
              content: 'Rename this?',
              at: Date.parse('2026-10-02T09:00:00Z')
            }
          ],
          place: { kind: 'placed', path: 'src/app.ts', side: 'right', startLine: 4, endLine: 5 }
        },
        {
          id: 2,
          rootCommentId: 1,
          resolution: 'resolved',
          providerStatus: 'fixed',
          comments: [
            {
              id: 1,
              author: 'Robin Widget',
              content: 'Done.',
              at: Date.parse('2026-10-02T10:00:00Z')
            }
          ],
          place: { kind: 'general' }
        }
      ]
    })
  })
})

describe('AdoPrClient.fileSide / fileSides (FPRA-16/17; T1, S6)', () => {
  /** An item and its blob, by commit: what the metadata, size and content calls return. */
  function files(
    byCommit: Record<string, { size: number; isBinary?: boolean; text?: string }>
  ): Route {
    return (url) => {
      if (url.pathname.endsWith('/items')) {
        const commit = url.searchParams.get('versionDescriptor.version') ?? ''
        const file = byCommit[commit]
        if (!file) return json({ message: 'TF401174: The item could not be found.' }, 404)
        // Without `$format=json` Azure DevOps answers with the file's own text,
        // metadata flags or not (T27 found it; measured live).
        if (url.searchParams.get('$format') !== 'json') return new Response(file.text ?? '')
        return json({
          objectId: `blob-${commit}`,
          contentMetadata: file.isBinary ? { isBinary: true } : { encoding: 65001 }
        })
      }
      const blob = /\/blobs\/blob-(.+)$/.exec(url.pathname)
      const file = blob ? byCommit[blob[1]] : undefined
      if (!file) return json({}, 500)
      if (url.searchParams.get('$format') === 'json') return json({ size: file.size })
      return new Response(file.text ?? '')
    }
  }

  it('reads the blob size before the content, and never the content of a large or binary blob', async () => {
    const ado = client(
      files({
        small: { size: 12, text: 'const a = 1\n' },
        large: { size: 1024 * 1024 + 1, text: 'x' },
        image: { size: 10, isBinary: true, text: '\u0000PNG' }
      })
    )

    expect(await ado.fileSide(PR, 'src/app.ts', 'small')).toEqual({
      kind: 'text',
      text: 'const a = 1\n',
      size: 12
    })
    expect(
      readRequests.map((r) => [r.url.pathname.split('/').pop(), r.url.searchParams.get('$format')])
    ).toEqual([
      ['items', 'json'],
      ['blob-small', 'json'],
      ['blob-small', 'text']
    ])
    const item = readRequests[0].url.searchParams
    expect(item.get('path')).toBe('/src/app.ts')
    expect(item.get('versionDescriptor.versionType')).toBe('commit')
    expect(item.get('includeContentMetadata')).toBe('true')

    expect(await ado.fileSide(PR, 'src/app.ts', 'large')).toEqual({
      kind: 'too-large',
      size: 1024 * 1024 + 1
    })
    expect(await ado.fileSide(PR, 'logo.png', 'image')).toEqual({ kind: 'binary', size: 10 })
    const contentReads = readRequests.filter((r) => r.url.searchParams.get('$format') === 'text')
    expect(contentReads.map((r) => r.url.pathname.split('/').pop())).toEqual(['blob-small'])
  })

  it('reads the original at the merge base and the modified at the source, an added file original as absent', async () => {
    const ado = client((url) => {
      if (url.pathname.endsWith('/iterations')) return json(iterations)
      return files({ aaa3: { size: 4, text: 'new\n' } })(url)
    })

    expect(await ado.fileSides(PR, 'src/new.ts')).toEqual({
      original: { kind: 'absent' },
      modified: { kind: 'text', text: 'new\n', size: 4 },
      eolChanged: []
    })
    const items = readRequests.filter((r) => r.url.pathname.endsWith('/items'))
    expect(items.map((r) => r.url.searchParams.get('versionDescriptor.version'))).toEqual([
      'bbb3',
      'aaa3'
    ])
  })
})

describe('AdoPrClient writes (FPRA-25/26/27/29/31/32)', () => {
  interface Written {
    method: string
    url: string
    body: unknown
  }

  /** A stand-in that records each write's method, URL and parsed body. */
  function writer(answer: () => Response = () => json({ id: 1 })): {
    ado: AdoPrClient
    written: Written[]
  } {
    const written: Written[] = []
    const fetchFn: typeof fetch = async (input, init) => {
      written.push({
        method: init?.method ?? 'GET',
        url: String(input),
        body: JSON.parse(String(init?.body))
      })
      return answer()
    }
    return { ado: new AdoPrClient({ getToken: token, fetchFn }), written }
  }

  const THREADS = `https://dev.azure.com/acme/platform/_apis/git/repositories/widget/pullRequests/42/threads`
  const MARKDOWN = {
    'Microsoft.TeamFoundation.Discussion.SupportsMarkdown': { type: 'System.Int32', value: 1 }
  }

  it('posts a reply under the thread root comment', async () => {
    const { ado, written } = writer()

    expect(await ado.reply(PR, 9, 1, 'Renamed it.')).toEqual({ ok: true })
    expect(written).toEqual([
      {
        method: 'POST',
        url: `${THREADS}/9/comments?api-version=7.1`,
        body: { content: 'Renamed it.', parentCommentId: 1, commentType: 1 }
      }
    ])
  })

  it('patches a thread status, Active included, which reopens it', async () => {
    const { ado, written } = writer()

    expect(await ado.setStatus(PR, 9, 'fixed')).toEqual({ ok: true })
    expect(await ado.setStatus(PR, 9, 'active')).toEqual({ ok: true })
    expect(written).toEqual([
      { method: 'PATCH', url: `${THREADS}/9?api-version=7.1`, body: { status: 2 } },
      { method: 'PATCH', url: `${THREADS}/9?api-version=7.1`, body: { status: 1 } }
    ])
  })

  it('creates a thread anchored to the selection, its file and the iteration on screen', async () => {
    const { ado, written } = writer()

    const result = await ado.createThread({
      pr: PR,
      iteration: 4,
      changeTrackingId: 3,
      selection: { path: 'src/app.ts', startLine: 5, startColumn: 1, endLine: 6, endColumn: 13 },
      content: 'Could this be a constant?'
    })

    expect(result).toEqual({ ok: true })
    expect(written).toEqual([
      {
        method: 'POST',
        url: `${THREADS}?api-version=7.1`,
        body: {
          comments: [{ parentCommentId: 0, content: 'Could this be a constant?', commentType: 1 }],
          status: 1,
          threadContext: {
            filePath: '/src/app.ts',
            rightFileStart: { line: 5, offset: 1 },
            rightFileEnd: { line: 6, offset: 13 }
          },
          pullRequestThreadContext: {
            changeTrackingId: 3,
            iterationContext: { firstComparingIteration: 4, secondComparingIteration: 4 }
          },
          properties: MARKDOWN
        }
      }
    ])
  })

  it('posts a general comment as a thread with no file context', async () => {
    const { ado, written } = writer()

    expect(await ado.generalComment(PR, 'Looks good overall.')).toEqual({ ok: true })
    expect(written).toEqual([
      {
        method: 'POST',
        url: `${THREADS}?api-version=7.1`,
        body: {
          comments: [{ parentCommentId: 0, content: 'Looks good overall.', commentType: 1 }],
          status: 1,
          properties: MARKDOWN
        }
      }
    ])
  })

  it("returns azure devops' own message when it refuses a write", async () => {
    const forbidden = writer(() =>
      json({ message: 'TF401027: You need the Git Contribute permission.' }, 403)
    )
    const unauthorized = writer(() => new Response('', { status: 401 }))
    const offline = new AdoPrClient({
      getToken: token,
      fetchFn: async () => {
        throw new TypeError('fetch failed')
      }
    })

    expect(await forbidden.ado.reply(PR, 9, 1, 'x')).toEqual({
      ok: false,
      message: 'TF401027: You need the Git Contribute permission.'
    })
    expect(await unauthorized.ado.generalComment(PR, 'x')).toEqual({
      ok: false,
      message: 'Azure DevOps request failed (HTTP 401)'
    })
    expect(await offline.setStatus(PR, 9, 'closed')).toEqual({ ok: false, message: 'fetch failed' })
  })

  it('sends nothing until a write is called, then exactly one request per write', async () => {
    const { ado, written } = writer()
    expect(written).toHaveLength(0)

    await ado.reply(PR, 9, 1, 'a')
    expect(written).toHaveLength(1)
    await ado.setStatus(PR, 9, 'wontFix')
    expect(written).toHaveLength(2)
    await ado.createThread({
      pr: PR,
      iteration: 1,
      changeTrackingId: 1,
      selection: { path: 'a.ts', startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
      content: 'b'
    })
    expect(written).toHaveLength(3)
    await ado.generalComment(PR, 'c')
    expect(written.map((w) => w.method)).toEqual(['POST', 'PATCH', 'POST', 'POST'])
  })
})

describe('opening pull request pages and links (FPRA-05/14/23)', () => {
  it('opens a markdown link only when it is https, and refuses anything else unopened', async () => {
    const opened: string[] = []
    const open = async (url: string): Promise<void> => {
      opened.push(url)
    }

    expect(await openPrLink('https://example.com/guide', open)).toEqual({ ok: true })
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'http://example.com/',
      'file:///C:/x',
      '/relative'
    ]) {
      expect((await openPrLink(href, open)).ok).toBe(false)
    }
    expect(opened).toEqual(['https://example.com/guide'])
  })

  it('builds the pull request page, and the create page from the repository the branch is pushed to', async () => {
    const opened: string[] = []
    const open = async (url: string): Promise<void> => {
      opened.push(url)
    }
    const pushed = client(
      () => json({}, 500),
      fakeGit({
        branch: 'feature/login',
        remotes: { upstream: UPSTREAM, fork: FORK },
        upstream: 'fork'
      })
    )
    const unpushed = client(
      () => json({}, 500),
      fakeGit({ branch: 'feature/login', remotes: { upstream: UPSTREAM } })
    )

    expect(await pushed.openPage('/repo', { pr: PR }, open)).toEqual({ ok: true })
    expect(await pushed.openPage('/repo', { create: true }, open)).toEqual({ ok: true })
    expect((await unpushed.openPage('/repo', { create: true }, open)).ok).toBe(false)
    expect(opened).toEqual([
      'https://dev.azure.com/acme/platform/_git/widget/pullrequest/42',
      'https://dev.azure.com/acme/platform/_git/widget-fork/pullrequestcreate?sourceRef=feature%2Flogin'
    ])
    expect(readRequests).toEqual([])
  })
})
