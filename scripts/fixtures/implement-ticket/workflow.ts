/**
 * WF4 gate example (WF4-16): an "implement a ticket" workflow that provokes the
 * engine-driven blocker/resume loop. It creates a worktree (WF2 `ctx.worktree.create`),
 * then hands a DELIBERATELY under-specified ticket to a `write`-posture `ctx.agent` step.
 * The step's prompt instructs the agent to emit `status:'blocked'` with a clarifying
 * question before writing anything — so the run pauses, a `workflow:blocked` fires, and a
 * `workflows:respond` guidance resumes the SAME session until the agent finishes `done`.
 *
 * Crucially the author writes **no** pause/resume logic: `await ctx.agent(...)` resolves
 * `done` after any number of block↔guidance rounds (the engine handles the loop, WF4-01).
 * The owner-run smoke (`scripts/smoke-blocker-resume.mjs`) drives this end-to-end.
 *
 * Self-contained on purpose (mirrors `review-pr`): no cross-package imports, because the
 * smoke script seeds a COPY of this file under `~/.playground/workflows/implement-ticket/`
 * and esbuild bundles that copy — a relative import into `src/` would break once copied.
 * `ctx` is typed with a local minimal interface mirroring the real `Ctx` facade.
 */

/** The result contract the agent must satisfy once it finishes (status `done`). */
export const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary']
}

export const meta = {
  name: 'Implement Ticket',
  description:
    'Create a worktree and have an agent implement a ticket, pausing to ask when the ticket is ambiguous.',
  inputs: [
    { key: 'repoPath', label: 'Repository path', required: true },
    { key: 'branch', label: 'Feature branch', required: true }
  ]
}

/** Minimal shape of the `ctx` facade this workflow uses (see `src/main/workflow-ctx.ts`). */
interface ImplementCtx {
  input: Record<string, string>
  worktree: {
    create(
      repoPath: string,
      branch: string,
      baseBranch?: string
    ): Promise<{ ok: boolean; path?: string; error?: string }>
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

export async function run(ctx: ImplementCtx): Promise<void> {
  const repoPath = ctx.input.repoPath
  const branch = ctx.input.branch

  const created = await ctx.worktree.create(repoPath, branch)
  if (!created.ok || !created.path) {
    await ctx.log(`implement-ticket: worktree create failed: ${created.error ?? 'unknown error'}`)
    return
  }
  const worktreePath = created.path
  await ctx.log(`implement-ticket: worktree ready at ${worktreePath}`)

  // The ticket is under-specified ON PURPOSE: it names no file, no function name, and no
  // greeting text. A good agent must ask before writing — that ask is the blocker we test.
  const prompt =
    'You are implementing a ticket in this repository worktree.\n\n' +
    'TICKET: "Add a greeting helper module."\n\n' +
    'The ticket is intentionally under-specified — it does not say which file to create, ' +
    'what to name the function, or what the greeting text should be. Before writing ANY ' +
    'code, if a critical detail is missing or ambiguous you MUST call the emit_result tool ' +
    'with status "blocked" and a single clear `question` asking for the missing detail. Do ' +
    'NOT guess and do NOT create files yet.\n\n' +
    'Once you receive guidance on a resumed turn, make the change, then finish by calling ' +
    'emit_result with status "done", a `summary` of what you did, and a `filesChanged` ' +
    'array of the paths you touched.'

  // NO pause/resume code here — the engine auto-pauses on a `blocked` emit, surfaces the
  // question (toast + workflow:blocked), and resumes THIS call with the guidance (WF4-01).
  const result = await ctx.agent({
    prompt,
    expect: IMPLEMENT_SCHEMA,
    cwd: worktreePath,
    permission: 'write'
  })

  // Surface the validated result on the persisted run log so the gate can parse it.
  await ctx.notify(`implement-ticket result: ${JSON.stringify(result.data ?? null)}`)
}
