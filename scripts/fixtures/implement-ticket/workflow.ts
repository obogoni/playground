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
    { key: 'branch', label: 'Feature branch', required: true },
    { key: 'baseBranch', label: 'Base branch', required: false }
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
  step<T>(label: string, fn: () => Promise<T>): Promise<T>
  notify(message: string, opts?: { toast?: boolean }): Promise<void>
  log(message: string): Promise<void>
}

export async function run(ctx: ImplementCtx): Promise<void> {
  const repoPath = ctx.input.repoPath
  const branch = ctx.input.branch
  // A base branch is REQUIRED to cut a NEW branch: with a base the manager runs
  // `git worktree add <target> -b <branch> <base>`; WITHOUT one it tries to check out an
  // already-existing branch and fails `invalid reference` for a fresh branch name.
  const baseBranch = ctx.input.baseBranch || 'main'

  // Wrap the worktree + agent calls in one labeled `ctx.step` group so the hifi timeline
  // renders them indented under a bold group row with a rollup pill (WHF-14 — live group
  // rollup coverage in the two-example gate). The callback RETURNS the agent result so the
  // `notify(JSON result)` line below (which the owner smoke greps) stays verbatim, with its
  // value still in scope; a failed worktree create returns `null` to short-circuit the run.
  const result = await ctx.step(`Implement ${branch}`, async () => {
    const created = await ctx.worktree.create(repoPath, branch, baseBranch)
    if (!created.ok || !created.path) {
      await ctx.log(
        `implement-ticket: worktree create failed: ${created.error ?? 'unknown error'}`
      )
      return null
    }
    const worktreePath = created.path
    await ctx.log(`implement-ticket: worktree ready at ${worktreePath}`)

    // The ticket is under-specified ON PURPOSE and the prompt makes blocking a MANDATORY
    // first phase (not a judgement call) so the gate deterministically exercises the WF4
    // block → guidance → resume loop — a capable agent left to its own judgement would just
    // pick reasonable defaults and finish `done` without ever asking.
    const prompt =
      'You are implementing a ticket in this repository worktree.\n\n' +
      'TICKET: "Add a greeting helper module (details to be confirmed with the requester)."\n\n' +
      'This task uses a MANDATORY two-phase confirmation protocol — follow it exactly:\n\n' +
      'PHASE 1 (now): Your FIRST emit_result call MUST have status "blocked" and a single ' +
      '`question` asking the requester to confirm three things: the target filename, the ' +
      'exported function name, and the exact greeting text. Do NOT create or edit ANY file in ' +
      'this phase and do NOT guess these details — blocking to ask is required.\n\n' +
      'PHASE 2 (after you receive a guidance response): make the change EXACTLY as the ' +
      'guidance instructs, then call emit_result with status "done", a `summary` of what you ' +
      'did, and a `filesChanged` array of the paths you touched.'

    // NO pause/resume code here — the engine auto-pauses on a `blocked` emit, surfaces the
    // question (toast + workflow:blocked), and resumes THIS call with the guidance (WF4-01).
    return ctx.agent({
      prompt,
      expect: IMPLEMENT_SCHEMA,
      cwd: worktreePath,
      permission: 'write'
    })
  })

  if (!result) return

  // Surface the validated result on the persisted run log so the gate can parse it.
  await ctx.notify(`implement-ticket result: ${JSON.stringify(result.data ?? null)}`)
}
