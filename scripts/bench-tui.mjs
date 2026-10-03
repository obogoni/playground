/* Fake full-screen TUI for the performance bench (issue #147, PDIAG-33).
 *
 * Prints what an Ink app prints, at a fixed rate, until it is stopped: it
 * enters the alternate screen, then every 1000 / fps ms it moves the cursor up
 * over the previous frame erasing each line, and writes a new frame of `rows`
 * coloured lines. The frame counter, the spinner glyph and the colours shift
 * every frame, so no two consecutive frames are equal. On SIGINT, SIGTERM or a
 * closed stdout it restores the main screen and the cursor and exits 0.
 *
 * Run: node scripts/bench-tui.mjs [--fps 20] [--rows 30] [--seed <n>]
 * scripts/bench-sessions.mjs runs one per fake session.
 */

const ESC = '\x1b'
const ENTER = `${ESC}[?1049h${ESC}[?2004h${ESC}[?25l`
const RESTORE = `${ESC}[?1049l${ESC}[?2004l${ESC}[?25h`
/** Erase the current line, then move up one: once per line of the previous frame. */
const ERASE_UP = `${ESC}[2K${ESC}[1A`
const ERASE_LINE = `${ESC}[2K\r`
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const COLUMNS = 100
const FILLER = 'abcdefghijklmnopqrstuvwxyz0123456789'

function option(name, fallback) {
  const at = process.argv.indexOf(name)
  if (at === -1) return fallback
  const value = Number(process.argv[at + 1])
  if (!Number.isFinite(value) || value < 0) {
    console.error(`bench-tui: ${name} needs a number, got ${process.argv[at + 1]}`)
    process.exit(2)
  }
  return value
}

const fps = option('--fps', 20)
const rows = option('--rows', 30)
const seed = option('--seed', 0)
if (fps <= 0 || rows <= 0) {
  console.error('bench-tui: --fps and --rows must be above 0')
  process.exit(2)
}
const intervalMs = 1000 / fps

/** One line of frame `n`: about COLUMNS visible characters. */
function line(n, i) {
  const colour = 16 + ((n + i + seed) % 216)
  const head = `${SPINNER[(n + i) % SPINNER.length]} frame ${n} line ${i + 1} seed ${seed} `
  const shift = (n + i + seed) % FILLER.length
  const tail = (FILLER.slice(shift) + FILLER.slice(0, shift)).repeat(3)
  return `${ESC}[38;5;${colour}m${(head + tail).slice(0, COLUMNS)}${ESC}[0m\n`
}

let previousRows = 0
function frame(n) {
  let out = ERASE_UP.repeat(previousRows) + ERASE_LINE
  for (let i = 0; i < rows; i++) out += line(n, i)
  previousRows = rows
  return out
}

let timer = null
let stopped = false
function stop() {
  if (stopped) return
  stopped = true
  clearTimeout(timer)
  // A closed stdout cannot take the restore; exit either way.
  const done = () => process.exit(0)
  try {
    process.stdout.write(RESTORE, done)
  } catch {
    done()
  }
  setTimeout(done, 1000).unref()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.stdout.on('error', () => {
  stopped = true
  clearTimeout(timer)
  process.exit(0)
})

const start = performance.now()
let n = 0
/** Each frame has its own deadline from the start, so a late timer does not slow the rate. */
function tick() {
  if (stopped) return
  n += 1
  process.stdout.write(frame(n))
  timer = setTimeout(tick, Math.max(0, start + n * intervalMs - performance.now()))
}

process.stdout.write(ENTER)
tick()
