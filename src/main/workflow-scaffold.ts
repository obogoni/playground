import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScaffoldResult } from '../shared/workflows'

/**
 * WF5 — scaffold a new workflow folder from a template (WF5-22/24). The created
 * folder is revealed by the `workflows:scaffold` handler; this module owns only
 * the pure-ish create logic (sanitise → guard existing → write template) so it
 * can be unit-tested against a temp dir like `workflow-loader`.
 */

/**
 * Reduce a display name to a safe workflow folder id (workflow **id = folder
 * name**): lowercase, every run of non-`[a-z0-9-_]` chars collapsed to a single
 * `-`, then trimmed of leading/trailing `-`. Returns `''` for a name that has no
 * usable characters (e.g. `"!!!"`), which the caller rejects.
 */
export function sanitizeWorkflowId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The minimal valid `workflow.ts` a fresh workflow starts from (loads to `{meta, run}`). */
function template(id: string): string {
  return (
    `export const meta = {\n` +
    `  name: '${id}',\n` +
    `  description: 'A new workflow',\n` +
    `  inputs: [] as { key: string; label: string; required?: boolean }[]\n` +
    `}\n\n` +
    `export async function run(ctx: any) {\n` +
    `  ctx.log('Hello from ${id}')\n` +
    `}\n`
  )
}

/**
 * Create `<root>/<id>/workflow.ts` from the template and return `{ok:true, id,
 * path}`. Rejects (`{ok:false}`, nothing written) when the name sanitises to an
 * empty id, or when the id folder already exists — an authored workflow is NEVER
 * overwritten (WF5-24). The `root` is created if missing; the id folder is made
 * non-recursively so a pre-existing folder surfaces as `EEXIST`.
 */
export async function scaffoldWorkflow(root: string, name: string): Promise<ScaffoldResult> {
  const id = sanitizeWorkflowId(name)
  if (!id) return { ok: false, error: `"${name}" is not a valid workflow name` }

  await mkdir(root, { recursive: true })
  const path = join(root, id)
  try {
    await mkdir(path)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'EEXIST') return { ok: false, error: `A workflow named "${id}" already exists` }
    return { ok: false, error: e.message }
  }

  await writeFile(join(path, 'workflow.ts'), template(id), 'utf8')
  return { ok: true, id, path }
}
