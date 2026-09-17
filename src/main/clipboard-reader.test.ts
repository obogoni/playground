import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classifyClipboard,
  parseFileDropList,
  pasteImageName,
  readClipboardPaste,
  type ClipboardReaderDeps
} from './clipboard-reader'

const PASTE_DIR = join('C:\\tmp', 'playground-paste')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
/** 2026-09-17 18:45:30 local time. */
const NOW = new Date(2026, 8, 17, 18, 45, 30)

interface FakeOpts {
  text?: string
  formats?: string[]
  png?: Buffer | null
  fileList?: string
  fileListError?: Error
  writeError?: Error
  now?: Date
  rand?: string
}

/** Records every port call so a test can assert what was (and was not) spawned. */
function fakeDeps(
  opts: FakeOpts = {}
): ClipboardReaderDeps & { listCalls: number; writes: { path: string; data: Buffer }[] } {
  const deps = {
    listCalls: 0,
    writes: [] as { path: string; data: Buffer }[],
    pasteDir: PASTE_DIR,
    readText: () => opts.text ?? '',
    formats: () => opts.formats ?? [],
    readImagePng: () => opts.png ?? null,
    readFileDropList: async () => {
      deps.listCalls++
      if (opts.fileListError) throw opts.fileListError
      return opts.fileList ?? ''
    },
    writeFile: async (path: string, data: Buffer) => {
      if (opts.writeError) throw opts.writeError
      deps.writes.push({ path, data })
    },
    now: () => opts.now ?? NOW,
    rand: () => opts.rand ?? 'a1b2c3'
  }
  return deps
}

describe('classifyClipboard', () => {
  it('lets text win over a file list and an image (TSP-12, TSP-13)', () => {
    expect(
      classifyClipboard({
        text: 'hello',
        formats: ['text/plain', 'text/uri-list'],
        imageEmpty: false
      })
    ).toBe('text')
  })

  it('treats whitespace-only text as text, because that is what was copied', () => {
    expect(classifyClipboard({ text: '   ', formats: [], imageEmpty: true })).toBe('text')
    expect(classifyClipboard({ text: '\n', formats: [], imageEmpty: false })).toBe('text')
  })

  it('picks files over an image when no text is present (TSP-21)', () => {
    expect(classifyClipboard({ text: '', formats: ['text/uri-list'], imageEmpty: false })).toBe(
      'files'
    )
  })

  it('picks the image when there is no text and no file list (TSP-14)', () => {
    expect(classifyClipboard({ text: '', formats: ['image/png'], imageEmpty: false })).toBe('image')
  })

  it('reports an empty clipboard when nothing is pasteable (TSP-15)', () => {
    expect(classifyClipboard({ text: '', formats: [], imageEmpty: true })).toBe('empty')
    expect(classifyClipboard({ text: '', formats: ['text/html'], imageEmpty: true })).toBe('empty')
  })
})

describe('parseFileDropList', () => {
  it('splits CRLF output and drops blank lines (TSP-36)', () => {
    expect(parseFileDropList('C:\\a\\one.png\r\nC:\\b\\two.md\r\n\r\n')).toEqual([
      'C:\\a\\one.png',
      'C:\\b\\two.md'
    ])
  })

  it('keeps non-ASCII path characters intact (TSP-37)', () => {
    expect(parseFileDropList('C:\\Acme Corp\\relatório.png\r\n')).toEqual([
      'C:\\Acme Corp\\relatório.png'
    ])
  })

  it('returns no paths for empty or blank output', () => {
    expect(parseFileDropList('')).toEqual([])
    expect(parseFileDropList('\r\n  \n')).toEqual([])
  })
})

describe('pasteImageName', () => {
  it('names the PNG paste-yyyyMMdd-HHmmss-<rand>.png (TSP-14)', () => {
    expect(pasteImageName(NOW, 'a1b2c3')).toBe('paste-20260917-184530-a1b2c3.png')
    expect(pasteImageName(new Date(2026, 0, 2, 3, 4, 5), 'ff00aa')).toBe(
      'paste-20260102-030405-ff00aa.png'
    )
  })

  it('differs for two images pasted in the same second (TSP-38)', () => {
    expect(pasteImageName(NOW, 'a1b2c3')).not.toBe(pasteImageName(NOW, 'd4e5f6'))
  })
})

describe('readClipboardPaste', () => {
  it('returns clipboard text without spawning the file-list read (TSP-12)', async () => {
    const deps = fakeDeps({ text: 'npm test', formats: ['text/plain'] })

    expect(await readClipboardPaste(deps)).toEqual({ kind: 'text', text: 'npm test' })
    expect(deps.listCalls).toBe(0)
    expect(deps.writes).toEqual([])
  })

  it('returns only the text when the clipboard also holds an image (TSP-13)', async () => {
    const deps = fakeDeps({ text: 'from the browser', formats: ['text/plain'], png: PNG })

    expect(await readClipboardPaste(deps)).toEqual({ kind: 'text', text: 'from the browser' })
    expect(deps.writes).toEqual([])
  })

  it('reads the file list once and keeps its order (TSP-21)', async () => {
    const deps = fakeDeps({
      formats: ['text/uri-list'],
      fileList: 'C:\\a\\one.png\r\nC:\\b\\two.md\r\n'
    })

    expect(await readClipboardPaste(deps)).toEqual({
      kind: 'paths',
      paths: ['C:\\a\\one.png', 'C:\\b\\two.md']
    })
    expect(deps.listCalls).toBe(1)
  })

  it('passes a copied directory through like a file (TSP-35)', async () => {
    const deps = fakeDeps({ formats: ['text/uri-list'], fileList: 'C:\\Acme Corp\\docs\r\n' })

    expect(await readClipboardPaste(deps)).toEqual({
      kind: 'paths',
      paths: ['C:\\Acme Corp\\docs']
    })
  })

  it('never spawns the file-list read without the uri-list format', async () => {
    const deps = fakeDeps({ formats: ['image/png'], png: PNG })

    await readClipboardPaste(deps)

    expect(deps.listCalls).toBe(0)
  })

  it('writes a clipboard image as a timestamped PNG and pastes its path (TSP-14)', async () => {
    const deps = fakeDeps({ formats: ['image/png'], png: PNG, rand: 'a1b2c3' })
    const expected = join(PASTE_DIR, 'paste-20260917-184530-a1b2c3.png')

    expect(await readClipboardPaste(deps)).toEqual({ kind: 'paths', paths: [expected] })
    expect(deps.writes).toEqual([{ path: expected, data: PNG }])
  })

  it('treats an empty image buffer as no image at all (TSP-15)', async () => {
    const deps = fakeDeps({ formats: ['image/png'], png: Buffer.alloc(0) })

    expect(await readClipboardPaste(deps)).toEqual({ kind: 'empty' })
    expect(deps.writes).toEqual([])
  })

  it('reports an empty clipboard when there is nothing to paste (TSP-15)', async () => {
    const deps = fakeDeps()

    expect(await readClipboardPaste(deps)).toEqual({ kind: 'empty' })
    expect(deps.writes).toEqual([])
  })

  it('turns a failed file-list read into an error, never a throw (TSP-16)', async () => {
    const deps = fakeDeps({
      formats: ['text/uri-list'],
      fileListError: new Error('powershell timed out')
    })

    expect(await readClipboardPaste(deps)).toEqual({
      kind: 'error',
      message: 'powershell timed out'
    })
  })

  it('turns a failed PNG write into an error, never a throw (TSP-16)', async () => {
    const deps = fakeDeps({
      formats: ['image/png'],
      png: PNG,
      writeError: new Error('ENOSPC: no space left on device')
    })

    expect(await readClipboardPaste(deps)).toEqual({
      kind: 'error',
      message: 'ENOSPC: no space left on device'
    })
    expect(deps.writes).toEqual([])
  })
})
