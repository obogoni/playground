import { Profiler, type JSX, type ReactNode } from 'react'
import { formatRenderLine, perfEnabled } from '../lib/perf-probe'

/** Read once at startup: flipping the flag takes a reload, like the mode probe (PERF-18). */
const ENABLED = perfEnabled()

interface PerfProfilerProps {
  /** The component name in the log line (`SessionRow`, `TopBar`, …). */
  name: string
  /** Optional instance id, e.g. the session id of a rail row. */
  id?: string
  children: ReactNode
}

/**
 * Logs `[perf] render <name> <id?>` for each commit of its subtree when the perf
 * flag is on (PERF-17). Off, it returns the children unwrapped, so no profiler is
 * mounted at all (PERF-18). React reports Profiler commits in development builds
 * (and the profiling build) only, so the log is a `npm run dev` aid.
 */
export function PerfProfiler({ name, id, children }: PerfProfilerProps): JSX.Element {
  if (!ENABLED) return <>{children}</>
  return (
    <Profiler id={name} onRender={() => console.debug(formatRenderLine(name, id))}>
      {children}
    </Profiler>
  )
}
