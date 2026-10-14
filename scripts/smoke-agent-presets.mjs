/* CDP smoke for agent presets (PRST-10..44, the UI-bound ACs).
 *
 * Self-contained: it seeds a throwaway user-data dir, launches the dev app on
 * it, drives it over CDP, then stops the app and removes everything it made.
 *
 *   node scripts/smoke-agent-presets.mjs
 *
 * ISOLATION — what this script may touch, and how it proves it left it alone:
 *   - config.json and sessions live in a temp `--user-data-dir`, never the real one.
 *   - presets live in a temp file named by PLAYGROUND_PRESETS_FILE; the real
 *     `~/.playground/presets.json` is hashed (or recorded absent) before the run
 *     and compared after it.
 *   - prompts have no override, so the script writes its prompt files into the
 *     real `~/.playground/prompts` under a unique `zz-smoke-presets-<pid>-`
 *     prefix, deletes them in a `finally`, and compares the folder's other
 *     entries (names and sizes) before and after. A folder it had to create is
 *     removed afterwards only if it is empty again.
 *   - the agents are a stub (`node stub-agent.mjs`) that prints its argv and
 *     stays alive, so no real coding agent starts.
 *
 * One visible side effect: PRST-42 clicks **Open presets file**, which opens the
 * temp presets file with the OS default application for `.json`.
 *
 * SMOKE_BREAK=1 compares every check against a deliberately wrong expected
 * value: every check must then FAIL, which proves none of them passes vacuously.
 *
 * Environment: SMOKE_PORT (default 9222) must be free; the script refuses to
 * attach to an app it did not launch.
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, rmdir, unlink } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const BREAK = process.env.SMOKE_BREAK === '1'

const REAL_PRESETS = join(homedir(), '.playground', 'presets.json')
const PROMPTS_DIR = join(homedir(), '.playground', 'prompts')
const P = `zz-smoke-presets-${process.pid}`
const PROMPT_PLAIN = `${P}-plain`
const PROMPT_TASK = `${P}-task`
const PROMPT_BROKEN = `${P}-broken`
const PROMPT_MISSING = `${P}-missing`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------- checks -- */

const checks = []
/** One named check: `actual` must equal `expected` (JSON). SMOKE_BREAK wraps
 *  `expected` so the comparison cannot hold. */
function expectEq(name, actual, expected) {
  const want = BREAK ? { deliberatelyWrong: expected } : expected
  const ok = JSON.stringify(actual) === JSON.stringify(want)
  checks.push({ name, ok })
  const detail = ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`
  console.log(`${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail}`)
}

/* ---------------------------------------------------- isolation proofs -- */

function fileFingerprint(path) {
  if (!existsSync(path)) return { exists: false }
  const bytes = readFileSync(path)
  return {
    exists: true,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mtimeMs: statSync(path).mtimeMs
  }
}

/** The prompts folder's entries other than this run's, as `name:size`. */
function promptsSnapshot() {
  if (!existsSync(PROMPTS_DIR)) return { exists: false, entries: [] }
  const entries = readdirSync(PROMPTS_DIR)
    .filter((n) => !n.startsWith(P))
    .map((n) => `${n}:${statSync(join(PROMPTS_DIR, n)).size}`)
    .sort()
  return { exists: true, entries }
}

/* ------------------------------------------------------------ the app -- */

async function portAnswers() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

let app = null
let appOutput = ''

function launch(userData, presetsFile) {
  const env = { ...process.env, PLAYGROUND_PRESETS_FILE: presetsFile }
  delete env.ELECTRON_RUN_AS_NODE
  // One command string: with `shell`, separate args are only concatenated anyway.
  app = spawn(`npm run dev -- -- --remote-debugging-port=${PORT} "--user-data-dir=${userData}"`, {
    cwd: ROOT,
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const keep = (chunk) => (appOutput = (appOutput + chunk).slice(-8192))
  app.stdout.on('data', keep)
  app.stderr.on('data', keep)
}

function stopApp() {
  if (!app || app.exitCode !== null) return
  try {
    // npm → electron-vite → electron: the whole tree goes.
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* already gone */
  }
}

async function pageTarget() {
  for (let i = 0; i < 180; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* not up yet */
    }
    if (app?.exitCode !== null) throw new Error(`dev app exited\n${appOutput}`)
    await sleep(1000)
  }
  throw new Error(`No CDP page target after 180s on port ${PORT}\n${appOutput}`)
}

/* ---------------------------------------------------------------- CDP -- */

let ws = null
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }
    }, 25000)
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || 'evaluate threw')
  }
  return res.result.value
}

async function connect() {
  const target = await pageTarget()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })
  await send('Runtime.enable')
  await waitFor(
    `document.querySelector('.session-rail') !== null && typeof window.api === 'object'`,
    90000
  )
}

/** Polls `expression` until it is truthy; returns its last value either way. */
async function waitFor(expression, timeout = 8000) {
  const deadline = Date.now() + timeout
  let value
  while (Date.now() < deadline) {
    value = await evaluate(expression)
    if (value) return value
    await sleep(150)
  }
  return value
}

const js = (value) => JSON.stringify(value)

/** Clicks the first `selector` whose trimmed text is `text`; false when none. */
const click = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${js(selector)})]
      .find((e) => ${text === undefined ? 'true' : `(e.textContent || '').trim() === ${js(text)}`})
    if (!el) return false
    el.click()
    return true
  })()`)

/** Focuses `selector`, selects its text, then types `text` as real input. */
async function typeInto(selector, text) {
  const found = await evaluate(`(() => {
    const el = document.querySelector(${js(selector)})
    if (!el) return false
    el.focus()
    el.select()
    return true
  })()`)
  if (!found) throw new Error(`no input ${selector}`)
  if (text === '') {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Delete',
      code: 'Delete',
      windowsVirtualKeyCode: 46
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Delete',
      code: 'Delete',
      windowsVirtualKeyCode: 46
    })
  } else {
    await send('Input.insertText', { text })
  }
  await sleep(100)
}

async function pressEnter() {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...base })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  await sleep(150)
}

const pressEscape = () =>
  evaluate(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return true
  })()`)

/* ------------------------------------------------------- app readings -- */

const dialogOpen = `document.querySelector('.dialog-panel') !== null`
const menuOpen = `document.querySelector('.preset-menu') !== null`

/** The open preset menu, row by row, in DOM order. */
const menuRows = `[...document.querySelector('.preset-menu').children].map((el) => {
  if (el.classList.contains('preset-menu-sep')) return { sep: true }
  return {
    text: el.querySelector('.preset-menu-name')?.textContent.trim() ?? el.textContent.trim(),
    problem: el.querySelector('.preset-menu-problem')?.textContent.trim() ?? null,
    disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true'
  }
})`

/** What the New Session dialog has selected. */
const nsSelection = `(() => ({
  agent: document.querySelector('.ns-agent-chip.selected .ns-agent-name')?.textContent.trim() ?? null,
  level: document.querySelector('.ns-level-segment[aria-pressed="true"]')?.textContent.trim() ?? null,
  cwdChips: document.querySelectorAll('.ns-cwd-chip.selected').length,
  prompt: document.querySelector('.ns-prompt-chip.selected')?.textContent.trim() ?? null
}))()`

const savePresetShown = `document.querySelector('.ns-save-preset') !== null`

/** The Settings › Presets rows. */
const settingsRows = `[...document.querySelectorAll('.set-preset-row')].map((r) => ({
  name: r.querySelector('.set-agent-name')?.textContent.trim() ?? null,
  sub: r.querySelector('.set-preset-sub')?.textContent.trim() ?? null,
  up: r.querySelector('[title="Move up"]')?.disabled ?? null,
  down: r.querySelector('[title="Move down"]')?.disabled ?? null
}))`

const clickRowButton = (name, title) =>
  evaluate(`(() => {
    const row = [...document.querySelectorAll('.set-preset-row')]
      .find((r) => r.querySelector('.set-agent-name')?.textContent.trim() === ${js(name)})
    const btn = row?.querySelector(${js(`[title="${title}"]`)})
    if (!btn) return false
    btn.click()
    return true
  })()`)

const sessionsList = () => evaluate(`window.api.invoke('sessions:list')`)

/** The argv the stub agent of session `id` printed, decoded; null until seen. */
async function stubArgv(id, timeout = 20000) {
  await evaluate(`window.api.invoke('sessions:attach', { id: ${js(id)} }).then(() => true)`)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const text = await evaluate(
      `window.__smk.data.filter((d) => d.id === ${js(id)}).map((d) => d.data).join('')`
    )
    // Terminal escapes (CSI and OSC) out, line breaks out: only the text is left.
    /* eslint-disable no-control-regex */
    const flat = text
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
      .replace(/[\r\n]/g, '')
    const m = /STUB_ARGV=([A-Za-z0-9%._~!*'()-]+)END/.exec(flat)
    if (m) return JSON.parse(decodeURIComponent(m[1]))
    await sleep(300)
  }
  return null
}

/** Spawns through `act`, then returns the one session it added. */
async function newSession(act) {
  const before = new Set((await sessionsList()).map((s) => s.id))
  await evaluate(`(() => {
    document.querySelectorAll('.rail-row').forEach((r) => r.setAttribute('data-smk-old', '1'))
    return true
  })()`)
  await act()
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const added = (await sessionsList()).filter((s) => !before.has(s.id))
    if (added.length > 0) return added[0]
    await sleep(200)
  }
  return null
}

/** The rail's selected row is a row that was not there before the spawn (PRST-28). */
const newRowSelected = `(() => {
  const sel = document.querySelectorAll('.rail-row.selected')
  return sel.length === 1 && !sel[0].hasAttribute('data-smk-old')
})()`

/* -------------------------------------------------------------- drive -- */

async function drive(t) {
  const { wsPath, gonePath, presetsFile, stub } = t
  const readPresets = () => (existsSync(presetsFile) ? readFileSync(presetsFile, 'utf8') : null)
  const writePresets = (value) =>
    writeFileSync(
      presetsFile,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'
    )

  await evaluate(`(() => {
    window.__smk = { data: [] }
    window.api.on('session:data', (p) => window.__smk.data.push(p))
    return true
  })()`)

  /* --- PRST-18: the split button ------------------------------------- */
  const arrow = await evaluate(`(() => {
    const a = document.querySelector('.session-rail-new-arrow')
    return a && {
      popup: a.getAttribute('aria-haspopup'),
      expanded: a.getAttribute('aria-expanded'),
      label: a.getAttribute('aria-label')
    }
  })()`)
  expectEq('PRST-18 the arrow part is a menu button labelled Agent presets', arrow, {
    popup: 'menu',
    expanded: 'false',
    label: 'Agent presets'
  })
  await click('.session-rail-new')
  await waitFor(dialogOpen)
  expectEq(
    'PRST-18 the main part opens the New Session dialog as before',
    await evaluate(`document.querySelector('.dialog-kicker')?.textContent.trim() ?? null`),
    'New session'
  )
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')

  /* --- PRST-20: no presets yet --------------------------------------- */
  await click('.session-rail-new-arrow')
  await waitFor(
    `${menuOpen} && !document.querySelector('.preset-menu').textContent.includes('Loading')`
  )
  expectEq(
    'PRST-20 an empty file shows the no-presets text above Manage presets…',
    await evaluate(menuRows),
    [
      { text: 'No presets yet — use Save as preset in New session', problem: null, disabled: true },
      { sep: true },
      { text: 'Manage presets…', problem: null, disabled: false }
    ]
  )
  await pressEscape()
  expectEq('PRST-20 Escape closes the preset menu', await evaluate(menuOpen), false)

  /* --- PRST-10..17: Save as preset ----------------------------------- */
  await click('.session-rail-new')
  await waitFor(dialogOpen)
  expectEq(
    'PRST-11 Save as preset is hidden while no cwd is selected',
    await evaluate(savePresetShown),
    false
  )
  await click('.ns-level-segment', 'Workspace')
  await waitFor(`document.querySelector('.ns-cwd-chip') !== null`)
  await click('.ns-cwd-chip')
  expectEq(
    'PRST-10 Save as preset shows with a registry agent and a cwd selected',
    await waitFor(savePresetShown),
    true
  )
  await click('.ns-agent-chip.adhoc')
  expectEq(
    'PRST-11 Save as preset is hidden while Ad-hoc command is selected',
    await evaluate(savePresetShown),
    false
  )
  await click('.ns-agent-chip .ns-agent-name', 'Stub')
  await waitFor(
    `[...document.querySelectorAll('.ns-prompt-chip')].some((c) => c.textContent.trim() === ${js(PROMPT_TASK)})`
  )
  await click('.ns-prompt-chip', PROMPT_TASK)
  const before12 = await evaluate(nsSelection)
  await click('.ns-save-preset')
  await waitFor(`document.querySelector('.ns-preset-field input') !== null`)
  expectEq(
    'PRST-12 Save as preset shows a focused name field with Save and Cancel, choices unchanged',
    await evaluate(`(() => ({
      focused: document.activeElement === document.querySelector('.ns-preset-field input'),
      buttons: [...document.querySelectorAll('.ns-preset-row button')].map((b) => b.textContent.trim()),
      selection: ${nsSelection}
    }))()`),
    { focused: true, buttons: ['Cancel', 'Save'], selection: before12 }
  )
  const nameState = `(() => ({
    saveDisabled: [...document.querySelectorAll('.ns-preset-row button')].find((b) => b.textContent.trim() === 'Save')?.disabled ?? null,
    hint: document.querySelector('.ns-preset-hint')?.textContent.trim() ?? null
  }))()`
  await typeInto('.ns-preset-field input', '   ')
  expectEq('PRST-15 a blank name disables Save and shows the rule', await evaluate(nameState), {
    saveDisabled: true,
    hint: '1–40 characters, one line'
  })
  await typeInto('.ns-preset-field input', 'x'.repeat(41))
  expectEq(
    'PRST-15 a 41-character name disables Save and shows the rule',
    await evaluate(nameState),
    {
      saveDisabled: true,
      hint: '1–40 characters, one line'
    }
  )
  await typeInto('.ns-preset-field input', 'Bug fixer')
  expectEq('PRST-15 a valid name enables Save with no hint', await evaluate(nameState), {
    saveDisabled: false,
    hint: null
  })
  await click('.ns-preset-row button', 'Save')
  expectEq(
    'PRST-13 saving shows Saved preset "<name>" and the dialog stays open',
    await waitFor(`document.querySelector('.ns-preset-saved')?.textContent.trim()`),
    'Saved preset "Bug fixer"'
  )
  expectEq(
    'PRST-13/PRST-14 the file holds { name, agent, cwd, prompt } and nothing else',
    JSON.parse(readPresets()),
    [{ name: 'Bug fixer', agent: 'Stub', cwd: wsPath, prompt: PROMPT_TASK }]
  )
  // A second preset, with prompt None, so the replace below has a neighbour.
  await click('.ns-prompt-chip', 'None')
  await click('.ns-save-preset')
  await typeInto('.ns-preset-field input', 'Hello')
  await click('.ns-preset-row button', 'Save')
  await waitFor(`document.querySelector('.ns-preset-saved')?.textContent.includes('Hello')`)
  expectEq('PRST-13 a preset saved with prompt None omits prompt', JSON.parse(readPresets())[1], {
    name: 'Hello',
    agent: 'Stub',
    cwd: wsPath
  })
  // Save over "Bug fixer" under another case, now with prompt None.
  await click('.ns-save-preset')
  await typeInto('.ns-preset-field input', 'bug FIXER')
  await click('.ns-preset-row button', 'Save')
  expectEq(
    'PRST-16 an existing name asks Replace preset "<existing name>"?',
    await waitFor(`document.querySelector('.ns-preset-confirm')?.textContent.trim()`),
    'Replace preset "Bug fixer"?'
  )
  await click('.ns-preset-row button', 'Replace')
  await waitFor(`document.querySelector('.ns-preset-saved') !== null`)
  expectEq(
    'PRST-16 Replace rewrites that entry in place, keeping its position',
    JSON.parse(readPresets()),
    [
      { name: 'bug FIXER', agent: 'Stub', cwd: wsPath },
      { name: 'Hello', agent: 'Stub', cwd: wsPath }
    ]
  )
  // An invalid file refuses the write; the row keeps the typed name.
  writePresets('{ not json')
  await click('.ns-save-preset')
  await typeInto('.ns-preset-field input', 'Refused')
  await click('.ns-preset-row button', 'Save')
  expectEq(
    'PRST-17 a refused write shows the reason and keeps the typed name',
    await waitFor(`(() => {
      const e = document.querySelector('.ns-preset-field .dialog-error')
      return e && { error: e.textContent.trim(), name: document.querySelector('.ns-preset-field input').value }
    })()`),
    { error: 'presets.json is invalid; fix it by hand first', name: 'Refused' }
  )
  expectEq('PRST-17 the invalid file is left as it was', readPresets(), '{ not json')
  await click('.ns-preset-row button', 'Cancel')
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')

  /* --- PRST-19, 32, 34: the menu over a hand-edited file -------------- */
  writePresets([
    { name: 'Hello', agent: 'Stub', cwd: wsPath, prompt: PROMPT_PLAIN },
    { name: 'Bug fixer', agent: 'Stub', cwd: wsPath, prompt: PROMPT_TASK },
    { name: 'Gone agent', agent: 'Nobody', cwd: wsPath, prompt: PROMPT_PLAIN },
    { name: 'Gone folder', agent: 'Stub', cwd: gonePath, prompt: PROMPT_PLAIN },
    { name: 'Lost prompt', agent: 'Stub2', cwd: wsPath, prompt: PROMPT_MISSING },
    { name: 'Bad prompt', agent: 'Stub', cwd: wsPath, prompt: PROMPT_BROKEN },
    { name: 'Bad entry', agent: 5, cwd: wsPath },
    { name: 'hello', agent: 'Stub', cwd: wsPath }
  ])
  const openMenu = async () => {
    await click('.session-rail-new-arrow')
    await waitFor(
      `${menuOpen} && !document.querySelector('.preset-menu').textContent.includes('Loading')`
    )
  }
  await openMenu()
  expectEq(
    'PRST-19/PRST-32/PRST-34 the menu lists presets in file order with broken reasons, then Manage presets…',
    await evaluate(menuRows),
    [
      { text: 'Hello', problem: null, disabled: false },
      { text: 'Bug fixer', problem: null, disabled: false },
      { text: 'Gone agent', problem: 'agent not found', disabled: false },
      { text: 'Gone folder', problem: 'folder not found', disabled: false },
      { text: 'Lost prompt', problem: 'prompt not found', disabled: false },
      { text: 'Bad prompt', problem: 'prompt broken', disabled: false },
      { text: 'Bad entry', problem: 'invalid entry: agent', disabled: true },
      { text: 'hello', problem: 'duplicate name', disabled: true },
      { sep: true },
      { text: 'Manage presets…', problem: null, disabled: false }
    ]
  )
  expectEq(
    'PRST-32 a broken preset carries the warning mark',
    await evaluate(
      `[...document.querySelectorAll('.preset-menu-problem')].every((p) => p.querySelector('svg') !== null)`
    ),
    true
  )
  await click('.preset-menu-name', 'Bad entry')
  expectEq(
    'PRST-34 an entry-invalid preset is not pickable',
    await evaluate(`${menuOpen} && !(${dialogOpen})`),
    true
  )

  /* --- PRST-27, 28: a preset with nothing to ask spawns at once ------ */
  const hello = await newSession(() => click('.preset-menu-name', 'Hello'))
  expectEq(
    'PRST-27 picking Hello spawns with no dialog',
    { session: hello !== null, dialog: await evaluate(dialogOpen) },
    {
      session: true,
      dialog: false
    }
  )
  expectEq(
    'PRST-27 the spawn is a New Session spawn with the preset agent, cwd and prompt',
    hello && { agent: hello.agent, cwd: hello.cwd, argv: await stubArgv(hello.id) },
    { agent: 'Stub', cwd: wsPath, argv: ['--', 'Say hello'] }
  )
  expectEq('PRST-28 the rail selects the spawned session', await waitFor(newRowSelected), true)

  /* --- PRST-22, 24, 25: the Run preset dialog ------------------------ */
  await openMenu()
  await click('.preset-menu-name', 'Bug fixer')
  await waitFor(`document.querySelector('.dialog-kicker')?.textContent.trim() === 'Preset'`)
  const runState = `(() => ({
    title: document.querySelector('.dialog-repo-title')?.textContent.trim() ?? null,
    fields: [...document.querySelectorAll('.ns-var-label')].map((l) => l.textContent.trim()),
    values: [...document.querySelectorAll('.dialog-body .dialog-input')].map((i) => i.value),
    focused: document.activeElement === document.querySelector('.dialog-body .dialog-input'),
    spawnDisabled: document.querySelector('.dialog-footer button[type="submit"]')?.disabled ?? null
  }))()`
  expectEq(
    'PRST-22 picking Bug fixer opens Run preset with its empty taskId field focused',
    await evaluate(runState),
    { title: 'Bug fixer', fields: ['{{taskId}}'], values: [''], focused: true, spawnDisabled: true }
  )
  expectEq(
    'PRST-24 Will run shows the agent command and cwd',
    await evaluate(`document.querySelector('.dialog-path-value')?.textContent.trim()`),
    `node ${stub} --  ·  ${wsPath}`
  )
  await typeInto('.dialog-body .dialog-input', 'a'.repeat(8001))
  expectEq(
    'PRST-24 a prompt over 8000 characters shows the limit and disables Spawn',
    await evaluate(`(() => ({
      error: document.querySelector('.dialog-body .dialog-error')?.textContent.trim() ?? null,
      spawnDisabled: document.querySelector('.dialog-footer button[type="submit"]').disabled
    }))()`),
    { error: 'Prompt too long (8009 / 8000 characters)', spawnDisabled: true }
  )
  await pressEnter()
  expectEq('PRST-25 Enter does not spawn while Spawn is disabled', await evaluate(dialogOpen), true)
  await typeInto('.dialog-body .dialog-input', '  12345 ')
  expectEq(
    'PRST-24 the live Will run card shows the trimmed value',
    await evaluate(`document.querySelector('.ns-prompt-preview')?.textContent`),
    'Fix 12345 now'
  )
  const fixer = await newSession(() => pressEnter())
  expectEq(
    'PRST-25 Enter spawns once Spawn is enabled and closes the dialog',
    { session: fixer !== null, dialog: await evaluate(dialogOpen) },
    {
      session: true,
      dialog: false
    }
  )
  expectEq(
    'PRST-27 the Run preset spawn carries the agent, cwd and resolved prompt',
    fixer && { agent: fixer.agent, cwd: fixer.cwd, argv: await stubArgv(fixer.id) },
    { agent: 'Stub', cwd: wsPath, argv: ['--', 'Fix 12345 now'] }
  )
  expectEq(
    'PRST-29 a numeric {{taskId}} links the session to that task, untitled when not pinned',
    fixer?.task ?? null,
    {
      id: 12345,
      title: null
    }
  )
  expectEq('PRST-28 the rail selects the Run preset session', await waitFor(newRowSelected), true)

  /* --- PRST-26: More options ----------------------------------------- */
  await openMenu()
  await click('.preset-menu-name', 'Bug fixer')
  await waitFor(`document.querySelector('.dialog-kicker')?.textContent.trim() === 'Preset'`)
  await click('.dialog-footer .dialog-btn-ghost', 'More options')
  await waitFor(`document.querySelector('.dialog-kicker')?.textContent.trim() === 'New session'`)
  expectEq(
    'PRST-26 More options opens New Session on the preset agent, level, cwd and prompt',
    await waitFor(
      `(() => { const s = ${nsSelection}; return s.prompt === ${js(PROMPT_TASK)} ? s : null })()`
    ),
    { agent: 'Stub', level: 'Workspace', cwdChips: 1, prompt: PROMPT_TASK }
  )
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')

  /* --- PRST-33: a broken preset opens New Session pre-filled --------- */
  await openMenu()
  await click('.preset-menu-name', 'Lost prompt')
  await waitFor(`document.querySelector('.dialog-kicker')?.textContent.trim() === 'New session'`)
  await sleep(500)
  expectEq(
    'PRST-33 a preset with a missing prompt opens New Session with its agent and cwd, prompt None',
    await evaluate(nsSelection),
    { agent: 'Stub2', level: 'Workspace', cwdChips: 1, prompt: 'None' }
  )
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')

  /* --- PRST-35, 37, 43: an invalid file ------------------------------ */
  writePresets('[1,')
  await openMenu()
  const invalidRows = await evaluate(menuRows)
  expectEq(
    'PRST-35 an invalid file shows one disabled presets.json row above Manage presets…',
    invalidRows.map((r) =>
      r.sep ? r : { ...r, text: r.text.replace(/^(presets\.json: invalid JSON: ).*$/, '$1…') }
    ),
    [
      { text: 'presets.json: invalid JSON: …', problem: null, disabled: true },
      { sep: true },
      { text: 'Manage presets…', problem: null, disabled: false }
    ]
  )
  await click('.preset-menu-item', 'Manage presets…')
  await waitFor(
    `document.querySelector('.set-preset-head') !== null || document.querySelector('.set-tab') !== null`
  )
  await waitFor(`document.querySelector('.set-preset-file-error, .set-preset-row') !== null`)
  expectEq(
    'PRST-37 Manage presets… opens Settings on the Presets tab',
    await evaluate(
      `document.querySelector('.set-tab[aria-selected="true"]')?.textContent.trim() ?? null`
    ),
    'Presets'
  )
  expectEq(
    'PRST-43 an invalid file shows its reason and Open presets file, with no row actions',
    await evaluate(`(() => ({
      reason: /^presets\\.json: invalid JSON: /.test(document.querySelector('.set-preset-file-error')?.textContent.trim() ?? ''),
      open: document.querySelector('.set-preset-open')?.textContent.trim() ?? null,
      actions: document.querySelectorAll('[title="Rename preset"], [title="Move up"], [title="Move down"], [title="Delete preset"]').length
    }))()`),
    { reason: true, open: 'Open presets file', actions: 0 }
  )
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')
  await click('.topbar-icon-btn[title="Settings"]')
  await waitFor(`document.querySelector('.set-tab') !== null`)
  expectEq(
    'PRST-37 every other Settings opener still lands on General',
    await evaluate(
      `document.querySelector('.set-tab[aria-selected="true"]')?.textContent.trim() ?? null`
    ),
    'General'
  )
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')

  /* --- PRST-36, 38..41, 44: Settings › Presets ----------------------- */
  writePresets([
    { name: 'A', agent: 'Stub', cwd: wsPath, prompt: PROMPT_PLAIN },
    { name: 'B', agent: 'Stub', cwd: wsPath },
    { name: 'C', agent: 'Stub2', cwd: wsPath, prompt: PROMPT_TASK, note: 'kept' },
    { name: 'D', agent: 'Stub', cwd: gonePath }
  ])
  const openPresetsTab = async () => {
    await openMenu()
    await click('.preset-menu-item', 'Manage presets…')
    await waitFor(`document.querySelectorAll('.set-preset-row').length > 0`)
  }
  await openPresetsTab()
  expectEq(
    'PRST-36/PRST-40 the tab lists every preset in file order; the ends cannot move outward',
    await evaluate(settingsRows),
    [
      { name: 'A', sub: `Stub · ${wsPath} · ${PROMPT_PLAIN}`, up: true, down: false },
      { name: 'B', sub: `Stub · ${wsPath} · No prompt`, up: false, down: false },
      { name: 'C', sub: `Stub2 · ${wsPath} · ${PROMPT_TASK}`, up: false, down: false },
      { name: 'D', sub: '⚠ folder not found', up: false, down: true }
    ]
  )
  const names = () => JSON.parse(readPresets()).map((e) => e.name)
  await clickRowButton('C', 'Move up')
  await waitFor(
    `document.querySelectorAll('.set-preset-row')[1]?.querySelector('.set-agent-name')?.textContent === 'C'`
  )
  expectEq('PRST-40/PRST-44 Move up swaps with the neighbour in the file at once', names(), [
    'A',
    'C',
    'B',
    'D'
  ])
  expectEq(
    'PRST-44 the tab re-renders from the returned listing',
    (await evaluate(settingsRows)).map((r) => r.name),
    ['A', 'C', 'B', 'D']
  )
  await clickRowButton('C', 'Rename preset')
  await waitFor(`document.querySelector('.set-preset-rename input') !== null`)
  await typeInto('.set-preset-rename input', 'Cee')
  await pressEnter()
  await waitFor(`document.querySelector('.set-preset-rename') === null`)
  expectEq(
    "PRST-38/PRST-44 rename changes that entry's name only, in the file at once",
    JSON.parse(readPresets())[1],
    {
      name: 'Cee',
      agent: 'Stub2',
      cwd: wsPath,
      prompt: PROMPT_TASK,
      note: 'kept'
    }
  )
  const beforeRefused = readPresets()
  await clickRowButton('Cee', 'Rename preset')
  await waitFor(`document.querySelector('.set-preset-rename input') !== null`)
  await typeInto('.set-preset-rename input', 'a')
  await pressEnter()
  expectEq(
    'PRST-39 a name another preset uses is refused',
    await waitFor(
      `document.querySelector('[aria-label="Presets"] .dialog-error')?.textContent.trim()`
    ),
    'A preset named "A" already exists'
  )
  expectEq('PRST-39 the refused rename leaves the file unchanged', readPresets(), beforeRefused)
  await click('.set-preset-rename button', 'Cancel')
  await clickRowButton('A', 'Delete preset')
  expectEq(
    'PRST-41 delete asks Delete preset "<name>"?',
    await waitFor(`document.querySelector('.set-preset-confirm')?.textContent.trim()`),
    'Delete preset "A"?'
  )
  await click('.set-preset-delete')
  await waitFor(`document.querySelector('.set-preset-confirm') === null`)
  expectEq('PRST-41/PRST-44 confirming removes that entry only, in the file at once', names(), [
    'Cee',
    'B',
    'D'
  ])

  /* --- PRST-42: Open presets file ------------------------------------ */
  await unlink(presetsFile)
  await click('.set-preset-open')
  await waitFor(`document.querySelector('.set-preset-row') === null`)
  await sleep(500)
  expectEq(
    'PRST-42 Open presets file creates a missing file as [] and opens it with no error',
    {
      file: readPresets(),
      error: await evaluate(
        `document.querySelector('[aria-label="Presets"] > div > .dialog-error')?.textContent ?? null`
      )
    },
    { file: '[]\n', error: null }
  )
  await click('.dialog-footer .dialog-btn-ghost', 'Cancel')
}

/* ---------------------------------------------------------------- run -- */

const realBefore = fileFingerprint(REAL_PRESETS)
const promptsBefore = promptsSnapshot()
let tmp = null
const ourPrompts = [
  [PROMPT_PLAIN, 'Say hello\n'],
  [PROMPT_TASK, 'Fix {{taskId}} now\n'],
  [PROMPT_BROKEN, '']
]
let failure = null

try {
  if (await portAnswers()) throw new Error(`port ${PORT} already answers CDP; close what holds it`)

  tmp = await mkdtemp(join(tmpdir(), 'smoke-presets-'))
  const userData = join(tmp, 'user-data')
  const wsPath = join(tmp, 'ws')
  const gonePath = join(tmp, 'gone')
  const presetsFile = join(tmp, 'presets.json')
  const stub = join(tmp, 'stub-agent.mjs')
  mkdirSync(userData)
  mkdirSync(wsPath)
  writeFileSync(
    stub,
    // argv URI-encoded on one line, so terminal escapes cannot split it.
    "process.stdout.write('STUB_ARGV=' + encodeURIComponent(JSON.stringify(process.argv.slice(2))) + 'END\\n')\n" +
      'setInterval(() => {}, 1 << 30)\n'
  )
  writeFileSync(
    join(userData, 'config.json'),
    JSON.stringify(
      {
        ui: { theme: 'dark', direction: 'agents', defaultShell: 'pwsh' },
        workspaces: [{ id: wsPath.toLowerCase(), path: wsPath, displayName: 'presets-smoke' }],
        agents: [
          { name: 'Stub', command: 'node', args: [stub], color: '--accent' },
          { name: 'Stub2', command: 'node', args: [stub], color: '--blue' }
        ],
        ado: { autoPinFromWorktrees: false },
        pinnedTasks: [],
        sessions: []
      },
      null,
      2
    ) + '\n'
  )
  mkdirSync(PROMPTS_DIR, { recursive: true })
  for (const [name, text] of ourPrompts) writeFileSync(join(PROMPTS_DIR, `${name}.md`), text)

  launch(userData, presetsFile)
  await connect()
  await drive({ wsPath, gonePath, presetsFile, stub })
} catch (err) {
  failure = err
  console.error(`\nsmoke aborted: ${err instanceof Error ? err.stack : err}`)
} finally {
  if (ws) {
    try {
      await evaluate(`(async () => {
        for (const s of await window.api.invoke('sessions:list')) {
          try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {}
          try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {}
        }
        return true
      })()`)
    } catch {
      /* the app may already be gone */
    }
    ws.close()
  }
  stopApp()
  await sleep(1500)
  for (const [name] of ourPrompts) {
    await rm(join(PROMPTS_DIR, `${name}.md`), { force: true })
  }
  if (!promptsBefore.exists && existsSync(PROMPTS_DIR) && readdirSync(PROMPTS_DIR).length === 0) {
    await rmdir(PROMPTS_DIR)
  }
  // Async rm: rmSync no-ops on this machine's non-ASCII profile paths.
  if (tmp) await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
}

/* The isolation proofs run whatever happened above (never broken by SMOKE_BREAK). */
const realAfter = fileFingerprint(REAL_PRESETS)
const promptsAfter = promptsSnapshot()
const leftovers = existsSync(PROMPTS_DIR)
  ? readdirSync(PROMPTS_DIR).filter((n) => n.startsWith(P))
  : []
const isolation = [
  [
    'the real ~/.playground/presets.json is untouched',
    JSON.stringify(realAfter) === JSON.stringify(realBefore)
  ],
  [
    "the prompts folder's other entries are unchanged",
    JSON.stringify(promptsAfter) === JSON.stringify(promptsBefore)
  ],
  ['no smoke prompt file is left behind', leftovers.length === 0],
  ['the temp folder is removed', tmp === null || !existsSync(tmp)]
]
for (const [name, ok] of isolation) {
  checks.push({ name, ok })
  console.log(`    ${ok ? 'PASS' : 'FAIL'}  isolation: ${name}`)
}
console.log(
  `    real presets.json before ${JSON.stringify(realBefore)} after ${JSON.stringify(realAfter)}`
)

const passed = checks.filter((c) => c.ok).length
console.log(
  `\n${passed}/${checks.length} checks passed${BREAK ? ' (SMOKE_BREAK: every PRST check should fail)' : ''}`
)
process.exit(failure === null && passed === checks.length ? 0 : 1)
