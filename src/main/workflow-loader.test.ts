import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverWorkflows, esbuildBinaryPath, loadWorkflow, validateMeta } from './workflow-loader'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

/** A fresh temp folder holding a workflow's files. */
function workflowDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'wfl-'))
  dirs.push(root)
  const folder = join(root, 'wf')
  mkdirSync(folder, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(folder, name), content, 'utf8')
  }
  return folder
}

describe('esbuildBinaryPath (pure)', () => {
  it('points at the unpacked win32 .exe under app.asar.unpacked', () => {
    const p = esbuildBinaryPath('C:\\app\\resources', 'win32', 'x64')
    expect(p).toBe(
      join(
        'C:\\app\\resources',
        'app.asar.unpacked',
        'node_modules',
        '@esbuild',
        'win32-x64',
        'esbuild.exe'
      )
    )
  })

  it('uses the bin/esbuild layout on non-Windows platforms', () => {
    const p = esbuildBinaryPath('/app/resources', 'darwin', 'arm64')
    expect(p).toBe(
      join(
        '/app/resources',
        'app.asar.unpacked',
        'node_modules',
        '@esbuild',
        'darwin-arm64',
        'bin',
        'esbuild'
      )
    )
  })
})

describe('validateMeta (pure)', () => {
  const run = async (): Promise<void> => {}

  it('accepts a well-formed meta object + async run', () => {
    const result = validateMeta({ meta: { name: 'X', inputs: [] }, run })
    expect(result).toEqual({ meta: { name: 'X', inputs: [] }, run })
  })

  it('rejects a module missing the run export', () => {
    const result = validateMeta({ meta: { name: 'X', inputs: [] } })
    expect('error' in result).toBe(true)
  })

  it('rejects a module missing the meta export', () => {
    expect('error' in validateMeta({ run })).toBe(true)
  })

  it('rejects a meta whose name is not a string', () => {
    expect('error' in validateMeta({ meta: { name: 42, inputs: [] }, run })).toBe(true)
  })

  it('rejects a meta whose inputs is not an array', () => {
    expect('error' in validateMeta({ meta: { name: 'X', inputs: {} }, run })).toBe(true)
  })

  it('accepts a well-formed input item with required + description', () => {
    const meta = {
      name: 'X',
      description: 'demo',
      inputs: [{ key: 'k', label: 'K', required: true }]
    }
    expect(validateMeta({ meta, run })).toEqual({ meta, run })
  })

  it('rejects a meta whose description is present but not a string', () => {
    expect('error' in validateMeta({ meta: { name: 'X', description: 1, inputs: [] }, run })).toBe(
      true
    )
  })

  it('rejects an input item that is not an object', () => {
    expect('error' in validateMeta({ meta: { name: 'X', inputs: ['nope'] }, run })).toBe(true)
  })

  it('rejects an input item missing key', () => {
    expect('error' in validateMeta({ meta: { name: 'X', inputs: [{ label: 'K' }] }, run })).toBe(
      true
    )
  })

  it('rejects an input item missing label', () => {
    expect('error' in validateMeta({ meta: { name: 'X', inputs: [{ key: 'k' }] }, run })).toBe(true)
  })

  it('rejects an input item whose required is not a boolean', () => {
    const meta = { name: 'X', inputs: [{ key: 'k', label: 'K', required: 'yes' }] }
    expect('error' in validateMeta({ meta, run })).toBe(true)
  })
})

describe('discoverWorkflows', () => {
  it('returns [] when the root does not exist', async () => {
    expect(await discoverWorkflows(join(tmpdir(), `nope-${Date.now()}`))).toEqual([])
  })

  it('returns [] when the root is empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wfl-empty-'))
    dirs.push(root)
    expect(await discoverWorkflows(root)).toEqual([])
  })

  it('lists the subfolder names, ignoring loose files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wfl-list-'))
    dirs.push(root)
    mkdirSync(join(root, 'alpha'))
    mkdirSync(join(root, 'beta'))
    writeFileSync(join(root, 'README.md'), 'x', 'utf8')
    expect((await discoverWorkflows(root)).sort()).toEqual(['alpha', 'beta'])
  })
})

describe('loadWorkflow (real esbuild bundle)', () => {
  it('loads a valid workflow.ts into { meta, run }', async () => {
    const folder = workflowDir({
      'workflow.ts':
        `export const meta = { name: 'Demo', inputs: [{ key: 'k', label: 'K' }] }\n` +
        `export async function run(ctx) { await ctx.log('hi') }\n`
    })
    const result = await loadWorkflow(folder)
    if ('error' in result) throw new Error(`expected load, got error: ${result.error}`)
    expect(result.meta.name).toBe('Demo')
    expect(result.meta.inputs).toEqual([{ key: 'k', label: 'K' }])
    expect(typeof result.run).toBe('function')
  })

  it('returns { error } when workflow.ts has a syntax error', async () => {
    const folder = workflowDir({ 'workflow.ts': `export const meta = { name: 'Broken' ,,,` })
    const result = await loadWorkflow(folder)
    expect('error' in result).toBe(true)
  })

  it('returns { error } when workflow.ts omits the run export', async () => {
    const folder = workflowDir({
      'workflow.ts': `export const meta = { name: 'NoRun', inputs: [] }\n`
    })
    const result = await loadWorkflow(folder)
    expect('error' in result).toBe(true)
  })

  it('does not leak the bundled temp .mjs after loading', async () => {
    const leaked = (): number =>
      readdirSync(tmpdir()).filter((f) => f.startsWith('workflow-') && f.endsWith('.mjs')).length
    const before = leaked()
    const folder = workflowDir({
      'workflow.ts': `export const meta = { name: 'Clean', inputs: [] }\nexport async function run() {}\n`
    })
    const result = await loadWorkflow(folder)
    if ('error' in result) throw new Error(`expected load, got error: ${result.error}`)
    expect(leaked()).toBe(before)
  })

  it('bundles a relative helper import into one working module', async () => {
    const folder = workflowDir({
      'helper.ts': `export const NAME = 'FromHelper'\n`,
      'workflow.ts':
        `import { NAME } from './helper'\n` +
        `export const meta = { name: NAME, inputs: [] }\n` +
        `export async function run() {}\n`
    })
    const result = await loadWorkflow(folder)
    if ('error' in result) throw new Error(`expected load, got error: ${result.error}`)
    expect(result.meta.name).toBe('FromHelper')
  })
})
