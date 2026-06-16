import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TERMINAL_HTTP_URL_REGEX_SOURCE, findUrlAtColumn } from './terminal-webview-url-tap'
import { XTERM_HTML } from './terminal-webview-html'

describe('findUrlAtColumn', () => {
  it('returns the URL when the tapped column falls inside it', () => {
    const line = 'see https://example.com/path for details'
    const start = line.indexOf('https')
    expect(findUrlAtColumn(line, start)).toBe('https://example.com/path')
    expect(findUrlAtColumn(line, start + 5)).toBe('https://example.com/path')
    // last char of the URL ("h" of /path) is still inside
    expect(findUrlAtColumn(line, line.indexOf(' for') - 1)).toBe('https://example.com/path')
  })

  it('returns null when the tap lands on surrounding text or whitespace', () => {
    const line = 'see https://example.com/path for details'
    expect(findUrlAtColumn(line, 0)).toBeNull() // "s" of "see"
    expect(findUrlAtColumn(line, line.indexOf('https') - 1)).toBeNull() // the space before
    expect(findUrlAtColumn(line, line.indexOf('for'))).toBeNull()
  })

  it('resolves the correct URL when several appear on one line', () => {
    const line = 'http://a.test/one  https://b.test/two'
    expect(findUrlAtColumn(line, line.indexOf('a.test'))).toBe('http://a.test/one')
    expect(findUrlAtColumn(line, line.indexOf('b.test'))).toBe('https://b.test/two')
    expect(findUrlAtColumn(line, line.indexOf('  '))).toBeNull() // gap between them
  })

  it('excludes trailing punctuation from the matched URL, like WebLinksAddon', () => {
    const line = 'visit https://example.com.'
    const url = findUrlAtColumn(line, line.indexOf('example'))
    expect(url).toBe('https://example.com')
    // the trailing period is not part of the link span
    expect(findUrlAtColumn(line, line.length - 1)).toBeNull()
  })

  it('only matches http(s) schemes', () => {
    const line = 'ftp://example.com/file and file:///etc/hosts'
    expect(findUrlAtColumn(line, line.indexOf('example'))).toBeNull()
    expect(findUrlAtColumn(line, line.indexOf('etc'))).toBeNull()
  })

  it('returns null for empty or out-of-range input', () => {
    expect(findUrlAtColumn('', 0)).toBeNull()
    expect(findUrlAtColumn('https://example.com', 999)).toBeNull()
  })

  it('keeps the regex source identical to the desktop terminal matcher (no drift)', () => {
    // The desktop hit-tester is the canonical matcher; mobile must mirror it so
    // both platforms open the same visible URL span.
    const desktopSource = readFileSync(
      new URL(
        '../../../src/renderer/src/components/terminal-pane/terminal-url-link-hit-testing.ts',
        import.meta.url
      ),
      'utf8'
    )
    const match = desktopSource.match(/const TERMINAL_HTTP_URL_REGEX = (\/.*\/)gi/)
    expect(match).not.toBeNull()
    const desktopRegex = match?.[1] ?? ''
    expect(`/${TERMINAL_HTTP_URL_REGEX_SOURCE}/`).toBe(desktopRegex)
  })

  it('injects the matcher and its regex source into the rendered WebView document', () => {
    // The detection runs inside the WebView's injected JS; assert the rendered
    // document actually carries the function and the exact regex source so the
    // tap-to-open path is wired, not just defined in a module.
    expect(XTERM_HTML).toContain('function findUrlAtColumn(')
    expect(XTERM_HTML).toContain('function urlAtViewportPoint(')
    expect(XTERM_HTML).toContain(JSON.stringify(TERMINAL_HTTP_URL_REGEX_SOURCE))
    // and the tap handler routes a detected URL to RN
    expect(XTERM_HTML).toContain("notify({ type: 'open-url', url: tappedUrl });")
    // OSC 8 hyperlink reading (PR links) is wired and tried before plain URLs
    expect(XTERM_HTML).toContain('function oscLinkAtViewportPoint(')
    expect(XTERM_HTML).toContain('oscLinkAtViewportPoint(ox, oy) || urlAtViewportPoint(ox, oy)')
  })
})
