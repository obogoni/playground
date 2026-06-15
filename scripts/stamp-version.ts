/**
 * CI version-stamping entry. Reads the build mode from `--mode`, derives the
 * version with the pure helper in `release-version.ts`, and writes it into
 * package.json via `npm version` so `electron-builder` packages it.
 *
 *   --mode=stable   derive X.Y.Z from GITHUB_REF (a refs/tags/vX.Y.Z tag)
 *   --mode=nightly  derive X.Y.Z-nightly.<run#> from GITHUB_RUN_NUMBER + the
 *                   current package.json version as the base
 *   --dry-run       print the computed version and exit without writing
 *
 * Run with no build step via `npx tsx scripts/stamp-version.ts --mode=...`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nightlyVersion, stableVersionFromTag } from './release-version'

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function currentBaseVersion(): string {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    version: string
  }
  return pkg.version
}

function computeVersion(mode: string | undefined): string {
  if (mode === 'stable') {
    const ref = process.env.GITHUB_REF
    if (!ref) throw new Error('GITHUB_REF is required for --mode=stable')
    return stableVersionFromTag(ref)
  }
  if (mode === 'nightly') {
    const runNumber = process.env.GITHUB_RUN_NUMBER
    if (!runNumber) throw new Error('GITHUB_RUN_NUMBER is required for --mode=nightly')
    return nightlyVersion(currentBaseVersion(), runNumber)
  }
  throw new Error(
    `Missing or unknown --mode (expected stable|nightly), got ${JSON.stringify(mode)}`
  )
}

function main(): void {
  const version = computeVersion(arg('mode'))

  if (hasFlag('dry-run')) {
    console.log(version)
    return
  }

  execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  console.log(version)
}

main()
