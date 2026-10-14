import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NODE_PRESET_FS,
  applyPresetOp,
  classifyEntries,
  createPresetStore,
  parsePresetsText,
  serializePresets,
  type PresetFs,
  type PresetStore
} from './agent-preset-store'

const reviewer = { name: 'Reviewer', agent: 'Claude', cwd: 'M:\\ws', prompt: 'review-pr' }
const fixer = { name: 'Bug fixer', agent: 'Claude', cwd: 'M:\\ws' }

describe('parsePresetsText', () => {
  it('reports unparseable text as invalid JSON with the parser message (PRST-03)', () => {
    const parsed = parsePresetsText('{')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.reason.startsWith('invalid JSON: ')).toBe(true)
    expect(parsed.reason.length).toBeGreaterThan('invalid JSON: '.length)
  })

  it('reports a top level other than an array as not an array (PRST-03)', () => {
    expect(parsePresetsText('{}')).toEqual({ ok: false, reason: 'not an array' })
    expect(parsePresetsText('"x"')).toEqual({ ok: false, reason: 'not an array' })
  })

  it('returns the array exactly as read', () => {
    expect(parsePresetsText('[{"name":"A","note":1},3]')).toEqual({
      ok: true,
      raw: [{ name: 'A', note: 1 }, 3]
    })
  })
})

describe('classifyEntries', () => {
  it('returns the entries in array order (PRST-01)', () => {
    expect(classifyEntries([fixer, reviewer])).toEqual([
      { kind: 'ok', preset: fixer },
      { kind: 'ok', preset: reviewer }
    ])
  })

  it('keeps only the managed fields in the preset', () => {
    expect(classifyEntries([{ ...fixer, note: 'mine' }])).toEqual([{ kind: 'ok', preset: fixer }])
  })

  it('names the first bad field of a broken entry and keeps its neighbours (PRST-04)', () => {
    expect(
      classifyEntries([
        reviewer,
        'not an object',
        null,
        [],
        { agent: 'Claude', cwd: 'M:\\ws' },
        { name: '', agent: 'Claude', cwd: 'M:\\ws' },
        { name: 7, agent: 'Claude', cwd: 'M:\\ws' },
        { name: 'No agent', cwd: 'M:\\ws' },
        { name: 'Empty agent', agent: '', cwd: 'M:\\ws' },
        { name: 'Bad agent', agent: 1, cwd: 'M:\\ws' },
        { name: 'No cwd', agent: 'Claude' },
        { name: 'Empty cwd', agent: 'Claude', cwd: '' },
        { name: 'Bad cwd', agent: 'Claude', cwd: false },
        { name: 'Bad prompt', agent: 'Claude', cwd: 'M:\\ws', prompt: 3 },
        { name: 'Null prompt', agent: 'Claude', cwd: 'M:\\ws', prompt: null },
        fixer
      ])
    ).toEqual([
      { kind: 'ok', preset: reviewer },
      { kind: 'invalid', name: null, reason: 'invalid entry: name' },
      { kind: 'invalid', name: null, reason: 'invalid entry: name' },
      { kind: 'invalid', name: null, reason: 'invalid entry: name' },
      { kind: 'invalid', name: null, reason: 'invalid entry: name' },
      { kind: 'invalid', name: null, reason: 'invalid entry: name' },
      { kind: 'invalid', name: null, reason: 'invalid entry: name' },
      { kind: 'invalid', name: 'No agent', reason: 'invalid entry: agent' },
      { kind: 'invalid', name: 'Empty agent', reason: 'invalid entry: agent' },
      { kind: 'invalid', name: 'Bad agent', reason: 'invalid entry: agent' },
      { kind: 'invalid', name: 'No cwd', reason: 'invalid entry: cwd' },
      { kind: 'invalid', name: 'Empty cwd', reason: 'invalid entry: cwd' },
      { kind: 'invalid', name: 'Bad cwd', reason: 'invalid entry: cwd' },
      { kind: 'invalid', name: 'Bad prompt', reason: 'invalid entry: prompt' },
      { kind: 'invalid', name: 'Null prompt', reason: 'invalid entry: prompt' },
      { kind: 'ok', preset: fixer }
    ])
  })

  it('lists a later case-insensitive trimmed duplicate as broken, the first wins (PRST-05)', () => {
    const first = { name: 'A', agent: 'Claude', cwd: 'M:\\one' }
    const second = { name: ' a ', agent: 'Codex', cwd: 'M:\\two' }
    const third = { name: 'A', agent: 'Codex', cwd: 'M:\\three' }
    expect(classifyEntries([first, second, third])).toEqual([
      { kind: 'ok', preset: first },
      { kind: 'invalid', name: ' a ', reason: 'duplicate name' },
      { kind: 'invalid', name: 'A', reason: 'duplicate name' }
    ])
  })
})

describe('applyPresetOp', () => {
  const a = { name: 'A', agent: 'Claude', cwd: 'M:/a', prompt: 'review-pr', note: 'keep me' }
  const b = { name: 'B', agent: 'Codex', cwd: 'M:/b' }
  const c = { name: 'C', agent: 'Claude', cwd: 'M:/c' }

  it('save appends name, agent, cwd and prompt (PRST-13)', () => {
    const preset = { name: 'Reviewer', agent: 'Claude', cwd: 'M:/ws', prompt: 'review-pr' }
    expect(applyPresetOp([b], { kind: 'save', preset, replace: false })).toEqual({
      raw: [b, { name: 'Reviewer', agent: 'Claude', cwd: 'M:/ws', prompt: 'review-pr' }]
    })
  })

  it('save omits prompt when the preset has none (PRST-13)', () => {
    const result = applyPresetOp([], {
      kind: 'save',
      preset: { name: 'Bare', agent: 'Claude', cwd: 'M:/ws' },
      replace: false
    })
    expect(result).toEqual({ raw: [{ name: 'Bare', agent: 'Claude', cwd: 'M:/ws' }] })
    expect('raw' in result && Object.keys(result.raw[0] as object)).toEqual([
      'name',
      'agent',
      'cwd'
    ])
  })

  it('save stores the name trimmed', () => {
    const preset = { name: '  Bare  ', agent: 'Claude', cwd: 'M:/ws' }
    expect(applyPresetOp([], { kind: 'save', preset, replace: false })).toEqual({
      raw: [{ name: 'Bare', agent: 'Claude', cwd: 'M:/ws' }]
    })
  })

  it('save on an existing name without replace answers exists with the stored name (PRST-16)', () => {
    const preset = { name: ' a ', agent: 'Codex', cwd: 'M:/x' }
    expect(applyPresetOp([b, a], { kind: 'save', preset, replace: false })).toEqual({
      error: { kind: 'exists', name: 'A' }
    })
  })

  it('save with replace overwrites the managed fields in place and keeps the rest (PRST-16, PRST-07)', () => {
    const preset = { name: 'a', agent: 'Codex', cwd: 'M:/x', prompt: 'fix-bug' }
    expect(applyPresetOp([b, a, c], { kind: 'save', preset, replace: true })).toEqual({
      raw: [b, { name: 'a', agent: 'Codex', cwd: 'M:/x', prompt: 'fix-bug', note: 'keep me' }, c]
    })
  })

  it('save with replace deletes prompt when the new preset has none (PRST-16)', () => {
    const preset = { name: 'A', agent: 'Claude', cwd: 'M:/a' }
    expect(applyPresetOp([a], { kind: 'save', preset, replace: true })).toEqual({
      raw: [{ name: 'A', agent: 'Claude', cwd: 'M:/a', note: 'keep me' }]
    })
  })

  it('save refuses an invalid name with the name rule text (PRST-15)', () => {
    const preset = { name: 'x'.repeat(41), agent: 'Claude', cwd: 'M:/a' }
    expect(applyPresetOp([], { kind: 'save', preset, replace: false })).toEqual({
      error: { kind: 'failed', message: '1–40 characters, one line' }
    })
  })

  it('rename changes the name only and keeps unknown fields (PRST-38, PRST-07)', () => {
    expect(applyPresetOp([a, b], { kind: 'rename', from: 'a', to: ' Reviewer ' })).toEqual({
      raw: [{ ...a, name: 'Reviewer' }, b]
    })
    expect(applyPresetOp([a, b], { kind: 'rename', from: 'a', to: 'Reviewer' })).toEqual({
      raw: [
        { name: 'Reviewer', agent: 'Claude', cwd: 'M:/a', prompt: 'review-pr', note: 'keep me' },
        b
      ]
    })
  })

  it('rename may change only the case of its own name (PRST-38)', () => {
    expect(applyPresetOp([b], { kind: 'rename', from: 'B', to: 'b' })).toEqual({
      raw: [{ name: 'b', agent: 'Codex', cwd: 'M:/b' }]
    })
  })

  it('rename to a name another preset uses answers exists (PRST-39)', () => {
    expect(applyPresetOp([a, b], { kind: 'rename', from: 'A', to: ' b ' })).toEqual({
      error: { kind: 'exists', name: 'B' }
    })
  })

  it('rename refuses an invalid new name with the name rule text (PRST-15)', () => {
    expect(applyPresetOp([a], { kind: 'rename', from: 'A', to: 'two\nlines' })).toEqual({
      error: { kind: 'failed', message: '1–40 characters, one line' }
    })
  })

  it('move swaps the entry with its raw neighbour, broken or not (PRST-40)', () => {
    expect(applyPresetOp([a, b, c], { kind: 'move', name: 'c', direction: 'up' })).toEqual({
      raw: [a, c, b]
    })
    expect(applyPresetOp([a, b, c], { kind: 'move', name: 'A', direction: 'down' })).toEqual({
      raw: [b, a, c]
    })
    expect(applyPresetOp([a, 42, c], { kind: 'move', name: 'C', direction: 'up' })).toEqual({
      raw: [a, c, 42]
    })
  })

  it('move refuses up on the first entry and down on the last (PRST-40)', () => {
    expect(applyPresetOp([a, b], { kind: 'move', name: 'A', direction: 'up' })).toEqual({
      error: { kind: 'failed', message: 'preset "A" is already first' }
    })
    expect(applyPresetOp([a, b], { kind: 'move', name: 'B', direction: 'down' })).toEqual({
      error: { kind: 'failed', message: 'preset "B" is already last' }
    })
  })

  it('delete removes only the named entry (PRST-41)', () => {
    expect(applyPresetOp([a, b, c], { kind: 'delete', name: 'b' })).toEqual({ raw: [a, c] })
  })

  it('answers not found for a target name no valid entry holds (PRST-09)', () => {
    const notFound = { error: { kind: 'failed', message: 'preset "Gone" not found' } }
    const broken = { name: 'Gone', cwd: 'M:/x' }
    expect(applyPresetOp([a, broken], { kind: 'rename', from: 'Gone', to: 'Z' })).toEqual(notFound)
    expect(applyPresetOp([a], { kind: 'move', name: 'Gone', direction: 'up' })).toEqual(notFound)
    expect(applyPresetOp([a], { kind: 'delete', name: 'Gone' })).toEqual(notFound)
  })

  it('leaves the input array untouched', () => {
    const raw = [a, b]
    applyPresetOp(raw, { kind: 'delete', name: 'A' })
    expect(raw).toEqual([a, b])
  })
})

describe('serializePresets', () => {
  it('writes the array indented with 2 spaces and a final newline (PRST-06)', () => {
    expect(serializePresets([{ name: 'A', agent: 'Claude', cwd: 'M:\\a', note: 1 }, 7])).toBe(
      '[\n  {\n    "name": "A",\n    "agent": "Claude",\n    "cwd": "M:\\\\a",\n    "note": 1\n  },\n  7\n]\n'
    )
  })
})

describe('createPresetStore', () => {
  // Async `rm`: `rmSync` silently no-ops on the non-ASCII profile path here.
  let dir: string
  let file: string
  const opened: string[] = []
  const opener = async (path: string): Promise<string> => {
    opened.push(path)
    return ''
  }
  const store = (fs: PresetFs = NODE_PRESET_FS, open = opener): PresetStore =>
    createPresetStore(file, fs, open)
  const reviewer = { name: 'Reviewer', agent: 'Claude', cwd: 'M:/ws', prompt: 'review-pr' }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aps-'))
    file = join(dir, '.playground', 'presets.json')
    opened.length = 0
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const seed = async (text: string): Promise<void> => {
    await mkdir(join(dir, '.playground'), { recursive: true })
    await writeFile(file, text, 'utf8')
  }

  it('lists no presets and no error when the file is missing (PRST-02)', async () => {
    expect(await store().list()).toEqual({ ok: true, entries: [] })
  })

  it('reports an invalid file with its reason (PRST-03)', async () => {
    await seed('{"name": "A"}')
    expect(await store().list()).toEqual({ ok: false, reason: 'not an array' })
  })

  it('lists entries in file order with cwdExists true only for an existing folder (PRST-01)', async () => {
    const folder = join(dir, 'ws')
    const plainFile = join(dir, 'file.txt')
    await mkdir(folder)
    await writeFile(plainFile, 'x')
    const missing = join(dir, 'gone')
    await seed(
      JSON.stringify([
        { name: 'Folder', agent: 'Claude', cwd: folder },
        { name: 'Missing', agent: 'Claude', cwd: missing },
        { name: 'Broken' },
        { name: 'File', agent: 'Claude', cwd: plainFile }
      ])
    )
    expect(await store().list()).toEqual({
      ok: true,
      entries: [
        { kind: 'ok', preset: { name: 'Folder', agent: 'Claude', cwd: folder }, cwdExists: true },
        {
          kind: 'ok',
          preset: { name: 'Missing', agent: 'Claude', cwd: missing },
          cwdExists: false
        },
        { kind: 'invalid', name: 'Broken', reason: 'invalid entry: agent' },
        { kind: 'ok', preset: { name: 'File', agent: 'Claude', cwd: plainFile }, cwdExists: false }
      ]
    })
  })

  it('creates the missing folder and file on the first change and returns the new listing (PRST-06)', async () => {
    const result = await store().change({ kind: 'save', preset: reviewer, replace: false })
    expect(await readFile(file, 'utf8')).toBe(
      '[\n  {\n    "name": "Reviewer",\n    "agent": "Claude",\n    "cwd": "M:/ws",\n    "prompt": "review-pr"\n  }\n]\n'
    )
    expect(result).toEqual({
      ok: true,
      listing: { ok: true, entries: [{ kind: 'ok', preset: reviewer, cwdExists: false }] }
    })
  })

  it('passes an exists answer through without writing (PRST-16)', async () => {
    const text = JSON.stringify([reviewer])
    await seed(text)
    expect(
      await store().change({
        kind: 'save',
        preset: { ...reviewer, name: 'reviewer' },
        replace: false
      })
    ).toEqual({ ok: false, error: { kind: 'exists', name: 'Reviewer' } })
    expect(await readFile(file, 'utf8')).toBe(text)
  })

  it('refuses every change while the file is invalid and leaves its bytes alone (PRST-08)', async () => {
    const refused = {
      ok: false,
      error: { kind: 'failed', message: 'presets.json is invalid; fix it by hand first' }
    }
    for (const text of ['[{"name": "A",', '{"presets": []}']) {
      await seed(text)
      expect(await store().change({ kind: 'save', preset: reviewer, replace: false })).toEqual(
        refused
      )
      expect(await store().change({ kind: 'delete', name: 'A' })).toEqual(refused)
      expect(await readFile(file, 'utf8')).toBe(text)
    }
  })

  it('re-reads the file before a change so a hand edit since the listing survives (PRST-09)', async () => {
    const s = store()
    await s.change({ kind: 'save', preset: reviewer, replace: false })
    await s.list()
    const handEdit = { name: 'Hand', agent: 'Codex', cwd: 'M:/hand', note: 'mine' }
    await writeFile(file, JSON.stringify([reviewer, handEdit]), 'utf8')

    await s.change({ kind: 'rename', from: 'Reviewer', to: 'Checker' })

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([
      { ...reviewer, name: 'Checker' },
      handEdit
    ])
  })

  it('applies two changes started together one after the other, so both land', async () => {
    const s = store()
    const second = { name: 'Second', agent: 'Codex', cwd: 'M:/two' }
    await Promise.all([
      s.change({ kind: 'save', preset: reviewer, replace: false }),
      s.change({ kind: 'save', preset: second, replace: false })
    ])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([reviewer, second])
  })

  it('keeps the original file and reports the message when the write fails', async () => {
    const text = JSON.stringify([reviewer])
    await seed(text)
    const failingWrite: PresetFs = {
      ...NODE_PRESET_FS,
      writeFile: async () => {
        throw new Error('EACCES: permission denied')
      }
    }
    const failingRename: PresetFs = {
      ...NODE_PRESET_FS,
      rename: async () => {
        throw new Error('EBUSY: resource busy')
      }
    }
    expect(await store(failingWrite).change({ kind: 'delete', name: 'Reviewer' })).toEqual({
      ok: false,
      error: { kind: 'failed', message: 'EACCES: permission denied' }
    })
    expect(await store(failingRename).change({ kind: 'delete', name: 'Reviewer' })).toEqual({
      ok: false,
      error: { kind: 'failed', message: 'EBUSY: resource busy' }
    })
    expect(await readFile(file, 'utf8')).toBe(text)
  })

  it('openFile creates a missing file as an empty array and opens it (PRST-42)', async () => {
    expect(await store().openFile()).toBeNull()
    expect(await readFile(file, 'utf8')).toBe('[]\n')
    expect(opened).toEqual([file])
  })

  it('openFile leaves an existing file as it is and returns the opener error (PRST-42)', async () => {
    await seed('not json')
    const failingOpen = async (path: string): Promise<string> => {
      opened.push(path)
      return 'No application is associated with the specified file'
    }
    expect(await store(NODE_PRESET_FS, failingOpen).openFile()).toBe(
      'No application is associated with the specified file'
    )
    expect(await readFile(file, 'utf8')).toBe('not json')
    expect(opened).toEqual([file])
  })

  it('openFile reports a failed create and opens nothing (PRST-42)', async () => {
    const failingMkdir: PresetFs = {
      ...NODE_PRESET_FS,
      mkdir: async () => {
        throw new Error('EPERM: operation not permitted')
      }
    }
    expect(await store(failingMkdir).openFile()).toBe('EPERM: operation not permitted')
    expect(opened).toEqual([])
  })
})
