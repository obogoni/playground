/**
 * The loopback endpoint Claude Code's http hooks POST to (AD-019, ACTV-04).
 *
 * One listener serves every session: the bearer token both authenticates the
 * request and says which session it belongs to, the same trick the workflows
 * result server uses per step (AD-008). A token is registered when its session
 * spawns and revoked when it stops, so a late POST from a dying agent is
 * rejected rather than resurrecting state (ACTV-32).
 *
 * **This server answers, it never decides.** Claude Code reads an http hook's
 * response body as a decision — it could allow or deny a permission on the
 * user's behalf. Every path here answers with an empty body, so no response can
 * ever carry one (ACTV-10). It also answers before dispatching, because the
 * agent is blocked until the hook returns.
 *
 * A second path takes the session's task link from its agent (ATSK-02). It is
 * no hook, so it answers after applying the link: a 204 means linked, and every
 * refusal is a status code with no body.
 */

import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Socket } from 'node:net'
import type { SessionTask } from '../shared/tasks'

/** `PostToolUse` carries the whole tool response; past this we stop reading. */
const MAX_BODY_BYTES = 8 * 1024 * 1024

const HOOKS_PATH = '/hooks'
const TASK_PATH = '/task'

/** A link body is a few hundred bytes; past this it is refused (ATSK-10). */
const MAX_TASK_BODY_BYTES = 4 * 1024

/** Azure DevOps' `System.Title` limit (ATSK-09). */
const MAX_TITLE_LENGTH = 255

export type HookEventListener = (sessionId: string, payload: Record<string, unknown>) => void

export type TaskLinkListener = (sessionId: string, task: SessionTask) => void

export interface ActivityHookServer {
  /** Bind an ephemeral loopback port; `url` is what the settings file points at,
   *  `taskUrl` is where an agent links its session to a task (ATSK-01). */
  start(): Promise<{ url: string; taskUrl: string; port: number }>
  /** A live session's token. Registered before the agent is spawned. */
  register(token: string, sessionId: string): void
  /** Drop a token — later requests with it are rejected. */
  revoke(token: string): void
  onEvent(listener: HookEventListener): void
  /** Called with a valid link before its 204 is sent (ATSK-02). */
  onTaskLink(listener: TaskLinkListener): void
  stop(): Promise<void>
}

function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== 'string') return undefined
  const match = /^Bearer (.+)$/.exec(header)
  return match ? match[1] : undefined
}

/** Answer with a status and nothing else. */
function answer(res: ServerResponse, status: number): void {
  res.writeHead(status)
  res.end()
}

function asEventObject(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** The link a body asks for, or null when it breaks any rule of ATSK-09. */
function asTaskLink(body: string): SessionTask | null {
  const parsed = asEventObject(body)
  if (parsed === null) return null
  const { id, title } = parsed
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return null
  if (title === undefined || title === null) return { id, title: null }
  if (typeof title !== 'string') return null
  const trimmed = title.trim()
  if (trimmed.length > MAX_TITLE_LENGTH) return null
  return { id, title: trimmed === '' ? null : trimmed }
}

export function createActivityHookServer(): ActivityHookServer {
  const sessionByToken = new Map<string, string>()
  const warned = new Set<string>()
  const sockets = new Set<Socket>()
  let listener: HookEventListener | null = null
  let taskListener: TaskLinkListener | null = null

  const warnOnce = (token: string, message: string): void => {
    if (warned.has(token)) return
    warned.add(token)
    console.warn(`[activity-hooks] ${message}`)
  }

  const httpServer: HttpServer = createServer((req, res) => {
    if (req.method !== 'POST') {
      req.resume()
      answer(res, 405)
      return
    }
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path !== HOOKS_PATH && path !== TASK_PATH) {
      req.resume()
      answer(res, 404)
      return
    }
    const token = bearerToken(req)
    const sessionId = token ? sessionByToken.get(token) : undefined
    if (token === undefined || sessionId === undefined) {
      req.resume()
      answer(res, 401)
      return
    }

    const cap = path === TASK_PATH ? MAX_TASK_BODY_BYTES : MAX_BODY_BYTES
    let size = 0
    let oversized = false
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      size += Buffer.byteLength(chunk, 'utf8')
      if (size > cap) {
        oversized = true
        body = ''
        return
      }
      body += chunk
    })
    req.on('end', () => {
      if (path === TASK_PATH) {
        if (oversized) {
          warnOnce(token, `task link body over ${MAX_TASK_BODY_BYTES} bytes refused`)
          answer(res, 413)
          return
        }
        const task = asTaskLink(body)
        if (task === null) {
          warnOnce(token, 'task link body was not a valid link')
          answer(res, 400)
          return
        }
        taskListener?.(sessionId, task)
        answer(res, 204)
        return
      }

      answer(res, 204)
      if (oversized) {
        warnOnce(token, `hook body over ${MAX_BODY_BYTES} bytes ignored`)
        return
      }
      const payload = asEventObject(body)
      if (payload === null) {
        warnOnce(token, 'hook body was not a JSON object')
        return
      }
      listener?.(sessionId, payload)
    })
  })

  httpServer.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  return {
    start() {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.listen(0, '127.0.0.1', () => {
          const { port } = httpServer.address() as AddressInfo
          const base = `http://127.0.0.1:${port}`
          resolve({ url: `${base}${HOOKS_PATH}`, taskUrl: `${base}${TASK_PATH}`, port })
        })
      })
    },
    register(token, sessionId) {
      sessionByToken.set(token, sessionId)
    },
    revoke(token) {
      sessionByToken.delete(token)
      warned.delete(token)
    },
    onEvent(next) {
      listener = next
    },
    onTaskLink(next) {
      taskListener = next
    },
    stop() {
      return new Promise((resolve, reject) => {
        // Keep-alive connections would hold close() open past app quit.
        for (const socket of sockets) socket.destroy()
        sockets.clear()
        // Quit paths can run twice (window-all-closed then before-quit), and a
        // second close would reject with "Server is not running".
        if (!httpServer.listening) {
          resolve()
          return
        }
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
    }
  }
}
