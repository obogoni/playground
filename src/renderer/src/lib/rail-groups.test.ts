import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import type { PinnedTaskView, WorkItemDetails } from '../../../shared/tasks'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import {
  adjacentRowId,
  buildRailGroups,
  flatRows,
  headerCounts,
  railRowEqual,
  statusClass,
  type RailRow,
  type LevelGroup,
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

describe('buildRailGroups with a linked task (HTSK-11, HTSK-20)', () => {
  const WT_DEVELOP = { path: 'C:/code/playground', branch: 'develop' }
  const WT_12345 = { path: 'C:/code/Code-12345', branch: 'feature/12345-x' }
  const WT_67890 = { path: 'C:/code/Code-67890', branch: 'feature/67890-x' }
  const linked = { id: 4821, title: 'Diagnose login loop' }

  it('puts a detached session linked to a task in that task group, not an orphan', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: 'C:/scratch/notes', task: linked })],
      tree(WT_A),
      pinned
    )

    expect(groups.map((g) => g.key)).toEqual(['task:4821'])
    expect(taskGroup(groups[0]).taskId).toBe(4821)
  })

  it("puts a session linked to another task than its branch's in the linked task's group", () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: WT_67890.path, task: { id: 12345, title: null } })],
      tree(WT_67890),
      pinned
    )

    expect(groups.map((g) => g.key)).toEqual(['task:12345'])
  })

  it('shares one group between an unlinked and a linked session of one task, in persisted order', () => {
    const groups = buildRailGroups(
      [
        session({ id: 'branch-one', cwd: WT_12345.path }),
        session({ id: 'orphan', cwd: 'C:/scratch/other' }),
        session({
          id: 'linked-one',
          cwd: WT_DEVELOP.path,
          task: { id: 12345, title: 'Fix login redirect' }
        })
      ],
      tree(WT_12345, WT_DEVELOP),
      []
    )

    expect(groups.map((g) => g.key)).toEqual(['task:12345', 'session:orphan'])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['branch-one', 'linked-one'])
    expect(taskGroup(groups[0]).title).toBe('Fix login redirect')
  })

  it("carries an unpinned link's title, and names the group by it", () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: WT_DEVELOP.path, task: linked })],
      tree(WT_DEVELOP),
      []
    )
    const group = taskGroup(groups[0])

    expect(group.title).toBe('Diagnose login loop')
    expect(group.details).toBeNull()
    expect(group.branch).toBe('develop')
    expect(group.ariaLabel).toBe('#4821 Diagnose login loop')
  })

  it('carries a null title for a link without one, and keeps the branch', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: WT_DEVELOP.path, task: { id: 4821, title: null } })],
      tree(WT_DEVELOP),
      []
    )
    const group = taskGroup(groups[0])

    expect(group.title).toBeNull()
    expect(group.branch).toBe('develop')
    expect(group.ariaLabel).toBe('#4821 develop')
  })

  it("takes the title from the group's first linked session, even when it has none", () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', cwd: WT_DEVELOP.path, task: { id: 4821, title: null } }),
        session({ id: 's2', cwd: 'C:/scratch/notes', task: linked })
      ],
      tree(WT_DEVELOP),
      []
    )

    expect(groups).toHaveLength(1)
    expect(taskGroup(groups[0]).title).toBeNull()
  })

  it('builds the same groups as before for unlinked sessions, with a null title', () => {
    const groups = buildRailGroups(
      [
        session({ id: 's1', cwd: WT_A.path }),
        session({ id: 's2', cwd: WT_DEVELOP.path }),
        session({ id: 's3', cwd: 'C:/scratch/notes' })
      ],
      tree(WT_A, WT_DEVELOP),
      pinned
    )

    expect(groups.map((g) => g.key)).toEqual(['task:24173', 'session:s2', 'session:s3'])
    const task = taskGroup(groups[0])
    expect(task.title).toBeNull()
    expect(task.branch).toBe(WT_A.branch)
    expect(task.ariaLabel).toBe('#24173 Fix the login redirect')
    expect(orphanGroup(groups[1]).reason).toBe('untagged')
    expect(orphanGroup(groups[2]).reason).toBe('detached')
  })
})

describe('buildRailGroups level groups (ISO-08, ISO-09)', () => {
  const MAIN = { id: 'M:/Work/api', path: 'M:/Work/api', branch: 'develop', isDefault: true }
  const TASK_MAIN = {
    id: 'M:/Work/web',
    path: 'M:/Work/web',
    branch: 'user/otavio/24173-fix-login',
    isDefault: true
  }
  const LINKED = {
    id: 'M:/Work/api-main',
    path: 'M:/Work/api-main',
    branch: 'spike',
    isDefault: false
  }
  const SIDE_MAIN = { id: 'D:/Side/api', path: 'D:/Side/api', branch: 'trunk', isDefault: true }

  function node(w: { id: string; path: string; branch: string; isDefault: boolean }): WorktreeNode {
    return { ...w, dirty: false, changes: 0 }
  }

  const levelTree: WorkspaceNode[] = [
    {
      id: 'm:/work',
      path: 'M:/Work',
      displayName: 'Work projects',
      repos: [
        { name: 'api', path: 'M:/Work/api', worktrees: [node(MAIN), node(LINKED)] },
        { name: 'web', path: 'M:/Work/web', worktrees: [node(TASK_MAIN)] }
      ]
    },
    {
      id: 'd:/side',
      path: 'D:/Side',
      displayName: 'side',
      repos: [{ name: 'api', path: 'D:/Side/api', worktrees: [node(SIDE_MAIN)] }]
    }
  ]

  function levelGroup(group: unknown): LevelGroup {
    const g = group as LevelGroup
    expect(g.kind).toBe('level')
    return g
  }

  it('labels a task-less workspace session `Workspace · <displayName>` (Rail group AC 1)', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: 'M:/Work' })], levelTree, [])
    const group = levelGroup(groups[0])

    expect(group.level).toBe('workspace')
    expect(group.label).toBe('Workspace · Work projects')
    expect(group.note).toBe('Work')
    expect(group.ariaLabel).toBe('Workspace · Work projects')
    expect(group.key).toBe('level:m:/work')
    expect(group.rows.map((r) => r.id)).toEqual(['s1'])
  })

  it('labels a task-less repo session `Repo · <name>` with its branch as the note (Rail group AC 2)', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: 'M:/Work/api' })], levelTree, [])
    const group = levelGroup(groups[0])

    expect(group.level).toBe('repo')
    expect(group.label).toBe('Repo · api')
    expect(group.note).toBe('develop')
    expect(group.ariaLabel).toBe('Repo · api')
  })

  it('shares one group between sessions at the same level and path, in persisted order (Rail group AC 3)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 'a', cwd: 'M:/Work' }),
        session({ id: 'x', cwd: 'C:/scratch/sandbox' }),
        session({ id: 'b', cwd: 'm:\\work\\' })
      ],
      levelTree,
      []
    )

    expect(groups.map((g) => g.key)).toEqual(['level:m:/work', 'session:x'])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('keeps same-named repos of two workspaces in separate groups (Edge Case "same repo name")', () => {
    const groups = buildRailGroups(
      [session({ id: 'a', cwd: 'M:/Work/api' }), session({ id: 'b', cwd: 'D:/Side/api' })],
      levelTree,
      []
    )

    expect(groups.map((g) => g.key)).toEqual(['level:m:/work/api', 'level:d:/side/api'])
    expect(groups.map((g) => levelGroup(g).label)).toEqual(['Repo · api', 'Repo · api'])
    expect(groups.map((g) => levelGroup(g).note)).toEqual(['develop', 'trunk'])
  })

  it('puts a primary checkout whose branch carries a task in the task group (Rail group AC 4)', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: 'M:/Work/web' })], levelTree, pinned)

    expect(groups.map((g) => g.key)).toEqual(['task:24173'])
    expect(taskGroup(groups[0]).taskId).toBe(24173)
  })

  it('puts a hand-linked workspace session in its task group (Rail group AC 4)', () => {
    const groups = buildRailGroups(
      [session({ id: 's1', cwd: 'M:/Work', task: { id: 4821, title: 'Brainstorm' } })],
      levelTree,
      []
    )

    expect(groups.map((g) => g.key)).toEqual(['task:4821'])
  })

  it('keeps the `worktree path missing` orphan for a missing workspace or repo session (Rail group AC 5)', () => {
    const groups = buildRailGroups(
      [
        session({ id: 'w', cwd: 'M:/Work', pathMissing: true }),
        session({ id: 'r', cwd: 'M:/Work/api', pathMissing: true })
      ],
      levelTree,
      []
    )

    expect(groups.map((g) => g.key)).toEqual(['session:w', 'session:r'])
    for (const g of groups) {
      expect(orphanGroup(g).reason).toBe('missing')
      expect(orphanGroup(g).note).toBe('worktree path missing')
    }
  })

  it('gives a task-less linked worktree session no level group (Rail group AC 6)', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: LINKED.path })], levelTree, [])
    const group = orphanGroup(groups[0])

    expect(group.key).toBe('session:s1')
    expect(group.reason).toBe('untagged')
    expect(group.note).toBe('untagged worktree')
  })

  it('keeps a session with no level detached (Rail group AC 6)', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: 'M:/Work/api/src' })], levelTree, [])

    expect(orphanGroup(groups[0]).note).toBe('detached · src')
  })

  it('falls back to `detached · <folder>` once the workspace leaves the tree (Edge Case "workspace removed")', () => {
    const groups = buildRailGroups([session({ id: 's1', cwd: 'M:/Work' })], levelTree.slice(1), [])
    const group = orphanGroup(groups[0])

    expect(group.key).toBe('session:s1')
    expect(group.reason).toBe('detached')
    expect(group.note).toBe('detached · Work')
  })
})

describe('railRowEqual (PERF-09)', () => {
  const sessions = [
    session({ id: 's1', status: 'running', activity: { state: 'working', subagents: 0 } }),
    session({ id: 's2' })
  ]
  const rowsOf = (): RailRow[] => flatRows(buildRailGroups(sessions, tree(WT_A), pinned))

  it('treats the fresh rows of two runs over the same inputs as equal', () => {
    const first = rowsOf()
    const second = rowsOf()

    expect(second[0]).not.toBe(first[0])
    expect(second[0].actions).not.toBe(first[0].actions)
    expect(railRowEqual(first[0], second[0])).toBe(true)
    expect(railRowEqual(first[1], second[1])).toBe(true)
  })

  it('compares actions element by element', () => {
    const [row] = rowsOf()

    expect(railRowEqual(row, { ...row, actions: ['stop'] })).toBe(true)
    expect(railRowEqual(row, { ...row, actions: ['respawn', 'remove'] })).toBe(false)
    expect(railRowEqual(row, { ...row, actions: ['stop', 'remove'] })).toBe(false)
  })

  it('is not equal when the id differs', () => {
    const [row] = rowsOf()
    expect(railRowEqual(row, { ...row, id: 'other' })).toBe(false)
  })

  it('is not equal when the label differs', () => {
    const [row] = rowsOf()
    expect(railRowEqual(row, { ...row, label: 'Claude 2' })).toBe(false)
  })

  it('is not equal when the status differs', () => {
    const [row] = rowsOf()
    expect(railRowEqual(row, { ...row, status: 'waiting' })).toBe(false)
  })

  it('is not equal when the tooltip differs', () => {
    const [row] = rowsOf()
    expect(railRowEqual(row, { ...row, tooltip: `${row.tooltip} · Bash` })).toBe(false)
  })

  it('compares the session by identity, not by content', () => {
    const [row] = rowsOf()
    expect(railRowEqual(row, { ...row, session: { ...row.session } })).toBe(false)
  })
})
