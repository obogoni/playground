import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

/** The real tags of a rendering: escaped text holds `&lt;`, never a raw `<`. */
function tags(html: string): string[] {
  return html.match(/<[^>]*>/g) ?? []
}

/** The value of one attribute on the first tag that has it, or null. */
function attr(html: string, name: string): string | null {
  for (const tag of tags(html)) {
    const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
    if (match) return match[1]
  }
  return null
}

describe('renderMarkdown (FPRA-10, 21, 22, 24)', () => {
  it('renders a comment as markdown, a generic type in inline code included', () => {
    // Every comment is markdown (T1, S5), and Azure DevOps keeps `<…>` as typed (S4).
    const html = renderMarkdown('**Bold** and `List<string>`')

    expect(html).toBe('<p><strong>Bold</strong> and <code>List&lt;string&gt;</code></p>\n')
  })

  it('renders a script tag as escaped text', () => {
    const html = renderMarkdown('<script>alert(1)</script>')

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(tags(html).some((tag) => /^<\/?script/i.test(tag))).toBe(false)
  })

  it('renders an image tag with an event handler as escaped text', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(tags(html).some((tag) => /^<img/i.test(tag))).toBe(false)
  })

  it('renders a javascript: link with neither href nor data-href', () => {
    for (const source of ['[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))']) {
      const html = renderMarkdown(source)

      expect(attr(html, 'href')).toBeNull()
      expect(attr(html, 'data-href')).toBeNull()
    }
  })

  it('renders an https link with its address in data-href and no href', () => {
    const html = renderMarkdown('[x](https://example.com)')

    expect(html).toBe('<p><a data-href="https://example.com">x</a></p>\n')
  })

  it('renders an image as a link to its source, never an img', () => {
    const html = renderMarkdown('![alt](https://example.com/a.png)')

    expect(tags(html).some((tag) => /^<img/i.test(tag))).toBe(false)
    expect(html).toBe('<p><a data-href="https://example.com/a.png">alt</a></p>\n')
  })

  it('renders an HTML comment and a details block as escaped text', () => {
    const comment = renderMarkdown('<!-- hidden -->')
    const details = renderMarkdown('<details><summary>More</summary>Body</details>')

    expect(comment).toContain('&lt;!-- hidden --&gt;')
    expect(details).toContain('&lt;details&gt;&lt;summary&gt;More&lt;/summary&gt;')
    expect(
      tags(comment)
        .concat(tags(details))
        .some((tag) => /^<(!--|\/?details|\/?summary)/i.test(tag))
    ).toBe(false)
  })

  it('renders a data: link with neither href nor data-href', () => {
    const html = renderMarkdown('[x](data:text/html,<script>alert(1)</script>)')

    expect(attr(html, 'href')).toBeNull()
    expect(attr(html, 'data-href')).toBeNull()
  })

  it('never emits an event attribute or an href, and gives data-href to https only', () => {
    const sources = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="https://example.com" onclick="alert(1)">x</a>',
      '[x](javascript:alert(1))',
      '[x](data:text/html,x)',
      '[x](http://example.com)',
      '[x](file:///C:/x)',
      '[x](/relative/path)',
      '[x](https://example.com "title")',
      '[ref][1]\n\n[1]: https://example.com',
      '<https://example.com/auto>',
      '![alt](javascript:alert(1))',
      '![alt](http://example.com/a.png)',
      '<!-- hidden -->',
      '<details><summary>More</summary>Body</details>'
    ]
    for (const source of sources) {
      const html = renderMarkdown(source)
      for (const tag of tags(html)) {
        expect(tag).not.toMatch(/\son[a-z]+\s*=/i)
        expect(tag).not.toMatch(/\shref\s*=/i)
        const target = /\sdata-href="([^"]*)"/.exec(tag)?.[1]
        if (target !== undefined) expect(target.startsWith('https://')).toBe(true)
      }
    }
    expect(attr(renderMarkdown('[x](http://example.com)'), 'data-href')).toBeNull()
    expect(attr(renderMarkdown('[x](/relative/path)'), 'data-href')).toBeNull()
  })
})
