import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpResultServer, type McpResultServer } from './mcp-result-server'
import { buildToolInputSchema, type JsonSchema } from './emit-result-schema'

// A representative step `expect`: the structured data the agent must emit.
const EXPECT: JsonSchema = {
  type: 'object',
  properties: { answer: { type: 'number' } },
  required: ['answer']
}

let server: McpResultServer
let url: string
let port: number
const openClients: Client[] = []

beforeEach(async () => {
  server = createMcpResultServer()
  ;({ url, port } = await server.start())
})

afterEach(async () => {
  for (const c of openClients.splice(0)) await c.close().catch(() => {})
  await server.stop()
})

/** Connect a real MCP client over loopback HTTP, sending the bearer token (if any). */
async function connectClient(token?: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined
  )
  const client = new Client({ name: 'wf3-test-client', version: '0.0.0' })
  await client.connect(transport)
  openClients.push(client)
  return client
}

describe('createMcpResultServer — lazy loopback binding (WF3-10)', () => {
  it('starts on a loopback URL with an ephemeral (non-zero) port', () => {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    expect(port).toBeGreaterThan(0)
    expect(url).toContain(`:${port}/`)
  })
})

describe('createMcpResultServer — per-token tools/list (WF3-06)', () => {
  it('exposes emit_result whose inputSchema is buildToolInputSchema(expect) verbatim', async () => {
    void server.register('tok-1', EXPECT).catch(() => {})
    const client = await connectClient('tok-1')
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('emit_result')
    expect(tools[0].inputSchema).toEqual(buildToolInputSchema(EXPECT))
  })
})

describe('createMcpResultServer — forced emit_result (WF3-06)', () => {
  it('resolves the pending promise with the validated payload on a valid call', async () => {
    const pending = server.register('tok-2', EXPECT)
    const client = await connectClient('tok-2')
    await client.callTool({
      name: 'emit_result',
      arguments: { status: 'done', data: { answer: 42 } }
    })
    await expect(pending).resolves.toEqual({ status: 'done', data: { answer: 42 } })
  })

  it('reports a non-conforming payload as a tool error and leaves the promise pending', async () => {
    const pending = server.register('tok-3', EXPECT)
    let settled = false
    void pending.then(
      () => (settled = true),
      () => (settled = true)
    )
    const client = await connectClient('tok-3')
    const res = await client.callTool({
      name: 'emit_result',
      arguments: { status: 'done', data: { answer: 'not-a-number' } }
    })
    expect(res.isError).toBe(true)
    expect(settled).toBe(false) // a bad payload does not resolve the step
  })
})

describe('createMcpResultServer — token is auth, not just routing (WF3-08)', () => {
  it('rejects a request with no bearer token with 401', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(res.status).toBe(401)
  })

  it('rejects a request with an unknown token with 401', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        Authorization: 'Bearer never-registered'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(res.status).toBe(401)
  })
})

describe('createMcpResultServer — field-level lastError (WF4-18)', () => {
  it('stores the field-level ajv error for a non-conforming payload, exposed via lastError(token)', async () => {
    void server.register('tok-e', EXPECT).catch(() => {})
    expect(server.lastError('tok-e')).toBeUndefined() // none before any invalid call
    const client = await connectClient('tok-e')
    await client.callTool({
      name: 'emit_result',
      arguments: { status: 'done', data: { answer: 'not-a-number' } }
    })
    const err = server.lastError('tok-e')
    expect(err).toMatch(/answer/) // names the offending field
    expect(err).toMatch(/number/) // and why it failed
  })

  it('returns undefined for an unknown token', () => {
    expect(server.lastError('never-registered')).toBeUndefined()
  })

  it('leaves lastError undefined when the emit is valid (no WF3 regression)', async () => {
    const pending = server.register('tok-v', EXPECT)
    const client = await connectClient('tok-v')
    await client.callTool({
      name: 'emit_result',
      arguments: { status: 'done', data: { answer: 7 } }
    })
    await expect(pending).resolves.toEqual({ status: 'done', data: { answer: 7 } })
    expect(server.lastError('tok-v')).toBeUndefined()
  })
})

describe('createMcpResultServer — bind-failure reject (WF4-20)', () => {
  it('rejects start() when the port is already bound instead of hanging forever', async () => {
    const second = createMcpResultServer()
    // `port` is held by the beforeEach server on 127.0.0.1 → EADDRINUSE.
    await expect(second.start(port)).rejects.toThrow()
    await second.stop().catch(() => {})
  })
})

describe('createMcpResultServer — revoke (WF3-09)', () => {
  it('rejects an un-settled pending on revoke and 401s later calls with that token', async () => {
    const pending = server.register('tok-4', EXPECT)
    server.revoke('tok-4')
    await expect(pending).rejects.toThrow(/revoked/) // revoke settles the pending step
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        Authorization: 'Bearer tok-4'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(res.status).toBe(401) // later calls with a revoked token are unauthorized
  })
})
