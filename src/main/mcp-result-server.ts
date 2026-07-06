/**
 * The shared, self-hosted loopback HTTP MCP result server (WF3, re-homed from the
 * WF1 spike `mcp-server`). It forces structured output out of the headless agent
 * (Arm M): one bearer token per step BOTH routes and authorizes. A request with a
 * missing / unknown / revoked token is rejected with 401 before it reaches any MCP
 * transport (WF3-08). For a registered token the server exposes a single
 * `emit_result` tool whose `inputSchema` is built from that step's `expect` via the
 * pure seam, and a valid `emit_result` call resolves the pending promise with the
 * ajv-validated payload (WF3-06).
 *
 * One server is started lazily on loopback (`127.0.0.1`, ephemeral port) and reused
 * across steps and runs; per-step tokens are registered before spawn and revoked
 * when the step resolves so a late / duplicate call cannot resolve it again (WF3-09,
 * WF3-10).
 *
 * Low-level `Server` + `setRequestHandler` (not the high-level `McpServer`) is used
 * deliberately: the contract is that `tools/list` returns EXACTLY
 * `buildToolInputSchema(expect)`, and only the low-level path emits a raw JSON Schema
 * verbatim — `registerTool` would round-trip it through Zod and reshape it.
 */

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import {
  buildToolInputSchema,
  validate,
  type EmitResultPayload,
  type JsonSchema
} from './emit-result-schema'

export interface McpResultServer {
  /** Bind an ephemeral loopback port; returns the URL to hand to the agent. */
  start(): Promise<{ url: string; port: number }>
  /** Register a step: its token authorizes calls and its `expect` shapes the tool.
   *  Resolves when the agent makes a valid `emit_result` call for this token. */
  register(token: string, expect: JsonSchema): Promise<EmitResultPayload>
  /** Drop a token — later calls with it are rejected (token = auth, not just routing). */
  revoke(token: string): void
  /** Close every per-token transport and the HTTP listener. */
  stop(): Promise<void>
}

interface Registration {
  expect: JsonSchema
  server: Server
  transport: StreamableHTTPServerTransport
  ready: Promise<void>
  resolve: (payload: EmitResultPayload) => void
  reject: (err: Error) => void
  settled: boolean
}

function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== 'string') return undefined
  const match = /^Bearer (.+)$/.exec(header)
  return match ? match[1] : undefined
}

function buildTokenServer(reg: Registration): Server {
  const server = new Server(
    { name: 'playground-result-server', version: '0.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'emit_result',
        description: 'Finish this step by emitting its structured result.',
        // Verbatim from the pure seam — this is the exact contract WF3-06 asserts.
        inputSchema: buildToolInputSchema(reg.expect) as { type: 'object' } & Record<
          string,
          unknown
        >
      }
    ]
  }))

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name !== 'emit_result') {
      return {
        content: [{ type: 'text', text: `unknown tool: ${request.params.name}` }],
        isError: true
      }
    }
    const result = validate(request.params.arguments, reg.expect)
    if (!result.ok) {
      // A non-conforming payload is REPORTED as a tool error; the corrective
      // --resume retry (if the run ends with no valid emit) is the runner's job.
      return {
        content: [{ type: 'text', text: `invalid emit_result: ${result.error}` }],
        isError: true
      }
    }
    if (!reg.settled) {
      reg.settled = true
      reg.resolve(result.value)
    }
    return { content: [{ type: 'text', text: 'result recorded' }] }
  })

  return server
}

export function createMcpResultServer(): McpResultServer {
  const registrations = new Map<string, Registration>()
  const httpServer: HttpServer = createServer((req, res) => {
    void (async () => {
      const token = bearerToken(req)
      const reg = token ? registrations.get(token) : undefined
      if (!reg) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'missing or unknown bearer token' }))
        return
      }
      await reg.ready
      await reg.transport.handleRequest(req, res)
    })()
  })

  return {
    start() {
      return new Promise((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => {
          const port = (httpServer.address() as AddressInfo).port
          resolve({ url: `http://127.0.0.1:${port}/mcp`, port })
        })
      })
    },

    register(token, expect) {
      let resolve!: (payload: EmitResultPayload) => void
      let reject!: (err: Error) => void
      const emitted = new Promise<EmitResultPayload>((res, rej) => {
        resolve = res
        reject = rej
      })
      const reg = { expect, resolve, reject, settled: false } as Registration
      reg.server = buildTokenServer(reg)
      reg.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true
      })
      reg.ready = reg.server.connect(reg.transport)
      registrations.set(token, reg)
      return emitted
    },

    revoke(token) {
      const reg = registrations.get(token)
      if (!reg) return
      registrations.delete(token)
      if (!reg.settled) {
        reg.settled = true
        reg.reject(new Error(`token revoked before emit_result: ${token}`))
      }
      void reg.transport.close()
      void reg.server.close()
    },

    async stop() {
      for (const reg of registrations.values()) {
        if (!reg.settled) {
          reg.settled = true
          reg.reject(new Error('server stopped before emit_result'))
        }
        await reg.transport.close()
        await reg.server.close()
      }
      registrations.clear()
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
    }
  }
}
