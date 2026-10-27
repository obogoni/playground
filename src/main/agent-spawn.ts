/** A thin seam over `child_process.spawn` — a fake in tests, the real spawn in `index.ts`. */
export interface AgentChild {
  onStdout(listener: (chunk: string) => void): void
  onStderr(listener: (chunk: string) => void): void
  /** The child could not be spawned or killed (`ENOENT`, `EACCES`). Node emits
   *  this before `close`; a ChildProcess with no listener throws instead, so a
   *  caller that outlives one binary (the name poller) must subscribe. */
  onError?(listener: (err: Error) => void): void
  onClose(listener: (code: number | null) => void): void
  kill(): void
}

export type AgentSpawn = (
  bin: string,
  argv: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv }
) => AgentChild
