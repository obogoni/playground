import { describe, expect, it } from 'vitest'
import { classifyTerminalKey, type TerminalKeyEvent } from './terminal-keys'

function key(overrides: Partial<TerminalKeyEvent> = {}): TerminalKeyEvent {
  return { type: 'keydown', ctrlKey: false, shiftKey: false, code: '', key: '', ...overrides }
}

describe('classifyTerminalKey', () => {
  it('copies on Ctrl+C with a selection and passes without one (INPUT-06, INPUT-07)', () => {
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), true)).toBe('copy-selection')
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false)).toBe('pass')
  })

  it('always copies on Ctrl+Shift+C (existing behavior, no regression)', () => {
    expect(classifyTerminalKey(key({ ctrlKey: true, shiftKey: true, code: 'KeyC' }), false)).toBe(
      'copy-selection'
    )
  })

  it('pastes on Ctrl+V (INPUT-08)', () => {
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyV' }), false)).toBe('paste')
  })

  it('reports Shift+Enter and Ctrl+Enter as newline (INPUT-04)', () => {
    expect(classifyTerminalKey(key({ shiftKey: true, key: 'Enter' }), false)).toBe('newline')
    expect(classifyTerminalKey(key({ ctrlKey: true, key: 'Enter' }), false)).toBe('newline')
  })

  it('passes every other chord through untouched', () => {
    expect(classifyTerminalKey(key({ code: 'KeyA', key: 'a' }), false)).toBe('pass')
    expect(classifyTerminalKey(key({ key: 'Enter' }), false)).toBe('pass')
    expect(classifyTerminalKey(key({ code: 'ArrowUp' }), false)).toBe('pass')
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyX' }), false)).toBe('pass')
    expect(classifyTerminalKey(key({ ctrlKey: true, shiftKey: true, code: 'KeyV' }), false)).toBe(
      'pass'
    )
  })

  it('ignores non-keydown events', () => {
    expect(classifyTerminalKey(key({ type: 'keyup', ctrlKey: true, code: 'KeyC' }), true)).toBe(
      'pass'
    )
  })
})
