import type { CSSProperties } from 'react'
import type { AgentDef } from '../../../shared/agents'

/** The ad-hoc session's stored agent label (mirrors SessionManager's constant). */
const ADHOC_AGENT = 'Ad-hoc'

/**
 * Resolve a session's tile-colour token from the registry (handoff agent→colour).
 * Ad-hoc sessions are amber; an unknown/deleted agent falls back to the default
 * accent tile (returns `undefined` so the component keeps its base styling).
 */
export function agentColor(agents: AgentDef[], agentName: string): string | undefined {
  if (agentName === ADHOC_AGENT) return '--amber'
  return agents.find((a) => a.name === agentName)?.color
}

/** Inline tile tint from a colour token: 15% mix background + token-coloured text. */
export function agentTileStyle(agents: AgentDef[], agentName: string): CSSProperties | undefined {
  const color = agentColor(agents, agentName)
  if (!color) return undefined
  return {
    background: `color-mix(in oklab, var(${color}) 15%, transparent)`,
    color: `var(${color})`
  }
}
