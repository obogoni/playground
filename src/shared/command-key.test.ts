import { describe, expect, it } from 'vitest'
import { commandKey } from './command-key'

describe('commandKey', () => {
  it('keeps a bare command as its own key', () => {
    expect(commandKey('claude')).toBe('claude')
  })

  it('lowercases the name so case never splits one agent in two', () => {
    expect(commandKey('Claude')).toBe('claude')
  })

  it('drops a Windows path, keeping the leaf', () => {
    expect(commandKey('C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.exe')).toBe('claude')
  })

  it('drops a forward-slash path too', () => {
    expect(commandKey('/usr/local/bin/claude')).toBe('claude')
  })

  it.each([
    ['claude.exe', 'claude'],
    ['claude.cmd', 'claude'],
    ['claude.bat', 'claude'],
    ['CLAUDE.EXE', 'claude']
  ])('strips the %s launcher suffix', (command, expected) => {
    expect(commandKey(command)).toBe(expected)
  })

  it('leaves an extension that is not a launcher suffix alone', () => {
    expect(commandKey('agent.ps1')).toBe('agent.ps1')
  })

  it('returns an empty key for an empty command', () => {
    expect(commandKey('')).toBe('')
  })
})
