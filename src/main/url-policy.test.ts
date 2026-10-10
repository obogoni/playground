import { describe, expect, it } from 'vitest'
import { isHttpsUrl, windowOpenDecision } from './url-policy'

const REFUSED = [
  'http://example.com/page',
  'file:///C:/Windows/win.ini',
  'ms-settings:privacy',
  '\\\\server\\share\\file.txt',
  'not a url'
]

describe('isHttpsUrl', () => {
  it('accepts an https address', () => {
    expect(isHttpsUrl('https://dev.azure.com/acme/platform/_workitems/edit/12345')).toBe(true)
  })

  it.each(REFUSED)('refuses %s', (url) => {
    expect(isHttpsUrl(url)).toBe(false)
  })
})

describe('isHttpsUrl on links from third-party markdown (FPRA-23)', () => {
  it('opens an https link', () => {
    expect(isHttpsUrl('https://example.com/x')).toBe(true)
  })

  it.each([
    ['a javascript: link', 'javascript:alert(1)'],
    ['a javascript: link in mixed case', 'JaVaScRiPt:alert(1)'],
    ['a data: link', 'data:text/html,<script>alert(1)</script>'],
    ['a file: link', 'file:///C:/x'],
    ['an http: link', 'http://example.com/x'],
    ['a relative path', 'docs/readme.md'],
    ['a malformed URL', 'https://exa mple.com/x']
  ])('does nothing for %s', (_case, url) => {
    expect(isHttpsUrl(url)).toBe(false)
  })
})

describe('windowOpenDecision (#115)', () => {
  it('opens an https address', () => {
    expect(windowOpenDecision('https://github.com/acme/widget')).toEqual({ open: true })
  })

  it.each([
    ['http://example.com/page', 'refused a window link with scheme http:'],
    ['file:///C:/Windows/win.ini', 'refused a window link with scheme file:'],
    ['ms-settings:privacy', 'refused a window link with scheme ms-settings:'],
    ['\\\\server\\share\\file.txt', 'refused a window link that is not a URL'],
    ['not a url', 'refused a window link that is not a URL']
  ])('refuses %s, naming only its scheme', (url, reason) => {
    expect(windowOpenDecision(url)).toEqual({ open: false, reason })
  })

  it('never puts the address itself in the reason', () => {
    const url = 'file:///C:/Users/someone/secret-plans.txt'
    const decision = windowOpenDecision(url)

    expect(decision.open).toBe(false)
    expect(JSON.stringify(decision)).not.toContain('secret-plans')
  })
})
