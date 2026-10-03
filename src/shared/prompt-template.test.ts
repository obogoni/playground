import { describe, expect, it } from 'vitest'
import {
  CONTEXT_PLACEHOLDERS,
  PROMPT_FILE_MAX_BYTES,
  PROMPT_MAX_CHARS,
  normalizePromptText,
  parsePlaceholders,
  resolvePrompt
} from './prompt-template'

describe('prompt limits', () => {
  it('caps a resolved prompt at 8000 characters and a file at 16 KiB', () => {
    expect(PROMPT_MAX_CHARS).toBe(8000)
    expect(PROMPT_FILE_MAX_BYTES).toBe(16384)
  })

  it('names the four context placeholders', () => {
    expect(CONTEXT_PLACEHOLDERS).toEqual(['taskId', 'taskTitle', 'branch', 'worktree'])
  })
})

describe('parsePlaceholders', () => {
  it('returns distinct names in order of first appearance (APR-12)', () => {
    const template = 'Review {{branch}} for #{{taskId}}.\nThen {{branch}} again, at {{worktree}}.'
    expect(parsePlaceholders(template)).toEqual(['branch', 'taskId', 'worktree'])
  })

  it('accepts digits and underscores after the first letter (APR-12)', () => {
    expect(parsePlaceholders('{{a}} {{x_1}} {{Name2_b}}')).toEqual(['a', 'x_1', 'Name2_b'])
  })

  it('returns no name for {{…}} content outside the name pattern (APR-13)', () => {
    expect(parsePlaceholders('{{ x }} {{1a}} {{}} {{_a}} {{a-b}} {x} {{{y')).toEqual([])
  })

  it('treats names as case-sensitive (APR-16)', () => {
    expect(parsePlaceholders('{{Branch}} {{branch}}')).toEqual(['Branch', 'branch'])
  })

  it('returns an empty list for a template with no placeholders', () => {
    expect(parsePlaceholders('Just review the diff.')).toEqual([])
  })
})

describe('resolvePrompt', () => {
  it('replaces every occurrence and keeps other text and line breaks (APR-14)', () => {
    const template = '- branch: {{branch}}\n\n  again {{branch}} / {{taskId}}\r\nend'
    expect(resolvePrompt(template, { branch: 'feat/x', taskId: '42' })).toBe(
      '- branch: feat/x\n\n  again feat/x / 42\r\nend'
    )
  })

  it('inserts a value containing {{name}} literally, without expanding it (APR-15)', () => {
    expect(resolvePrompt('{{a}} and {{b}}', { a: '{{b}}', b: 'B' })).toBe('{{b}} and B')
  })

  it('inserts replacement patterns such as $& and $1 as typed', () => {
    expect(resolvePrompt('cost: {{x}}', { x: "$& $1 $$ $' $`" })).toBe("cost: $& $1 $$ $' $`")
  })

  it('substitutes case-sensitively (APR-16)', () => {
    expect(resolvePrompt('{{Branch}}/{{branch}}', { Branch: 'A', branch: 'b' })).toBe('A/b')
  })

  it('leaves literal {{…}} text that is not a placeholder untouched (APR-13)', () => {
    expect(resolvePrompt('{{ x }} {{1a}} {{}} {{x}}', { x: 'X' })).toBe('{{ x }} {{1a}} {{}} X')
  })
})

describe('normalizePromptText', () => {
  it('strips a leading BOM, turns CRLF into LF and trims (APR-04)', () => {
    expect(normalizePromptText('\uFEFF  \r\nline 1\r\nline 2\r\n\r\n  ')).toBe('line 1\nline 2')
  })

  it('keeps inner whitespace and a lone \\r (APR-04)', () => {
    expect(normalizePromptText('a  \n\n  b\rc')).toBe('a  \n\n  b\rc')
  })

  it('reduces whitespace-only text to empty', () => {
    expect(normalizePromptText('\uFEFF \r\n\t ')).toBe('')
  })
})
