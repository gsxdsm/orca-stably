const STYLE_ID = 'orca-pressable-svg-hits'

// A click or long-press whose target is an SVG path never reaches a page Pressable.
// One and two levels covers the icon and a single wrapper. Deeper drawings stay hittable.
const RULES = `:is([tabindex], [aria-disabled], [role="button"]) > svg,
:is([tabindex], [aria-disabled], [role="button"]) > * > svg,
:is([tabindex], [aria-disabled], [role="button"]) > svg > *,
:is([tabindex], [aria-disabled], [role="button"]) > * > svg > * {
  pointer-events: none;
}`

export function startIgnoringPressableIconHits(): void {
  if (document.getElementById(STYLE_ID) !== null) {
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = RULES
  document.head.append(style)
}
