import { utilityProcess } from 'electron'
import { createInterface } from 'node:readline'
import type { FromHost } from '../shared/pty-host-protocol'
import type { HostTransport } from './pty-host-client'
import ptyHostPath from './pty-host?modulePath'

/**
 * Electron adapter behind `HostTransport`: forks `pty-host.ts` as a utility
 * process. electron-vite bundles the `?modulePath` entry next to main
 * (`out/main/pty-host-<hash>.js`), and it runs from inside the asar in the
 * packaged build (pty-host T1 spike). Thin and hand-verified, like the old
 * in-process node-pty adapter.
 */
export function forkPtyHost(): HostTransport {
  const child = utilityProcess.fork(ptyHostPath, [], {
    serviceName: 'Playground PTY host',
    stdio: 'pipe'
  })
  forwardLines(child.stdout)
  forwardLines(child.stderr)
  return {
    post: (m) => child.postMessage(m),
    onMessage: (cb) => child.on('message', (m: FromHost) => cb(m)),
    onExit: (cb) => child.on('exit', (code) => cb(code)),
    kill: () => {
      child.kill()
    }
  }
}

/** The host has no console of its own: its output goes to main's log, prefixed. */
function forwardLines(stream: NodeJS.ReadableStream | null): void {
  if (!stream) return
  createInterface({ input: stream }).on('line', (line) => console.error(`[pty-host] ${line}`))
}
