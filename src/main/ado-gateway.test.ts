import { describe, expect, it } from 'vitest'
import { fetchWithTimeout } from './ado-gateway'

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
