import { describe, expect, it } from 'vitest'
import { nightlyVersion, stableVersionFromTag } from './release-version'

describe('stableVersionFromTag', () => {
  it('extracts the semver core from a vX.Y.Z tag ref', () => {
    expect(stableVersionFromTag('refs/tags/v1.2.3')).toBe('1.2.3')
  })

  it('preserves a pre-release suffix', () => {
    expect(stableVersionFromTag('refs/tags/v0.1.0-nightly.42')).toBe('0.1.0-nightly.42')
  })

  it.each([
    ['refs/heads/main', 'a branch ref, not a tag'],
    ['refs/tags/v1.2', 'an incomplete semver core'],
    ['v1.2.3', 'the refs/tags/ prefix missing'],
    ['refs/tags/1.2.3', 'the v missing'],
    ['', 'empty input']
  ])('throws on %j (%s)', (ref) => {
    expect(() => stableVersionFromTag(ref)).toThrow()
  })
})

describe('nightlyVersion', () => {
  it('appends the run number as a -nightly pre-release', () => {
    expect(nightlyVersion('0.1.0', 42)).toBe('0.1.0-nightly.42')
  })

  it('accepts a numeric string run number (CI env vars are strings)', () => {
    expect(nightlyVersion('0.1.0', '7')).toBe('0.1.0-nightly.7')
  })

  it.each([
    [0, 'zero'],
    [-1, 'negative'],
    [1.5, 'non-integer'],
    ['abc', 'non-numeric string']
  ])('throws on run number %j (%s)', (runNumber) => {
    expect(() => nightlyVersion('0.1.0', runNumber as number | string)).toThrow()
  })
})
