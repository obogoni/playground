import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OpenPeriod, TimePeriod } from '../shared/time'
import { TimeLogStore } from './time-log-store'

function period(id: string, start = '2026-09-16T12:00:00.000Z'): TimePeriod {
  return {
    id,
    sessionId: 's1',
    agent: 'Claude',
    cwd: 'D:\\acme\\app-12345',
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch: 'feature/12345-fix-login-redirect',
    taskId: 12345,
    taskTitle: 'Fix login redirect',
    start,
    end: '2026-09-16T14:40:00.000Z'
  }
}

function openPeriod(id: string): OpenPeriod {
  const { end: _end, ...rest } = period(id)
  void _end
  return { ...rest, lastSeen: '2026-09-16T13:00:00.000Z' }
}

describe('TimeLogStore', () => {
  let dir: string
  let logged: unknown[][]
  const log = (...args: unknown[]): void => {
    logged.push(args)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-time-'))
    logged = []
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads nothing when neither file exists', () => {
    const store = new TimeLogStore(dir, log)

    expect(store.readPeriods()).toEqual({ periods: [], skipped: 0 })
    expect(store.readOpen()).toEqual([])
  })

  it('round-trips appended periods as versioned JSON lines (TIME-02)', () => {
    const store = new TimeLogStore(dir, log)
    store.append(period('a'))
    store.append(period('b'))

    const lines = readFileSync(join(dir, 'time-log.jsonl'), 'utf8').trim().split('\n')
    expect(lines.map((l) => JSON.parse(l).v)).toEqual([1, 1])
    expect(new TimeLogStore(dir, log).readPeriods()).toEqual({
      periods: [period('a'), period('b')],
      skipped: 0
    })
  })

  it('skips invalid lines and unknown versions, keeps every valid line and logs once (TIME-13)', () => {
    const valid = (id: string): string => JSON.stringify({ v: 1, ...period(id) })
    writeFileSync(
      join(dir, 'time-log.jsonl'),
      [
        valid('a'),
        '{ not json',
        JSON.stringify({ v: 2, ...period('future') }),
        JSON.stringify({ v: 1, id: 'missing-fields' }),
        valid('b'),
        ''
      ].join('\n'),
      'utf8'
    )

    const store = new TimeLogStore(dir, log)

    expect(store.readPeriods()).toEqual({ periods: [period('a'), period('b')], skipped: 3 })
    expect(logged).toHaveLength(1)
  })

  it('rewrites the log atomically, replacing its content and leaving no tmp file (TIME-48)', () => {
    const store = new TimeLogStore(dir, log)
    store.append(period('a'))
    store.append(period('b'))

    store.rewrite([period('b')])

    expect(store.readPeriods().periods).toEqual([period('b')])
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('writes and reads the open sidecar; an empty list writes an empty array (TIME-04)', () => {
    const store = new TimeLogStore(dir, log)

    store.writeOpen([openPeriod('o1')])
    expect(new TimeLogStore(dir, log).readOpen()).toEqual([openPeriod('o1')])

    store.writeOpen([])
    expect(JSON.parse(readFileSync(join(dir, 'time-open.json'), 'utf8'))).toEqual([])
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('backs up a corrupt sidecar as time-open.json.bak-<epoch> and reads it as empty', () => {
    writeFileSync(join(dir, 'time-open.json'), '{ corrupt', 'utf8')

    const store = new TimeLogStore(dir, log)

    expect(store.readOpen()).toEqual([])
    expect(existsSync(join(dir, 'time-open.json'))).toBe(false)
    const backups = readdirSync(dir).filter((f) => /^time-open\.json\.bak-\d+$/.test(f))
    expect(backups).toHaveLength(1)
    expect(readFileSync(join(dir, backups[0]), 'utf8')).toBe('{ corrupt')
  })

  it('queues an append that fails and flushes it with the next successful write (TIME-14)', () => {
    const logDir = join(dir, 'data')
    writeFileSync(logDir, 'a file where the directory should be', 'utf8')
    const store = new TimeLogStore(logDir, log)

    store.append(period('a'))
    expect(logged.length).toBeGreaterThan(0)

    rmSync(logDir)
    mkdirSync(logDir)
    store.append(period('b'))

    expect(store.readPeriods().periods).toEqual([period('a'), period('b')])
  })

  it('leaves the previous log and sidecar intact when a write fails before the rename (TIME-48)', () => {
    const store = new TimeLogStore(dir, log)
    store.append(period('a'))
    store.append(period('b'))
    store.writeOpen([openPeriod('o1')])
    const logBefore = readFileSync(join(dir, 'time-log.jsonl'), 'utf8')
    const openBefore = readFileSync(join(dir, 'time-open.json'), 'utf8')
    mkdirSync(join(dir, 'time-log.jsonl.tmp'))
    mkdirSync(join(dir, 'time-open.json.tmp'))

    store.rewrite([period('b')])
    store.writeOpen([])

    expect(readFileSync(join(dir, 'time-log.jsonl'), 'utf8')).toBe(logBefore)
    expect(readFileSync(join(dir, 'time-open.json'), 'utf8')).toBe(openBefore)
  })

  it('retries a failed rewrite with the next append, so an edit never resurfaces (TIME-14)', () => {
    const store = new TimeLogStore(dir, log)
    store.append(period('a'))
    store.append(period('b'))
    // A directory where the tmp file goes makes the rewrite fail before the rename.
    mkdirSync(join(dir, 'time-log.jsonl.tmp'))

    store.rewrite([period('b')])
    expect(logged.length).toBeGreaterThan(0)

    rmSync(join(dir, 'time-log.jsonl.tmp'), { recursive: true })
    store.append(period('c'))

    expect(new TimeLogStore(dir, log).readPeriods().periods).toEqual([period('b'), period('c')])

    // Once the retry lands, appends go back to appending: nothing since is lost.
    store.append(period('d'))
    expect(new TimeLogStore(dir, log).readPeriods().periods).toEqual([
      period('b'),
      period('c'),
      period('d')
    ])
  })

  it('keeps retrying a failed rewrite across further failing appends (TIME-14)', () => {
    const store = new TimeLogStore(dir, log)
    store.append(period('a'))
    mkdirSync(join(dir, 'time-log.jsonl.tmp'))

    store.rewrite([])
    store.append(period('b'))

    rmSync(join(dir, 'time-log.jsonl.tmp'), { recursive: true })
    store.append(period('c'))

    expect(new TimeLogStore(dir, log).readPeriods().periods).toEqual([period('b'), period('c')])
  })
})

describe('TimeLogStore hand-set task flag', () => {
  let dir: string
  let logged: unknown[][]
  const log = (...args: unknown[]): void => {
    logged.push(args)
  }
  const logFile = (): string => join(dir, 'time-log.jsonl')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-time-'))
    logged = []
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips a period carrying taskByHand: true through append and read (HTSK-42)', () => {
    const flagged: TimePeriod = { ...period('a'), taskId: 67890, taskByHand: true }
    new TimeLogStore(dir, log).append(flagged)

    const [line] = readFileSync(logFile(), 'utf8').trim().split('\n')
    expect(JSON.parse(line)).toEqual({ v: 1, ...flagged })
    expect(new TimeLogStore(dir, log).readPeriods()).toEqual({ periods: [flagged], skipped: 0 })
  })

  it('reads a line without taskByHand as a period with no taskByHand key (HTSK-41)', () => {
    writeFileSync(logFile(), JSON.stringify({ v: 1, ...period('a') }) + '\n', 'utf8')

    const { periods, skipped } = new TimeLogStore(dir, log).readPeriods()

    expect(skipped).toBe(0)
    expect(periods).toEqual([period('a')])
    expect('taskByHand' in periods[0]).toBe(false)
  })

  it('skips and counts a line whose taskByHand is not a boolean (HTSK-43)', () => {
    writeFileSync(
      logFile(),
      [
        JSON.stringify({ v: 1, ...period('a') }),
        JSON.stringify({ v: 1, ...period('bad'), taskByHand: 'yes' }),
        JSON.stringify({ v: 1, ...period('b'), taskByHand: true })
      ].join('\n') + '\n',
      'utf8'
    )

    const store = new TimeLogStore(dir, log)

    expect(store.readPeriods()).toEqual({
      periods: [period('a'), { ...period('b'), taskByHand: true }],
      skipped: 1
    })
    expect(logged).toHaveLength(1)
  })

  it('reads a taskByHand: false line, a boolean, and skips a taskByHand: null one (HTSK-43)', () => {
    writeFileSync(
      logFile(),
      [
        JSON.stringify({ v: 1, ...period('off'), taskByHand: false }),
        JSON.stringify({ v: 1, ...period('nil'), taskByHand: null })
      ].join('\n') + '\n',
      'utf8'
    )

    expect(new TimeLogStore(dir, log).readPeriods()).toEqual({
      periods: [{ ...period('off'), taskByHand: false }],
      skipped: 1
    })
  })

  it('writes a period without the flag as a v:1 line with no taskByHand key (HTSK-42)', () => {
    new TimeLogStore(dir, log).append(period('a'))

    expect(readFileSync(logFile(), 'utf8')).toBe(JSON.stringify({ v: 1, ...period('a') }) + '\n')
    expect(readFileSync(logFile(), 'utf8')).not.toContain('taskByHand')
  })
})
