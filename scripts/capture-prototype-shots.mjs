/* Presentation helper (not part of the gate, not a smoke test).
 *
 * Renders the hifi design prototype (design/handoff/Worktree Manager.dc.html) in a
 * headless Electron window and saves one PNG per direction (Tree / Board / Agents) to
 * docs/screenshots/. The prototype ships placeholder data, so these screenshots expose
 * no real ADO tasks or repo names — safe for the public README.
 *
 * Run: npx electron scripts/capture-prototype-shots.mjs
 * Needs network (the prototype loads React UMD + Google Fonts from CDNs).
 */

import { app, BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const PROTOTYPE = join(root, 'design', 'handoff', 'Worktree Manager.dc.html')
const OUTDIR = join(root, 'docs', 'screenshots')

// label = the segmented-control button text; file = output name.
const SHOTS = [
  { label: 'Tree', file: 'tree.png' },
  { label: 'Board', file: 'board.png' },
  { label: 'Agents', file: 'agents.png' }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  mkdirSync(OUTDIR, { recursive: true })

  // Visible window: a hidden/offscreen window only repaints on demand, so capturePage
  // lags one React commit behind each click. A shown window paints continuously.
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#1a1815',
    webPreferences: { offscreen: false }
  })

  await win.loadFile(PROTOTYPE)

  // Wait until the DC runtime has booted and the segmented control exists.
  const segReady = `(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
    return btns.some((t) => t.startsWith('Agents'))
  })()`
  for (let i = 0; i < 60; i++) {
    if (await win.webContents.executeJavaScript(segReady)) break
    await sleep(500)
  }
  // Extra settle for web-font swap + entrance animations.
  await sleep(2500)

  for (const { label, file } of SHOTS) {
    await win.webContents.executeJavaScript(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))
      if (btn) btn.click()
      return !!btn
    })()`)
    await sleep(1200)
    await win.webContents.capturePage() // warm-up frame, discarded
    await sleep(200)
    const img = await win.webContents.capturePage()
    writeFileSync(join(OUTDIR, file), img.toPNG())
    console.log(`saved ${file}`)
  }

  win.destroy()
}

app.whenReady().then(async () => {
  try {
    await run()
    app.quit()
  } catch (err) {
    console.error(err)
    app.exit(1)
  }
})
