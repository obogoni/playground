import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIconLoader, type IconData } from './icon-set'
import type { IconMapping } from './file-icons'

const mapping: IconMapping = {
  getIconForFile: () => undefined,
  getIconForFolder: () => 'default_folder.svg',
  getIconForOpenFolder: () => 'default_folder_opened.svg'
}

const data: IconData = {
  set: {
    width: 32,
    height: 32,
    icons: {
      'file-type-gnu': { body: '<path d="M1 1h30"/>' },
      'file-type-tall': { body: '<path d="M2 2"/>', width: 16, height: 24 }
    },
    aliases: { 'file-type-makefile': { parent: 'file-type-gnu' } }
  },
  mapping
}

/** The SVG a `data:` URI carries. */
function svgOf(uri: string | null): string {
  expect(uri).not.toBeNull()
  const prefix = 'data:image/svg+xml,'
  expect(uri!.startsWith(prefix)).toBe(true)
  return decodeURIComponent(uri!.slice(prefix.length))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createIconLoader', () => {
  it('imports the set once however many times it is asked', async () => {
    const importer = vi.fn(async () => data)
    const load = createIconLoader(importer)

    const [first, second] = await Promise.all([load(), load()])
    const third = await load()

    expect(importer).toHaveBeenCalledTimes(1)
    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('turns an icon name into a data URI of its SVG (FICN-06)', async () => {
    const icons = await createIconLoader(async () => data)()

    const svg = svgOf(icons!.uri('file-type-gnu'))
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 32 32"')
    expect(svg).toContain('<path d="M1 1h30"/>')
  })

  it("uses an icon's own size over the set's", async () => {
    const icons = await createIconLoader(async () => data)()

    expect(svgOf(icons!.uri('file-type-tall'))).toContain('viewBox="0 0 16 24"')
  })

  it("draws an alias with its parent's body", async () => {
    const icons = await createIconLoader(async () => data)()

    expect(svgOf(icons!.uri('file-type-makefile'))).toContain('<path d="M1 1h30"/>')
  })

  it('answers null for a name missing from the set (FICN-06)', async () => {
    const icons = await createIconLoader(async () => data)()

    expect(icons!.uri('file-type-nowhere')).toBeNull()
  })

  it('lists icons and aliases as the available names, and hands the mapping on', async () => {
    const icons = await createIconLoader(async () => data)()

    expect([...icons!.available].sort()).toEqual([
      'file-type-gnu',
      'file-type-makefile',
      'file-type-tall'
    ])
    expect(icons!.mapping).toBe(mapping)
  })

  it('resolves to null on every call and logs once when the import fails (FICN-14)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const importer = vi.fn(async (): Promise<IconData> => {
      throw new Error('chunk failed to load')
    })
    const load = createIconLoader(importer)

    expect(await load()).toBeNull()
    expect(await load()).toBeNull()
    expect(await load()).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0])).toContain('chunk failed to load')
  })
})
