import { describe, expect, it } from 'vitest'
import {
  applyPresetOp,
  classifyEntries,
  parsePresetsText,
  serializePresets
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
