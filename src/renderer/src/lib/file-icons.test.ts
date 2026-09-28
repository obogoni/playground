import { describe, expect, it } from 'vitest'
import iconSet from '@iconify-json/vscode-icons/icons.json'
import * as vscodeIcons from 'vscode-icons-js'
import expectedIcons from '../../../../.specs/features/file-icons/expected-icons.md?raw'
import { resolveIconName, type IconMapping, type IconQuery } from './file-icons'

const available: ReadonlySet<string> = new Set([
  ...Object.keys(iconSet.icons),
  ...Object.keys(iconSet.aliases ?? {})
])

function resolve(query: IconQuery, mapping: IconMapping = vscodeIcons): string {
  return resolveIconName(query, available, mapping)
}

function file(name: string, theme: IconQuery['theme'] = 'dark'): string {
  return resolve({ name, kind: 'file', open: false, theme })
}

function folder(name: string, open: boolean, theme: IconQuery['theme'] = 'dark'): string {
  return resolve({ name, kind: 'folder', open, theme })
}

/** A mapping that answers every file with one icon file name, to reach names the real one never gives. */
function answering(fileName: string): IconMapping {
  return {
    getIconForFile: () => fileName,
    getIconForFolder: () => vscodeIcons.DEFAULT_FOLDER,
    getIconForOpenFolder: () => vscodeIcons.DEFAULT_FOLDER_OPENED
  }
}

interface Row {
  name: string
  kind: 'file' | 'folder'
  closed: string
  opened: string | null
}

/** The rows of expected-icons.md, the comparison page's names with the icon each must show. */
const rows: Row[] = [
  ...expectedIcons.matchAll(/^\| `([^`]+)` \| (file|folder) \| `([^`]+)` \| (?:`([^`]+)`|—) \|$/gm)
].map(([, name, kind, closed, opened]) => ({
  name,
  kind: kind as Row['kind'],
  closed,
  opened: opened ?? null
}))

describe('resolveIconName', () => {
  it('reads all 91 rows of the expected table', () => {
    expect(rows).toHaveLength(91)
  })

  it.each(rows)(
    'resolves $name to the icon the comparison page shows, in the dark theme (FICN-01..06, 09, 10, 15)',
    ({ name, kind, closed, opened }) => {
      if (kind === 'file') {
        expect(file(name)).toBe(closed)
      } else {
        expect(folder(name, false)).toBe(closed)
        expect(folder(name, true)).toBe(opened)
      }
    }
  )

  it('gives a .slnx the .sln icon (FICN-03)', () => {
    expect(file('Acme.Widget.slnx')).toBe('file-type-sln')
    expect(file('Acme.Widget.slnx')).toBe(file('Acme.Widget.sln'))
  })

  it('gives a .razor file-type-razor (FICN-04)', () => {
    expect(file('Counter.razor')).toBe('file-type-razor')
  })

  it('gives a .resx the XML icon (FICN-05)', () => {
    expect(file('Resources.resx')).toBe('file-type-xml')
  })

  it('applies the corrections by the last extension, whatever its case', () => {
    expect(file('ACME.WIDGET.SLNX')).toBe('file-type-sln')
    expect(file('Strings.pt-BR.resx')).toBe('file-type-xml')
  })

  it('gives a name the mapping does not know the default file icon (FICN-02)', () => {
    expect(file('notes.unknownext')).toBe('default-file')
    expect(file('notes')).toBe('default-file')
  })

  it('takes the 2 variant of a mapped name missing from the set (FICN-06)', () => {
    expect(available.has('file-type-pdf')).toBe(false)
    expect(file('contract.pdf')).toBe('file-type-pdf2')
  })

  it('falls back to the default file icon when neither the name nor its 2 variant is in the set (FICN-06)', () => {
    const mapping = answering('file_type_nowhere.svg')
    expect(resolve({ name: 'a.nowhere', kind: 'file', open: false, theme: 'dark' }, mapping)).toBe(
      'default-file'
    )
  })

  it('shows the light variant in the light theme when the set has one (FICN-07)', () => {
    expect(file('vite.config.ts', 'dark')).toBe('file-type-vite')
    expect(file('vite.config.ts', 'light')).toBe('file-type-light-vite')
    expect(folder('node_modules', false, 'light')).toBe('folder-type-light-node')
    expect(folder('node_modules', true, 'light')).toBe('folder-type-light-node-opened')
  })

  it('keeps the icon in the light theme when the set has no light variant (FICN-07)', () => {
    expect(file('main.ts', 'light')).toBe('file-type-typescript')
    expect(folder('src', true, 'light')).toBe('folder-type-src-opened')
    expect(file('notes', 'light')).toBe('default-file')
  })

  it('replaces a light answer of the mapping by its base in the dark theme and keeps it in the light (FICN-15)', () => {
    expect(vscodeIcons.getIconForFile('settings.json')).toBe('file_type_light_json.svg')
    expect(file('settings.json', 'dark')).toBe('file-type-json')
    expect(file('settings.json', 'light')).toBe('file-type-light-json')
  })

  it('keeps a light answer in the dark theme when the set has no base for it (FICN-15)', () => {
    // Every light icon of 1.2.82 has its base, so the base is taken out of the set.
    const withoutBase = new Set([...available].filter((icon) => icon !== 'file-type-json'))
    const query: IconQuery = { name: 'settings.json', kind: 'file', open: false, theme: 'dark' }
    expect(resolveIconName(query, withoutBase, vscodeIcons)).toBe('file-type-light-json')
  })

  it('does not take light inside a word for a light variant', () => {
    for (const icon of ['file-type-lighthouse', 'file-type-go-lightblue']) {
      const mapping = answering(`${icon.replace(/-/g, '_')}.svg`)
      for (const theme of ['dark', 'light'] as const) {
        expect(resolve({ name: 'a.x', kind: 'file', open: false, theme }, mapping)).toBe(icon)
      }
    }
  })

  it('gives a folder the theme does not cover the default pair (FICN-09, FICN-10)', () => {
    expect(folder('Properties', false)).toBe('default-folder')
    expect(folder('Properties', true)).toBe('default-folder-opened')
  })

  it('matches names without an extension regardless of case', () => {
    for (const name of ['Dockerfile', 'DOCKERFILE', 'dockerfile'])
      expect(file(name)).toBe('file-type-docker')
    for (const name of ['LICENSE', 'License', 'license'])
      expect(file(name)).toBe('file-type-license')
    for (const name of ['SRC', 'Src']) expect(folder(name, false)).toBe('folder-type-src')
  })

  it('follows the mapping for names with several dots', () => {
    expect(file('OrderList.test.tsx')).toBe('file-type-testts')
    expect(file('appsettings.Development.json')).toBe('file-type-json')
  })

  it('lower-cases names with letters outside ASCII', () => {
    expect(file('Relatório.MD')).toBe('file-type-markdown')
    expect(file('ÜBERSICHT.JSON')).toBe('file-type-json')
    expect(folder('.GİTHUB', false)).toBe('default-folder')
  })
})
