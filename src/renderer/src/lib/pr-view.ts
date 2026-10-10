import type { AdoThreadStatus, PrThreadView } from '../../../shared/files'

/**
 * Pure decisions behind the Pull request mode's views (F4): which Overview
 * group a thread is listed in, how a thread status reads, where a thread is
 * drawn in a diff, and when a newer iteration deserves a banner.
 */

/** The Overview's thread groups (FPRA-11, 13, 19, 20). */
export interface OverviewGroups {
  /** Open threads drawn in a diff. */
  active: PrThreadView[]
  /** Resolved threads drawn in a diff, shown collapsed. */
  resolved: PrThreadView[]
  /** Threads Azure DevOps could not place in the latest iteration, never drawn (FPRA-19). */
  outdated: PrThreadView[]
  /** Threads on the pull request as a whole, with no line to sit on. */
  general: PrThreadView[]
  /** System threads, in the collapsed Activity section only (FPRA-13). */
  activity: PrThreadView[]
}

/**
 * Every thread in exactly one group, in the order given — publication order.
 * Where a thread sits decides first: outdated, general and system threads
 * each have a group of their own whatever their status, and only the threads
 * drawn in a diff split by resolution. A deleted thread is listed nowhere.
 */
export function overviewGroups(threads: PrThreadView[]): OverviewGroups {
  const groups: OverviewGroups = {
    active: [],
    resolved: [],
    outdated: [],
    general: [],
    activity: []
  }
  for (const thread of threads) {
    switch (thread.place.kind) {
      case 'placed':
        groups[thread.resolution].push(thread)
        break
      case 'outdated':
        groups.outdated.push(thread)
        break
      case 'general':
        groups.general.push(thread)
        break
      case 'system':
        groups.activity.push(thread)
        break
      case 'deleted':
        break
    }
  }
  return groups
}

// [owner 2026-10-10] `fixed` reads "Resolved", as Azure DevOps' web view
// names it; every other status keeps its own name.
const STATUS_LABELS: Record<AdoThreadStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  fixed: 'Resolved',
  wontFix: "Won't fix",
  closed: 'Closed',
  byDesign: 'By design',
  unknown: 'Unknown'
}

/** How an Azure DevOps thread status reads in the view (FPRA-26). */
export function statusLabel(status: AdoThreadStatus): string {
  return STATUS_LABELS[status]
}

/**
 * The statuses a thread can be set to, in the order Azure DevOps lists them.
 * `unknown` is a status threads are read with, never one to set (FPRA-26).
 */
export const OFFERED_STATUSES: readonly Exclude<AdoThreadStatus, 'unknown'>[] = [
  'active',
  'pending',
  'fixed',
  'wontFix',
  'closed',
  'byDesign'
]

/** One thread drawn in a PR diff: a view zone after `afterLine` on its side (FPRA-18). */
export interface ThreadZone {
  /** 1-based line the zone sits under: the thread's last line. */
  afterLine: number
  thread: PrThreadView
}

/**
 * The threads one PR diff draws, per side (FPRA-18). Only threads placed in
 * this file; each sits under its own last line, one zone per thread, so two
 * threads on a line read in the order they were published. Resolved threads
 * are drawn too, collapsed by the thread itself (FPRA-20).
 */
export function zonesForFile(
  threads: PrThreadView[],
  path: string
): { left: ThreadZone[]; right: ThreadZone[] } {
  const zones: { left: ThreadZone[]; right: ThreadZone[] } = { left: [], right: [] }
  for (const thread of threads) {
    if (thread.place.kind !== 'placed' || thread.place.path !== path) continue
    zones[thread.place.side].push({ afterLine: thread.place.endLine, thread })
  }
  return zones
}

/**
 * Whether a reload found an iteration newer than the one the open diffs show,
 * so the view offers to reload them (FPRA-34). Nothing on screen yet is no
 * reason for a banner.
 */
export function newIterationBanner(onScreen: number | null, latest: number): boolean {
  return onScreen !== null && latest > onScreen
}
