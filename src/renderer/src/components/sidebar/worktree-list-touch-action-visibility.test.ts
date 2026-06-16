import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

// Why: sidebar project-header action buttons (project actions, create worktree,
// group menu, collapse chevron) hide with `opacity-0` and reveal on
// `group-hover`. Touch devices have no hover, so a bare `opacity-0` leaves the
// icon permanently invisible while the button stays clickable — the web/mobile
// "missing icons" bug. The fix gates the hide behind the `can-hover:` variant
// (active only under `@media (hover: hover)`), so touch keeps the icon visible.
// This guard fails if a future change reintroduces a bare hover-reveal here.

const WORKTREE_LIST = resolve(__dirname, 'WorktreeList.tsx')
const MAIN_CSS = resolve(__dirname, '../../assets/main.css')

describe('sidebar action button touch visibility', () => {
  it('declares the can-hover variant so touch devices skip the hover-only hide', () => {
    const css = readFileSync(MAIN_CSS, 'utf8')
    expect(css).toMatch(/@custom-variant\s+can-hover\s+\(@media\s*\(hover:\s*hover\)\)/)
  })

  it('never hides a hover-reveal control behind a bare opacity-0', () => {
    const source = readFileSync(WORKTREE_LIST, 'utf8')
    const lines = source.split('\n')
    const offenders: string[] = []

    lines.forEach((line, index) => {
      // Scan every `opacity-0` token on the line.
      for (const match of line.matchAll(/opacity-0\b/g)) {
        const prevChar = match.index! > 0 ? line[match.index! - 1] : ''
        // A `:` prefix means it is variant-gated (e.g. `can-hover:opacity-0`),
        // which is the touch-safe form.
        if (prevChar === ':') {
          continue
        }
        // A bare `opacity-0` is only legitimate for elements hidden regardless
        // of pointer (drag placeholders), which also disable pointer events.
        if (line.includes('pointer-events-none')) {
          continue
        }
        offenders.push(`${index + 1}: ${line.trim()}`)
      }
    })

    expect(offenders).toEqual([])
  })
})
