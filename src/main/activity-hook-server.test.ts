import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createActivityHookServer, type ActivityHookServer } from './activity-hook-server'

/** Payload shape from the Claude Code hooks reference. */
const STOP_EVENT = {
  session_id: 'abc123',
  hook_event_name: 'Stop',
  last_assistant_message: 'done'
}

describe('ActivityHookServer', () => {
  let server: ActivityHookServer
  let url: string
  let received: { sessionId: string; payload: Record<string, unknown> }[]

  beforeEach(async () => {
    received = []
    server = createActivityHookServer()
    server.onEvent((sessionId, payload) => received.push({ sessionId, payload }))
    url = (await server.start()).url
    server.register('token-1', 'session-1')
  })

  afterEach(async () => {
    await server.stop()
  })

  const post = async (
    body: string,
    token?: string,
    method = 'POST'
  ): Promise<{ status: number; body: string }> => {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      ...(method === 'POST' ? { body } : {})
    })
    return { status: res.status, body: await res.text() }
  }

  it('binds loopback only', async () => {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hooks$/)
  })

  it('routes a registered token to its session and answers 2xx with no body (ACTV-10)', async () => {
    const res = await post(JSON.stringify(STOP_EVENT), 'token-1')

    expect(res.status).toBe(204)
    expect(res.body).toBe('')
    expect(received).toEqual([{ sessionId: 'session-1', payload: STOP_EVENT }])
  })

  it('rejects a request with no token and dispatches nothing (ACTV-04)', async () => {
    const res = await post(JSON.stringify(STOP_EVENT))

    expect(res.status).toBe(401)
    expect(received).toEqual([])
  })

  it('rejects a token of no live session (ACTV-04)', async () => {
    const res = await post(JSON.stringify(STOP_EVENT), 'token-of-nobody')

    expect(res.status).toBe(401)
    expect(received).toEqual([])
  })

  it('rejects a revoked token, which is the late POST after a session stopped (ACTV-32)', async () => {
    server.revoke('token-1')

    const res = await post(JSON.stringify(STOP_EVENT), 'token-1')

    expect(res.status).toBe(401)
    expect(received).toEqual([])
  })

  it('accepts but ignores a body that is not JSON', async () => {
    const res = await post('not json at all', 'token-1')

    expect(res.status).toBe(204)
    expect(received).toEqual([])
  })

  it.each([
    ['an array', '[1,2,3]'],
    ['a bare string', '"Stop"'],
    ['null', 'null']
  ])('accepts but ignores %s, which is not an event object', async (_label, body) => {
    const res = await post(body, 'token-1')

    expect(res.status).toBe(204)
    expect(received).toEqual([])
  })

  it('accepts but ignores a body past the size cap', async () => {
    const huge = JSON.stringify({ ...STOP_EVENT, tool_response: 'x'.repeat(9_000_000) })

    const res = await post(huge, 'token-1')

    expect(res.status).toBe(204)
    expect(received).toEqual([])
  })

  it('never answers with a body on any path it can produce (ACTV-10)', async () => {
    const responses = [
      await post(JSON.stringify(STOP_EVENT), 'token-1'),
      await post(JSON.stringify(STOP_EVENT)),
      await post(JSON.stringify(STOP_EVENT), 'token-of-nobody'),
      await post('not json', 'token-1'),
      await post('', 'token-1', 'GET')
    ]

    for (const res of responses) {
      expect(res.body).toBe('')
      expect(res.status).toBeGreaterThanOrEqual(200)
    }
  })

  it('serves every registered session from one listener', async () => {
    server.register('token-2', 'session-2')

    await post(JSON.stringify(STOP_EVENT), 'token-1')
    await post(JSON.stringify(STOP_EVENT), 'token-2')

    expect(received.map((r) => r.sessionId)).toEqual(['session-1', 'session-2'])
  })

  it('stops listening when the app quits', async () => {
    await server.stop()

    await expect(post(JSON.stringify(STOP_EVENT), 'token-1')).rejects.toThrow()
  })
})
