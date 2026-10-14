import type { AgentPreset } from '../../../shared/agent-presets'
import type { AgentDef } from '../../../shared/agents'
import type { PromptEntry } from '../../../shared/prompt-template'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'

/**
 * What picking an agent preset does, kept out of the components so it is
 * unit-tested: why a preset cannot launch, which task a `{{taskId}}` value
 * links, and whether the pick spawns at once, asks for values, or opens the
 * full New Session dialog.
 */

/** Why a preset's own fields stop it from launching (PRST-31). */
export type PresetProblem =
  | 'agent not found'
  | 'folder not found'
  | 'prompt not found'
  | 'prompt broken'

/** The first failing reason in PRST-31's order, or null when the preset can launch. */
export function presetProblem(
  preset: AgentPreset,
  cwdExists: boolean,
  agents: AgentDef[],
  prompts: PromptEntry[]
): PresetProblem | null {
  if (!agents.some((a) => a.name === preset.agent)) return 'agent not found'
  if (!cwdExists) return 'folder not found'
  if (preset.prompt === undefined) return null
  const prompt = prompts.find((p) => p.name === preset.prompt)
  if (!prompt) return 'prompt not found'
  return 'error' in prompt ? 'prompt broken' : null
}

/** A positive integer with no sign and no leading zero (PRST-29). */
const TASK_ID = /^[1-9][0-9]*$/

/**
 * The task a spawned prompt links: its `{{taskId}}` value when that is a
 * positive integer, titled from the pin when pinned (PRST-29); otherwise none,
 * so the session follows its branch (PRST-30).
 */
export function presetTaskLink(
  names: string[],
  values: Record<string, string>,
  tasks: PinnedTaskView[]
): SessionTask | undefined {
  if (!names.includes('taskId')) return undefined
  const value = (values.taskId ?? '').trim()
  if (!TASK_ID.test(value)) return undefined
  const id = Number(value)
  return { id, title: tasks.find((t) => t.id === id)?.details?.title ?? null }
}
