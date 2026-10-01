import { extname, join } from 'node:path'

/** What Windows assumes when `PATHEXT` is missing from the environment. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/**
 * Finds `name` on `PATH` the way `where` does — every directory in order, every
 * `PATHEXT` extension in order inside it — without spawning anything (PERF-19).
 *
 * `where` blocked the main process for 220–310 ms per call and printed in the
 * console codepage, which a UTF-8 decode turned `Otávio` into `Ot┤¢vio`: the
 * spawn then failed with ENOENT and the name poller looked the binary up again
 * on every nudge. Paths built here come straight from the environment, so a
 * non-ASCII directory survives byte for byte.
 */
export async function findOnPath(
  name: string,
  env: { PATH?: string; PATHEXT?: string },
  isFile: (path: string) => Promise<boolean>
): Promise<string | null> {
  const dirs = (env.PATH ?? '')
    .split(';')
    .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter((dir) => dir !== '')
  const exts = (env.PATHEXT ?? DEFAULT_PATHEXT).split(';').filter((ext) => ext !== '')
  // A name that already has an extension is what the user asked for; try it as is first.
  const candidates = extname(name)
    ? [name, ...exts.map((ext) => name + ext)]
    : exts.map((ext) => name + ext)
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const path = join(dir, candidate)
      if (await isFile(path)) return path
    }
  }
  return null
}
