import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // node-pty is a native module (.node) — Vite cannot bundle it, so externalize
  // it (and every other dependency) in main + preload; they load from the
  // packaged node_modules at runtime. See AM1 agent-spike T1.
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // Monaco's icon font, reached by file path because its package exports
        // map appends `.js` to every subpath and so cannot serve a stylesheet.
        // Without it every codicon renders as a missing-glyph box — the +/- in
        // a diff's gutter among them (F2 T21).
        'monaco-codicon.css': resolve(
          'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
        )
      }
    },
    plugins: [react()]
  }
})
