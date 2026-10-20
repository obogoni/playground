import { describe, expect, it } from 'vitest'
import type { TasksSnapshot } from '../shared/tasks'
import { runLinkedPin, type LinkedPinDeps } from './linked-task-pin'

const SNAPSHOT: TasksSnapshot = { tasks: [], auth: 'ok', lastSyncAt: 1 }

function recordingDeps(
  pinLinked: LinkedPinDeps['pinLinked']
): LinkedPinDeps & { pinned: number[]; emitted: TasksSnapshot[]; errors: unknown[] } {
  const pinned: number[] = []
  const emitted: TasksSnapshot[] = []
  const errors: unknown[] = []
  return {
    pinned,
    emitted,
    errors,
    pinLinked: (id) => {
      pinned.push(id)
      return pinLinked(id)
    },
    emit: (snapshot) => emitted.push(snapshot),
    logError: (err) => errors.push(err)
  }
}

describe('runLinkedPin', () => {
  it('pins the linked id and pushes the snapshot when a pin was added (PRST-45, PRST-47)', async () => {
    const deps = recordingDeps(async () => ({ added: 1, snapshot: SNAPSHOT }))

    await runLinkedPin({ id: 26266, title: null }, deps)

    expect(deps.pinned).toEqual([26266])
    expect(deps.emitted).toEqual([SNAPSHOT])
  })

  it('pushes nothing when no pin was added (PRST-47, PRST-48)', async () => {
    const deps = recordingDeps(async () => ({ added: 0, snapshot: SNAPSHOT }))

    await runLinkedPin({ id: 26266, title: 'Statement' }, deps)

    expect(deps.pinned).toEqual([26266])
    expect(deps.emitted).toEqual([])
  })

  it('pins nothing for a link back to the branch or no link', async () => {
    const deps = recordingDeps(async () => ({ added: 1, snapshot: SNAPSHOT }))

    await runLinkedPin(null, deps)
    await runLinkedPin(undefined, deps)

    expect(deps.pinned).toEqual([])
    expect(deps.emitted).toEqual([])
  })

  it('never rejects and shows no error to the session when pinning throws (PRST-46, PRST-48)', async () => {
    const boom = new Error('network down')
    const deps = recordingDeps(async () => {
      throw boom
    })

    await expect(runLinkedPin({ id: 26266, title: null }, deps)).resolves.toBeUndefined()
    expect(deps.errors).toEqual([boom])
    expect(deps.emitted).toEqual([])
  })
})
