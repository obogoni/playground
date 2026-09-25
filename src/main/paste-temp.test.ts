import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PASTE_MAX_AGE_MS, purgePasteDir, selectExpired } from './paste-temp'

const NOW_MS = Date.UTC(2026, 8, 17, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000

describe('PASTE_MAX_AGE_MS', () => {
  it('is seven days in milliseconds (TSP-18)', () => {
    expect(PASTE_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('selectExpired', () => {
  it('selects only entries strictly older than the max age (TSP-18, TSP-39)', () => {
    const entries = [
      { name: 'older.png', mtimeMs: NOW_MS - 7 * DAY_MS - 1 },
      { name: 'exactly-seven-days.png', mtimeMs: NOW_MS - 7 * DAY_MS },
      { name: 'fresh.png', mtimeMs: NOW_MS - 1000 }
    ]

    expect(selectExpired(entries, NOW_MS, PASTE_MAX_AGE_MS)).toEqual(['older.png'])
  })

  it('selects nothing from an empty directory', () => {
    expect(selectExpired([], NOW_MS, PASTE_MAX_AGE_MS)).toEqual([])
  })
})

describe('purgePasteDir', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-paste-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** Writes `name` in the paste dir and back-dates its mtime by `ageMs`. */
  function aged(name: string, ageMs: number): void {
    const path = join(dir, name)
    writeFileSync(path, 'png bytes', 'utf8')
    const when = new Date(NOW_MS - ageMs)
    utimesSync(path, when, when)
  }

  it('deletes pasted images older than a week and keeps the rest (TSP-18)', () => {
    aged('paste-old.png', 8 * DAY_MS)
    aged('paste-ancient.png', 60 * DAY_MS)
    aged('paste-boundary.png', 7 * DAY_MS)
    aged('paste-today.png', 30 * 60 * 1000)

    purgePasteDir(dir, NOW_MS)

    expect(readdirSync(dir).sort()).toEqual(['paste-boundary.png', 'paste-today.png'])
  })

  it('does nothing when the paste directory does not exist (TSP-19)', () => {
    const missing = join(dir, 'never-created')

    expect(() => purgePasteDir(missing, NOW_MS)).not.toThrow()
    expect(existsSync(missing)).toBe(false)
  })

  it('skips an entry it cannot delete and purges the others (TSP-19)', () => {
    const stuck = join(dir, 'paste-stuck.png')
    mkdirSync(stuck)
    writeFileSync(join(stuck, 'inside.txt'), 'blocks a plain delete', 'utf8')
    const when = new Date(NOW_MS - 30 * DAY_MS)
    utimesSync(stuck, when, when)
    aged('paste-old.png', 30 * DAY_MS)

    expect(() => purgePasteDir(dir, NOW_MS)).not.toThrow()

    expect(readdirSync(dir)).toEqual(['paste-stuck.png'])
    expect(existsSync(join(stuck, 'inside.txt'))).toBe(true)
  })
})
