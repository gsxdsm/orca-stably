// Single source of truth for "is there a URL under the tapped cell?" on mobile.
// The regex mirrors @xterm/addon-web-links' strict matcher (and the desktop
// terminal's terminal-url-link-hit-testing.ts) so a tap opens the same visible
// URL span the desktop would.
export const TERMINAL_HTTP_URL_REGEX_SOURCE =
  String.raw`\bhttps?:\/\/[^\s"'!*(){}|\\^<>` +
  '`' +
  String.raw`]*[^\s"':,.!?{}|\\^~[\]` +
  '`' +
  String.raw`()<>]`

// Returns the URL covering `col` on `lineText`, or null. `col` is a 0-based
// column index into the physical line (matching xterm's translateToString).
export function findUrlAtColumn(lineText: string, col: number): string | null {
  if (typeof lineText !== 'string' || lineText.length === 0) {
    return null
  }
  const re = new RegExp(TERMINAL_HTTP_URL_REGEX_SOURCE, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(lineText)) !== null) {
    const start = match.index
    const end = start + match[0].length // exclusive
    if (col >= start && col < end) {
      return match[0]
    }
    // Why: a zero-length match would loop forever; nudge lastIndex past it.
    if (match[0].length === 0) {
      re.lastIndex++
    }
  }
  return null
}

// JS injected verbatim into the WebView document (terminal-webview-html.ts).
// Mirrors findUrlAtColumn above — the regex source is shared so the inlined
// copy can't drift — and reuses the document's viewportToCell/getLineText
// (in scope where this is spliced into the IIFE) to resolve the tapped cell.
export const URL_TAP_WEBVIEW_JS = `
  var URL_TAP_RE_SOURCE = ${JSON.stringify(TERMINAL_HTTP_URL_REGEX_SOURCE)};
  function findUrlAtColumn(lineText, col) {
    if (typeof lineText !== 'string' || lineText.length === 0) return null;
    var re = new RegExp(URL_TAP_RE_SOURCE, 'gi');
    var match;
    while ((match = re.exec(lineText)) !== null) {
      var end = match.index + match[0].length;
      if (col >= match.index && col < end) return match[0];
      if (match[0].length === 0) re.lastIndex++;
    }
    return null;
  }
  function urlAtViewportPoint(clientX, clientY) {
    var cell = viewportToCell(clientX, clientY);
    if (!cell) return null;
    return findUrlAtColumn(getLineText(cell.row), cell.col);
  }

  // Why: OSC 8 hyperlinks (e.g. Claude Code's PR links) render styled text whose
  // visible characters aren't a URL — the real URI lives in xterm's link data.
  // Read it at the tapped cell the same way xterm's built-in OSC link provider
  // does: cell.extended.urlId -> _oscLinkService.getLinkData(id).uri. Internal
  // API, so guard everything; a miss just falls through to plain detection.
  function oscLinkService() {
    try {
      var core = term && term._core;
      if (!core) return null;
      return core._oscLinkService
        || (core._inputHandler && core._inputHandler._oscLinkService)
        || null;
    } catch (e) { return null; }
  }
  function oscLinkAtViewportPoint(clientX, clientY) {
    try {
      var svc = oscLinkService();
      if (!svc || !svc.getLinkData) return null;
      var cell = viewportToCell(clientX, clientY);
      if (!cell) return null;
      var line = term.buffer.active.getLine(cell.row);
      if (!line) return null;
      var bufCell = line.getCell(cell.col);
      var urlId = bufCell && bufCell.extended && bufCell.extended.urlId;
      if (!urlId) return null;
      var data = svc.getLinkData(urlId);
      var uri = data && data.uri;
      return uri && /^https?:/i.test(uri) ? uri : null;
    } catch (e) { return null; }
  }
`
