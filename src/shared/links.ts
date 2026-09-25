/** What main found at a terminal link candidate after resolving it against the session cwd. */
export type PathKind = 'file' | 'dir' | 'missing'

export interface ProbeResult {
  /** The candidate exactly as it appeared in the terminal — the renderer's cache key. */
  pathText: string
  /** Null when the candidate could not be resolved to an absolute path (LINK-29). */
  absolutePath: string | null
  kind: PathKind
}
