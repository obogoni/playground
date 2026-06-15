import { describe, expect, it } from 'vitest'
import { buildElevatedOpen, parseVswhereProductPath } from './shortcut-launcher'

describe('parseVswhereProductPath', () => {
  it('returns the trimmed first non-empty line', () => {
    const out =
      '  C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe \r\n'
    expect(parseVswhereProductPath(out)).toBe(
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe'
    )
  })

  it('skips leading blank lines', () => {
    expect(parseVswhereProductPath('\r\n\r\n  X:\\devenv.exe\r\n')).toBe('X:\\devenv.exe')
  })

  it('treats empty / whitespace-only output as not found', () => {
    expect(parseVswhereProductPath('')).toBeNull()
    expect(parseVswhereProductPath('   \r\n  \n')).toBeNull()
  })
})

describe('buildElevatedOpen', () => {
  it('elevates devenv via Start-Process RunAs with the folder as a quoted arg', () => {
    const { command, args } = buildElevatedOpen('C:\\VS\\devenv.exe', 'C:\\code\\repo')
    expect(command).toBe('powershell.exe')
    expect(args).toContain('-Command')
    expect(args.at(-1)).toBe(
      `Start-Process -FilePath 'C:\\VS\\devenv.exe' -ArgumentList '"C:\\code\\repo"' -Verb RunAs`
    )
  })

  it('passes spaces and non-ASCII paths through inside the double-quoted arg', () => {
    const { args } = buildElevatedOpen(
      'C:\\VS\\devenv.exe',
      'C:\\Configuração de ambiente\\my repo'
    )
    expect(args.at(-1)).toContain(`-ArgumentList '"C:\\Configuração de ambiente\\my repo"'`)
  })

  it('doubles single quotes so a quoted path stays literal in PowerShell', () => {
    const { args } = buildElevatedOpen('C:\\VS\\devenv.exe', "C:\\o'brien\\repo")
    expect(args.at(-1)).toContain(`-ArgumentList '"C:\\o''brien\\repo"'`)
  })
})
