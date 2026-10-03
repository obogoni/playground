import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A remote whose fetch waits for a credential answer that never comes
 * (create-timeouts T1, CRTO-02): the case `GIT_TERMINAL_PROMPT=0` does not
 * cover. The server answers every request `401` with a Basic challenge, so git
 * asks its credential helpers; `trackWaitingRemote` installs one that waits.
 *
 * The helper waits on a request to the server's `/wait`, which the server holds
 * open until `close()`. Killing git does not kill its children, and on Windows
 * `git-remote-http`, still waiting for the helper, keeps its cwd inside the
 * repo, so the repo's folder cannot be removed (EPERM). `close()` ends the
 * wait; the helper returns no credentials and the orphans exit within
 * milliseconds (measured about 60 ms), which `removeReleasedFolder` waits out.
 */
export interface WaitingRemote {
  url: string
  close(): Promise<void>
}

/** An HTTP server on `127.0.0.1`, port 0, that refuses every request with a Basic challenge. */
export async function startWaitingRemote(): Promise<WaitingRemote> {
  const held = new Set<ServerResponse>()
  const server = createServer((req, res) => {
    if (req.url === '/wait') {
      held.add(res)
      return
    }
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="fixture"' })
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/repo.git`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        held.clear()
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      })
  }
}

/**
 * The credential helper that never answers on its own: a shell function, so the
 * `get` git appends becomes its argument (a bare `sleep 30` would read it as a
 * duration and fail at once). It leaves the repo folder, then waits on the
 * remote's `/wait` until the remote closes, or 30 s at most.
 */
export function waitingHelper(url: string): string {
  return `!f() { cd / && curl -s --max-time 30 ${new URL('/wait', url).href}; }; f`
}

/**
 * Makes `main` in `repo` track `origin/main` at `url`, with the waiting helper
 * as the only credential helper. `refs/remotes/origin/main` is written at
 * `HEAD`, because without it `main@{upstream}` does not resolve.
 */
export function trackWaitingRemote(repo: string, url: string): void {
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  }
  git('remote', 'add', 'origin', url)
  git('config', 'branch.main.remote', 'origin')
  git('config', 'branch.main.merge', 'refs/heads/main')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  // An empty value resets the helper list inherited from the system config.
  git('config', 'credential.helper', '')
  git('config', '--add', 'credential.helper', waitingHelper(url))
}

/**
 * Removes a folder a killed fetch's orphans may still hold, after `close()`:
 * retries `EPERM` / `EBUSY` for up to 5 s. `rmSync`'s own `maxRetries` did not
 * retry this `EPERM` (measured, Node 24).
 */
export async function removeReleasedFolder(path: string): Promise<void> {
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      rmSync(path, { recursive: true, force: true })
      return
    } catch (err) {
      const code = (err as { code?: string }).code
      if ((code !== 'EPERM' && code !== 'EBUSY') || Date.now() > deadline) throw err
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}
