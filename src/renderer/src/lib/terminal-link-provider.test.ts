import { describe, expect, it } from 'vitest'
import type { ILink } from '@xterm/xterm'
import type { PathKind, ProbeResult } from '../../../shared/links'
import {
  activeBufferOf,
  type BufferLike,
  type BufferLineLike,
  type CellLike
} from './terminal-buffer-lines'
import { createTerminalLinkProvider, hitForOscTarget, type LinkHit } from './terminal-link-provider'

const COLS = 40

/** A mutable fake buffer of single-width rows; `set` repaints a row between calls. */
function makeBuffer(rows: string[]): BufferLike & { set(y0: number, text: string): void } {
  const texts = [...rows]
  const line = (y0: number): BufferLineLike | undefined => {
    const text = texts[y0]
    if (text === undefined) return undefined
    return {
      isWrapped: false,
      length: COLS,
      translateToString: () => text,
      getCell: (x, cell) => {
        const target = (cell ?? makeCell()) as CellLike & { chars: string; width: number }
        target.chars = text[x] ?? ''
        target.width = 1
        return target
      }
    }
  }
  return { getLine: line, getNullCell: makeCell, set: (y0, text) => void (texts[y0] = text) }
}

function makeCell(): CellLike & { chars: string; width: number } {
  const cell = { chars: '', width: 0, getChars: () => cell.chars, getWidth: () => cell.width }
  return cell
}

/** A probe fake answering from `disk`; records every batch; can be made to fail. */
function makeProbe(
  disk: Record<string, PathKind>,
  opts: { fail?: boolean } = {}
): { probe: (paths: string[]) => Promise<ProbeResult[]>; calls: string[][] } {
  const calls: string[][] = []
  const probe = async (paths: string[]): Promise<ProbeResult[]> => {
    calls.push(paths)
    if (opts.fail) throw new Error('ipc down')
    return paths.map((pathText) => ({
      pathText,
      absolutePath: `E:\\wt\\${pathText}`,
      kind: disk[pathText] ?? 'missing'
    }))
  }
  return { probe, calls }
}

const provideLinks = (
  provider: ReturnType<typeof createTerminalLinkProvider>,
  y1: number
): Promise<ILink[] | undefined> => new Promise((resolve) => provider.provideLinks(y1, resolve))

describe('provideLinks — urls (LINK-01, LINK-02)', () => {
  it('links a url synchronously with its cells, an underline and a no-op activate', () => {
    const buffer = makeBuffer(['see https://example.com/x now'])
    const { probe, calls } = makeProbe({})
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    let links: ILink[] | undefined
    provider.provideLinks(1, (result) => (links = result))
    expect(links).toHaveLength(1)
    expect(links![0]).toMatchObject({
      text: 'https://example.com/x',
      range: { start: { x: 5, y: 1 }, end: { x: 25, y: 1 } },
      decorations: { underline: true, pointerCursor: true }
    })
    expect(() => links![0].activate(new Event('click') as MouseEvent, 'x')).not.toThrow()
    expect(calls).toEqual([])
  })
})

describe('provideLinks — paths (LINK-06, LINK-07, LINK-08, LINK-24, LINK-25, LINK-26, LINK-27)', () => {
  it('probes every path on the row in one batch and links only the ones that exist', async () => {
    const buffer = makeBuffer(['edited src/a.ts and src/b.ts and src/nope.ts'])
    const { probe, calls } = makeProbe({ 'src/a.ts': 'file', 'src/b.ts': 'dir' })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    const links = await provideLinks(provider, 1)
    expect(calls).toEqual([['src/a.ts', 'src/b.ts', 'src/nope.ts']])
    expect(links?.map((l) => l.text)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(links![0].range).toEqual({ start: { x: 8, y: 1 }, end: { x: 15, y: 1 } })
  })

  it('answers from the cache on the second call and probes again after dispose', async () => {
    const buffer = makeBuffer(['edited src/a.ts'])
    const { probe, calls } = makeProbe({ 'src/a.ts': 'file' })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    await provideLinks(provider, 1)
    const second = await provideLinks(provider, 1)
    expect(calls).toHaveLength(1)
    expect(second?.map((l) => l.text)).toEqual(['src/a.ts'])
    provider.dispose()
    await provideLinks(provider, 1)
    expect(calls).toHaveLength(2)
  })

  it('treats a failed probe as missing: no links, no throw, cached as missing', async () => {
    const buffer = makeBuffer(['edited src/a.ts'])
    const { probe, calls } = makeProbe({ 'src/a.ts': 'file' }, { fail: true })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    expect(await provideLinks(provider, 1)).toBeUndefined()
    expect(await provideLinks(provider, 1)).toBeUndefined()
    expect(calls).toHaveLength(1)
  })

  it('discards a probe result for a row that was repainted meanwhile', async () => {
    const buffer = makeBuffer(['edited src/a.ts'])
    const { probe } = makeProbe({ 'src/a.ts': 'file' })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    const pending = provideLinks(provider, 1)
    buffer.set(0, 'something else')
    expect(await pending).toBeUndefined()
  })

  it('links the longest existing alternative of a spaced path, probing all of them at once', async () => {
    const buffer = makeBuffer(['salvo em E:\\Meus Docs\\a.txt agora'])
    const { probe, calls } = makeProbe({ 'E:\\Meus Docs\\a.txt': 'file' })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    const links = await provideLinks(provider, 1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(
      expect.arrayContaining(['E:\\Meus Docs\\a.txt', 'E:\\Meus', 'Docs\\a.txt'])
    )
    expect(links?.map((l) => l.text)).toEqual(['E:\\Meus Docs\\a.txt'])
    expect(links![0].range).toEqual({ start: { x: 10, y: 1 }, end: { x: 27, y: 1 } })
  })

  it('falls back to the plain candidates when the spaced path does not exist', async () => {
    const buffer = makeBuffer(['salvo em E:\\Meus Docs\\a.txt agora'])
    const { probe } = makeProbe({ 'Docs\\a.txt': 'file' })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    const links = await provideLinks(provider, 1)
    expect(links?.map((l) => l.text)).toEqual(['Docs\\a.txt'])
  })

  it('reports no links for an empty row without probing', () => {
    const buffer = makeBuffer(['', 'plain prose'])
    const { probe, calls } = makeProbe({})
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    let first: ILink[] | undefined = []
    let second: ILink[] | undefined = []
    provider.provideLinks(1, (r) => (first = r))
    provider.provideLinks(2, (r) => (second = r))
    expect(first).toBeUndefined()
    expect(second).toBeUndefined()
    expect(calls).toEqual([])
  })
})

describe('hitTest (LINK-02, LINK-07, LINK-19, LINK-28)', () => {
  it('finds a url under the cell', () => {
    const buffer = makeBuffer(['see https://example.com/x now'])
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, ...makeProbe({}) })
    expect(provider.hitTest(10, 1)).toEqual({ kind: 'url', url: 'https://example.com/x' })
    expect(provider.hitTest(2, 1)).toBeNull()
  })

  it('finds a cached existing path under the cell, with its kind', async () => {
    const buffer = makeBuffer(['edited src/a.ts'])
    const provider = createTerminalLinkProvider({
      buffer,
      getCols: () => COLS,
      ...makeProbe({ 'src/a.ts': 'dir' })
    })
    await provideLinks(provider, 1)
    expect(provider.hitTest(10, 1)).toEqual({ kind: 'path', pathText: 'src/a.ts', state: 'dir' })
  })

  it('returns null for a path already known to be missing (LINK-07)', async () => {
    const buffer = makeBuffer(['edited src/nope.ts'])
    const { probe, calls } = makeProbe({})
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    await provideLinks(provider, 1)
    expect(provider.hitTest(10, 1)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('intercepts an unprobed path and settles to the existing hit (LINK-19)', async () => {
    const buffer = makeBuffer(['edited src/a.ts'])
    const { probe, calls } = makeProbe({ 'src/a.ts': 'file' })
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, probe })
    const hit = provider.hitTest(10, 1)
    expect(hit).toMatchObject({ kind: 'path', pathText: 'src/a.ts', state: 'unprobed' })
    const settled = await (hit as Extract<LinkHit, { state: 'unprobed' }>).settled
    expect(settled).toEqual({ kind: 'path', pathText: 'src/a.ts', state: 'file' })
    expect(calls).toEqual([['src/a.ts']])
  })

  it('settles an unprobed miss to null and remembers it', async () => {
    const buffer = makeBuffer(['edited src/nope.ts'])
    const provider = createTerminalLinkProvider({ buffer, getCols: () => COLS, ...makeProbe({}) })
    const hit = provider.hitTest(10, 1) as Extract<LinkHit, { state: 'unprobed' }>
    expect(await hit.settled).toBeNull()
    expect(provider.hitTest(10, 1)).toBeNull()
  })

  it('works on a scrollback row the same way (LINK-28)', () => {
    const rows = Array.from({ length: 200 }, () => 'filler')
    rows[150] = 'see https://example.com/x now'
    const provider = createTerminalLinkProvider({
      buffer: makeBuffer(rows),
      getCols: () => COLS,
      ...makeProbe({})
    })
    expect(provider.hitTest(10, 151)).toEqual({ kind: 'url', url: 'https://example.com/x' })
  })

  it('returns null on an empty cell and outside the buffer', () => {
    const provider = createTerminalLinkProvider({
      buffer: makeBuffer(['plain']),
      getCols: () => COLS,
      ...makeProbe({})
    })
    expect(provider.hitTest(3, 1)).toBeNull()
    expect(provider.hitTest(3, 9)).toBeNull()
  })
})

describe('alternate screen (LINK-32)', () => {
  it('follows the buffer that is active at call time, for the hover and the hit test alike', async () => {
    const normal = makeBuffer(['plain prompt'])
    const alternate = makeBuffer(['see https://example.com/x now'])
    const terminal = { buffer: { active: normal } }
    const provider = createTerminalLinkProvider({
      buffer: activeBufferOf(terminal),
      getCols: () => COLS,
      ...makeProbe({})
    })
    expect(await provideLinks(provider, 1)).toBeUndefined()
    expect(provider.hitTest(10, 1)).toBeNull()

    terminal.buffer.active = alternate
    expect((await provideLinks(provider, 1))?.map((l) => l.text)).toEqual(['https://example.com/x'])
    expect(provider.hitTest(10, 1)).toEqual({ kind: 'url', url: 'https://example.com/x' })

    terminal.buffer.active = normal
    expect(await provideLinks(provider, 1)).toBeUndefined()
    expect(provider.hitTest(10, 1)).toBeNull()
  })
})

describe('hitForOscTarget (LINK-20, LINK-21, LINK-22)', () => {
  it('routes an http or https target to the browser', () => {
    expect(hitForOscTarget('https://example.com/x')).toEqual({
      kind: 'url',
      url: 'https://example.com/x'
    })
    expect(hitForOscTarget('http://example.com/x')).toEqual({
      kind: 'url',
      url: 'http://example.com/x'
    })
  })

  it('routes a file target to the file rules', () => {
    expect(hitForOscTarget('file:///C:/Users/MAUROP%7E1/a.txt')).toEqual({
      kind: 'fileUrl',
      url: 'file:///C:/Users/MAUROP%7E1/a.txt'
    })
  })

  it('opens nothing for any other scheme or for text that is not a url', () => {
    expect(hitForOscTarget('mailto:a@b.c')).toBeNull()
    expect(hitForOscTarget('vscode://file/E:/x/y.ts')).toBeNull()
    expect(hitForOscTarget('ms-teams:launch')).toBeNull()
    expect(hitForOscTarget('not a url')).toBeNull()
  })
})
