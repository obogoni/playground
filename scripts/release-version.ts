/**
 * Pure version-derivation helpers shared by the CI stamping entry.
 * No IO, no env reads — unit-tested input→output.
 */

const TAG_REF = /^refs\/tags\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/

/** 'refs/tags/v1.2.3' -> '1.2.3'. Throws on anything not matching refs/tags/vX.Y.Z[-pre]. */
export function stableVersionFromTag(githubRef: string): string {
  const match = TAG_REF.exec(githubRef)
  if (!match) {
    throw new Error(`Not a vX.Y.Z release tag ref: ${JSON.stringify(githubRef)}`)
  }
  return match[1]
}

/**
 * ('0.1.0', 42) -> '0.1.0-alpha.42'. runNumber must be a positive integer.
 *
 * The pre-release identifier is intentionally `alpha`, not `nightly`: it must
 * match the `alpha` publish channel (→ `alpha.yml`) so electron-updater's GitHub
 * provider resolves the right channel file. The provider derives the running
 * app's channel from `semver.prerelease(version)[0]`, and only releases tagged
 * with a *valid semver* pre-release in the alpha/beta family are ever selected
 * (GitHubProvider skips non-semver tags outright). `nightly` satisfied neither,
 * which is why nightly auto-update never fired.
 */
export function nightlyVersion(baseVersion: string, runNumber: number | string): string {
  const n = typeof runNumber === 'string' ? Number(runNumber) : runNumber
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Run number must be a positive integer, got ${JSON.stringify(runNumber)}`)
  }
  return `${baseVersion}-alpha.${n}`
}
