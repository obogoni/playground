/**
 * The one place that knows a row's links (design §terminal-link-provider): it
 * serves xterm's `provideLinks` (hover underline) and the pane's synchronous
 * `hitTest` (the Ctrl gesture), from the same detection and the same per-pane
 * existence cache. xterm never activates anything — `activate` is a no-op and
 * the pane opens through `hitTest`.
 */
import type { IBufferRange, ILink } from '@xterm/xterm'
import type { PathKind, ProbeResult } from '../../../shared/links'
import {
  rangeContains,
  rangeForStringSpan,
  windowedLine,
  type BufferLike,
  type WindowedLine
} from './terminal-buffer-lines'
import { detectLinkCandidates, type LinkCandidate } from './terminal-links'

export type KnownLinkHit =
  | { kind: 'url'; url: string }
  /** An OSC 8 `file://` target; main converts it to a path (LINK-21). */
  | { kind: 'fileUrl'; url: string }
  | { kind: 'path'; pathText: string; state: 'file' | 'dir' }

export type LinkHit =
  | KnownLinkHit
  /** A path nobody probed yet: intercepted now, opened on mouseup if `settled` says it exists (LINK-19). */
  | { kind: 'path'; pathText: string; state: 'unprobed'; settled: Promise<KnownLinkHit | null> }

export interface TerminalLinkProviderDeps {
  buffer: BufferLike
  getCols(): number
  /** Resolves and stats each text against the session cwd (main's `links:probe`). */
  probe(paths: string[]): Promise<ProbeResult[]>
}

export interface TerminalLinkProvider {
  provideLinks(y1: number, callback: (links: ILink[] | undefined) => void): void
  hitTest(x1: number, y1: number): LinkHit | null
  dispose(): void
}

type PathCandidate = Extract<LinkCandidate, { kind: 'path' }>

/** A candidate pinned to the text it links as and the cells it covers. */
type Placed = { candidate: LinkCandidate; hit: KnownLinkHit; range: IBufferRange; end: number }

const NOOP = (): void => {}

/**
 * What a Ctrl+click on an OSC 8 hyperlink opens: `http(s)` in the browser,
 * `file` through the file rules, anything else nothing — xterm provides every
 * scheme once `allowNonHttpProtocols` is on, so the pane filters here
 * (LINK-20, LINK-21, LINK-22).
 */
export function hitForOscTarget(target: string): KnownLinkHit | null {
  let protocol: string
  try {
    protocol = new URL(target).protocol
  } catch {
    return null
  }
  if (protocol === 'http:' || protocol === 'https:') return { kind: 'url', url: target }
  if (protocol === 'file:') return { kind: 'fileUrl', url: target }
  return null
}

export function createTerminalLinkProvider(deps: TerminalLinkProviderDeps): TerminalLinkProvider {
  const cache = new Map<string, PathKind>()
  const inFlight = new Map<string, Promise<void>>()

  /** One probe per distinct text; concurrent askers share it; a failed probe caches 'missing' (LINK-24). */
  const probe = (texts: string[]): Promise<void> => {
    const pending = [...new Set(texts)].filter((t) => !cache.has(t) && !inFlight.has(t))
    if (pending.length > 0) {
      const request = deps
        .probe(pending)
        .then(
          (results) => {
            for (const result of results) cache.set(result.pathText, result.kind)
          },
          () => {}
        )
        .then(() => {
          for (const text of pending) {
            if (!cache.has(text)) cache.set(text, 'missing')
            inFlight.delete(text)
          }
        })
      for (const text of pending) inFlight.set(text, request)
    }
    return Promise.all(texts.map((t) => inFlight.get(t))).then(NOOP)
  }

  /** Every text a path candidate may link as: its own, then each spaced alternative. */
  const textsOf = (candidate: PathCandidate): string[] => [
    candidate.pathText,
    ...(candidate.alternatives ?? []).map((a) => a.pathText)
  ]

  /** The longest text of a candidate known to exist, or null while none does. */
  const existing = (candidate: PathCandidate): { hit: KnownLinkHit; end: number } | null => {
    const options = [
      ...(candidate.alternatives ?? []),
      { pathText: candidate.pathText, end: candidate.end }
    ].sort((a, b) => b.end - a.end)
    for (const option of options) {
      const kind = cache.get(option.pathText)
      if (kind === 'file' || kind === 'dir') {
        return { hit: { kind: 'path', pathText: option.pathText, state: kind }, end: option.end }
      }
    }
    return null
  }

  /** Candidates that link right now — URLs always, paths when cached as existing — longest wins. */
  const place = (line: WindowedLine, candidates: LinkCandidate[]): Placed[] => {
    const placed: Placed[] = []
    for (const candidate of candidates) {
      const chosen =
        candidate.kind === 'url'
          ? { hit: { kind: 'url' as const, url: candidate.text }, end: candidate.end }
          : existing(candidate)
      if (!chosen) continue
      const range = rangeForStringSpan(deps.buffer, line.topRow, candidate.start, chosen.end)
      if (range) placed.push({ candidate, hit: chosen.hit, range, end: chosen.end })
    }
    return preferLongest(placed)
  }

  const linksFor = (line: WindowedLine, candidates: LinkCandidate[]): ILink[] | undefined => {
    const links = place(line, candidates).map(({ candidate, range, end }) => ({
      range,
      text: line.text.slice(candidate.start, end),
      decorations: { underline: true, pointerCursor: true },
      activate: NOOP
    }))
    return links.length > 0 ? links : undefined
  }

  return {
    provideLinks(y1, callback) {
      const line = windowedLine(deps.buffer, y1 - 1)
      const candidates = line ? detectLinkCandidates(line.text) : []
      if (!line || candidates.length === 0) {
        callback(undefined)
        return
      }
      const unknown = candidates
        .flatMap((c) => (c.kind === 'path' ? textsOf(c) : []))
        .filter((t) => !cache.has(t))
      if (unknown.length === 0) {
        callback(linksFor(line, candidates))
        return
      }
      void probe(unknown).then(() => {
        // A row repainted while the probe was out gets no stale link (LINK-25).
        const current = windowedLine(deps.buffer, y1 - 1)
        callback(current?.fingerprint === line.fingerprint ? linksFor(line, candidates) : undefined)
      })
    },

    hitTest(x1, y1) {
      const line = windowedLine(deps.buffer, y1 - 1)
      if (!line) return null
      const cols = deps.getCols()
      const candidates = detectLinkCandidates(line.text)
      // What the hover shows: known links, longest first.
      for (const { hit, range } of place(line, candidates)) {
        if (rangeContains(range, x1, y1, cols)) return hit
      }
      // Then a path nobody has probed yet (LINK-19); a cached miss yields nothing (LINK-07).
      for (const candidate of candidates) {
        if (candidate.kind !== 'path') continue
        const texts = textsOf(candidate)
        if (texts.every((t) => cache.has(t))) continue
        const range = rangeForStringSpan(deps.buffer, line.topRow, candidate.start, candidate.end)
        if (!range || !rangeContains(range, x1, y1, cols)) continue
        return {
          kind: 'path',
          pathText: candidate.pathText,
          state: 'unprobed',
          settled: probe(texts).then(() => existing(candidate)?.hit ?? null)
        }
      }
      return null
    },

    dispose() {
      cache.clear()
      inFlight.clear()
    }
  }
}

/** Longest first, never overlapping; then back in row order. */
function preferLongest(placed: Placed[]): Placed[] {
  const chosen: Placed[] = []
  const byLength = [...placed].sort(
    (a, b) =>
      b.end - b.candidate.start - (a.end - a.candidate.start) ||
      a.candidate.start - b.candidate.start
  )
  for (const item of byLength) {
    if (!chosen.some((c) => overlaps(c, item))) chosen.push(item)
  }
  return chosen.sort((a, b) => a.candidate.start - b.candidate.start)
}

function overlaps(a: Placed, b: Placed): boolean {
  return a.candidate.start < b.end && b.candidate.start < a.end
}
