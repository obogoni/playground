import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { languageForPath, monaco } from '../lib/monaco-setup'
import './CodeViewer.css'

interface CodeViewerProps {
  /** Path relative to the worktree root. Picks the language (FXPL-17). */
  path: string
  /** The `text` of a `FileContent` — the viewer never sees the other kinds. */
  text: string
}

/**
 * The read-only file viewer (FXPL-17): Monaco, one editor per mounted tab,
 * highlighted by the Monarch contribution matching the path.
 *
 * It shows the file and says nothing about diffs. FXPL-14's caption was there
 * only while F2 had no diff to open; now a click in either diff mode opens one
 * (FDIF-10), and the only way here is the full-folder mode.
 *
 * The editor is created once and then fed new text, never recreated, because a
 * disk change must update the tab in place and keep the scroll position
 * (FXPL-21). `setValue` resets the scroll, so the offset is captured and
 * restored around the edit — cheap, and it survives a content replacement of
 * any size.
 */
export function CodeViewer({ path, text }: CodeViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value: text,
      language: languageForPath(path),
      readOnly: true,
      // A read-only viewer has nothing to type into, and the cursor's blink
      // reads as an invitation to edit.
      domReadOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false
    })
    editorRef.current = editor
    return () => {
      editorRef.current = null
      // Disposing the editor does not dispose its model (FXPL-18: tabs come and
      // go while the app runs, so a leak here accumulates for the session).
      editor.getModel()?.dispose()
      editor.dispose()
    }
    // Created once per mounted tab; `text` and `path` are applied by the effects
    // below so the editor survives a content replacement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || model.getValue() === text) return
    const scrollTop = editor.getScrollTop()
    const scrollLeft = editor.getScrollLeft()
    model.setValue(text)
    editor.setScrollTop(scrollTop)
    editor.setScrollLeft(scrollLeft)
  }, [text])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model) monaco.editor.setModelLanguage(model, languageForPath(path))
  }, [path])

  return (
    <div className="code-viewer">
      <div className="code-viewer-editor" ref={containerRef} />
    </div>
  )
}
