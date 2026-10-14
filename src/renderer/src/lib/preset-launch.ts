import type { AgentPreset } from '../../../shared/agent-presets'
import type { AgentDef } from '../../../shared/agents'
import { parsePlaceholders, type PromptEntry } from '../../../shared/prompt-template'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { isolationLevelOf, samePath } from './isolation-level'
import { formBlockers, prefillValues, promptContext, resolveForm } from './prompt-form'
import { levelOptions } from './session-levels'

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

/**
 * The New Session pre-fill a broken preset opens with: the fields of
 * `NewSessionSource` this plan sets, kept here so the lib needs no component.
 */
export interface PresetDialogSource {
  cwd?: string
  agentName?: string
  promptName?: string
}

/** What a pick does; every `cwd` is in the tree's own spelling when the tree knows it. */
export type PresetLaunchPlan =
  | { kind: 'spawn'; agentName: string; cwd: string; prompt?: string; task?: SessionTask }
  | {
      kind: 'form'
      agentName: string
      cwd: string
      promptName: string
      template: string
      /** Placeholder names in parse order (APR-12). */
      names: string[]
      /** Starting values, as New Session would pre-fill them (PRST-23). */
      values: Record<string, string>
    }
  | { kind: 'dialog'; source: PresetDialogSource }

export interface PresetLaunchInput {
  preset: AgentPreset
  cwdExists: boolean
  agents: AgentDef[]
  prompts: PromptEntry[]
  tree: WorkspaceNode[]
  tasks: PinnedTaskView[]
}

/**
 * Spawn at once when nothing is left to ask (PRST-21), ask for the empty or
 * too-long values (PRST-22), or open New Session with whatever is still valid
 * when the preset is broken (PRST-33). Starting values are exactly the ones
 * New Session shows for the cwd with the Task field on From branch (PRST-23).
 */
export function planPresetLaunch(input: PresetLaunchInput): PresetLaunchPlan {
  const { preset, cwdExists, agents, prompts, tree, tasks } = input
  // A hand-edited cwd may be spelled differently from the tree (AD-050).
  const match = isolationLevelOf(tree, preset.cwd)
  const cwd = match?.path ?? preset.cwd

  const problem = presetProblem(preset, cwdExists, agents, prompts)
  if (problem) {
    const source: PresetDialogSource = {}
    if (agents.some((a) => a.name === preset.agent)) source.agentName = preset.agent
    if (cwdExists) source.cwd = cwd
    const prompt = prompts.find((p) => p.name === preset.prompt)
    if (prompt && 'template' in prompt) source.promptName = prompt.name
    return { kind: 'dialog', source }
  }

  const agentName = preset.agent
  const prompt = prompts.find((p) => p.name === preset.prompt)
  if (!prompt || !('template' in prompt)) return { kind: 'spawn', agentName, cwd }

  const { template } = prompt
  const names = parsePlaceholders(template)
  const option = match
    ? (levelOptions(tree, match.level).find((o) => samePath(o.path, cwd)) ?? null)
    : null
  const values = prefillValues(names, promptContext(null, option, cwd, tasks))
  const resolved = resolveForm(template, values)
  const { emptyFields, tooLong } = formBlockers(values, names, resolved)
  if (emptyFields.length > 0 || tooLong !== null) {
    return { kind: 'form', agentName, cwd, promptName: prompt.name, template, names, values }
  }
  const task = presetTaskLink(names, values, tasks)
  return task
    ? { kind: 'spawn', agentName, cwd, prompt: resolved, task }
    : { kind: 'spawn', agentName, cwd, prompt: resolved }
}
