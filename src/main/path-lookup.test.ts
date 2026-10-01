import { describe, expect, it } from 'vitest'
import { findOnPath } from './path-lookup'

/** A fake filesystem: `isFile` is true only for the listed paths, and records every probe. */
function fakeFs(files: string[]): { isFile: (path: string) => Promise<boolean>; probed: string[] } {
  const probed: string[] = []
  return {
    probed,
    isFile: async (path) => {
      probed.push(path)
      return files.includes(path)
    }
  }
}

describe('findOnPath', () => {
  it('returns the first hit, trying every PATHEXT extension of a directory before the next directory (PERF-19)', async () => {
    const fs = fakeFs(['C:\\b\\claude.EXE', 'C:\\a\\claude.CMD'])
    const found = await findOnPath(
      'claude',
      { PATH: 'C:\\a;C:\\b', PATHEXT: '.EXE;.CMD' },
      fs.isFile
    )
    expect(found).toBe('C:\\a\\claude.CMD')
    expect(fs.probed).toEqual(['C:\\a\\claude.EXE', 'C:\\a\\claude.CMD'])
  })

  it('keeps a non-ASCII directory exactly as PATH spells it (PERF-19)', async () => {
    const dir = 'C:\\Users\\OtávioBogoni\\.local\\bin'
    const fs = fakeFs([`${dir}\\claude.exe`])
    const found = await findOnPath('claude', { PATH: dir, PATHEXT: '.exe' }, fs.isFile)
    expect(found).toBe('C:\\Users\\OtávioBogoni\\.local\\bin\\claude.exe')
  })

  it('skips empty PATH entries and strips the quotes around one', async () => {
    const fs = fakeFs(['C:\\Program Files\\x\\claude.EXE'])
    const found = await findOnPath(
      'claude',
      { PATH: ';"C:\\Program Files\\x";;', PATHEXT: '.EXE' },
      fs.isFile
    )
    expect(found).toBe('C:\\Program Files\\x\\claude.EXE')
    expect(fs.probed).toEqual(['C:\\Program Files\\x\\claude.EXE'])
  })

  it('falls back to .COM;.EXE;.BAT;.CMD when PATHEXT is unset', async () => {
    const fs = fakeFs([])
    await findOnPath('claude', { PATH: 'C:\\a' }, fs.isFile)
    expect(fs.probed).toEqual([
      'C:\\a\\claude.COM',
      'C:\\a\\claude.EXE',
      'C:\\a\\claude.BAT',
      'C:\\a\\claude.CMD'
    ])
  })

  it('tries a name that already carries an extension bare first', async () => {
    const fs = fakeFs(['C:\\a\\claude.exe'])
    const found = await findOnPath('claude.exe', { PATH: 'C:\\a', PATHEXT: '.EXE' }, fs.isFile)
    expect(found).toBe('C:\\a\\claude.exe')
    expect(fs.probed).toEqual(['C:\\a\\claude.exe'])
  })

  it('returns null when no directory holds the binary (PERF-19 AC 2 falls back from here)', async () => {
    const fs = fakeFs([])
    expect(await findOnPath('claude', { PATH: 'C:\\a;C:\\b', PATHEXT: '.EXE' }, fs.isFile)).toBe(
      null
    )
    expect(await findOnPath('claude', {}, fs.isFile)).toBe(null)
  })
})
