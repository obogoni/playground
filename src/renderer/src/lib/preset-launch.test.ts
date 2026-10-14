import { describe, expect, it } from 'vitest'
import type { AgentPreset } from '../../../shared/agent-presets'
import type { AgentDef } from '../../../shared/agents'
import type { PromptEntry } from '../../../shared/prompt-template'
import type { PinnedTaskView } from '../../../shared/tasks'
import { presetProblem, presetTaskLink } from './preset-launch'

const pin = (id: number, title: string | null): PinnedTaskView => ({
  id,
  org: 'org',
  project: 'proj',
  url: `https://dev.azure.com/org/proj/_workitems/edit/${id}`,
  details: title === null ? null : { title, type: 'Task', state: 'Active' }
})

const claude: AgentDef = { name: 'Claude', command: 'claude', args: [] }
const codex: AgentDef = { name: 'Codex', command: 'codex', args: [] }
const agents = [claude, codex]
const prompts: PromptEntry[] = [
  { name: 'review-pr', template: 'Review {{pr}}.' },
  { name: 'broken', error: 'empty' }
]
const preset: AgentPreset = { name: 'Reviewer', agent: 'Codex', cwd: 'M:/ws', prompt: 'review-pr' }

describe('presetProblem', () => {
  it('is null for a preset whose agent, folder and prompt all exist', () => {
    expect(presetProblem(preset, true, agents, prompts)).toBeNull()
    expect(presetProblem({ ...preset, prompt: undefined }, true, agents, [])).toBeNull()
  })

  it('reports agent not found when no registry agent has the name (PRST-31)', () => {
    expect(presetProblem({ ...preset, agent: 'Gemini' }, true, agents, prompts)).toBe(
      'agent not found'
    )
  })

  it('reports folder not found when the cwd is not an existing folder (PRST-31)', () => {
    expect(presetProblem(preset, false, agents, prompts)).toBe('folder not found')
  })

  it('reports prompt not found when no prompt file has the name (PRST-31)', () => {
    expect(presetProblem({ ...preset, prompt: 'gone' }, true, agents, prompts)).toBe(
      'prompt not found'
    )
  })

  it('reports prompt broken when the prompt file is listed with an error (PRST-31)', () => {
    expect(presetProblem({ ...preset, prompt: 'broken' }, true, agents, prompts)).toBe(
      'prompt broken'
    )
  })

  it('reports the first reason in PRST-31 order when several fail', () => {
    const allBad = { ...preset, agent: 'Gemini', prompt: 'gone' }
    expect(presetProblem(allBad, false, agents, prompts)).toBe('agent not found')
    expect(presetProblem({ ...allBad, agent: 'Claude' }, false, agents, prompts)).toBe(
      'folder not found'
    )
  })
})

describe('presetTaskLink', () => {
  const names = ['taskId', 'pr']

  it('links a positive integer taskId with the pinned title (PRST-29)', () => {
    expect(presetTaskLink(names, { taskId: '12345', pr: '7' }, [pin(12345, 'Fix login')])).toEqual({
      id: 12345,
      title: 'Fix login'
    })
  })

  it('links with a null title when the task is not pinned or has no cached title (PRST-29)', () => {
    expect(presetTaskLink(names, { taskId: '12345', pr: '' }, [pin(99, 'Other')])).toEqual({
      id: 12345,
      title: null
    })
    expect(presetTaskLink(names, { taskId: '12345' }, [pin(12345, null)])).toEqual({
      id: 12345,
      title: null
    })
  })

  it('links the trimmed value (APR-37)', () => {
    expect(presetTaskLink(names, { taskId: ' 42 ' }, [])).toEqual({ id: 42, title: null })
  })

  it('links nothing for a value that is not such an integer (PRST-30)', () => {
    for (const taskId of ['012', '+12', '0', '12a', '', '-5', '1.5']) {
      expect(presetTaskLink(names, { taskId }, [pin(12, 'Twelve')])).toBeUndefined()
    }
  })

  it('links nothing when the prompt has no taskId placeholder (PRST-30)', () => {
    expect(presetTaskLink(['pr'], { pr: '1', taskId: '12345' }, [])).toBeUndefined()
    expect(presetTaskLink([], {}, [])).toBeUndefined()
  })
})
