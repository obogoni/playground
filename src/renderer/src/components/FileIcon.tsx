import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { resolveIconName, type IconTheme } from '../lib/file-icons'
import { loadIcons, type LoadedIcons } from '../lib/icon-set'
import { Icon } from './Icon'
import './FileIcon.css'

// The set, once loaded; null until then and for good if it failed (FICN-13/14).
// Module state, so a row mounted after the load draws its icon on first paint.
let icons: LoadedIcons | null = null
const iconListeners = new Set<() => void>()

function subscribeIcons(listener: () => void): () => void {
  iconListeners.add(listener)
  if (!icons) {
    void loadIcons().then((loaded) => {
      if (!loaded || icons) return
      icons = loaded
      for (const notify of iconListeners) notify()
    })
  }
  return () => iconListeners.delete(listener)
}

/** `data-theme` on `<html>`, as App.tsx sets it; followed live like TerminalPane does (FICN-08). */
function subscribeTheme(listener: () => void): () => void {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function currentTheme(): IconTheme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

interface FileIconProps {
  /** The file or folder name, not its path. */
  name: string
  kind: 'file' | 'folder'
  /** Whether a folder is expanded; ignored for files. */
  open?: boolean
}

/**
 * A file or folder's vscode-icons icon, 16 px, as an `<img>` so icons sharing
 * gradient ids cannot collide on the page. While the set loads, or if it failed,
 * the generic `Icon` stands in (FICN-13, FICN-14). `alt` is empty: the name
 * beside it carries the meaning.
 */
export function FileIcon({ name, kind, open = false }: FileIconProps): JSX.Element {
  const loaded = useSyncExternalStore(subscribeIcons, () => icons)
  const theme = useSyncExternalStore(subscribeTheme, currentTheme)
  const uri = loaded
    ? loaded.uri(resolveIconName({ name, kind, open, theme }, loaded.available, loaded.mapping))
    : null
  return (
    <span className="file-icon" aria-hidden="true">
      {uri ? (
        <img src={uri} alt="" width={16} height={16} draggable={false} />
      ) : (
        <Icon name={kind} size={13} />
      )}
    </span>
  )
}
