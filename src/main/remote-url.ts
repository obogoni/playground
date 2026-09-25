import type { RemoteRef } from '../shared/files'

/**
 * What a git remote URL points at, when the app recognizes the host
 * (FCMT-23/26/27). Pure, and deliberately host-first: an unknown host returns
 * null rather than a guess, because the only thing worse than hiding the
 * browser button is opening the wrong page (F3-Q11).
 *
 * Both of git's URL shapes are accepted — `scheme://[user@]host/path` and the
 * scp-like `user@host:path` — and neither carries its userinfo into the
 * result, so a remote holding a credential (`https://user:token@…`) cannot
 * leak it into a built URL (edge case).
 *
 * F4 and F5 reuse this for pull requests.
 */
export function parseRemote(url: string): RemoteRef | null {
  const located = locate(url)
  if (!located) return null
  const { host, segments } = located
  if (segments.length === 0) return null

  if (host === 'github.com') {
    // <owner>/<repo>
    if (segments.length !== 2) return null
    return { provider: 'github', owner: segments[0], repo: unsuffixed(segments[1]) }
  }
  if (host === 'dev.azure.com') {
    // <org>/<project>/_git/<repo>
    if (segments.length !== 4 || segments[2] !== '_git') return null
    return {
      provider: 'azure-devops',
      org: segments[0],
      project: segments[1],
      repo: unsuffixed(segments[3])
    }
  }
  if (host === 'ssh.dev.azure.com' || host === 'vs-ssh.visualstudio.com') {
    // v3/<org>/<project>/<repo> — the SSH form spells no `_git`.
    if (segments.length !== 4 || segments[0] !== 'v3') return null
    return {
      provider: 'azure-devops',
      org: segments[1],
      project: segments[2],
      repo: unsuffixed(segments[3])
    }
  }
  if (host.endsWith('.visualstudio.com')) {
    // The organisation is the subdomain; the path is <project>/_git/<repo>,
    // optionally behind the legacy `DefaultCollection`.
    const org = host.slice(0, -'.visualstudio.com'.length)
    if (org === '' || org.includes('.')) return null
    const path = segments[0] === 'DefaultCollection' ? segments.slice(1) : segments
    if (path.length !== 3 || path[1] !== '_git') return null
    return { provider: 'azure-devops', org, project: path[0], repo: unsuffixed(path[2]) }
  }
  return null
}

/**
 * A commit's page on its provider (FCMT-24/28). Always `https://`, whatever
 * scheme the remote used, and every segment re-encoded, so a project named
 * `My Project` survives the round trip. The three Azure DevOps remote forms
 * converge here on the one address that works for all of them.
 */
export function commitUrl(ref: RemoteRef, sha: string): string {
  const part = (value: string): string => encodeURIComponent(value)
  if (ref.provider === 'github') {
    return `https://github.com/${part(ref.owner)}/${part(ref.repo)}/commit/${part(sha)}`
  }
  return (
    `https://dev.azure.com/${part(ref.org)}/${part(ref.project)}` +
    `/_git/${part(ref.repo)}/commit/${part(sha)}`
  )
}

/** The host and the decoded path segments, from either URL shape; null if neither fits. */
function locate(url: string): { host: string; segments: string[] } | null {
  const trimmed = url.trim()
  if (trimmed === '') return null

  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(trimmed)
  if (scheme) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }
    // `hostname` is userinfo-free and port-free by construction, which is why
    // the credential in `https://user:token@…` cannot survive this step.
    return { host: parsed.hostname.toLowerCase(), segments: split(parsed.pathname) }
  }

  // scp-like: [user@]host:path. The host must look like a domain, so a Windows
  // path (`C:\repos\widget`) is not mistaken for a host named `C`.
  const scp = /^(?:[^@/\\]+@)?([^/\\:]+):(.+)$/.exec(trimmed)
  if (!scp || !scp[1].includes('.')) return null
  return { host: scp[1].toLowerCase(), segments: split(scp[2]) }
}

/** Path segments, empties dropped and each percent-decoded. */
function split(path: string): string[] {
  const out: string[] = []
  for (const raw of path.split('/')) {
    if (raw === '') continue
    let decoded: string
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      // A stray `%` is not an encoding; keep the segment as written.
      decoded = raw
    }
    out.push(decoded)
  }
  return out
}

/** A repository segment without git's optional `.git` suffix. */
function unsuffixed(repo: string): string {
  return repo.endsWith('.git') ? repo.slice(0, -'.git'.length) : repo
}
