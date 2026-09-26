import type { IconMapping } from './file-icons'

interface IconBody {
  body: string
  width?: number
  height?: number
}

/** The part of an Iconify JSON set (`@iconify-json/vscode-icons/icons.json`) the loader reads. */
export interface IconSetJson {
  width?: number
  height?: number
  icons: Record<string, IconBody>
  aliases?: Record<string, { parent: string }>
}

/** What the lazy chunk carries: the icon set and the mapping that names its icons. */
export interface IconData {
  set: IconSetJson
  mapping: IconMapping
}

export interface LoadedIcons {
  /** Every icon and alias name in the set, for `resolveIconName`. */
  available: ReadonlySet<string>
  mapping: IconMapping
  /** A `data:` URI of the icon's SVG, or null when the set has no such name. */
  uri(name: string): string | null
}

function loaded({ set, mapping }: IconData): LoadedIcons {
  const aliases = set.aliases ?? {}
  const available = new Set([...Object.keys(set.icons), ...Object.keys(aliases)])
  const uris = new Map<string, string>()

  function uri(name: string): string | null {
    const cached = uris.get(name)
    if (cached) return cached
    const parent = aliases[name]?.parent
    const icon: IconBody | undefined = set.icons[name] ?? (parent ? set.icons[parent] : undefined)
    if (!icon) return null
    const width = icon.width ?? set.width ?? 16
    const height = icon.height ?? set.height ?? 16
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`
    const result = `data:image/svg+xml,${encodeURIComponent(svg)}`
    uris.set(name, result)
    return result
  }

  return { available, mapping, uri }
}

/**
 * A loader that imports the icon data once, on its first call, and answers the
 * same promise afterwards (FICN-12). A failed import resolves to null, now and
 * on every later call, and is logged once (FICN-14).
 */
export function createIconLoader(
  importer: () => Promise<IconData>
): () => Promise<LoadedIcons | null> {
  let pending: Promise<LoadedIcons | null> | null = null
  return () => {
    pending ??= importer().then(loaded, (err: unknown) => {
      console.error('File icons failed to load; keeping the generic icon.', err)
      return null
    })
    return pending
  }
}

/** The app's loader: the ~3.7 MB set and its mapping live in their own chunk. */
export const loadIcons = createIconLoader(() => import('./icon-data').then((m) => m.iconData))
