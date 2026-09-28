/**
 * Which addresses the app hands to the browser on its own (AD-044): only
 * `https:`. It covers every new window the renderer asks for and every address
 * the app builds from a remote, such as a commit page. Links the user
 * Ctrl+clicks in a terminal follow their own rule, `http:` or `https:`
 * (LINK-04), because they are addresses an agent printed, often `localhost`.
 */
export function isHttpsUrl(url: string): boolean {
  return schemeOf(url) === 'https:'
}

/**
 * What `setWindowOpenHandler` does with a URL the renderer tried to open in a
 * new window (#115). A refusal's reason names the scheme only, never the
 * address, so the log does not record what the link pointed at.
 */
export function windowOpenDecision(url: string): { open: true } | { open: false; reason: string } {
  const scheme = schemeOf(url)
  if (scheme === 'https:') return { open: true }
  return {
    open: false,
    reason:
      scheme === null
        ? 'refused a window link that is not a URL'
        : `refused a window link with scheme ${scheme}`
  }
}

function schemeOf(url: string): string | null {
  try {
    return new URL(url).protocol
  } catch {
    return null
  }
}
