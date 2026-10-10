import MarkdownIt from 'markdown-it'

/**
 * Markdown other people wrote — PR descriptions and review comments — as
 * inert HTML (FPRA-10, 21, 22, 24; design D1).
 *
 * `html: false` means markdown-it never parses HTML at all: a `<script>`, an
 * `<img onerror>`, a comment or a `<details>` block becomes escaped text, so
 * there is no markup to sanitize afterwards. What markdown itself can make is
 * narrowed by two rules:
 * - a link never carries `href`, so nothing in the page can navigate. An
 *   `https:` address goes to `data-href`, which the view hands to main to open
 *   (FPRA-23); any other scheme gets neither attribute.
 * - an image is rendered as a link to its source and never loaded: the CSP
 *   blocks remote images anyway, and Azure DevOps attachments need auth.
 *
 * Every comment is rendered as markdown, as Azure DevOps' own web view does
 * whether or not the thread says it supports markdown (T1, S5). `linkify` is
 * off, so bare text is never turned into a link.
 */
const md = new MarkdownIt({ html: false, linkify: false })

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href')
  token.attrs = null
  if (href !== null && isHttps(href)) token.attrSet('data-href', href)
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src') ?? ''
  const alt = self.renderInlineAsText(token.children ?? [], options, env)
  const target = isHttps(src) ? ` data-href="${md.utils.escapeHtml(src)}"` : ''
  return `<a${target}>${md.utils.escapeHtml(alt === '' ? src : alt)}</a>`
}

/** The HTML for one piece of third-party markdown. Pure. */
export function renderMarkdown(source: string): string {
  return md.render(source)
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
