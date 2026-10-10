import type { AdoThreadStatus, PrThreadView } from '../../../shared/files'

/**
 * Pure decisions behind the Pull request mode's views (F4): which Overview
 * group a thread is listed in, and how a thread status reads.
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

const STATUS_LABELS: Record<AdoThreadStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  fixed: 'Fixed',
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
