import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensurePromptsFolder, listPrompts } from './prompt-library'

// Async `rm`: `rmSync` silently no-ops on the non-ASCII profile path here.
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'prl-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('listPrompts', () => {
  it('lists *.md files of any case by name and ignores subfolders and other files (APR-01/02)', async () => {
    await writeFile(join(dir, 'review.md'), 'Review the branch.')
    await writeFile(join(dir, 'Implement.MD'), 'Implement #{{taskId}}.')
    await writeFile(join(dir, 'notes.txt'), 'not a prompt')
    await writeFile(join(dir, 'md'), 'no extension')
    await mkdir(join(dir, 'nested.md'))
    await writeFile(join(dir, 'nested.md', 'inner.md'), 'too deep')

    expect(await listPrompts(dir)).toEqual([
      { name: 'Implement', template: 'Implement #{{taskId}}.' },
      { name: 'review', template: 'Review the branch.' }
    ])
  })

  it('sorts by name ascending, case-insensitively (APR-03)', async () => {
    for (const name of ['beta', 'Alpha', 'gamma', 'Delta']) {
      await writeFile(join(dir, `${name}.md`), name)
    }
    expect((await listPrompts(dir)).map((p) => p.name)).toEqual(['Alpha', 'beta', 'Delta', 'gamma'])
  })

  it('normalises the template: no BOM, LF line breaks, trimmed (APR-04)', async () => {
    await writeFile(join(dir, 'crlf.md'), '\uFEFF\r\n  line 1\r\nline 2  \r\n\r\n')
    expect(await listPrompts(dir)).toEqual([{ name: 'crlf', template: 'line 1\nline 2' }])
  })

  it('returns no prompts and no error when the folder is missing (APR-05)', async () => {
    expect(await listPrompts(join(dir, 'does-not-exist'))).toEqual([])
  })

  it('lists an empty or whitespace-only file as broken: empty, keeping the others (APR-06)', async () => {
    await writeFile(join(dir, 'blank.md'), '')
    await writeFile(join(dir, 'spaces.md'), '\uFEFF \r\n\t\r\n')
    await writeFile(join(dir, 'ok.md'), 'Go.')
    expect(await listPrompts(dir)).toEqual([
      { name: 'blank', error: 'empty' },
      { name: 'ok', template: 'Go.' },
      { name: 'spaces', error: 'empty' }
    ])
  })

  it('lists a file over 16 KiB as broken and accepts exactly 16 KiB (APR-06)', async () => {
    await writeFile(join(dir, 'big.md'), 'x'.repeat(16385))
    await writeFile(join(dir, 'edge.md'), 'y'.repeat(16384))
    await writeFile(join(dir, 'ok.md'), 'Go.')
    expect(await listPrompts(dir)).toEqual([
      { name: 'big', error: 'larger than 16 KiB' },
      { name: 'edge', template: 'y'.repeat(16384) },
      { name: 'ok', template: 'Go.' }
    ])
  })

  it('bounds the file by bytes, not characters (APR-06)', async () => {
    // 'ã' is two UTF-8 bytes: 8193 of them are 16386 bytes but 8193 characters.
    await writeFile(join(dir, 'wide.md'), 'ã'.repeat(8193), 'utf8')
    expect(await listPrompts(dir)).toEqual([{ name: 'wide', error: 'larger than 16 KiB' }])
  })

  it('decodes the file as UTF-8 (APR-04)', async () => {
    await writeFile(join(dir, 'pt.md'), 'Configuração de ação', 'utf8')
    expect(await listPrompts(dir)).toEqual([{ name: 'pt', template: 'Configuração de ação' }])
  })

  it('lists a file it cannot read as unreadable with the error message and keeps the others (APR-06)', async () => {
    await writeFile(join(dir, 'locked.md'), 'Never read.')
    await writeFile(join(dir, 'ok.md'), 'Go.')
    // Windows offers no portable way to make a regular-file read fail, so the
    // failure is injected; readdir and stat stay real.
    const failingRead = async (path: string, encoding: 'utf8'): Promise<string> => {
      if (path.endsWith('locked.md')) throw new Error('EACCES: permission denied')
      return readFile(path, encoding)
    }
    expect(await listPrompts(dir, { readdir, stat, readFile: failingRead })).toEqual([
      { name: 'locked', error: 'unreadable: EACCES: permission denied' },
      { name: 'ok', template: 'Go.' }
    ])
  })
})

describe('ensurePromptsFolder', () => {
  it('creates a missing nested folder (APR-08)', async () => {
    const root = join(dir, '.playground', 'prompts')
    await ensurePromptsFolder(root)
    expect((await stat(root)).isDirectory()).toBe(true)
  })

  it('leaves an existing folder and its files alone (APR-08)', async () => {
    await writeFile(join(dir, 'keep.md'), 'Keep me.')
    await ensurePromptsFolder(dir)
    expect(await listPrompts(dir)).toEqual([{ name: 'keep', template: 'Keep me.' }])
  })
})
