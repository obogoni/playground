import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionTask } from '../shared/tasks'
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

describe('ActivityHookServer task link', () => {
  let server: ActivityHookServer
  let hooksUrl: string
  let taskUrl: string
  let links: { sessionId: string; task: SessionTask }[]
  let events: { sessionId: string; payload: Record<string, unknown> }[]

  beforeEach(async () => {
    links = []
    events = []
    server = createActivityHookServer()
    server.onEvent((sessionId, payload) => events.push({ sessionId, payload }))
    server.onTaskLink((sessionId, task) => links.push({ sessionId, task }))
    ;({ url: hooksUrl, taskUrl } = await server.start())
    server.register('token-1', 'session-1')
    server.register('token-2', 'session-2')
  })

  afterEach(async () => {
    await server.stop()
  })

  const send = async (
    body: string,
    opts: { token?: string; method?: string; to?: string } = {}
  ): Promise<{ status: number; body: string }> => {
    const method = opts.method ?? 'POST'
    const res = await fetch(opts.to ?? taskUrl, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {})
      },
      ...(method === 'POST' ? { body } : {})
    })
    return { status: res.status, body: await res.text() }
  }

  /** A body of exactly `bytes` bytes: JSON whitespace pads it without changing its value. */
  const paddedTo = (bytes: number): string => {
    const head = '{"id":12345,"title":"Example task"'
    return head + ' '.repeat(bytes - head.length - 1) + '}'
  }

  it('publishes the link url on the hooks listener (ATSK-01)', () => {
    const port = new URL(hooksUrl).port

    expect(taskUrl).toBe(`http://127.0.0.1:${port}/task`)
  })

  it('links the calling session and answers 204 with no body (ATSK-02)', async () => {
    const res = await send(JSON.stringify({ id: 12345, title: 'Example task' }), {
      token: 'token-1'
    })

    expect(res).toEqual({ status: 204, body: '' })
    expect(links).toEqual([{ sessionId: 'session-1', task: { id: 12345, title: 'Example task' } }])
    expect(events).toEqual([])
  })

  it('stores the title trimmed (ATSK-02)', async () => {
    await send(JSON.stringify({ id: 12345, title: '  Example task \n' }), { token: 'token-1' })

    expect(links.map((l) => l.task)).toEqual([{ id: 12345, title: 'Example task' }])
  })

  it('accepts a title of exactly 255 characters after trimming (ATSK-02)', async () => {
    const title = 'x'.repeat(255)

    const res = await send(JSON.stringify({ id: 12345, title: ` ${title} ` }), {
      token: 'token-1'
    })

    expect(res.status).toBe(204)
    expect(links.map((l) => l.task)).toEqual([{ id: 12345, title }])
  })

  it.each([
    ['omitted', { id: 12345 }],
    ['null', { id: 12345, title: null }],
    ['blank', { id: 12345, title: '   ' }]
  ])('stores a null title when it is %s (ATSK-03)', async (_label, body) => {
    const res = await send(JSON.stringify(body), { token: 'token-1' })

    expect(res.status).toBe(204)
    expect(links.map((l) => l.task)).toEqual([{ id: 12345, title: null }])
  })

  it('changes only the session its token names (ATSK-08)', async () => {
    await send(JSON.stringify({ id: 7, title: 'B' }), { token: 'token-2' })

    expect(links).toEqual([{ sessionId: 'session-2', task: { id: 7, title: 'B' } }])
  })

  it.each([
    ['no token', undefined],
    ['a token of no live session', 'token-of-nobody']
  ])('answers 401 with no body to %s and links nothing (ATSK-07)', async (_label, token) => {
    const res = await send(JSON.stringify({ id: 12345, title: 'x' }), { token })

    expect(res).toEqual({ status: 401, body: '' })
    expect(links).toEqual([])
  })

  it('answers 401 to a revoked token and links nothing (ATSK-07)', async () => {
    server.revoke('token-1')

    const res = await send(JSON.stringify({ id: 12345, title: 'x' }), { token: 'token-1' })

    expect(res).toEqual({ status: 401, body: '' })
    expect(links).toEqual([])
  })

  it.each([
    ['a body that is not JSON', 'not json'],
    ['an array', '[12345]'],
    ['null', 'null'],
    ['a missing id', JSON.stringify({ title: 'x' })],
    ['an id that is a string', JSON.stringify({ id: '12345', title: 'x' })],
    ['an id of 0', JSON.stringify({ id: 0, title: 'x' })],
    ['a negative id', JSON.stringify({ id: -1, title: 'x' })],
    ['a fractional id', JSON.stringify({ id: 1.5, title: 'x' })],
    ['an id above 2^53-1', JSON.stringify({ id: 2 ** 53, title: 'x' })],
    ['a title that is a number', JSON.stringify({ id: 12345, title: 42 })],
    ['a title of 256 characters after trimming', JSON.stringify({ id: 1, title: 'x'.repeat(256) })]
  ])('answers 400 with no body to %s and links nothing (ATSK-09)', async (_label, body) => {
    const res = await send(body, { token: 'token-1' })

    expect(res).toEqual({ status: 400, body: '' })
    expect(links).toEqual([])
  })

  it('accepts an id of exactly 2^53-1 (ATSK-09)', async () => {
    const res = await send(JSON.stringify({ id: Number.MAX_SAFE_INTEGER }), { token: 'token-1' })

    expect(res.status).toBe(204)
    expect(links.map((l) => l.task.id)).toEqual([Number.MAX_SAFE_INTEGER])
  })

  it('answers 405 with no body to a method other than POST (ATSK-10)', async () => {
    const res = await send('', { token: 'token-1', method: 'GET' })

    expect(res).toEqual({ status: 405, body: '' })
    expect(links).toEqual([])
  })

  it('answers 404 with no body to a POST on a path it does not serve (ATSK-10)', async () => {
    const other = taskUrl.replace(/\/task$/, '/other')

    const res = await send(JSON.stringify({ id: 12345, title: 'x' }), {
      token: 'token-1',
      to: other
    })

    expect(res).toEqual({ status: 404, body: '' })
    expect(links).toEqual([])
    expect(events).toEqual([])
  })

  it('accepts a body of exactly 4 KiB (ATSK-10)', async () => {
    const res = await send(paddedTo(4096), { token: 'token-1' })

    expect(res.status).toBe(204)
    expect(links.map((l) => l.task)).toEqual([{ id: 12345, title: 'Example task' }])
  })

  it('answers 413 with no body to a body over 4 KiB and links nothing (ATSK-10)', async () => {
    const res = await send(paddedTo(4097), { token: 'token-1' })

    expect(res).toEqual({ status: 413, body: '' })
    expect(links).toEqual([])
  })

  it('still folds a hook posted to the hooks url into activity, never into a link (ATSK-11)', async () => {
    const res = await send(JSON.stringify(STOP_EVENT), { token: 'token-1', to: hooksUrl })

    expect(res).toEqual({ status: 204, body: '' })
    expect(events).toEqual([{ sessionId: 'session-1', payload: STOP_EVENT }])
    expect(links).toEqual([])
  })

  it('never treats a link body posted to the hooks url as a link (ATSK-11)', async () => {
    await send(JSON.stringify({ id: 12345, title: 'x' }), { token: 'token-1', to: hooksUrl })

    expect(links).toEqual([])
  })
})
