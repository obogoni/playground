import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpResultServer, type McpResultServer } from './mcp-server'
import { buildToolInputSchema, type JsonSchema } from './emit-result-schema'

const EXPECT: JsonSchema = {
  type: 'object',
  properties: { answer: { type: 'number' } },
  required: ['answer']
}

let server: McpResultServer
let url: string
const openClients: Client[] = []

beforeEach(async () => {
  server = createMcpResultServer()
  ;({ url } = await server.start())
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
  const client = new Client({ name: 'wf1-test-client', version: '0.0.0' })
  await client.connect(transport)
  openClients.push(client)
  return client
}

describe('createMcpResultServer — binding', () => {
  it('starts on a loopback URL with an ephemeral port (WF1-03)', () => {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
  })
})

describe('createMcpResultServer — per-token tools/list', () => {
  it('exposes emit_result whose inputSchema is built from the token expect (WF1-04)', async () => {
    void server.register('tok-1', EXPECT).catch(() => {})
    const client = await connectClient('tok-1')
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('emit_result')
    expect(tools[0].inputSchema).toEqual(buildToolInputSchema(EXPECT))
  })
})

describe('createMcpResultServer — forced emit_result', () => {
  it('resolves the pending promise with the validated payload on a valid call (WF1-03/04)', async () => {
    const pending = server.register('tok-2', EXPECT)
    const client = await connectClient('tok-2')
    await client.callTool({
      name: 'emit_result',
      arguments: { status: 'done', data: { answer: 42 } }
    })
    await expect(pending).resolves.toEqual({ status: 'done', data: { answer: 42 } })
  })

  it('reports a schema mismatch as a tool error and leaves the promise pending', async () => {
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

describe('createMcpResultServer — token is auth, not just routing (WF1-03)', () => {
  it('rejects a request with no bearer token', async () => {
    await expect(connectClient(undefined)).rejects.toThrow()
  })

  it('rejects a request with an unknown token', async () => {
    await expect(connectClient('never-registered')).rejects.toThrow()
  })

  it('rejects a request whose token was revoked', async () => {
    const pending = server.register('tok-4', EXPECT)
    server.revoke('tok-4')
    await expect(pending).rejects.toThrow(/revoked/) // revoke settles the pending step
    await expect(connectClient('tok-4')).rejects.toThrow() // later calls are unauthorized
  })
})
