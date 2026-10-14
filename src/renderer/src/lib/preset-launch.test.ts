import { describe, expect, it } from 'vitest'
import type { AgentPreset } from '../../../shared/agent-presets'
import type { AgentDef } from '../../../shared/agents'
import type { PromptEntry } from '../../../shared/prompt-template'
import type { PinnedTaskView } from '../../../shared/tasks'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { planPresetLaunch, presetProblem, presetTaskLink } from './preset-launch'

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

describe('planPresetLaunch', () => {
  const wt = (path: string, branch: string, isDefault: boolean): WorktreeNode => ({
    id: path,
    branch,
    path,
    isDefault,
    dirty: false,
    changes: 0
  })
  /** Workspace `M:\x` holding repo `app` with a primary checkout and a task worktree. */
  const tree: WorkspaceNode[] = [
    {
      id: 'm:/x',
      path: 'M:\\x',
      displayName: 'x',
      repos: [
        {
          name: 'app',
          path: 'M:\\x\\app',
          worktrees: [
            wt('M:\\x\\app', 'main', true),
            wt('M:\\x\\app-123', 'user/otavio/123-fix-login', false)
          ]
        }
      ]
    }
  ]
  const tasks = [pin(123, 'Fix login'), pin(12345, 'Pinned twelve')]
  const prompt = (name: string, template: string): PromptEntry => ({ name, template })
  const plan = (
    p: Partial<AgentPreset>,
    promptList: PromptEntry[],
    cwdExists = true
  ): ReturnType<typeof planPresetLaunch> =>
    planPresetLaunch({
      preset: { name: 'P', agent: 'Claude', cwd: 'M:\\x', ...p },
      cwdExists,
      agents,
      prompts: promptList,
      tree,
      tasks
    })

  it('spawns without a prompt when the preset has none (PRST-21)', () => {
    expect(plan({}, prompts)).toEqual({ kind: 'spawn', agentName: 'Claude', cwd: 'M:\\x' })
  })

  it('spawns with the template text when the prompt has no placeholders (PRST-21)', () => {
    const plain = prompt('plain', 'Review the open PRs.')
    expect(plan({ prompt: 'plain' }, [plain])).toEqual({
      kind: 'spawn',
      agentName: 'Claude',
      cwd: 'M:\\x',
      prompt: 'Review the open PRs.'
    })
  })

  it('spawns a worktree prompt whose placeholders the branch fills, linked to its task (PRST-21, PRST-23, PRST-29)', () => {
    const fix = prompt('fix', 'Fix #{{taskId}} on {{branch}}.')
    expect(plan({ cwd: 'M:\\x\\app-123', prompt: 'fix' }, [fix])).toEqual({
      kind: 'spawn',
      agentName: 'Claude',
      cwd: 'M:\\x\\app-123',
      prompt: 'Fix #123 on user/otavio/123-fix-login.',
      task: { id: 123, title: 'Fix login' }
    })
  })

  it('asks for a workspace prompt whose taskId starts empty, names in parse order (PRST-22, PRST-23)', () => {
    const fix = prompt('fix', 'Fix #{{taskId}} in {{worktree}}, see {{notes}} and {{taskId}}.')
    expect(plan({ prompt: 'fix' }, [fix])).toEqual({
      kind: 'form',
      agentName: 'Claude',
      cwd: 'M:\\x',
      promptName: 'fix',
      template: 'Fix #{{taskId}} in {{worktree}}, see {{notes}} and {{taskId}}.',
      names: ['taskId', 'worktree', 'notes'],
      values: { taskId: '', worktree: 'M:\\x', notes: '' }
    })
  })

  it('asks when every value is filled but the resolved prompt is 8001 characters (PRST-22)', () => {
    // `M:\x` is 4 characters, so the resolved text is 7997 + 4 = 8001.
    const long = prompt('long', 'x'.repeat(7997) + '{{worktree}}')
    const result = plan({ prompt: 'long' }, [long])
    expect(result.kind).toBe('form')
    expect(result).toMatchObject({ names: ['worktree'], values: { worktree: 'M:\\x' } })
  })

  it('spawns when the resolved prompt is exactly 8000 characters (PRST-21)', () => {
    const edge = prompt('edge', 'x'.repeat(7996) + '{{worktree}}')
    const result = plan({ prompt: 'edge' }, [edge])
    expect(result).toEqual({
      kind: 'spawn',
      agentName: 'Claude',
      cwd: 'M:\\x',
      prompt: 'x'.repeat(7996) + 'M:\\x'
    })
  })

  it('opens New Session with only the still-valid agent, cwd and prompt when broken (PRST-33)', () => {
    const review = prompt('review-pr', 'Review {{pr}}.')
    expect(plan({ prompt: 'gone' }, [review])).toEqual({
      kind: 'dialog',
      source: { agentName: 'Claude', cwd: 'M:\\x' }
    })
    expect(plan({ agent: 'Gemini', prompt: 'review-pr' }, [review], false)).toEqual({
      kind: 'dialog',
      source: { promptName: 'review-pr' }
    })
    expect(plan({ prompt: 'broken' }, prompts)).toEqual({
      kind: 'dialog',
      source: { agentName: 'Claude', cwd: 'M:\\x' }
    })
    expect(plan({ agent: 'Gemini' }, prompts)).toEqual({
      kind: 'dialog',
      source: { cwd: 'M:\\x' }
    })
  })

  it('returns the tree spelling of a differently spelled cwd in every plan kind (AD-050)', () => {
    const plain = prompt('plain', 'Go.')
    const ask = prompt('ask', 'Do {{what}}.')
    expect(plan({ cwd: 'M:/X/' }, [])).toMatchObject({ kind: 'spawn', cwd: 'M:\\x' })
    expect(plan({ cwd: 'M:/X/', prompt: 'plain' }, [plain])).toMatchObject({
      kind: 'spawn',
      cwd: 'M:\\x'
    })
    expect(plan({ cwd: 'M:/X/', prompt: 'ask' }, [ask])).toMatchObject({
      kind: 'form',
      cwd: 'M:\\x'
    })
    expect(plan({ cwd: 'M:/X/', agent: 'Gemini' }, [])).toEqual({
      kind: 'dialog',
      source: { cwd: 'M:\\x' }
    })
  })

  it('keeps a folder the tree does not know as it is (spec Edge Cases)', () => {
    expect(plan({ cwd: 'D:/elsewhere' }, [])).toEqual({
      kind: 'spawn',
      agentName: 'Claude',
      cwd: 'D:/elsewhere'
    })
  })
})
