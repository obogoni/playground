import { describe, expect, it } from 'vitest'
import { presetNameProblem, sameName } from './agent-presets'

describe('presetNameProblem', () => {
  it('rejects an empty or blank name (PRST-15)', () => {
    expect(presetNameProblem('')).toBe('1–40 characters, one line')
    expect(presetNameProblem('   ')).toBe('1–40 characters, one line')
  })

  it('accepts 1 and 40 characters and rejects 41, counted after trimming (PRST-15)', () => {
    expect(presetNameProblem('R')).toBeNull()
    expect(presetNameProblem('x'.repeat(40))).toBeNull()
    expect(presetNameProblem(`  ${'x'.repeat(40)}  `)).toBeNull()
    expect(presetNameProblem('x'.repeat(41))).toBe('1–40 characters, one line')
  })

  it('rejects a line break of either kind (PRST-15)', () => {
    expect(presetNameProblem('Bug\nfixer')).toBe('1–40 characters, one line')
    expect(presetNameProblem('Bug\rfixer')).toBe('1–40 characters, one line')
  })
})

describe('sameName', () => {
  it('matches trimmed names case-insensitively, and only equal ones (PRST-05)', () => {
    expect(sameName(' Reviewer ', 'reviewer')).toBe(true)
    expect(sameName('Reviewer', 'Reviewer 2')).toBe(false)
  })
})
