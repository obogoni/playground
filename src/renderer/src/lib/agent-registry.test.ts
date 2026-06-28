import { describe, expect, it } from 'vitest'
import type { AgentDef } from '../../../shared/agents'
import { applyAgentEdit } from './agent-registry'

const A: AgentDef = { name: 'A', command: 'a', args: [], color: '--accent' }
const B: AgentDef = { name: 'B', command: 'b', args: [], color: '--blue' }
const C: AgentDef = { name: 'C', command: 'c', args: [], color: '--green' }

describe('applyAgentEdit', () => {
  it('appends when editKey is null (adding a new agent)', () => {
    expect(applyAgentEdit([A, B], null, C)).toEqual([A, B, C])
  })

  it('edits the agent matched by stable key, leaving others untouched (AGFK-04)', () => {
    const edited: AgentDef = { name: 'B2', command: 'b2', args: ['x'], color: '--red' }
    expect(applyAgentEdit([A, B, C], 'B', edited)).toEqual([A, edited, C])
  })

  it('targets the opened agent even after a different, lower-index agent was deleted (AGFK-01)', () => {
    // User opened the form for C (editKey 'C'), then deleted A — the list is now [B, C].
    const edited: AgentDef = { name: 'C-renamed', command: 'c', args: [], color: '--green' }
    expect(applyAgentEdit([B, C], 'C', edited)).toEqual([B, edited])
  })

  it('is a no-op (no accidental append) when the targeted agent was deleted', () => {
    // User opened the form for B, then deleted B — committing must not re-add it.
    const stale: AgentDef = { name: 'B', command: 'b-edited', args: [], color: '--blue' }
    expect(applyAgentEdit([A, C], 'B', stale)).toEqual([A, C])
  })

  it('does not mutate the input array', () => {
    const input = [A, B]
    applyAgentEdit(input, null, C)
    applyAgentEdit(input, 'A', B)
    expect(input).toEqual([A, B])
  })
})
