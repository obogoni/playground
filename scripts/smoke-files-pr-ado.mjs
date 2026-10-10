/* CDP smoke for the Files Pull request mode (FPRA-01..36), against a live
 * Azure DevOps pull request.
 *
 *   SMOKE_PR_WORKTREE=<a worktree on the sandbox PR's source branch> \
 *     node scripts/smoke-files-pr-ado.mjs [--allow-writes]
 *
 * The pull request is whatever the app finds for that worktree's branch: a
 * DRAFT the owner named, with no reviewers, so nothing here notifies anyone.
 * Nothing about it lives in this file: no organization, project, repository,
 * branch, number or path. The output names checks and counts, never content.
 *
 * The script launches its own dev app and tears it down:
 *   - a throwaway --user-data-dir under the OS temp folder, holding one
 *     workspace: the folder that contains the sandbox worktree's repository,
 *     which the app scans one level deep as it scans any workspace (it lists
 *     only real directories, so a junction would not do). Nothing of the
 *     owner's real configuration is in scope;
 *   - CDP on SMOKE_PORT (default 9333); a port that already answers is refused;
 *   - every process it started is killed, and the temp folder removed, in
 *     `finally`. No agent session is ever started.
 *
 * Read-only by default: nothing reaches Azure DevOps but the app's own reads.
 *
 * --allow-writes makes the app write, through its own UI, on threads this run
 * creates and on nothing else: a new thread from a two-line selection on the
 * modified side, a reply to it, two status changes on it, and a general
 * comment. Every comment carries a random run marker. In `finally` the script
 * deletes, over the same REST API the app uses, every comment carrying the
 * marker, and reads each back to confirm `isDeleted`. It never changes the
 * pull request's draft state, title, description, reviewers or votes, never
 * touches a thread it did not create, and never pushes.
 *
 * SMOKE_ONLY=overview | diff | writes runs one section alone, from a fresh
 * launch, for iterating on it; the whole smoke runs once before the PR.
 *
 * The sandbox is expected to hold: an active thread anchored to lines of a
 * changed file, a thread whose line was deleted (outdated), and at least one
 * deleted thread. Checks that need one say so when it is missing.
 */

import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.SMOKE_PORT) || 9333
const ONLY = process.env.SMOKE_ONLY ?? null
const WRITES = process.argv.includes('--allow-writes')
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARK = `smoke-${randomBytes(4).toString('hex')}`
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'
const API = 'api-version=7.1'

if (ONLY !== null && !['overview', 'diff', 'writes'].includes(ONLY)) {
  console.error('SMOKE_ONLY must be overview, diff or writes.')
  process.exit(2)
}
if (ONLY === 'writes' && !WRITES) {
  console.error('SMOKE_ONLY=writes needs --allow-writes.')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const J = JSON.stringify

/* ------------------------------------------------------------ sandbox -- */

const WT_INPUT = process.env.SMOKE_PR_WORKTREE
if (!WT_INPUT) {
  console.error('Set SMOKE_PR_WORKTREE to a worktree on the sandbox pull request branch.')
  process.exit(2)
}
const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

let WT
let BRANCH
let REPO_ROOT
try {
  WT = git(['rev-parse', '--show-toplevel'], WT_INPUT)
  BRANCH = git(['branch', '--show-current'], WT)
  REPO_ROOT = dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], WT))
} catch {
  console.error('SMOKE_PR_WORKTREE is not a git worktree.')
  process.exit(2)
}
if (!BRANCH) {
  console.error('SMOKE_PR_WORKTREE has a detached HEAD; it must be on the PR source branch.')
  process.exit(2)
}

/** org / project / repo of the worktree's upstream remote, for the cleanup's REST calls only. */
function adoTarget() {
  const remote = git(['config', `branch.${BRANCH}.remote`], WT) || 'origin'
  const url = git(['remote', 'get-url', remote], WT)
  const m =
    url.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i) ??
    url.match(/([^/.@]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/?#]+)/i)
  if (!m) throw new Error('The sandbox remote is not an Azure DevOps https remote.')
  return { org: m[1], project: m[2], repo: m[3] }
}

/* ---------------------------------------------------------------- REST -- */

let token = null
function adoToken() {
  if (token) return token
  // The same command the app runs (AdoGateway); az.cmd needs a shell on Windows.
  token = execFileSync(
    'cmd.exe',
    [
      '/d',
      '/c',
      `az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`
    ],
    { encoding: 'utf8', windowsHide: true }
  ).trim()
  return token
}

let prBase = null
async function rest(method, path) {
  const res = await fetch(`${prBase}${path}${path.includes('?') ? '&' : '?'}${API}`, {
    method,
    headers: { Authorization: `Bearer ${adoToken()}` }
  })
  if (!res.ok) throw new Error(`REST ${method} answered ${res.status}`)
  return method === 'DELETE' ? null : res.json()
}

/** Every thread of the pull request, deleted ones included, as Azure DevOps holds them. */
const restThreads = async () => (await rest('GET', '/threads')).value

/** Comments this run wrote: the marker is random per run, so nothing else carries it. */
function ownComments(threads) {
  const out = []
  for (const thread of threads) {
    for (const comment of thread.comments ?? []) {
      if (typeof comment.content === 'string' && comment.content.includes(MARK)) {
        out.push({
          threadId: thread.id,
          commentId: comment.id,
          deleted: comment.isDeleted === true
        })
      }
    }
  }
  return out
}

/* ------------------------------------------------------------- launch -- */

const DIR = mkdtempSync(join(tmpdir(), 'playground-smoke-pr-'))
const USER_DATA = join(DIR, 'userData')
let app = null
let logFd = null

async function portAnswers() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`)
    return true
  } catch {
    return false
  }
}

async function launch() {
  if (await portAnswers()) {
    throw new Error(`Port ${PORT} already answers; it is not this script's app. Set SMOKE_PORT.`)
  }
  mkdirSync(USER_DATA, { recursive: true })
  // The app lists a workspace's repositories one level down, and each
  // repository's linked worktrees through `git worktree list`.
  const ws = dirname(REPO_ROOT)
  writeFileSync(
    join(USER_DATA, 'config.json'),
    J({ workspaces: [{ id: ws.toLowerCase(), path: ws, displayName: 'ws' }] }) + '\n'
  )
  const log = openSync(join(DIR, 'app.log'), 'w')
  logFd = log
  app = spawn(
    process.execPath,
    [
      join(APP_ROOT, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
      'dev',
      '--',
      `--user-data-dir=${USER_DATA}`,
      `--remote-debugging-port=${PORT}`,
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling'
    ],
    { cwd: APP_ROOT, stdio: ['ignore', log, log], windowsHide: true }
  )
}

async function teardown() {
  if (app?.pid) {
    try {
      // The dev server and every Electron process under it, and nothing else.
      execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* already gone */
    }
  }
  if (logFd !== null) closeSync(logFd)
  // Chromium lets go of the profile a moment after its processes die.
  for (let i = 0; i < 30 && existsSync(DIR); i++) {
    try {
      rmSync(DIR, { recursive: true, force: true })
    } catch {
      await sleep(1000)
    }
  }
}

/* ------------------------------------------------------------ harness -- */

let ws = null
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(J({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }
    }, 30000)
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

/** Polls `expression` until it is truthy, up to `ms`; returns its last value. */
async function waitFor(expression, ms = 15000, step = 200) {
  let value = null
  for (let waited = 0; waited <= ms; waited += step) {
    value = await evaluate(expression)
    if (value) return value
    await sleep(step)
  }
  return value
}

async function connect() {
  let page = null
  for (let i = 0; i < 120 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools')) ?? null
    } catch {
      /* not up yet */
    }
    if (!page) await sleep(1000)
  }
  if (!page) throw new Error(`No CDP page on port ${PORT} after 120 s`)
  ws = new WebSocket(page.webSocketDebuggerUrl)
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
  if (!(await waitFor(`document.querySelector('.topbar') !== null`, 60000, 500))) {
    throw new Error('The top bar never appeared')
  }
}

const checks = []
const skipped = []
/** A check this sandbox cannot drive: printed, never counted as a pass. */
function skip(label, reason) {
  skipped.push(label)
  console.log(`--. SKIP  ${label} — ${reason}`)
}
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  )
}

async function mouse(type, x, y, extra = {}) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra })
}

async function click(point) {
  await mouse('mouseMoved', point.x, point.y)
  await mouse('mousePressed', point.x, point.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', point.x, point.y, { button: 'left', buttons: 0, clickCount: 1 })
}

/** A real drag, the way a reader selects text: press, move in steps, release. */
async function drag(from, to) {
  await mouse('mouseMoved', from.x, from.y)
  await mouse('mousePressed', from.x, from.y, { button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 6; i++) {
    const x = from.x + ((to.x - from.x) * i) / 6
    const y = from.y + ((to.y - from.y) * i) / 6
    await mouse('mouseMoved', x, y, { button: 'left', buttons: 1 })
    await sleep(30)
  }
  await mouse('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 })
}

/** Types through the keyboard, one key at a time, into whatever holds the focus. */
async function type(text) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
}

async function ctrlEnter() {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 }
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

/** The centre of the first element `selector` matches, or null. */
const centre = (selector) =>
  evaluate(`(() => {
    const el = document.querySelector(${J(selector)})
    if (!el) return null
    // Inside the editor Monaco owns the scrolling; scrollIntoView would shift
    // its clipped layers out from under its own coordinates.
    if (!el.closest('.monaco-editor')) el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)

const clickByText = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${J(selector)})]
      .find((e) => (e.textContent || '').trim() === ${J(text)})
    if (!el) return false
    el.click()
    return true
  })()`)

/** Sets a React-controlled <select> the way a pick does. */
const pickStatus = (scope, value) =>
  evaluate(`(() => {
    const select = document.querySelector(${J(scope + ' .pr-thread-status')})
    if (!select) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(select, ${J(value)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)

/* ------------------------------------------------------ page readings -- */

/** The pull request as the app's own main process reads it (window.api, no network of ours). */
async function appDetail() {
  return evaluate(`(async () => {
    const search = await window.api.invoke('ado-pr:find', { worktreePath: ${J(WT)} })
    if (search.kind !== 'found') return { search: search.kind }
    const pr = search.prs[0]
    const got = await window.api.invoke('ado-pr:get', {
      worktreePath: ${J(WT)},
      pr: { target: pr.target, id: pr.id }
    })
    return got.kind === 'ok' ? { search: 'found', count: search.prs.length, detail: got.detail } : { search: 'found', get: got.kind }
  })()`)
}

/** What the Overview lists: section labels, and each thread by id with where it sits. */
const overview = () =>
  evaluate(`(() => {
    const root = document.querySelector('.pr-overview')
    if (!root) return null
    const sections = [...root.querySelectorAll('.pr-overview-section')].map((s) => {
      const label = s.querySelector('.section-label')?.textContent.trim() ?? ''
      return {
        label,
        threads: [...s.querySelectorAll('.pr-thread')].map((t) => ({
          id: Number(t.getAttribute('data-thread-id')),
          expanded: t.querySelector('.pr-thread-toggle')?.getAttribute('aria-expanded') === 'true',
          link: t.querySelector('.pr-thread-location.link') !== null,
          location: t.querySelector('.pr-thread-location') !== null,
          comments: t.querySelectorAll('.pr-thread-comment').length
        }))
      }
    })
    return {
      title: root.querySelector('.pr-overview-title')?.textContent.trim() ?? '',
      id: root.querySelector('.pr-overview-id')?.textContent.trim() ?? '',
      draft: root.querySelector('.pr-overview-badge')?.textContent.trim() ?? '',
      meta: [...root.querySelectorAll('.pr-overview-meta > span')].map((s) => s.textContent.trim().length > 0),
      reviewers: root.querySelectorAll('.pr-overview-reviewer').length,
      noReviewers: [...root.querySelectorAll('.pr-overview-empty')].some((e) => e.textContent.includes('No reviewers')),
      description: root.querySelector('.pr-overview-description') !== null,
      noDescription: [...root.querySelectorAll('.pr-overview-empty')].some((e) => e.textContent.includes('No description')),
      sections
    }
  })()`)

const sectionOf = (view, id) =>
  view?.sections.find((s) => s.threads.some((t) => t.id === id))?.label.replace(/ \(\d+\)$/, '') ??
  null

const threadIn = (view, id) =>
  view?.sections.flatMap((s) => s.threads).find((t) => t.id === id) ?? null

const activeTabLabel = `document.querySelector('.file-tab.active .file-tab-label')?.textContent.trim() ?? ''`

async function showOverview() {
  await evaluate(`document.querySelector('.file-tab.fixed .file-tab-label')?.click()`)
  return waitFor(`document.querySelector('.pr-overview-title') !== null`, 20000)
}

/**
 * Lines of one side of the open PR diff that Monaco has rendered: number,
 * gutter box, and the text line's box, for aiming the mouse.
 */
const sideLines = (side) =>
  evaluate(`(() => {
    const ed = document.querySelector('.pr-diff-tab .editor.${side}')
    if (!ed) return null
    const box = ed.getBoundingClientRect()
    const views = [...ed.querySelectorAll('.view-lines .view-line')]
    return [...ed.querySelectorAll('.margin-view-overlays .line-numbers')]
      .map((n) => {
        const r = n.getBoundingClientRect()
        const line = views.find((v) => Math.abs(v.getBoundingClientRect().top - r.top) < 2)
        return {
          n: Number(n.textContent.trim()),
          top: r.top,
          bottom: r.bottom,
          active: n.classList.contains('active-line-number'),
          text: line ? line.textContent.replace(/\\u00a0/g, ' ') : null,
          inView: r.top >= box.top && r.bottom <= box.bottom
        }
      })
      .filter((l) => Number.isInteger(l.n) && l.n > 0)
      .sort((a, b) => a.n - b.n)
  })()`)

/** Where character `k` of rendered line `n` sits on screen, for a click that lands on column k + 1. */
const charPoint = (side, n, k) =>
  evaluate(`(() => {
    const ed = document.querySelector('.pr-diff-tab .editor.${side}')
    const num = [...ed.querySelectorAll('.margin-view-overlays .line-numbers')]
      .find((e) => e.textContent.trim() === ${J(String(n))})
    if (!num) return null
    const top = num.getBoundingClientRect().top
    const view = [...ed.querySelectorAll('.view-lines .view-line')]
      .find((v) => Math.abs(v.getBoundingClientRect().top - top) < 2)
    if (!view) return null
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT)
    let left = ${k}
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (left < node.length) {
        const range = document.createRange()
        range.setStart(node, left)
        range.setEnd(node, left + 1)
        const r = range.getBoundingClientRect()
        return { x: r.left + 1, y: r.top + r.height / 2 }
      }
      left -= node.length
    }
    const r = view.getBoundingClientRect()
    return { x: r.left + 2, y: r.top + r.height / 2 }
  })()`)

/** Each thread zone of the open PR diff: its side, its box and the thread in it. */
const zones = () =>
  evaluate(`[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone')].map((z) => {
    const r = z.getBoundingClientRect()
    const t = z.querySelector('.pr-thread')
    return {
      side: z.closest('.editor.modified') ? 'modified' : z.closest('.editor.original') ? 'original' : '?',
      top: r.top,
      height: r.height,
      // The gap Monaco opened for it: the empty view zone at the same top.
      gap: [...(z.closest('.editor')?.querySelectorAll('.diff-viewer-zone-space') ?? [])]
        .map((g) => g.getBoundingClientRect())
        .find((g) => Math.abs(g.top - r.top) < 1.5)?.height ?? null,
      visible: getComputedStyle(z).visibility !== 'hidden',
      threadId: t ? Number(t.getAttribute('data-thread-id')) : null,
      expanded: t?.querySelector('.pr-thread-toggle')?.getAttribute('aria-expanded') === 'true',
      composer: z.querySelector('.comment-composer') !== null,
      comments: [...z.querySelectorAll('.pr-thread-comment .markdown-body')].map((b) => b.textContent)
    }
  })`)

/** The line a zone sits under: the rendered line whose gutter box ends where the zone begins. */
function lineAbove(zone, lines) {
  const hit = lines.find((l) => Math.abs(l.bottom - zone.top) < 1.5)
  return hit ? hit.n : null
}

/**
 * The modified-side selection the PR diff holds, read from React's state for
 * the PrDiffTab: exactly what Monaco reported, and what a new thread is
 * anchored to (FPRA-27). The component's first hook is that state. The walk
 * starts from the root's committed tree: a DOM node's own fiber pointer can be
 * the stale alternate.
 */
const heldSelection = () =>
  evaluate(`(() => {
    const host = [...document.querySelectorAll('body > *')]
      .find((e) => Object.keys(e).some((k) => k.startsWith('__reactContainer$')))
    if (!host) return null
    const key = Object.keys(host).find((k) => k.startsWith('__reactContainer$'))
    const stack = [host[key].stateNode.current]
    while (stack.length) {
      const fiber = stack.pop()
      if (fiber.type && fiber.type.name === 'PrDiffTab') {
        const state = fiber.memoizedState?.memoizedState
        return state && typeof state.startLine === 'number' ? state : null
      }
      if (fiber.sibling) stack.push(fiber.sibling)
      if (fiber.child) stack.push(fiber.child)
    }
    return null
  })()`)

/**
 * Selects from character `ka` of line `a` to character `kb` of line `b` the
 * way a reader extends a selection: a click, then a Shift+click. Each point is
 * read just before it is used, because the view may have moved in between.
 */
async function selectRange(side, a, ka, b, kb) {
  await click(await charPoint(side, a, ka))
  await sleep(400)
  const to = await charPoint(side, b, kb)
  if (!to) return
  await mouse('mouseMoved', to.x, to.y, { modifiers: 8 })
  await mouse('mousePressed', to.x, to.y, {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    modifiers: 8
  })
  await mouse('mouseReleased', to.x, to.y, {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    modifiers: 8
  })
}

/** Watches the Overview's refresh button for "Refreshing…" from now on. */
const armLoadingWatch = () =>
  evaluate(`(() => {
    window.__smokeLoads = 0
    let was = false
    const look = () => {
      const now = (document.querySelector('.pr-overview-toolbar .pr-overview-button')?.textContent ?? '').includes('Refreshing')
      if (now && !was) window.__smokeLoads++
      was = now
    }
    window.__smokeObserver?.disconnect()
    window.__smokeObserver = new MutationObserver(look)
    window.__smokeObserver.observe(document.body, { subtree: true, childList: true, characterData: true })
    return true
  })()`)

const loadsSeen = () => evaluate(`window.__smokeLoads ?? 0`)
const idle = `!(document.querySelector('.pr-overview-toolbar .pr-overview-button')?.textContent ?? '').includes('Refreshing')`

/* ------------------------------------------------------------- setup -- */

let fx = null // what the app read: the PR and the threads the checks are about

async function enterPullRequestMode() {
  await clickByText('.topbar-segment', 'Tree')
  const picked = await waitFor(
    `(() => {
      const el = [...document.querySelectorAll('.sidebar-worktree-branch')]
        .find((e) => (e.textContent || '').trim() === ${J(BRANCH)})
      if (!el) return false
      el.closest('.sidebar-worktree').click()
      return true
    })()`,
    60000,
    500
  )
  if (!picked) throw new Error('The sandbox worktree never appeared in the sidebar')
  await sleep(800)
  await clickByText('.topbar-segment', 'Files')
  await waitFor(`document.querySelectorAll('.file-tree-mode').length > 0`, 20000)
  await clickByText('.file-tree-mode', 'Pull request')
  return waitFor(`document.querySelector('.pr-overview-title') !== null`, 60000, 300)
}

async function readFixture() {
  const read = await appDetail()
  const detail = read.detail ?? null
  const threads = detail?.threads ?? []
  const own = (t) => (t.comments ?? []).some((c) => c.content.includes(MARK))
  const active = threads.find(
    (t) =>
      !own(t) && t.place.kind === 'placed' && t.place.side === 'right' && t.resolution === 'active'
  )
  fx = {
    read,
    detail,
    active: active ?? null,
    outdated: threads.filter((t) => t.place.kind === 'outdated'),
    deleted: threads.filter((t) => t.place.kind === 'deleted'),
    file: active
      ? detail.files.find((f) => f.path === active.place.path)
      : (detail?.files[0] ?? null)
  }
  if (WRITES && detail) {
    const t = adoTarget()
    prBase = `https://dev.azure.com/${t.org}/${t.project}/_apis/git/repositories/${t.repo}/pullRequests/${detail.id}`
  }
}

/** Opens the active thread's diff from its Overview location, as a reader does. */
async function openActiveThreadDiff() {
  await showOverview()
  const opened = await evaluate(`(() => {
    const link = document.querySelector('.pr-overview .pr-thread[data-thread-id="${fx.active.id}"] .pr-thread-location.link')
    if (!link) return false
    link.click()
    return true
  })()`)
  if (!opened) return false
  await waitFor(
    `document.querySelector('.pr-diff-tab .editor.modified .view-line') !== null`,
    30000,
    300
  )
  await sleep(1200)
  return true
}

/* ----------------------------------------------------------- overview -- */

async function overviewSection() {
  // 1. FPRA-01: the fifth mode, beside the four that shipped before it.
  const modes = await evaluate(
    `[...document.querySelectorAll('.file-tree-mode')].map((e) => e.textContent.trim())`
  )
  check(
    'The mode selector offers five modes, the fifth Pull request (FPRA-01)',
    modes.length === 5 && modes[4] === 'Pull request',
    `${modes.length} modes, fifth ${modes[4] === 'Pull request' ? 'Pull request' : 'other'}`
  )

  // 2. FPRA-01 / T23: at the left column's minimum width every label stays on
  //    one line and inside the column. The row wraps; no label breaks.
  const handle = await evaluate(`(() => {
    const h = document.querySelector('.files-view .pane-handle')
    if (!h) return null
    const r = h.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: h.parentElement.getBoundingClientRect().width }
  })()`)
  let narrow = null
  if (handle) {
    await drag(handle, { x: handle.x - 600, y: handle.y })
    await sleep(500)
    narrow = await evaluate(`(() => {
      const pane = document.querySelector('.files-view .resizable-pane')
      const p = pane.getBoundingClientRect()
      const buttons = [...document.querySelectorAll('.file-tree-mode')]
      const one = buttons.map((b) => {
        const r = b.getBoundingClientRect()
        const lh = parseFloat(getComputedStyle(b).lineHeight) || 16
        return {
          inside: r.left >= p.left - 0.5 && r.right <= p.right + 0.5,
          oneLine: b.scrollWidth <= b.clientWidth + 0.5 && r.height < lh * 2 + 8
        }
      })
      const rows = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size
      return { width: Math.round(p.width), one, rows }
    })()`)
    const moved = await evaluate(`(() => {
      const r = document.querySelector('.files-view .pane-handle').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`)
    await drag(moved, { x: handle.x, y: handle.y })
    await sleep(300)
  }
  check(
    'At the column minimum width the five modes wrap whole, none broken or clipped (FPRA-01)',
    narrow !== null &&
      narrow.width === 200 &&
      narrow.one.length === 5 &&
      narrow.one.every((b) => b.inside && b.oneLine) &&
      narrow.rows >= 2,
    narrow
      ? `width ${narrow.width}, ${narrow.rows} rows, ${narrow.one.filter((b) => b.inside && b.oneLine).length}/5 whole`
      : 'no pane handle'
  )

  // 3. FPRA-02/09: the branch's pull request is found and opens on the fixed
  //    Overview tab, numbered and marked draft.
  const view = await overview()
  const fixed = await evaluate(
    `[...document.querySelectorAll('.file-tab.fixed .file-tab-label')].map((e) => e.textContent.trim())`
  )
  check(
    'The branch pull request is found and shown on the fixed Overview tab, as a draft (FPRA-02/09)',
    fx.read.search === 'found' &&
      fx.detail !== null &&
      view !== null &&
      view.id === `!${fx.detail.id}` &&
      view.draft === 'Draft' &&
      fixed.length === 1 &&
      fixed[0] === 'Overview' &&
      (await evaluate(activeTabLabel)) === 'Overview',
    `search ${fx.read.search}, id ${view?.id === `!${fx.detail?.id}` ? 'matches' : 'differs'}, draft ${view?.draft === 'Draft'}, fixed tabs ${fixed.length}`
  )

  // 4. FPRA-15: the column lists the pull request's files, as its provider does.
  const treeFiles = await evaluate(
    `[...document.querySelectorAll('.file-tree-row')].filter((r) => !r.querySelector('.file-tree-chevron')).length`
  )
  check(
    'The left column lists the pull request files (FPRA-15)',
    fx.detail !== null && fx.detail.files.length > 0 && treeFiles === fx.detail.files.length,
    `${treeFiles} rows for ${fx.detail?.files.length ?? 0} files`
  )

  // 5. FPRA-09/10: header, reviewers and description, as the app read them.
  const reviewersOk =
    fx.detail.reviewers.length === 0
      ? view.noReviewers
      : view.reviewers === fx.detail.reviewers.length
  const descriptionOk = fx.detail.description.trim() === '' ? view.noDescription : view.description
  check(
    'The Overview shows the header, the reviewers and the description (FPRA-09/10)',
    view.title.length > view.id.length &&
      view.meta.length === 4 &&
      view.meta.every(Boolean) &&
      reviewersOk &&
      descriptionOk,
    `meta ${view.meta.filter(Boolean).length}/4, reviewers ${reviewersOk ? 'ok' : 'wrong'} (${view.reviewers}), description ${descriptionOk ? 'ok' : 'wrong'}`
  )

  // 6. FPRA-11: the thread sections, each counted, in the spec's order.
  const want = [
    [
      'Active',
      fx.detail.threads.filter((t) => t.place.kind === 'placed' && t.resolution === 'active').length
    ],
    [
      'Resolved',
      fx.detail.threads.filter((t) => t.place.kind === 'placed' && t.resolution === 'resolved')
        .length
    ],
    ['Outdated', fx.outdated.length],
    ['General', fx.detail.threads.filter((t) => t.place.kind === 'general').length]
  ]
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} (${n})`)
  const got = view.sections
    .map((s) => s.label)
    .filter((l) => /^(Active|Resolved|Outdated|General) \(\d+\)$/.test(l))
  check(
    'Threads are listed in Active / Resolved / Outdated / General sections, counted (FPRA-11)',
    got.join('|') === want.join('|') && got.length > 0,
    `${got.length} sections, ${got.join('|') === want.join('|') ? 'as read' : 'differ from what was read'}`
  )

  // 7. FPRA-11/12: the active thread sits under Active, its location a link.
  const activeRow = fx.active ? threadIn(view, fx.active.id) : null
  check(
    'The anchored active thread is listed under Active, expanded, its line a link (FPRA-11/12/20)',
    fx.active !== null &&
      sectionOf(view, fx.active.id) === 'Active' &&
      activeRow?.link === true &&
      activeRow.expanded,
    fx.active
      ? `section ${sectionOf(view, fx.active.id)}, link ${activeRow?.link}`
      : 'the sandbox has no active anchored thread'
  )

  // 8. FPRA-19: the outdated thread is listed, under Outdated, and opens nothing.
  const outdatedRows = fx.outdated.map((t) => ({
    section: sectionOf(view, t.id),
    row: threadIn(view, t.id)
  }))
  check(
    'The outdated thread is listed under Outdated, with its old line and no link (FPRA-19)',
    outdatedRows.length > 0 &&
      outdatedRows.every((o) => o.section === 'Outdated' && o.row.location && !o.row.link),
    outdatedRows.length > 0
      ? `${outdatedRows.filter((o) => o.section === 'Outdated').length}/${outdatedRows.length} under Outdated`
      : 'the sandbox has no outdated thread'
  )

  // 9. FPRA-21 / S9: deleted threads are listed nowhere.
  const listed = new Set(view.sections.flatMap((s) => s.threads.map((t) => t.id)))
  check(
    'Deleted threads are listed nowhere in the Overview (FPRA-21)',
    fx.deleted.length > 0 && fx.deleted.every((t) => !listed.has(t.id)),
    fx.deleted.length > 0
      ? `${fx.deleted.filter((t) => listed.has(t.id)).length} of ${fx.deleted.length} listed`
      : 'the sandbox has no deleted thread'
  )

  // 10. FPRA-13: Activity is collapsed, and nothing of it is mounted, until asked.
  const before = await evaluate(`({
    expanded: document.querySelector('.pr-overview-activity-toggle')?.getAttribute('aria-expanded'),
    rows: document.querySelector('.pr-overview-activity') !== null
  })`)
  await evaluate(`document.querySelector('.pr-overview-activity-toggle')?.click()`)
  await sleep(300)
  const after = await evaluate(`({
    expanded: document.querySelector('.pr-overview-activity-toggle')?.getAttribute('aria-expanded'),
    rows: document.querySelector('.pr-overview-activity') !== null
  })`)
  await evaluate(`document.querySelector('.pr-overview-activity-toggle')?.click()`)
  await sleep(200)
  check(
    'Activity is collapsed by default and opens on a click (FPRA-13)',
    before.expanded === 'false' &&
      before.rows === false &&
      after.expanded === 'true' &&
      after.rows === true,
    `before ${before.expanded}/${before.rows}, after ${after.expanded}/${after.rows}`
  )

  // 11. FPRA-33: Refresh reads the pull request again.
  await armLoadingWatch()
  await evaluate(`document.querySelector('.pr-overview-toolbar .pr-overview-button')?.click()`)
  const settled = await waitFor(`${idle} && (window.__smokeLoads ?? 0) > 0`, 30000, 100)
  check(
    'Refresh reads the pull request again, and shows it again (FPRA-33)',
    settled === true && (await loadsSeen()) === 1 && (await overview())?.id === view.id,
    `${await loadsSeen()} reload(s) seen`
  )

  // 12. FPRA-33: a focus reloads, and a second within 5 s does not.
  await sleep(5500) // out of any earlier focus's debounce window
  await armLoadingWatch()
  await evaluate(`window.dispatchEvent(new Event('focus'))`)
  await waitFor(`${idle} && (window.__smokeLoads ?? 0) > 0`, 30000, 100)
  const first = await loadsSeen()
  await evaluate(`window.dispatchEvent(new Event('focus'))`)
  await sleep(1500)
  const second = (await loadsSeen()) - first
  await sleep(4200)
  await evaluate(`window.dispatchEvent(new Event('focus'))`)
  await waitFor(`${idle} && (window.__smokeLoads ?? 0) > ${first}`, 30000, 100)
  const third = (await loadsSeen()) - first - second
  check(
    'A window focus reloads; another within 5 s does not; one after 5 s does (FPRA-33)',
    first === 1 && second === 0 && third === 1,
    `reloads ${first} / ${second} / ${third}`
  )
}

/* --------------------------------------------------------------- diff -- */

async function diffSection() {
  if (!fx.active) {
    check('The PR diff checks need an active anchored thread in the sandbox', false, 'none found')
    return
  }
  const place = fx.active.place

  // 13. FPRA-12/16: the thread's location opens its file's PR diff, landing on its line.
  const opened = await openActiveThreadDiff()
  const lines = (await sideLines('modified')) ?? []
  const landed = lines.find((l) => l.n === place.startLine)
  const tabTitle = await evaluate(
    `document.querySelector('.file-tab.active .file-tab-label')?.getAttribute('title') ?? ''`
  )
  check(
    'A thread location opens its file PR diff, on the thread line (FPRA-12/16)',
    opened && tabTitle === place.path && landed !== undefined && landed.inView && landed.active,
    `opened ${opened}, tab ${tabTitle === place.path ? 'that file' : 'other'}, line ${landed ? (landed.inView ? 'in view' : 'off screen') : 'not rendered'}, cursor ${landed?.active ? 'on it' : 'elsewhere'}`
  )

  // 14. FPRA-18: the thread is drawn on the modified side, right under its last line.
  const drawn = (await zones()).filter((z) => z.threadId === fx.active.id)
  const under = drawn.length === 1 ? lineAbove(drawn[0], lines) : null
  check(
    'The active thread is drawn once, on the modified side, under its last line (FPRA-18)',
    drawn.length === 1 && drawn[0].side === 'modified' && under === place.endLine,
    `${drawn.length} zone(s), side ${drawn[0]?.side}, under line ${under} (expected ${place.endLine})`
  )

  // 15. FPRA-19/21: outdated and deleted threads are not drawn.
  const zoneIds = (await zones()).map((z) => z.threadId)
  const forFile = fx.detail.threads.filter(
    (t) => t.place.kind === 'placed' && t.place.path === place.path
  ).length
  check(
    'Outdated and deleted threads are not drawn; every zone is a thread placed in this file (FPRA-19/21)',
    fx.outdated.length > 0 &&
      fx.outdated.every((t) => !zoneIds.includes(t.id)) &&
      fx.deleted.every((t) => !zoneIds.includes(t.id)) &&
      zoneIds.length === forFile,
    `${zoneIds.length} zones for ${forFile} placed threads; outdated drawn ${fx.outdated.filter((t) => zoneIds.includes(t.id)).length}`
  )

  // 16. T16: the zone follows its content: collapsing the thread shrinks it
  //     and pulls the next line up; expanding grows it back.
  const height = async () => (await zones()).find((z) => z.threadId === fx.active.id)?.gap ?? 0
  const nextTop = async () =>
    ((await sideLines('modified')) ?? []).find((l) => l.n === place.endLine + 1)?.top ?? null
  const open = { h: await height(), next: await nextTop() }
  await evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone .pr-thread[data-thread-id="${fx.active.id}"] .pr-thread-toggle')?.click()`
  )
  await sleep(600)
  const shut = { h: await height(), next: await nextTop() }
  await evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone .pr-thread[data-thread-id="${fx.active.id}"] .pr-thread-toggle')?.click()`
  )
  await sleep(600)
  const reopened = { h: await height(), next: await nextTop() }
  check(
    'A thread zone shrinks when the thread collapses and grows back when it expands (T16)',
    open.h > 0 &&
      shut.h < open.h - 10 &&
      Math.abs(reopened.h - open.h) < 2 &&
      open.next !== null &&
      shut.next !== null &&
      shut.next < open.next - 10,
    `zone ${Math.round(open.h)} -> ${Math.round(shut.h)} -> ${Math.round(reopened.h)} px`
  )

  // 17. FPRA-20/25/26: what a thread in the diff offers takes a real click.
  //     A DOM .click() reaches it whatever covers it; a pointer does not.
  const toggleSel = `.pr-diff-tab .diff-viewer-zone .pr-thread[data-thread-id="${fx.active.id}"] .pr-thread-toggle`
  const expandedNow = () =>
    evaluate(`document.querySelector(${J(toggleSel)})?.getAttribute('aria-expanded') ?? null`)
  const beforeClick = await expandedNow()
  const togglePoint = await evaluate(`(() => {
    const r = document.querySelector(${J(toggleSel)})?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  })()`)
  const covered = togglePoint
    ? await evaluate(`(() => {
        const e = document.querySelector(${J(toggleSel)})
        const hit = document.elementFromPoint(${togglePoint.x}, ${togglePoint.y})
        return !(e === hit || e.contains(hit))
      })()`)
    : null
  if (togglePoint) await click(togglePoint)
  await sleep(500)
  const afterClick = await expandedNow()
  if (afterClick !== beforeClick) {
    await evaluate(`document.querySelector(${J(toggleSel)})?.click()`) // put it back
    await sleep(500)
  }
  check(
    'A real click on a thread in the diff reaches it: its toggle collapses it (FPRA-20)',
    beforeClick === 'true' && afterClick === 'false' && covered === false,
    `expanded ${beforeClick} -> ${afterClick}, ${covered ? 'covered by the editor text layer' : 'on top'}`
  )

  // 18. FPRA-27: a two-line selection on the modified side offers Comment.
  //     The text must stay under the pointer while the reader selects: a
  //     drag that moves the editor ends on another line than the one aimed at.
  const pair = await pickLines('modified')
  const bodyTop = `document.querySelector('.pr-diff-body')?.getBoundingClientRect().top ?? null`
  let offered = null
  let shift = null
  let idle = null
  if (pair) {
    idle = await evaluate(commentOffered)
    const before = await evaluate(bodyTop)
    await selectRange('modified', pair[0], 2, pair[1], 3)
    await sleep(400)
    shift = (await evaluate(bodyTop)) - before
    offered = await evaluate(`({
      button: document.querySelector('.pr-diff-comment')?.textContent.trim() ?? null,
      enabled: ${commentOffered},
      lines: document.querySelector('.pr-diff-comment-bar > span')?.textContent.trim() ?? null
    })`)
  }
  const held = await heldSelection()
  check(
    'A two-line selection on the modified side offers Comment on those lines (FPRA-27)',
    pair !== null &&
      idle === false &&
      offered?.button === 'Comment' &&
      offered.enabled === true &&
      offered.lines === `on lines ${pair[0]}–${pair[1]}` &&
      held?.startLine === pair[0] &&
      held?.endLine === pair[1],
    pair
      ? `before ${idle ? 'enabled' : 'disabled'}, after ${offered?.enabled ? 'enabled' : 'disabled'} "${offered?.lines}", selected ${pair[0]}-${pair[1]}, held ${held?.startLine}:${held?.startColumn}-${held?.endLine}:${held?.endColumn}`
      : 'no two plain lines in view'
  )
  check(
    'Starting a selection leaves the diff where it is, so the text stays under the pointer (FPRA-27)',
    shift !== null && Math.abs(shift) < 1,
    shift === null ? 'no selection made' : `the editor moved ${Math.round(shift * 10) / 10} px`
  )

  // 19. FPRA-27: and so a mouse drag selects the lines it was dragged over.
  let dragged = null
  if (pair) {
    const away = (await sideLines('modified'))?.find((l) => l.inView && l.n > pair[1] + 1)
    if (away) await click(await charPoint('modified', away.n, 0))
    await sleep(400)
    await drag(await charPoint('modified', pair[0], 2), await charPoint('modified', pair[1], 3))
    await sleep(400)
    dragged = await heldSelection()
  }
  check(
    'A mouse drag over two lines selects exactly those two lines (FPRA-27)',
    pair !== null && dragged?.startLine === pair[0] && dragged?.endLine === pair[1],
    `dragged ${pair?.[0]}-${pair?.[1]}, selected ${dragged?.startLine}-${dragged?.endLine}`
  )

  // FPRA-17: a PR diff takes the diff preferences the other diffs have; the
  // layout one stands for them. Inline and back, the thread still drawn.
  const layoutNow = () =>
    evaluate(`({
      sideBySide: document.querySelector('.pr-diff-tab .monaco-diff-editor.side-by-side') !== null,
      pressed: [...document.querySelectorAll('.file-tabs-toggle')].find((b) => b.textContent.trim() === 'Inline')?.getAttribute('aria-pressed') ?? null,
      thread: document.querySelector('.pr-diff-tab .diff-viewer-zone .pr-thread[data-thread-id="${fx.active.id}"]') !== null
    })`)
  const layout0 = await layoutNow()
  await clickByText('.file-tabs-toggle', 'Inline')
  await sleep(1000)
  const layout1 = await layoutNow()
  await clickByText('.file-tabs-toggle', 'Inline')
  await sleep(1000)
  const layout2 = await layoutNow()
  check(
    'The PR diff follows the layout preference, inline and back, its thread still drawn (FPRA-17)',
    layout0.sideBySide &&
      layout0.pressed === 'false' &&
      !layout1.sideBySide &&
      layout1.pressed === 'true' &&
      layout1.thread &&
      layout2.sideBySide &&
      layout2.thread,
    `side by side ${layout0.sideBySide} -> ${layout1.sideBySide} -> ${layout2.sideBySide}, thread ${layout1.thread}/${layout2.thread}`
  )

  // 19. FPRA-28: a selection on the original side offers nothing. It needs a
  //     file the pull request modifies: an added file's original side is
  //     empty, with nothing to select.
  const modified = fx.detail.files.find((f) => f.status === 'modified')
  if (!modified) {
    skip(
      'A selection on the original side offers no Comment (FPRA-28)',
      'the pull request modifies no existing file, so no original side has text'
    )
    return
  }
  if (modified.path !== place.path) {
    await evaluate(
      `[...document.querySelectorAll('.file-tree-row')].find((r) => r.getAttribute('title') === ${J(modified.path)})?.querySelector('.file-tree-open')?.click()`
    )
    await waitFor(
      `document.querySelector('.pr-diff-tab[data-pr-diff=${J(modified.path)}] .editor.original .view-line') !== null`,
      30000,
      300
    )
    await sleep(1200)
  }
  // The click empties any modified selection, so Comment is disabled again.
  const modifiedLine = (await sideLines('modified'))?.find((l) => l.inView)
  if (modifiedLine) await click(await charPoint('modified', modifiedLine.n, 0))
  await sleep(300)
  const cleared = (await evaluate(commentOffered)) === false
  const left = await pickLines('original')
  let original = null
  if (left) {
    await selectRange('original', left[0], 1, left[1], 3)
    await sleep(400)
    original = await evaluate(`({
      selected: document.querySelectorAll('.pr-diff-tab .editor.original .selected-text').length,
      comment: ${commentOffered}
    })`)
  }
  check(
    'A selection on the original side offers no Comment (FPRA-28)',
    cleared && left !== null && original.selected > 0 && original.comment === false,
    left
      ? `selection drawn ${original.selected > 0}, Comment ${original.comment ? 'enabled' : 'disabled'}`
      : 'no two original lines with text in view'
  )
}

/** Comment is offered: the bar's button is there and enabled (it stays mounted, disabled, otherwise). */
const commentOffered = `(() => {
  const b = document.querySelector('.pr-diff-comment')
  return b !== null && !b.disabled
})()`

/**
 * Two consecutive rendered, in-view lines with text, with no thread zone
 * between them, on one side.
 */
async function pickLines(side) {
  const lines = (await sideLines(side)) ?? []
  const zoneLines = new Set(
    (await zones()).filter((z) => z.side === side).map((z) => lineAbove(z, lines))
  )
  for (const l of lines) {
    const next = lines.find((m) => m.n === l.n + 1)
    if (!next || !l.inView || !next.inView) continue
    if (zoneLines.has(l.n)) continue
    if ((l.text ?? '').trim().length < 4 || (next.text ?? '').trim().length < 4) continue
    return [l.n, next.n]
  }
  return null
}

/* ------------------------------------------------------------- writes -- */

async function writesSection() {
  if (!fx.file) {
    check('The write checks need a changed file in the pull request', false, 'none')
    return
  }
  if (!fx.active || !(await openActiveThreadDiff())) {
    check('The write checks need the active thread diff open', false, 'not opened')
    return
  }
  const path = fx.active.place.path

  // 19. FPRA-27/30, T22: Comment opens a composer in a zone under the
  //     selection; real typing reaches it and Ctrl+Enter posts it.
  const pair = await pickLines('modified')
  if (!pair) {
    check('The write checks need two plain lines in view', false, 'none')
    return
  }
  await selectRange('modified', pair[0], 2, pair[1], 3)
  await sleep(400)
  const selection = await heldSelection()
  await evaluate(`document.querySelector('.pr-diff-comment')?.click()`)
  await sleep(500)
  const draftZone = (await zones()).find((z) => z.composer && z.threadId === null)
  const draftUnder = draftZone ? lineAbove(draftZone, (await sideLines('modified')) ?? []) : null
  const box = await centre('.pr-diff-tab .diff-viewer-zone .comment-composer-input')
  if (box) await click(box)
  const threadText = `${MARK} thread on two lines`
  await type(threadText)
  const typed = await evaluate(
    `document.querySelector('.pr-diff-tab .diff-viewer-zone .comment-composer-input')?.value ?? null`
  )
  const focused = await evaluate(
    `document.activeElement?.classList.contains('comment-composer-input') && document.activeElement.closest('.diff-viewer-zone') !== null`
  )
  await ctrlEnter()
  const posted = await waitFor(
    `[...document.querySelectorAll('.pr-diff-tab .diff-viewer-zone .pr-thread')].find((t) => Number(t.getAttribute('data-thread-id')) > 0 && t.textContent.includes(${J(MARK)}))?.getAttribute('data-thread-id') ?? null`,
    30000,
    300
  )
  const threadId = posted ? Number(posted) : null
  await track()
  check(
    'Typing and Ctrl+Enter in a composer inside a diff zone post a new thread (FPRA-27/30)',
    selection !== null &&
      draftZone?.side === 'modified' &&
      draftUnder === pair[1] &&
      focused === true &&
      typed === threadText &&
      threadId !== null,
    `composer under line ${draftUnder} (expected ${pair[1]}), focus ${focused}, typed ${typed === threadText ? 'intact' : 'altered'}, thread ${threadId !== null ? 'posted' : 'absent'}`
  )

  // 20. FPRA-18/27, S1: the thread is drawn under the selection's last line,
  //     and Azure DevOps anchored it to exactly Monaco's selection.
  const lines = (await sideLines('modified')) ?? []
  const drawnZone = (await zones()).find((z) => z.threadId === threadId)
  const drawnUnder = drawnZone ? lineAbove(drawnZone, lines) : null
  let anchor = null
  if (threadId !== null) {
    const thread = (await restThreads()).find((t) => t.id === threadId)
    anchor = thread?.threadContext ?? null
  }
  const s = selection ?? {}
  check(
    'The new thread sits under its last line, anchored by ADO to the selection lines and columns (FPRA-27, S1)',
    drawnZone?.side === 'modified' &&
      drawnUnder === pair[1] &&
      anchor !== null &&
      anchor.filePath === `/${path}` &&
      anchor.rightFileStart?.line === s.startLine &&
      anchor.rightFileStart?.offset === s.startColumn &&
      anchor.rightFileEnd?.line === s.endLine &&
      anchor.rightFileEnd?.offset === s.endColumn &&
      !anchor.leftFileStart,
    `drawn under ${drawnUnder}; ADO ${anchor?.rightFileStart?.line}:${anchor?.rightFileStart?.offset}-${anchor?.rightFileEnd?.line}:${anchor?.rightFileEnd?.offset} vs Monaco ${s.startLine}:${s.startColumn}-${s.endLine}:${s.endColumn}`
  )

  // 21. FPRA-25, T16: Reply opens a composer that grows the zone; the reply
  //     lands at the end of its thread, and the zone shrinks back.
  const scope = `.pr-diff-tab .diff-viewer-zone .pr-thread[data-thread-id="${threadId}"]`
  const h0 = (await zones()).find((z) => z.threadId === threadId)?.gap ?? 0
  await evaluate(`document.querySelector(${J(scope + ' .pr-thread-reply')})?.click()`)
  await sleep(600)
  const h1 = (await zones()).find((z) => z.threadId === threadId)?.gap ?? 0
  const replyBox = await centre(`${scope} .comment-composer-input`)
  if (replyBox) await click(replyBox)
  const replyText = `${MARK} reply`
  await type(replyText)
  await evaluate(`document.querySelector(${J(scope + ' .comment-composer-post')})?.click()`)
  const replied = await waitFor(
    `(() => {
      const bodies = [...document.querySelectorAll(${J(scope + ' .pr-thread-comment')})]
      const last = bodies[bodies.length - 1]
      return bodies.length === 2 && Number(last.getAttribute('data-comment-id')) > 0 && last.textContent.includes(${J(replyText)})
    })()`,
    30000,
    300
  )
  await sleep(600)
  const h2 = (await zones()).find((z) => z.threadId === threadId)?.gap ?? 0
  await track()
  check(
    'A reply lands at the end of its thread; its composer grows the zone and leaves with it (FPRA-25, T16)',
    replied === true && h1 > h0 + 40 && h2 < h1 - 40,
    `reply ${replied ? 'last' : 'missing'}, zone ${Math.round(h0)} -> ${Math.round(h1)} -> ${Math.round(h2)} px`
  )

  // 22. FPRA-20/26: Resolved collapses the thread, here and in the Overview.
  await pickStatus(scope, 'fixed')
  const collapsed = await waitFor(
    `document.querySelector(${J(scope + ' .pr-thread-toggle')})?.getAttribute('aria-expanded') === 'false'`,
    15000
  )
  await sleep(2500) // the reload after the write
  await showOverview()
  await waitFor(
    `document.querySelector('.pr-overview .pr-thread[data-thread-id="${threadId}"]') !== null`,
    15000
  )
  let view = await overview()
  let row = threadIn(view, threadId)
  const restStatus = async () =>
    (await restThreads()).find((t) => t.id === threadId)?.status ?? null
  const resolvedStatus = await restStatus()
  check(
    'Status Resolved collapses the thread, and the Overview lists it under Resolved, collapsed (FPRA-20/26)',
    collapsed === true &&
      sectionOf(view, threadId) === 'Resolved' &&
      row?.expanded === false &&
      resolvedStatus === 'fixed',
    `zone collapsed ${collapsed === true}, section ${sectionOf(view, threadId)}, expanded ${row?.expanded}, ADO ${resolvedStatus}`
  )

  // 23. FPRA-26: Active reopens it.
  await pickStatus(`.pr-overview .pr-thread[data-thread-id="${threadId}"]`, 'active')
  await waitFor(
    `document.querySelector('.pr-overview .pr-thread[data-thread-id="${threadId}"] .pr-thread-toggle')?.getAttribute('aria-expanded') === 'true'`,
    15000
  )
  await sleep(2500)
  view = await overview()
  row = threadIn(view, threadId)
  const activeStatus = await restStatus()
  check(
    'Status Active reopens the thread, expanded, under Active (FPRA-26)',
    sectionOf(view, threadId) === 'Active' && row?.expanded === true && activeStatus === 'active',
    `section ${sectionOf(view, threadId)}, expanded ${row?.expanded}, ADO ${activeStatus}`
  )

  // 24. FPRA-29/30: the Overview composer posts a general comment.
  const general = `${MARK} general [js](javascript:alert(1)) and [web](https://example.com/acme)`
  const input = await centre('.pr-overview > .pr-overview-section .comment-composer-input')
  if (input) await click(input)
  await send('Input.insertText', { text: general })
  await evaluate(
    `document.querySelector('.pr-overview .comment-composer-post:not([disabled])')?.click()`
  )
  const generalId = await waitFor(
    `(() => {
      const t = [...document.querySelectorAll('.pr-overview .pr-thread')]
        .find((e) => Number(e.getAttribute('data-thread-id')) > 0 && e.textContent.includes(${J(MARK + ' general')}))
      return t ? Number(t.getAttribute('data-thread-id')) : null
    })()`,
    30000,
    300
  )
  view = await overview()
  const emptied = await evaluate(
    `[...document.querySelectorAll('.pr-overview .comment-composer-input')].every((e) => e.value === '')`
  )
  check(
    'A general comment posted from the Overview is listed under General, and the composer empties (FPRA-29/30)',
    generalId !== null && sectionOf(view, generalId) === 'General' && emptied,
    `listed ${generalId !== null}, section ${sectionOf(view, generalId)}, composer empty ${emptied}`
  )

  // 25. FPRA-22/23: its links render inert: no href anywhere, javascript: with
  //     nothing to open, https: with a data-href main checks again.
  const links = await evaluate(`(() => {
    const t = document.querySelector('.pr-overview .pr-thread[data-thread-id="${generalId}"]')
    if (!t) return null
    const body = t.querySelector('.markdown-body')
    const anchors = [...t.querySelectorAll('.markdown-body a')]
    // markdown-it does not even parse a javascript: link as a link; whatever
    // it becomes, no attribute anywhere may carry the address.
    const attrs = [...body.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.value))
    return {
      hrefs: document.querySelectorAll('.pr-overview a[href]').length,
      jsInAttr: attrs.some((v) => /javascript/i.test(v)),
      jsAnchorsWithTarget: anchors.filter((a) => a.textContent === 'js' && a.hasAttribute('data-href')).length,
      web: anchors.filter((a) => a.textContent === 'web').map((a) => a.getAttribute('data-href'))
    }
  })()`)
  check(
    'Markdown links render inert: no href, nothing for javascript:, data-href for https: (FPRA-22/23)',
    links !== null &&
      links.hrefs === 0 &&
      links.jsInAttr === false &&
      links.jsAnchorsWithTarget === 0 &&
      links.web.length === 1 &&
      links.web[0] === 'https://example.com/acme',
    links
      ? `${links.hrefs} hrefs, javascript ${links.jsInAttr || links.jsAnchorsWithTarget ? 'LIVE' : 'inert'}, https ${links.web[0] ? 'kept' : 'lost'}`
      : 'comment not found'
  )

  // 26. FPRA-33: Refresh shows a change made elsewhere: the general comment,
  //     deleted over REST, leaves the Overview.
  if (generalId !== null) {
    await track()
    for (const c of ownComments(await restThreads()).filter((c) => c.threadId === generalId)) {
      await rest('DELETE', `/threads/${c.threadId}/comments/${c.commentId}`)
    }
  }
  await evaluate(`document.querySelector('.pr-overview-toolbar .pr-overview-button')?.click()`)
  const gone = await waitFor(
    `document.querySelector('.pr-overview .pr-thread[data-thread-id="${generalId}"]') === null`,
    30000,
    300
  )
  check(
    'Refresh drops a thread deleted elsewhere (FPRA-33)',
    generalId !== null && gone === true,
    `thread ${gone ? 'gone' : 'still listed'}`
  )
}

/* --------------------------------------------------------------- main -- */

/**
 * Every comment this run wrote, by id. A deleted comment comes back without
 * its content (S9), so the marker finds a comment only while it lives: ids
 * are recorded as soon as they exist and before anything is deleted.
 */
const created = new Map()
async function track() {
  for (const c of ownComments(await restThreads())) created.set(`${c.threadId}/${c.commentId}`, c)
}

async function cleanup() {
  if (!WRITES || prBase === null) return null
  await track()
  for (const c of created.values()) {
    const live = (await restThreads())
      .find((t) => t.id === c.threadId)
      ?.comments?.find((m) => m.id === c.commentId)
    if (live && live.isDeleted !== true) {
      await rest('DELETE', `/threads/${c.threadId}/comments/${c.commentId}`)
    }
  }
  const threads = await restThreads()
  const deleted = [...created.values()].filter(
    (c) =>
      threads.find((t) => t.id === c.threadId)?.comments?.find((m) => m.id === c.commentId)
        ?.isDeleted === true
  ).length
  const pr = await rest('GET', '')
  return { created: created.size, deleted, draft: pr.isDraft === true }
}

let failed = 1
let cleaned = null
try {
  await launch()
  await connect()
  if (!(await enterPullRequestMode())) throw new Error('The Overview never showed a pull request')
  await readFixture()
  if (fx.detail === null) throw new Error('The app found no pull request for the sandbox branch')
  if (WRITES && !(await rest('GET', '')).isDraft) {
    throw new Error('The sandbox pull request is not a draft; refusing to write')
  }
  if (ONLY === null || ONLY === 'overview') await overviewSection()
  if (ONLY === null || ONLY === 'diff') await diffSection()
  if (WRITES && (ONLY === null || ONLY === 'writes')) await writesSection()
  failed = checks.filter((c) => !c.ok).length
  console.log(
    `\n${checks.length - failed}/${checks.length} checks passed${WRITES ? ' (with writes)' : ' (read-only)'}${skipped.length ? `, ${skipped.length} skipped` : ''}`
  )
} catch (err) {
  console.error(`Aborted: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  try {
    cleaned = await cleanup()
  } catch (err) {
    console.error(`CLEANUP FAILED: ${err instanceof Error ? err.message : String(err)}`)
    failed = failed || 1
  }
  if (cleaned) {
    const ok = cleaned.deleted === cleaned.created && cleaned.draft
    console.log(
      `Cleanup: ${cleaned.deleted}/${cleaned.created} smoke comments deleted and read back isDeleted; pull request still a draft: ${cleaned.draft ? 'yes' : 'NO'}`
    )
    if (!ok) failed = failed || 1
  }
  try {
    ws?.close()
  } catch {
    /* closed */
  }
  if (process.env.SMOKE_KEEP === '1') {
    // For iterating on a check: the app stays up until this script is killed.
    console.log(`SMOKE_KEEP: app left running on port ${PORT}; stop this script to end it`)
    await new Promise(() => setInterval(() => {}, 60000))
  }
  await teardown()
  console.log(`App stopped; ${existsSync(DIR) ? 'temp folder LEFT' : 'temp folder removed'}.`)
}
process.exit(failed ? 1 : 0)
