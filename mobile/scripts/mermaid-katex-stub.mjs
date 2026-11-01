// Page mermaid only calls renderToString for $$ labels. Return the expression so the
// diagram still draws; typesetting stays on the desktop markdown preview.
export default {
  renderToString(expression) {
    return expression
  }
}
