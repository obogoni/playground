import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadWorkflow } from './workflow-loader'
import { sanitizeWorkflowId, scaffoldWorkflow } from './workflow-scaffold'

const roots: string[] = []
afterEach(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
  roots.length = 0
})

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wfs-'))
  roots.push(root)
  return root
}

describe('sanitizeWorkflowId', () => {
  it('lowercases, replaces invalid runs with a single dash, and trims edges', () => {
    expect(sanitizeWorkflowId('Implement Ticket')).toBe('implement-ticket')
    expect(sanitizeWorkflowId('Review PR!')).toBe('review-pr')
    expect(sanitizeWorkflowId('a//b')).toBe('a-b')
  })

  it('keeps hyphens and underscores and returns "" for an all-invalid name', () => {
    expect(sanitizeWorkflowId('my_flow-2')).toBe('my_flow-2')
    expect(sanitizeWorkflowId('!!!')).toBe('')
    expect(sanitizeWorkflowId('   ')).toBe('')
  })
})

describe('scaffoldWorkflow', () => {
  it('creates a workflow.ts from the template and returns {ok,id,path}', async () => {
    const root = freshRoot()
    const result = await scaffoldWorkflow(root, 'Implement Ticket')
    expect(result).toEqual({
      ok: true,
      id: 'implement-ticket',
      path: join(root, 'implement-ticket')
    })
    expect(existsSync(join(root, 'implement-ticket', 'workflow.ts'))).toBe(true)
  })

  it('produces a template that the real loader parses to a valid {meta, run}', async () => {
    const root = freshRoot()
    const result = await scaffoldWorkflow(root, 'demo-flow')
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
    const loaded = await loadWorkflow(result.path)
    if ('error' in loaded) throw new Error(`expected load, got error: ${loaded.error}`)
    expect(loaded.meta.name).toBe('demo-flow')
    expect(loaded.meta.inputs).toEqual([])
    expect(typeof loaded.run).toBe('function')
  })

  it('rejects an existing id without overwriting the existing file', async () => {
    const root = freshRoot()
    mkdirSync(join(root, 'taken'))
    const sentinel = '// hand-authored — must not be clobbered\n'
    writeFileSync(join(root, 'taken', 'workflow.ts'), sentinel, 'utf8')

    const result = await scaffoldWorkflow(root, 'Taken')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.error).toMatch(/already exists/)
    expect(readFileSync(join(root, 'taken', 'workflow.ts'), 'utf8')).toBe(sentinel)
  })

  it('rejects an empty/invalid name and creates nothing', async () => {
    const root = freshRoot()
    const result = await scaffoldWorkflow(root, '!!!')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.error).toMatch(/not a valid workflow name/)
    expect(readdirSync(root)).toEqual([]) // no id folder was created for the invalid name
  })
})
