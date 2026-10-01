import { describe, expect, it } from 'vitest'
import { createListenerSet } from './listener-set'

describe('createListenerSet', () => {
  it('calls every added listener with the emitted value, in order of adding', () => {
    const set = createListenerSet<string>()
    const seen: string[] = []
    set.add((v) => seen.push(`a:${v}`))
    set.add((v) => seen.push(`b:${v}`))

    set.emit('/repo/main')
    expect(seen).toEqual(['a:/repo/main', 'b:/repo/main'])
  })

  it('stops calling a listener once its remove function runs', () => {
    const set = createListenerSet<string>()
    const seen: string[] = []
    const remove = set.add((v) => seen.push(v))
    set.emit('one')
    remove()
    set.emit('two')
    expect(seen).toEqual(['one'])
  })

  it('registers the same function once, however often it is added', () => {
    const set = createListenerSet<number>()
    let calls = 0
    const cb = (): void => {
      calls++
    }
    set.add(cb)
    set.add(cb)
    set.emit(1)
    expect(calls).toBe(1)
  })

  it('logs a throwing listener and still calls the others', () => {
    const logged: unknown[] = []
    const set = createListenerSet<string>((...args) => logged.push(...args))
    const boom = new Error('boom')
    const seen: string[] = []
    set.add(() => {
      throw boom
    })
    set.add((v) => seen.push(v))

    expect(() => set.emit('x')).not.toThrow()
    expect(seen).toEqual(['x'])
    expect(logged).toContain(boom)
  })
})
