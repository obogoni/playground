import { describe, expect, it } from 'vitest'
import { classifyEntries, parsePresetsText } from './agent-preset-store'

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
