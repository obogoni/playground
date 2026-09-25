import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBinary, MAX_VIEW_BYTES, readForView, resolveInside } from './file-reader'

describe('resolveInside', () => {
  it('rejects an absolute path, even one pointing inside the root', () => {
    expect(resolveInside('C:\\work\\repo', join('C:\\work\\repo', 'src', 'a.ts'))).toBeNull()
  })

  it('rejects a relative path that escapes the root', () => {
    expect(resolveInside('C:\\work\\repo', '../other/secret.txt')).toBeNull()
  })

  it('accepts a path through a folder inside the root', () => {
    expect(resolveInside('C:\\work\\repo', 'src/lib/a.ts')).toBe(
      join('C:\\work\\repo', 'src', 'lib', 'a.ts')
    )
  })
})

describe('isBinary', () => {
  it('is true for a NUL byte within the first 8000 bytes', () => {
    expect(isBinary(Buffer.from([0x61, 0x00, 0x62]))).toBe(true)
  })

  it('is false for text, and for a NUL byte beyond the first 8000 bytes', () => {
    const late = Buffer.alloc(9000, 0x61)
    late[8500] = 0x00

    expect(isBinary(Buffer.from('plain text\n', 'utf8'))).toBe(false)
    expect(isBinary(late)).toBe(false)
  })
})

describe('readForView', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-fr-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reports a file above 1 MB as too large, with its size and no content', async () => {
    const size = MAX_VIEW_BYTES + 1
    writeFileSync(join(root, 'big.log'), Buffer.alloc(size, 0x61))

    const content = await readForView(root, 'big.log')

    expect(content).toEqual({ kind: 'too-large', size })
  })

  it('reads a file of exactly 1 MB as text — the ceiling is "larger than" (FXPL-20)', async () => {
    const bytes = Buffer.alloc(MAX_VIEW_BYTES, 0x61)
    writeFileSync(join(root, 'edge.log'), bytes)

    const content = await readForView(root, 'edge.log')

    expect(content).toEqual({ kind: 'text', text: bytes.toString('utf8'), size: MAX_VIEW_BYTES })
  })

  it('reports a file that does not exist as missing', async () => {
    const content = await readForView(root, 'gone.ts')

    expect(content).toEqual({ kind: 'missing' })
  })

  it('reports a file with a NUL byte as binary, with its size and no content', async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01])
    writeFileSync(join(root, 'thing.bin'), bytes)

    const content = await readForView(root, 'thing.bin')

    expect(content).toEqual({ kind: 'binary', size: bytes.length })
  })

  it('reads a file through a folder as text, replacing bytes that are not UTF-8', async () => {
    mkdirSync(join(root, 'src'))
    // 0xE9 is Latin-1 'é' and is not valid UTF-8 on its own.
    writeFileSync(join(root, 'src', 'latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]))

    const content = await readForView(root, 'src/latin.txt')

    expect(content).toEqual({ kind: 'text', text: 'caf\uFFFD', size: 4 })
  })
})
