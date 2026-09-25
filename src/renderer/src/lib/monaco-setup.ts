import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/basic-languages/monaco.contribution'
import 'monaco-codicon.css'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

/**
 * Monaco, set up for the one thing this app asks of it: reading code (AD-025).
 *
 * Only `editor.api` and the Monarch basic-language contributions are imported.
 * The TS, JSON, CSS and HTML language services are most of Monaco's weight and
 * would load to power completions and diagnostics that a read-only viewer never
 * shows.
 */

/**
 * Monaco asks its environment for a worker rather than constructing one itself,
 * and its default answer — used when it is loaded from a CDN — is a `blob:`
 * URL. The renderer CSP (`index.html:9`) is `script-src 'self'` with no
 * `worker-src`, so workers fall back to `script-src` and a `blob:` worker is
 * refused. Vite's `?worker` import emits a same-origin file instead, which
 * `'self'` allows. Proved in dev and in the packaged build by F1 T13.
 */
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

/** The built-in theme matching the app's: `data-theme` on `<html>` (App.tsx:158). */
export function monacoTheme(): 'vs' | 'vs-dark' {
  return document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark'
}

/**
 * Re-applies the matching built-in theme whenever the app's theme toggles.
 * Monaco's theme is global, not per-editor, so this is set once for the app
 * rather than per mounted editor. Returns the disposer.
 */
export function followAppTheme(): () => void {
  monaco.editor.setTheme(monacoTheme())
  const observer = new MutationObserver(() => monaco.editor.setTheme(monacoTheme()))
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
  return () => observer.disconnect()
}

/**
 * The language id Monaco should use for a path (FXPL-17), matched against the
 * Monarch contributions actually loaded — by filename first (`Dockerfile`,
 * `Makefile` carry no extension), then by extension. Unknown means plain text,
 * which still renders; highlighting is the only thing lost.
 */
export function languageForPath(path: string): string {
  const name = (path.split(/[\\/]/).pop() ?? '').toLowerCase()
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const languages = monaco.languages.getLanguages()
  const byFilename = languages.find((l) =>
    (l.filenames ?? []).some((f) => f.toLowerCase() === name)
  )
  if (byFilename) return byFilename.id
  if (!ext) return 'plaintext'
  const byExtension = languages.find((l) =>
    (l.extensions ?? []).some((e) => e.toLowerCase() === ext)
  )
  return byExtension?.id ?? 'plaintext'
}

export { monaco }
