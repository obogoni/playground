/**
 * WF3 gate example (WF3-21): a "review PR" workflow. It reads a worktree's changed
 * files (WF2 `ctx.worktree.changedFiles`), hands that diff context to a READ-posture
 * `ctx.agent` step declaring a findings `expect` schema, then notifies a summary. The
 * `read` posture guarantees the review cannot mutate the worktree (WF3-11), which the
 * owner-run smoke (`scripts/smoke-agent-workflow.mjs`) asserts end-to-end.
 *
 * Self-contained on purpose: no cross-package imports, because the smoke script seeds a
 * COPY of this file under `~/.playground/workflows/review-pr/` and esbuild bundles that
 * copy — a relative import into `src/` would break once copied. `ctx` is therefore typed
 * with a local minimal interface mirroring the real `Ctx` facade (`src/main/workflow-ctx.ts`).
 */

/** The findings contract the agent step must satisfy — fed verbatim to the emit_result tool. */
export const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { enum: ['info', 'warn', 'error'] },
          summary: { type: 'string' }
        },
        required: ['file', 'severity', 'summary']
      }
    }
  },
  required: ['findings']
}

export const meta = {
  name: 'Review PR',
  description: 'Read a worktree diff and return structured review findings.',
  inputs: [{ key: 'worktreePath', label: 'Worktree path', required: true }]
}

/** Minimal shape of the `ctx` facade this workflow uses (see `src/main/workflow-ctx.ts`). */
interface ReviewCtx {
  input: Record<string, string>
  worktree: {
    changedFiles(worktreePath: string): Promise<Array<{ path: string; status: string }>>
  }
  agent(opts: {
    prompt: string
    expect: unknown
    cwd: string
    permission?: 'read' | 'write' | 'bypass'
  }): Promise<{ status: string; data?: unknown; question?: string; sessionId: string }>
  notify(message: string, opts?: { toast?: boolean }): Promise<void>
  log(message: string): Promise<void>
}

export async function run(ctx: ReviewCtx): Promise<void> {
  const worktreePath = ctx.input.worktreePath
  const changed = await ctx.worktree.changedFiles(worktreePath)
  await ctx.log(`review-pr: ${changed.length} changed file(s)`)

  const fileList =
    changed.length > 0
      ? changed.map((f) => `- ${f.path} (${f.status})`).join('\n')
      : '(no changed files)'
  const prompt =
    'You are reviewing the changes in this worktree. The changed files are:\n' +
    fileList +
    '\n\nInspect the changed files (read-only) and report review findings. ' +
    'Do NOT modify any files. Finish by calling emit_result with status "done" and a ' +
    '`findings` array; each finding has `file`, `severity` ("info" | "warn" | "error") ' +
    'and a one-line `summary`. If there is nothing to report, emit an empty findings array.'

  // `read` posture: the agent gets read-only tools + emit_result only — a mutating tool
  // (Edit/Write/Bash) is auto-denied, so the review provably cannot touch the worktree.
  const result = await ctx.agent({
    prompt,
    expect: FINDINGS_SCHEMA,
    cwd: worktreePath,
    permission: 'read'
  })

  // Surface the validated findings on the persisted run log so the gate can parse and
  // re-validate them against FINDINGS_SCHEMA (the agent's `data` is not otherwise persisted).
  await ctx.notify(`review-pr findings: ${JSON.stringify(result.data ?? null)}`)
}
