import { describe, expect, it } from 'vitest'
import { isKeystroke } from './keystroke'

const ESC = '\x1b'

describe('isKeystroke', () => {
  it.each([
    ['a plain character', 'a'],
    ['Enter, which answers a permission dialog', '\r'],
    ['a digit, which picks a dialog option', '1'],
    ['an arrow key, which navigates a dialog', `${ESC}[A`],
    ['a control byte', '\x03'],
    ['a pasted line', 'npm test\r']
  ])('counts %s as the user typing', (_label, data) => {
    expect(isKeystroke(data)).toBe(true)
  })

  it.each([
    ['an SGR mouse press', `${ESC}[<0;10;20M`],
    ['an SGR mouse release', `${ESC}[<0;10;20m`],
    ['an SGR motion report with large coordinates', `${ESC}[<35;120;48M`],
    ['an X10 mouse report', `${ESC}[M !!`],
    ['a urxvt mouse report', `${ESC}[32;10;20M`],
    ['a focus-in report', `${ESC}[I`],
    ['a focus-out report', `${ESC}[O`]
  ])('does not count %s as the user typing (ACTV-33)', (_label, data) => {
    expect(isKeystroke(data)).toBe(false)
  })

  it('does not count a burst of motion reports in one chunk', () => {
    const drag = `${ESC}[<35;10;20M${ESC}[<35;11;20M${ESC}[<35;12;21M`
    expect(isKeystroke(drag)).toBe(false)
  })

  it('does not count a focus change bundled with a mouse report', () => {
    expect(isKeystroke(`${ESC}[I${ESC}[<0;5;5M`)).toBe(false)
  })

  it('counts a real character that arrives alongside a mouse report', () => {
    expect(isKeystroke(`${ESC}[<0;5;5M1`)).toBe(true)
  })

  it('does not count an empty chunk', () => {
    expect(isKeystroke('')).toBe(false)
  })
})
