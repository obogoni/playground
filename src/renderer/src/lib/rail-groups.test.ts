import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import type { PinnedTaskView, WorkItemDetails } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import {
  adjacentRowId,
  buildRailGroups,
  flatRows,
  headerCounts,
  statusClass,
  type OrphanGroup,
  type TaskGroup
} from './rail-groups'

/** Branches are nested on purpose: taskIdFromBranch reads only the LAST segment. */
const WT_A = { path: 'C:/code/Code-24173', branch: 'user/otavio/24173-fix-login' }
const WT_B = { path: 'C:/code/Code-24173-b', branch: 'user/vinicius/24173-fix-login-take-2' }
const WT_PLAIN = { path: 'C:/code/Code-main', branch: 'user/otavio/main' }

function tree(...worktrees: { path: string; branch: string }[]): WorkspaceNode[] {
  return [
    {
      id: 'c:/code',
      path: 'C:/code',
      displayName: 'code',
      repos: [
        {
          name: 'playground',
          path: 'C:/code/playground',
          worktrees: worktrees.map((w) => ({
            id: w.path,
            branch: w.branch,
            path: w.path,
            isDefault: false,
            dirty: false,
            changes: 0
          }))
        }
      ]
    }
  ]
}

function session(overrides: Partial<SessionView> & { id: string }): SessionView {
  return {
    agent: 'Claude',
    cwd: WT_A.path,
    title: 'Claude · 24173-fix-login',
    status: 'stopped',
    pathMissing: false,
    ...overrides
  }
}

const details: WorkItemDetails = { title: 'Fix the login redirect', type: 'Bug', state: 'Active' }

function pin(id: number, d: WorkItemDetails | null): PinnedTaskView {
  return {
    id,
    org: 'acme',
    project: 'web',
    url: `https://dev.azure.com/acme/web/_workitems/edit/${id}`,
    details: d
  }
}

const pinned = [pin(24173, details)]

function taskGroup(group: unknown): TaskGroup {
  const g = group as TaskGroup
  expect(g.kind).toBe('task')
  return g
}

function orphanGroup(group: unknown): OrphanGroup {
  const g = group as OrphanGroup
  expect(g.kind).toBe('orphan')
  return g
}

describe('buildRailGroups grouping', () => {
  it('derives the model from its arguments alone, without mutating them (RAIL-01)', () => {
    const sessions = [session({ id: 's1' }), session({ id: 's2', cwd: 'C:/elsewhere' })]
    const snapshot = JSON.parse(JSON.stringify(sessions))
    const first = buildRailGroups(sessions, tree(WT_A), pinned)
    const second = buildRailGroups(sessions, tree(WT_A), pinned)

    expect(sessions).toEqual(snapshot)
    expect(first.map((g) => g.key)).toEqual(second.map((g) => g.key))
    expect(first.map((g) => g.rows.map((r) => r.label))).toEqual(
      second.map((g) => g.rows.map((r) => r.label))
    )
  })

  it('keys a resolved session by task and an unresolved one by session id (RAIL-02)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1' }), session({ id: 's2', cwd: 'C:/elsewhere' })],
      tree(WT_A),
      pinned
    )

    expect(groups.map((g) => g.key)).toEqual(['task:24173', 'session:s2'])
  })

  it('merges two worktrees of one task and takes the header branch from the first (RAIL-03)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: WT_B.path }), session({ id: 's2', cwd: WT_A.path })],
      tree(WT_A, WT_B),
      pinned
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].rows.map((r) => r.id)).toEqual(['s1', 's2'])
    expect(taskGroup(groups[0]).branch).toBe(WT_B.branch)
  })

  it('orders groups and rows by a single in-order walk of sessions (RAIL-04)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 'z', cwd: 'C:/detached-z' }),
        session({ id: 'a' }),
        session({ id: 'b' }),
        session({ id: 'm', cwd: 'C:/detached-m' })
      ],
      tree(WT_A),
      pinned
    )

    expect(groups.map((g) => g.key)).toEqual(['session:z', 'task:24173', 'session:m'])
    expect(groups[1].rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('keeps group and row order identical when a status flips (RAIL-05)', () => {
    const stopped = [
      session({ id: 'z', cwd: 'C:/detached-z' }),
      session({ id: 'a' }),
      session({ id: 'b' })
    ]
    const running = [
      session({ id: 'z', cwd: 'C:/detached-z' }),
      session({ id: 'a', status: 'running' }),
      session({ id: 'b' })
    ]

    const before = buildRailGroups(stopped, tree(WT_A), pinned)
    const after = buildRailGroups(running, tree(WT_A), pinned)

    expect(after.map((g) => g.key)).toEqual(before.map((g) => g.key))
    expect(after.map((g) => g.rows.map((r) => r.id))).toEqual(
      before.map((g) => g.rows.map((r) => r.id))
    )
  })

  it('never merges two orphan sessions into one group (RAIL-06)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', cwd: 'C:/loose' }),
        session({ id: 's2', cwd: 'C:/loose' }),
        session({ id: 's3', cwd: WT_PLAIN.path })
      ],
      tree(WT_PLAIN),
      pinned
    )

    expect(groups.map((g) => g.key)).toEqual(['session:s1', 'session:s2', 'session:s3'])
    expect(groups.every((g) => g.rows.length === 1)).toBe(true)
  })
})

describe('buildRailGroups headers', () => {
  it('carries the pinned details and the branch for a resolved task group (RAIL-07)', () => {
    const groups = buildRailGroups([session({ id: 's1' })], tree(WT_A), pinned)
    const group = taskGroup(groups[0])

    expect(group.taskId).toBe(24173)
    expect(group.details).toEqual(details)
    expect(group.branch).toBe('user/otavio/24173-fix-login')
  })

  it('leaves details null and keeps the branch when the task is unpinned (RAIL-08)', () => {
    const groups = buildRailGroups([session({ id: 's1' })], tree(WT_A), [])
    const group = taskGroup(groups[0])

    expect(group.taskId).toBe(24173)
    expect(group.details).toBeNull()
    expect(group.branch).toBe('user/otavio/24173-fix-login')
  })

  it('leaves details null when a pinned task has not resolved its details (RAIL-08)', () => {
    const groups = buildRailGroups([session({ id: 's1' })], tree(WT_A), [pin(24173, null)])

    expect(taskGroup(groups[0]).details).toBeNull()
  })

  it('labels a cwd matching no worktree as a detached orphan (RAIL-09)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: 'C:/scratch/sandbox' })],
      tree(WT_A),
      pinned
    )
    const group = orphanGroup(groups[0])

    expect(group.reason).toBe('detached')
    expect(group.label).toBe('sandbox')
    expect(group.note).toBe('detached · sandbox')
    expect(group.rows).toHaveLength(1)
  })

  it('labels a worktree whose branch carries no id as untagged (RAIL-10)', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: WT_PLAIN.path })], tree(WT_PLAIN), [])
    const group = orphanGroup(groups[0])

    expect(group.reason).toBe('untagged')
    expect(group.label).toBe('user/otavio/main')
    expect(group.note).toBe('untagged worktree')
  })

  it('ranks a missing path above the detached note (RAIL-11)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: 'C:/gone/Code-9', pathMissing: true })],
      tree(WT_A),
      pinned
    )
    const group = orphanGroup(groups[0])

    expect(group.reason).toBe('missing')
    expect(group.note).toBe('worktree path missing')
  })

  it('ranks a missing path above the untagged note (RAIL-11)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: WT_PLAIN.path, pathMissing: true })],
      tree(WT_PLAIN),
      []
    )
    const group = orphanGroup(groups[0])

    expect(group.reason).toBe('missing')
    expect(group.note).toBe('worktree path missing')
  })

  it('keeps a path-missing session inside its task group (RAIL-11 boundary)', () => {
    const groups = buildRailGroups([session({ id: 's1', pathMissing: true })], tree(WT_A), pinned)

    expect(groups[0].key).toBe('task:24173')
    expect(groups[0].rows[0].status).toBe('path missing')
  })

  it('aria-labels a task group by id and title, and an orphan by its label (RAIL-19)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1' }), session({ id: 's2', cwd: 'C:/scratch/sandbox' })],
      tree(WT_A),
      pinned
    )

    expect(groups[0].ariaLabel).toBe('#24173 Fix the login redirect')
    expect(groups[1].ariaLabel).toBe('sandbox')
  })

  it('falls back to the branch in the aria-label when details are absent (RAIL-19)', () => {
    const groups = buildRailGroups([session({ id: 's1' })], tree(WT_A), [])

    expect(groups[0].ariaLabel).toBe('#24173 user/otavio/24173-fix-login')
  })
})

describe('buildRailGroups rows', () => {
  it('exposes only tile, label, status and action data — no branch or preview (RAIL-12)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', lastOutput: 'tail line\nsecond line' })],
      tree(WT_A),
      pinned
    )
    const row = groups[0].rows[0]

    expect(Object.keys(row).sort()).toEqual([
      'actions',
      'id',
      'label',
      'session',
      'status',
      'tooltip'
    ])
    expect(row.session.agent).toBe('Claude')
  })

  it('ordinal-suffixes duplicate agent names in group order (RAIL-13)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', agent: 'Claude' }),
        session({ id: 's2', agent: 'Codex' }),
        session({ id: 's3', agent: 'Claude' })
      ],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows.map((r) => r.label)).toEqual(['Claude 1', 'Codex', 'Claude 2'])
  })

  it('scopes the ordinal to the group, leaving a name unique per group bare (RAIL-13)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', agent: 'Claude' }), session({ id: 's2', agent: 'Claude', cwd: 'C:/x' })],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows[0].label).toBe('Claude')
    expect(groups[1].rows[0].label).toBe('Claude')
  })

  it('resolves status by running > path missing > stopped (RAIL-14)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', status: 'running', pathMissing: true }),
        session({ id: 's2', status: 'stopped', pathMissing: true }),
        session({ id: 's3', status: 'stopped' })
      ],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows.map((r) => r.status)).toEqual(['running', 'path missing', 'stopped'])
  })

  it('builds the tooltip from the session title and its branch (RAIL-15)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', title: 'Claude · login' })],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows[0].tooltip).toBe('Claude · login · user/otavio/24173-fix-login')
  })

  it('substitutes the cwd for the branch when the session is detached (RAIL-15)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', title: 'Ad-hoc · scratch', cwd: 'C:/scratch/sandbox' })],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows[0].tooltip).toBe('Ad-hoc · scratch · C:/scratch/sandbox')
  })

  it('offers Stop while running, Remove alone when path-missing, Respawn then Remove otherwise (RAIL-16)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', status: 'running' }),
        session({ id: 's2', status: 'stopped', pathMissing: true }),
        session({ id: 's3', status: 'stopped' })
      ],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows.map((r) => r.actions)).toEqual([
      ['stop'],
      ['remove'],
      ['respawn', 'remove']
    ])
  })

  it('offers Stop on a running path-missing row, running winning the action set (RAIL-16)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', status: 'running', pathMissing: true })],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows[0].actions).toEqual(['stop'])
  })

  it('gives every row the session id, unique across the whole rail (RAIL-20)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1' }), session({ id: 's2' }), session({ id: 's3', cwd: 'C:/x' })],
      tree(WT_A),
      pinned
    )
    const rows = groups.flatMap((g) => g.rows)

    expect(rows.map((r) => r.id)).toEqual(['s1', 's2', 's3'])
    expect(rows.filter((r) => r.id === 's2')).toHaveLength(1)
  })
})

describe('buildRailGroups edge cases', () => {
  it('returns no groups for an empty session list (RAIL-25)', () => {
    expect(buildRailGroups([], tree(WT_A), pinned)).toEqual([])
  })

  it('drops a group when its last session goes and keeps the rest in order (RAIL-28)', () => {
    const before = buildRailGroups(
      [
        session({ id: 'z', cwd: 'C:/detached-z' }),
        session({ id: 'a' }),
        session({ id: 'm', cwd: 'C:/detached-m' })
      ],
      tree(WT_A),
      pinned
    )
    const after = buildRailGroups(
      [session({ id: 'z', cwd: 'C:/detached-z' }), session({ id: 'm', cwd: 'C:/detached-m' })],
      tree(WT_A),
      pinned
    )

    expect(before.map((g) => g.key)).toEqual(['session:z', 'task:24173', 'session:m'])
    expect(after.map((g) => g.key)).toEqual(['session:z', 'session:m'])
  })

  it('keeps a group when one of its several sessions goes (RAIL-28)', () => {
    const after = buildRailGroups(
      [session({ id: 'a' }), session({ id: 'm', cwd: 'C:/detached-m' })],
      tree(WT_A),
      pinned
    )

    expect(after.map((g) => g.key)).toEqual(['task:24173', 'session:m'])
    expect(after[0].rows.map((r) => r.id)).toEqual(['a'])
  })
})

describe('statusClass', () => {
  it('folds the space out of path missing and passes the others through (RAIL-14)', () => {
    expect(statusClass('running')).toBe('running')
    expect(statusClass('stopped')).toBe('stopped')
    expect(statusClass('path missing')).toBe('missing')
  })
})

describe('flatRows and adjacentRowId', () => {
  /** Three groups in visual order: a two-row task group between two orphans. */
  function threeGroups(): ReturnType<typeof buildRailGroups> {
    return buildRailGroups(
      [
        session({ id: 'top', cwd: 'C:/detached-top' }),
        session({ id: 'a' }),
        session({ id: 'b' }),
        session({ id: 'bottom', cwd: 'C:/detached-bottom' })
      ],
      tree(WT_A),
      pinned
    )
  }

  it('flattens every row in visual order across group boundaries (RAIL-21)', () => {
    expect(flatRows(threeGroups()).map((r) => r.id)).toEqual(['top', 'a', 'b', 'bottom'])
  })

  it('returns no rows for an empty model (RAIL-25)', () => {
    expect(flatRows([])).toEqual([])
  })

  it('moves down across a group boundary (RAIL-21)', () => {
    const groups = threeGroups()

    expect(adjacentRowId(groups, 'top', 1)).toBe('a')
    expect(adjacentRowId(groups, 'b', 1)).toBe('bottom')
  })

  it('leaves focus on the last row when there is no next row (RAIL-21)', () => {
    expect(adjacentRowId(threeGroups(), 'bottom', 1)).toBe('bottom')
  })

  it('moves up across a group boundary (RAIL-22)', () => {
    const groups = threeGroups()

    expect(adjacentRowId(groups, 'a', -1)).toBe('top')
    expect(adjacentRowId(groups, 'bottom', -1)).toBe('b')
  })

  it('leaves focus on the first row when there is no previous row (RAIL-22)', () => {
    expect(adjacentRowId(threeGroups(), 'top', -1)).toBe('top')
  })

  it('returns null for a row id the model no longer holds (RAIL-21, RAIL-22)', () => {
    const groups = threeGroups()

    expect(adjacentRowId(groups, 'removed', 1)).toBeNull()
    expect(adjacentRowId(groups, 'removed', -1)).toBeNull()
  })
})

describe('rail rows with agent activity', () => {
  const running = (activity?: SessionView['activity']): SessionView =>
    session({ id: 's1', status: 'running', ...(activity ? { activity } : {}) })

  const statusOf = (s: SessionView): string =>
    flatRows(buildRailGroups([s], tree(WT_A), []))[0].status

  const tooltipOf = (s: SessionView): string =>
    flatRows(buildRailGroups([s], tree(WT_A), []))[0].tooltip

  it.each([
    ['working', 'working'],
    ['compacting', 'compacting'],
    ['waiting', 'waiting'],
    ['needs-approval', 'approval'],
    ['needs-input', 'input'],
    ['error', 'error'],
    ['exited', 'shell']
  ])('labels a session whose agent reports %s as %s', (state, label) => {
    expect(statusOf(running({ state: state as never, subagents: 0 }))).toBe(label)
  })

  it('keeps the bare running label when the agent reports nothing (ACTV-19)', () => {
    expect(statusOf(running())).toBe('running')
  })

  it('keeps stopped and path-missing rows exactly as they were (ACTV-19)', () => {
    expect(statusOf(session({ id: 's1' }))).toBe('stopped')
    expect(statusOf(session({ id: 's1', pathMissing: true }))).toBe('path missing')
  })

  it.each(['working', 'waiting', 'needs-approval', 'error', 'exited'])(
    'offers Stop and nothing else while the agent is %s',
    (state) => {
      const rows = flatRows(
        buildRailGroups([running({ state: state as never, subagents: 0 })], tree(WT_A), [])
      )
      expect(rows[0].actions).toEqual(['stop'])
    }
  )

  it('names the running tool in the tooltip (ACTV-24)', () => {
    expect(tooltipOf(running({ state: 'working', tool: 'Bash', subagents: 0 }))).toBe(
      'Claude · 24173-fix-login · user/otavio/24173-fix-login · Bash'
    )
  })

  it('keeps the raw MCP tool name in the tooltip (STRP-06)', () => {
    const tooltip = tooltipOf(
      running({ state: 'working', tool: 'mcp__azure-devops__wit_work_item', subagents: 0 })
    )
    expect(tooltip).toBe(
      'Claude · 24173-fix-login · user/otavio/24173-fix-login · mcp__azure-devops__wit_work_item'
    )
    expect(tooltip).not.toContain('MCP azure-devops')
  })

  it.each([
    [1, '1 subagent'],
    [3, '3 subagents']
  ])('counts %i active subagents in the tooltip (ACTV-25)', (subagents, text) => {
    expect(tooltipOf(running({ state: 'working', subagents }))).toContain(` · ${text}`)
  })

  it('names the API error in the tooltip (ACTV-26)', () => {
    expect(tooltipOf(running({ state: 'error', subagents: 0, error: 'rate_limit' }))).toContain(
      ' · rate_limit'
    )
  })

  it('leaves the tooltip byte-identical when the agent reports nothing (RAIL-15)', () => {
    expect(tooltipOf(running())).toBe('Claude · 24173-fix-login · user/otavio/24173-fix-login')
  })

  it('does not reorder rows when a status changes (RAIL-04, RAIL-05)', () => {
    const before = buildRailGroups(
      [
        session({ id: 'a', status: 'running', activity: { state: 'waiting', subagents: 0 } }),
        session({ id: 'b', status: 'running', cwd: WT_B.path })
      ],
      tree(WT_A, WT_B),
      []
    )
    const after = buildRailGroups(
      [
        session({ id: 'a', status: 'running', activity: { state: 'error', subagents: 0 } }),
        session({ id: 'b', status: 'running', cwd: WT_B.path })
      ],
      tree(WT_A, WT_B),
      []
    )

    expect(flatRows(after).map((r) => r.id)).toEqual(flatRows(before).map((r) => r.id))
  })
})

describe('headerCounts', () => {
  const s = (id: string, activity?: SessionView['activity']): SessionView =>
    session({ id, status: 'running', ...(activity ? { activity } : {}) })

  it('counts working and compacting agents as working (ACTV-22)', () => {
    const counts = headerCounts([
      s('a', { state: 'working', subagents: 0 }),
      s('b', { state: 'compacting', subagents: 0 }),
      s('c', { state: 'waiting', subagents: 0 })
    ])

    // `waiting` is not "needs you": ACTV-23 names only approval, input and error.
    expect(counts).toEqual({ running: 3, working: 2, needYou: 0 })
  })

  it('counts blocked and failed agents as needing the user (ACTV-23)', () => {
    const counts = headerCounts([
      s('a', { state: 'needs-approval', subagents: 0 }),
      s('b', { state: 'needs-input', subagents: 0 }),
      s('c', { state: 'error', subagents: 0 })
    ])

    expect(counts.needYou).toBe(3)
  })

  it('counts live shells as running whether or not they report activity', () => {
    const counts = headerCounts([
      s('a'),
      s('b', { state: 'working', subagents: 0 }),
      session({ id: 'c' })
    ])

    expect(counts).toEqual({ running: 2, working: 1, needYou: 0 })
  })
})

describe("rail rows with the agent's session name (AD-040)", () => {
  const named = (id: string, name: string, overrides: Partial<SessionView> = {}): SessionView =>
    session({ id, status: 'running', name, ...overrides })

  it('labels the row with the name Claude gives the session (SNAME-01)', () => {
    const [row] = flatRows(buildRailGroups([named('s1', 'alpha')], tree(WT_A), pinned))

    expect(row.label).toBe('alpha')
  })

  it('keeps the agent name for unnamed, ad-hoc and stopped sessions (SNAME-03)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', status: 'running' }),
        session({ id: 's2', agent: 'Ad-hoc', status: 'running' }),
        session({ id: 's3', agent: 'Codex', status: 'stopped' })
      ],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows.map((r) => r.label)).toEqual(['Claude', 'Ad-hoc', 'Codex'])
  })

  it('ordinal-suffixes two rows that share a name in one group (SNAME-06)', () => {
    const groups = buildRailGroups(
      [named('s1', 'refactor'), named('s2', 'refactor')],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows.map((r) => r.label)).toEqual(['refactor 1', 'refactor 2'])
  })

  it('leaves a named row bare beside agent-named rows that collide (SNAME-06)', () => {
    const groups = buildRailGroups(
      [
        named('s1', 'alpha'),
        session({ id: 's2', status: 'running' }),
        session({ id: 's3', status: 'running' })
      ],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows.map((r) => r.label)).toEqual(['alpha', 'Claude 1', 'Claude 2'])
  })

  it('scopes the ordinal to the group, leaving a name unique per group bare (SNAME-06)', () => {
    const groups = buildRailGroups(
      [named('s1', 'alpha'), named('s2', 'alpha', { cwd: 'C:/x' })],
      tree(WT_A),
      pinned
    )

    expect(groups[0].rows[0].label).toBe('alpha')
    expect(groups[1].rows[0].label).toBe('alpha')
  })

  it('reads `<agent> · <name>` in the tooltip in place of the title (SNAME-05)', () => {
    const [row] = flatRows(
      buildRailGroups([named('s1', 'alpha', { title: 'renamed by hand' })], tree(WT_A), pinned)
    )

    expect(row.tooltip).toBe('Claude · alpha · user/otavio/24173-fix-login')
  })

  it('keeps the activity detail after the name in the tooltip (SNAME-05, ACTV-24)', () => {
    const [row] = flatRows(
      buildRailGroups(
        [named('s1', 'alpha', { activity: { state: 'working', tool: 'Bash', subagents: 0 } })],
        tree(WT_A),
        pinned
      )
    )

    expect(row.tooltip).toBe('Claude · alpha · user/otavio/24173-fix-login · Bash')
  })

  it('changes neither the group head nor the header counts (SNAME-07)', () => {
    const sessions = [named('s1', 'alpha'), named('s2', 'beta')]
    const groups = buildRailGroups(sessions, tree(WT_A), pinned)

    expect(groups[0].ariaLabel).toBe('#24173 Fix the login redirect')
    expect(headerCounts(sessions)).toEqual({ running: 2, working: 0, needYou: 0 })
  })

  it('still hands the component the agent for the tile (SNAME-07, RAIL-12)', () => {
    const [row] = flatRows(buildRailGroups([named('s1', 'alpha')], tree(WT_A), pinned))

    expect(row.session.agent).toBe('Claude')
  })
})
