/**
 * Link detection over one logical terminal line (spec LINK-06/08/22/23).
 * Pure: text in, candidates with string spans out. Existence is decided by
 * main; the provider maps spans to buffer cells.
 */

export type LinkCandidate =
  | { kind: 'url'; text: string; start: number; end: number }
  | {
      kind: 'path'
      /** Display text, `:line:col` suffix included. */
      text: string
      /** Without the suffix — what main resolves and stats. */
      pathText: string
      line: number | null
      col: number | null
      start: number
      end: number
      /** Spaced paths only: extension-terminated prefixes, longest first (LINK-08). */
      alternatives?: { pathText: string; end: number }[]
    }

/** More than this on one line is a listing, not prose; the rest is not linked (design §Risks). */
export const MAX_CANDIDATES_PER_LINE = 32

// Ported from @xterm/addon-web-links 0.12.0 (MIT, © The xterm.js authors):
// consume anything that is not a terminator, then require a last character that
// is neither trailing interpunction nor a bracket or an unsafe char. `;` is
// added to the last-character class — the addon keeps it, LINK-23 excludes it.
const URL_REGEX = /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\^<>`]*[^\s"':,.!?;{}|\\^~[\]`()<>]/g

function isUrl(text: string): boolean {
  try {
    const url = new URL(text)
    const base = url.username
      ? url.password
        ? `${url.protocol}//${url.username}:${url.password}@${url.host}`
        : `${url.protocol}//${url.username}@${url.host}`
      : `${url.protocol}//${url.host}`
    return text.toLocaleLowerCase().startsWith(base.toLocaleLowerCase())
  } catch {
    return false
  }
}

// A path starts at ~/, a bare separator, ./ or ../, a drive, or a word followed
// by a separator; then any path-ish run; then an optional :line and :col. The
// drive form needs a word boundary before it, or the `e:/` inside `vscode://`
// and `file:///` would open a path.
const PATH_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|(?<![\p{L}\p{N}])[A-Za-z]:[\\/]|[\p{L}\p{N}._-]+[\\/])[\p{L}\p{N}\p{M}._~\-/\\%+@()[\]]*(?::\d+)?(?::\d+)?/gu
// Only an unambiguous path start at a token start opens a spaced candidate — a
// bare word, or the `/` inside `d/f.ts`, would turn any two words around a
// separator into one. The span stops at closing punctuation or before a second
// path start, so `/a/b.txt /c/d.txt` stays two candidates.
const SPACED_PATH_START = /(?<!\S)(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])/g
const SPACED_PATH_END = /[()[\]{}'",;<>|]|\s(?=~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])/
const EXTENSION_TOKEN = /\.[A-Za-z0-9_+-]+(?::\d+)?(?::\d+)?(?=[\s.,;:)\]]|$)/g
const SUFFIX = /^(.*?)(?::(\d+))?(?::(\d+))?$/
const SCHEME_PREFIX = /^[A-Za-z][A-Za-z0-9+.-]*:/

type Span = { start: number; end: number }

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

/** Trailing interpunction and a closing bracket without its opener are prose, not path. */
function trimPathTail(text: string): string {
  let trimmed = text
  for (;;) {
    const last = trimmed.at(-1)
    const unbalanced =
      (last === ')' && count(trimmed, '(') < count(trimmed, ')')) ||
      (last === ']' && count(trimmed, '[') < count(trimmed, ']'))
    if (!unbalanced && !(last && '.,;:'.includes(last))) return trimmed
    trimmed = trimmed.slice(0, -1)
  }
}

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

function parseSuffix(text: string): { pathText: string; line: number | null; col: number | null } {
  const match = SUFFIX.exec(text)
  const pathText = match?.[1] ?? text
  return {
    pathText,
    line: match?.[2] !== undefined ? Number(match[2]) : null,
    col: match?.[3] !== undefined ? Number(match[3]) : null
  }
}

/** True when the text from the token's start to `index` reads as `scheme:` — the match sits inside a URI. */
function insideScheme(line: string, index: number): boolean {
  const tokenStart =
    Math.max(line.lastIndexOf(' ', index - 1), line.lastIndexOf('\t', index - 1)) + 1
  return SCHEME_PREFIX.test(line.slice(tokenStart, index))
}

function detectUrls(line: string): LinkCandidate[] {
  const urls: LinkCandidate[] = []
  for (const match of line.matchAll(URL_REGEX)) {
    if (isUrl(match[0])) {
      urls.push({
        kind: 'url',
        text: match[0],
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }
  return urls
}

function detectPaths(line: string, claimed: Span[]): LinkCandidate[] {
  const paths: LinkCandidate[] = []
  for (const match of line.matchAll(PATH_REGEX)) {
    const text = trimPathTail(match[0])
    if (!text || !/[\\/]/.test(text)) continue
    const span = { start: match.index, end: match.index + text.length }
    if (claimed.some((url) => overlaps(url, span)) || insideScheme(line, span.start)) continue
    paths.push({ kind: 'path', text, ...parseSuffix(text), ...span })
  }
  return paths
}

function detectSpacedPaths(line: string, claimed: Span[]): LinkCandidate[] {
  const spaced: LinkCandidate[] = []
  for (const start of line.matchAll(SPACED_PATH_START)) {
    if (insideScheme(line, start.index)) continue
    const rest = line.slice(start.index)
    const stop = SPACED_PATH_END.exec(rest)
    const span = stop ? rest.slice(0, stop.index) : rest
    const alternatives: { pathText: string; end: number }[] = []
    for (const token of span.matchAll(EXTENSION_TOKEN)) {
      const prefix = span.slice(0, token.index + token[0].length)
      if (/\s/.test(prefix)) {
        alternatives.push({
          pathText: parseSuffix(prefix).pathText,
          end: start.index + prefix.length
        })
      }
    }
    if (alternatives.length === 0) continue
    alternatives.reverse()
    const longest = alternatives[0]
    const text = line.slice(start.index, longest.end)
    const candidate = { start: start.index, end: longest.end }
    if (claimed.some((url) => overlaps(url, candidate))) continue
    spaced.push({ kind: 'path', text, ...parseSuffix(text), ...candidate, alternatives })
  }
  return spaced
}

/**
 * URLs claim their spans first; path candidates never overlap them. Spaced
 * candidates may overlap plain ones — the provider keeps the longest that
 * exists. Sorted by start, longer first on a tie, capped at the line limit.
 */
export function detectLinkCandidates(line: string): LinkCandidate[] {
  const urls = detectUrls(line)
  const candidates = [...urls, ...detectPaths(line, urls), ...detectSpacedPaths(line, urls)]
  return candidates
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .slice(0, MAX_CANDIDATES_PER_LINE)
}
