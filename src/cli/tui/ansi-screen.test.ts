import { describe, expect, it } from 'vitest'
import { AnsiScreen } from './ansi-screen'

describe('AnsiScreen', () => {
  it('renders plain text into a styled line', async () => {
    const screen = new AnsiScreen()
    const lines = await screen.render('hello world', 20, 1)
    screen.dispose()
    const text = lines
      .flat()
      .map((span) => span.text)
      .join('')
    expect(text).toContain('hello world')
  })

  it('captures SGR color as a hex foreground', async () => {
    const screen = new AnsiScreen()
    // ESC[31m = palette red (index 1), reset after.
    const lines = await screen.render('[31mRED[0m', 10, 1)
    screen.dispose()
    const spans = lines.flat()
    const red = spans.find((span) => span.text.includes('RED'))
    expect(red).toBeTruthy()
    expect(red?.fg).toBe('#800000')
  })

  it('captures bold + a 256-palette color', async () => {
    const screen = new AnsiScreen()
    // ESC[1m bold, ESC[38;5;196m = bright red (256 palette).
    const lines = await screen.render('[1;38;5;196mHI[0m', 10, 1)
    screen.dispose()
    const span = lines.flat().find((s) => s.text.includes('HI'))
    expect(span?.bold).toBe(true)
    expect(span?.fg).toBe('#ff0000')
  })
})
