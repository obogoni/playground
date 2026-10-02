import * as pty from 'node-pty'
import type { ToHost } from '../shared/pty-host-protocol'
import { createPtyHost } from './pty-host-core'

/**
 * PTY host utility-process entry (forked by `pty-host-fork.ts`). The only file
 * that imports node-pty (PTYH-01): ConPTY creation is synchronous and costs
 * ~300 ms, so it blocks this process's loop instead of main's. Thin on purpose;
 * the logic lives in `createPtyHost` and this wiring is hand-verified.
 */
const host = createPtyHost({
  spawn: (file, args, opts) => pty.spawn(file, args, opts),
  post: (m) => process.parentPort.postMessage(m),
  exit: (code) => process.exit(code)
})

process.parentPort.on('message', (e) => host.handle(e.data as ToHost))
