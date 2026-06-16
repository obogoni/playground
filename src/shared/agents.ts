import type { AgentDef } from '../main/spawn-plan'

/**
 * The fixed seed agent list for AM2. Both main (to resolve a session's stored
 * agent name to its launch definition) and the renderer (to render the agent
 * chips in the New Session dialog) import this. AM3 relocates the list into
 * `AppConfig` behind a Settings editor; until then it is a shared constant.
 *
 * Commands mirror `design/handoff/DESIGN_HANDOFF_AGENTS.md`. The `AgentDef`
 * type lives in `spawn-plan.ts`; the import is type-only, so this shared module
 * pulls no main-process code into the renderer bundle.
 */
export const SEEDED_AGENTS: AgentDef[] = [
  { name: 'Claude', command: 'claude', args: [], color: '--accent' },
  { name: 'Copilot', command: 'gh', args: ['copilot'], color: '--blue' },
  { name: 'Codex', command: 'codex', args: ['--full-auto'], color: '--green' }
]
