/** The slice of `WebglAddon` the loader drives (`@xterm/addon-webgl`). */
export interface GpuAddon {
  onContextLoss(cb: () => void): { dispose(): void }
  dispose(): void
}

export interface GpuRenderer {
  /** Disposes the WebGL addon, if it is still loaded. Idempotent. */
  dispose(): void
  /** Which renderer the terminal is drawing with right now. */
  kind(): 'webgl' | 'dom'
}

/**
 * Loads xterm's WebGL renderer into an opened terminal, with the DOM renderer as
 * the fallback (PERF-04). A throw while creating or loading the addon (no WebGL2,
 * a blocklisted driver) is warned once and the terminal keeps the DOM renderer
 * (PERF-05). A lost WebGL context disposes the addon, and xterm continues on the
 * DOM renderer with its buffer intact (PERF-06). `dispose()` belongs in the
 * pane's cleanup (PERF-07); a context loss followed by an unmount disposes the
 * addon once. The addon factory and the warning are injected so this runs
 * without a GPU.
 */
export function attachGpuRenderer<A extends GpuAddon>(
  // NoInfer: the addon type comes from `create`, so a real `Terminal` (whose
  // `loadAddon` takes any `ITerminalAddon`) is accepted.
  term: { loadAddon(addon: NoInfer<A>): void },
  create: () => A,
  warn: (msg: string, err: unknown) => void
): GpuRenderer {
  let addon: A | null = null
  let loss: { dispose(): void } | null = null
  const release = (): void => {
    if (addon === null) return
    const loaded = addon
    addon = null
    loss?.dispose()
    loss = null
    loaded.dispose()
  }
  try {
    const created = create()
    // Subscribed before loading, as xterm documents, so no loss goes unheard.
    loss = created.onContextLoss(release)
    term.loadAddon(created)
    addon = created
  } catch (err) {
    loss?.dispose()
    loss = null
    warn('[terminal] WebGL renderer unavailable; using the DOM renderer', err)
  }
  return { dispose: release, kind: () => (addon === null ? 'dom' : 'webgl') }
}
