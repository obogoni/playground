import { describe, expect, it } from 'vitest'
import { AdoGateway, fetchWithTimeout, parseChildRefs } from './ado-gateway'

/**
 * Seed the private token cache so the real `getToken` short-circuits on it and
 * never spawns `az` — the deterministic seam for exercising the REST path with
 * an injected fake `fetch` (mirrors the token-cache hit in `getToken`).
 */
function seedToken(gw: AdoGateway): void {
  ;(gw as unknown as { cached: { token: string; expiresAt: number } }).cached = {
    token: 'test-token',
    expiresAt: Date.now() + 60 * 60_000
  }
}

describe('fetchWithTimeout', () => {
  it('rejects when the request outlives the timeout (ADTO-01/02)', async () => {
    // A fetch that never settles on its own but honors abort — models a hung
    // connection. Without the timeout this promise would stay pending forever.
    const hanging: typeof fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted: ' + init.signal?.reason))
        )
      })
    await expect(fetchWithTimeout(hanging, 'http://x', {}, 10)).rejects.toThrow()
  })

  it('resolves and forwards the response when fetch completes in time (ADTO-03)', async () => {
    const fast: typeof fetch = async () => new Response('ok')
    const res = await fetchWithTimeout(fast, 'http://x', {}, 1000)
    expect(await res.text()).toBe('ok')
  })

  it('passes an abort signal through to fetch and preserves the init', async () => {
    let seenSignal: AbortSignal | null = null
    let seenAuth: string | undefined
    const spy: typeof fetch = async (_url, init) => {
      seenSignal = init?.signal ?? null
      seenAuth = new Headers(init?.headers).get('Authorization') ?? undefined
      return new Response('')
    }
    await fetchWithTimeout(spy, 'http://x', { headers: { Authorization: 'Bearer t' } }, 1000)
    expect(seenSignal).toBeInstanceOf(AbortSignal)
    expect(seenAuth).toBe('Bearer t')
  })

  it('gives each call an independent signal', async () => {
    const signals: (AbortSignal | null)[] = []
    const spy: typeof fetch = async (_url, init) => {
      signals.push(init?.signal ?? null)
      return new Response('')
    }
    await fetchWithTimeout(spy, 'http://a', {}, 1000)
    await fetchWithTimeout(spy, 'http://b', {}, 1000)
    expect(signals[0]).not.toBe(signals[1])
  })
})

describe('AdoGateway.getWorkItemWithRelations', () => {
  it('returns Hierarchy-Forward children as child refs in the same org/project (WF2-08)', async () => {
    const gw = new AdoGateway()
    seedToken(gw)
    let seenUrl = ''
    const fakeFetch: typeof fetch = async (url) => {
      seenUrl = String(url)
      return new Response(
        JSON.stringify({
          id: 42,
          fields: {
            'System.Title': 'Parent story',
            'System.WorkItemType': 'User Story',
            'System.State': 'Active'
          },
          relations: [
            {
              rel: 'System.LinkTypes.Hierarchy-Forward',
              url: 'https://dev.azure.com/o/p/_apis/wit/workItems/101'
            },
            {
              rel: 'System.LinkTypes.Hierarchy-Reverse',
              url: 'https://dev.azure.com/o/p/_apis/wit/workItems/7'
            },
            {
              rel: 'System.LinkTypes.Hierarchy-Forward',
              url: 'https://dev.azure.com/o/p/_apis/wit/workItems/102'
            }
          ]
        })
      )
    }
    const result = await gw.getWorkItemWithRelations({ id: 42, org: 'o', project: 'p' }, fakeFetch)
    expect(result).toEqual({
      ok: true,
      item: { title: 'Parent story', type: 'User Story', state: 'Active' },
      childRefs: [
        { id: 101, org: 'o', project: 'p' },
        { id: 102, org: 'o', project: 'p' }
      ]
    })
    // $expand=Relations added, api-version=7.1 retained, fields omitted (ADO
    // couples fields/$expand mutually exclusively).
    expect(seenUrl).toContain('$expand=Relations')
    expect(seenUrl).toContain('api-version=7.1')
    expect(seenUrl).not.toContain('fields=')
  })

  it('returns [] childRefs when the item has no relations', async () => {
    const gw = new AdoGateway()
    seedToken(gw)
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ id: 42, fields: { 'System.Title': 'Solo' } }))
    const result = await gw.getWorkItemWithRelations({ id: 42, org: 'o', project: 'p' }, fakeFetch)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.childRefs).toEqual([])
  })

  it('clears the cached token and returns auth failure on HTTP 401 (mirrors getWorkItems)', async () => {
    const gw = new AdoGateway()
    seedToken(gw)
    const fakeFetch: typeof fetch = async () => new Response('', { status: 401 })
    const result = await gw.getWorkItemWithRelations({ id: 42, org: 'o', project: 'p' }, fakeFetch)
    expect(result).toEqual({ ok: false, reason: 'auth', error: expect.stringContaining('401') })
    expect((gw as unknown as { cached: unknown }).cached).toBeNull()
  })
})

describe('parseChildRefs', () => {
  it('maps only Hierarchy-Forward relations to child refs — tail id, parent org/project', () => {
    const children = parseChildRefs(
      [
        {
          rel: 'System.LinkTypes.Hierarchy-Forward',
          url: 'https://dev.azure.com/o/p/_apis/wit/workItems/5'
        },
        {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: 'https://dev.azure.com/o/p/_apis/wit/workItems/1'
        },
        {
          rel: 'System.LinkTypes.Related',
          url: 'https://dev.azure.com/o/p/_apis/wit/workItems/9'
        },
        {
          rel: 'System.LinkTypes.Hierarchy-Forward',
          url: 'https://dev.azure.com/o/p/_apis/wit/workItems/6'
        }
      ],
      { id: 2, org: 'acme', project: 'web' }
    )
    // Only forward links; id is the url tail; org/project come from the parent.
    expect(children).toEqual([
      { id: 5, org: 'acme', project: 'web' },
      { id: 6, org: 'acme', project: 'web' }
    ])
  })

  it('returns [] for undefined relations', () => {
    expect(parseChildRefs(undefined, { id: 1, org: 'o', project: 'p' })).toEqual([])
  })
})
