import type { AgentDef } from '../../../shared/agents'

/**
 * Computes the next agent registry after an edit form commit, keyed by a stable
 * identity (the agent's original name) instead of a positional array index.
 *
 * The index-based version corrupted config: opening the edit form captured an
 * index, and deleting a different agent at a lower index then shifted the array,
 * so the commit wrote to the wrong agent (or silently dropped the edit). Keying
 * by the original name makes the edit land on the agent the user opened,
 * regardless of concurrent list mutations.
 *
 * - `editKey === null` → adding: append `def`.
 * - `editKey` set      → editing: replace the agent whose `name === editKey`
 *   with `def`. If no agent matches (the target was deleted while the form was
 *   open) the list is returned unchanged — never an accidental append.
 */
export function applyAgentEdit(
  agents: AgentDef[],
  editKey: string | null,
  def: AgentDef
): AgentDef[] {
  if (editKey === null) return [...agents, def]
  if (!agents.some((a) => a.name === editKey)) return agents
  return agents.map((a) => (a.name === editKey ? def : a))
}
