/**
 * Housekeeping for the images a Ctrl+V writes to disk. A pasted screenshot is
 * read by the agent the moment its path lands, but a resumed conversation may
 * reopen it days later, so the files live for a week and are purged at app
 * start. Nothing here may block or fail startup: a missing directory and a
 * locked file are both normal, and the next start tries again.
 */

import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A pasted image survives a week, so a resumed conversation can still read it. */
export const PASTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Names strictly older than `maxAgeMs`; one exactly that old is kept. */
export function selectExpired(
  entries: { name: string; mtimeMs: number }[],
  nowMs: number,
  maxAgeMs: number
): string[] {
  return entries.filter((entry) => nowMs - entry.mtimeMs > maxAgeMs).map((entry) => entry.name)
}

/** Deletes the expired pastes in `dir`, skipping whatever it cannot read or remove. */
export function purgePasteDir(dir: string, nowMs: number): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }

  const entries: { name: string; mtimeMs: number }[] = []
  for (const name of names) {
    try {
      entries.push({ name, mtimeMs: statSync(join(dir, name)).mtimeMs })
    } catch {
      // Vanished between the listing and the stat; nothing left to purge.
    }
  }

  for (const name of selectExpired(entries, nowMs, PASTE_MAX_AGE_MS)) {
    try {
      rmSync(join(dir, name))
    } catch {
      // Locked, or not a plain file. The next start retries.
    }
  }
}
