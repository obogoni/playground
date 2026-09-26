/** The app's two themes, as `data-theme` on `<html>` names them. */
export type IconTheme = 'dark' | 'light'

export interface IconQuery {
  /** The file or folder name, not its path. */
  name: string
  kind: 'file' | 'folder'
  /** Whether a folder is expanded; ignored for files. */
  open: boolean
  theme: IconTheme
}

/**
 * The part of `vscode-icons-js` the resolver asks. It is passed in rather than
 * imported so the ~105 KB mapping rides in the icon set's lazy chunk, not in the
 * entry chunk (FICN-12). Answers are vscode-icons file names (`file_type_json.svg`).
 */
export interface IconMapping {
  getIconForFile(name: string): string | undefined
  getIconForFolder(name: string): string
  getIconForOpenFolder(name: string): string
}

/**
 * Our corrections over the mapping, which was last released in 2023, keyed by
 * last extension (FICN-03..05).
 */
const CORRECTIONS: Record<string, string> = {
  slnx: 'file-type-sln',
  razor: 'file-type-razor',
  resx: 'file-type-xml'
}

/** `file-type-light-x` / `folder-type-light-x`; `file-type-lighthouse` is not one. */
const LIGHT_VARIANT = /^(file|folder)-type-light-/
const HAS_LIGHT_VARIANT = /^(file|folder)-type-(?!light-)/

/** `file_type_light_json.svg` → `file-type-light-json`, the Iconify name. */
function iconifyName(fileName: string): string {
  return fileName.replace(/\.svg$/, '').replace(/_/g, '-')
}

function mapped({ name, kind, open }: IconQuery, mapping: IconMapping): string {
  // toLowerCase, not toLocaleLowerCase: the mapping matches case-sensitively, and
  // the result must not depend on the machine's locale.
  const lower = name.toLowerCase()
  if (kind === 'folder') {
    return iconifyName(open ? mapping.getIconForOpenFolder(lower) : mapping.getIconForFolder(lower))
  }
  const dot = lower.lastIndexOf('.')
  const correction = dot >= 0 ? CORRECTIONS[lower.slice(dot + 1)] : undefined
  return correction ?? iconifyName(mapping.getIconForFile(lower) ?? 'default_file.svg')
}

function fallback({ kind, open }: IconQuery): string {
  if (kind === 'file') return 'default-file'
  return open ? 'default-folder-opened' : 'default-folder'
}

/**
 * The vscode-icons icon a file or folder shows, as an Iconify name in
 * `available`: the mapping's answer for the lower-cased name, after our
 * corrections; its base in the dark theme when the mapping answered a light
 * variant (FICN-15); its `2` variant or the default when it is missing from the
 * set (FICN-06); its light variant in the light theme when the set has one
 * (FICN-07).
 */
export function resolveIconName(
  query: IconQuery,
  available: ReadonlySet<string>,
  mapping: IconMapping
): string {
  let icon = mapped(query, mapping)
  if (query.theme === 'dark' && LIGHT_VARIANT.test(icon)) {
    const base = icon.replace(LIGHT_VARIANT, '$1-type-')
    if (available.has(base)) icon = base
  }
  if (!available.has(icon)) icon = available.has(`${icon}2`) ? `${icon}2` : fallback(query)
  if (query.theme === 'light' && HAS_LIGHT_VARIANT.test(icon)) {
    const light = icon.replace(HAS_LIGHT_VARIANT, '$1-type-light-')
    if (available.has(light)) icon = light
  }
  return icon
}
