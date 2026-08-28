import { describe, expect, it } from 'vitest'
import {
  VS_EDITIONS,
  buildElevatedOpen,
  buildVswhereArgs,
  parseVswhereProductPath,
  vsFailureMessages
} from './shortcut-launcher'

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

/**
 * Parses an MSBuild-style half-open range `[lo,hi)` into numeric bounds, so the
 * ranges can be reasoned about as intervals rather than compared as strings —
 * string equality would pass for two ranges that silently overlap.
 */
function parseRange(range: string): { lo: number; hi: number } {
  const match = /^\[(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\)$/.exec(range)
  if (!match) throw new Error(`unparseable version range: ${range}`)
  return { lo: Number(match[1]), hi: Number(match[2]) }
}

/** Whether `version` falls inside the half-open range, the way vswhere reads it. */
function satisfies(version: number, range: string): boolean {
  const { lo, hi } = parseRange(range)
  return version >= lo && version < hi
}

describe('buildVswhereArgs', () => {
  it('asks vswhere for the newest productPath within the given range', () => {
    const args = buildVswhereArgs('[18.0,19.0)')
    expect(args).toEqual(['-latest', '-version', '[18.0,19.0)', '-property', 'productPath'])
  })

  it('never passes -prerelease, so Insiders cannot shadow a stable install', () => {
    for (const edition of Object.values(VS_EDITIONS)) {
      expect(buildVswhereArgs(edition.versionRange)).not.toContain('-prerelease')
    }
  })

  it('is pure — resolving one edition cannot affect another', () => {
    const first = buildVswhereArgs(VS_EDITIONS.vs2022.versionRange)
    const second = buildVswhereArgs(VS_EDITIONS.vs2026.versionRange)
    const firstAgain = buildVswhereArgs(VS_EDITIONS.vs2022.versionRange)
    expect(firstAgain).toEqual(first)
    expect(second).not.toEqual(first)
  })
})

describe('VS_EDITIONS coexistence', () => {
  it('gives each Visual Studio version its own range and year-specific label', () => {
    expect(VS_EDITIONS.vs2022.label).toBe('Visual Studio 2022')
    expect(VS_EDITIONS.vs2026.label).toBe('Visual Studio 2026')
    expect(VS_EDITIONS.vs2022.versionRange).not.toBe(VS_EDITIONS.vs2026.versionRange)
  })

  it('keeps the ranges disjoint, so no install can satisfy both', () => {
    const a = parseRange(VS_EDITIONS.vs2022.versionRange)
    const b = parseRange(VS_EDITIONS.vs2026.versionRange)
    expect(a.hi <= b.lo || b.hi <= a.lo).toBe(true)
  })

  it('routes each installed version to exactly one edition', () => {
    // Versions measured on the target machine: VS 2022 17.14.18, VS 2026 18.4.2.
    const cases: { version: number; expected: 'vs2022' | 'vs2026' }[] = [
      { version: 17.14, expected: 'vs2022' },
      { version: 18.4, expected: 'vs2026' }
    ]
    for (const { version, expected } of cases) {
      const matched = (Object.keys(VS_EDITIONS) as (keyof typeof VS_EDITIONS)[]).filter((tool) =>
        satisfies(version, VS_EDITIONS[tool].versionRange)
      )
      expect(matched).toEqual([expected])
    }
  })

  it('claims no Visual Studio older than 2022 — a 2019 install matches neither', () => {
    // The machine also has VS 2019 (16.7.28); neither card may ever open it.
    for (const edition of Object.values(VS_EDITIONS)) {
      expect(satisfies(16.7, edition.versionRange)).toBe(false)
    }
  })
})

describe('vsFailureMessages', () => {
  it('names Visual Studio 2022 exactly as the 2022 launcher always has', () => {
    expect(vsFailureMessages(VS_EDITIONS.vs2022)).toEqual({
      notInstalled: "Visual Studio 2022 isn't installed (or wasn't found)",
      cancelled: 'Visual Studio 2022 launch was cancelled',
      missingPath: "Couldn't launch Visual Studio 2022 — the worktree path no longer exists"
    })
  })

  it('names Visual Studio 2026 in its own failures', () => {
    expect(vsFailureMessages(VS_EDITIONS.vs2026)).toEqual({
      notInstalled: "Visual Studio 2026 isn't installed (or wasn't found)",
      cancelled: 'Visual Studio 2026 launch was cancelled',
      missingPath: "Couldn't launch Visual Studio 2026 — the worktree path no longer exists"
    })
  })

  it('never leaves the user guessing which Visual Studio failed', () => {
    const messages2022 = Object.values(vsFailureMessages(VS_EDITIONS.vs2022))
    const messages2026 = Object.values(vsFailureMessages(VS_EDITIONS.vs2026))
    for (const message of messages2022) {
      expect(message).toContain('2022')
      expect(message).not.toContain('2026')
    }
    for (const message of messages2026) {
      expect(message).toContain('2026')
      expect(message).not.toContain('2022')
    }
  })
})
