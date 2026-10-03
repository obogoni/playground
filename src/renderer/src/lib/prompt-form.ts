import { PROMPT_MAX_CHARS, resolvePrompt } from '../../../shared/prompt-template'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import type { LevelOption } from './session-levels'

/**
 * The variables form's rules for the New Session dialog's prompt step, kept
 * out of the component so they are unit-tested: what the four context
 * placeholders start as, which typed values survive Back or a prompt switch,
 * and what keeps Spawn disabled.
 */

/** What the dialog knows at spawn; `null` = unknown, so the field starts empty. */
export interface PromptContext {
  taskId: number | null
  taskTitle: string | null
  branch: string | null
  worktree: string
}

/**
 * The hand-picked task wins over the one derived from the chip's branch; the
 * title falls back to the pin's cached one. A workspace chip or a detached
 * folder (`option` null) has no branch (APR-19..21).
 */
export function promptContext(
  task: SessionTask | null,
  option: LevelOption | null,
  cwd: string,
  tasks: PinnedTaskView[]
): PromptContext {
  const derived = option !== null && option.level !== 'workspace' ? option : null
  const taskId = task?.id ?? derived?.taskId ?? null
  const pinTitle =
    taskId === null ? null : (tasks.find((t) => t.id === taskId)?.details?.title ?? null)
  return {
    taskId,
    taskTitle: task?.title ?? pinTitle,
    branch: derived?.branch ?? null,
    worktree: cwd
  }
}

function contextValue(name: string, ctx: PromptContext): string {
  switch (name) {
    case 'taskId':
      return ctx.taskId === null ? '' : String(ctx.taskId)
    case 'taskTitle':
      return ctx.taskTitle ?? ''
    case 'branch':
      return ctx.branch ?? ''
    case 'worktree':
      return ctx.worktree
    default:
      return ''
  }
}

/** One value per name: context names from `ctx`, everything else empty (APR-19..22). */
export function prefillValues(names: string[], ctx: PromptContext): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, contextValue(name, ctx)]))
}

/** Keeps the typed value of every name still asked for, prefills new ones, drops the rest (APR-27/28). */
export function carryValues(
  prev: Record<string, string>,
  names: string[],
  ctx: PromptContext
): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [name, Object.hasOwn(prev, name) ? prev[name] : contextValue(name, ctx)])
  )
}

/** Spawn is enabled iff `emptyFields` is empty and `tooLong` is null (APR-23/26). */
export function formBlockers(
  values: Record<string, string>,
  names: string[],
  resolved: string
): { emptyFields: string[]; tooLong: number | null } {
  return {
    emptyFields: names.filter((name) => (values[name] ?? '').trim() === ''),
    tooLong: resolved.length > PROMPT_MAX_CHARS ? resolved.length : null
  }
}

/** The prompt the dialog previews and spawns: every value trimmed, then resolved (APR-37). */
export function resolveForm(template: string, values: Record<string, string>): string {
  const trimmed = Object.fromEntries(Object.entries(values).map(([name, v]) => [name, v.trim()]))
  return resolvePrompt(template, trimmed)
}
