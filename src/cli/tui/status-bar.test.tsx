import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { StatusBar } from './status-bar'
import { HelpOverlay } from './help-overlay'

describe('StatusBar', () => {
  it('renders core key hints', () => {
    const frame = render(<StatusBar platform="other" />).lastFrame() ?? ''
    expect(frame).toContain('move')
    expect(frame).toContain('quit')
    expect(frame).toContain('Ctrl+C')
  })

  it('shows a disconnected banner', () => {
    const frame = render(<StatusBar platform="other" disconnected />).lastFrame() ?? ''
    expect(frame).toContain('disconnected')
  })

  it('surfaces an action error inline', () => {
    const frame = render(<StatusBar platform="other" error="permission denied" />).lastFrame() ?? ''
    expect(frame).toContain('permission denied')
  })

  it('uses the mac control glyph on darwin', () => {
    const frame = render(<StatusBar platform="mac" />).lastFrame() ?? ''
    expect(frame).toContain('⌃C')
  })
})

describe('HelpOverlay', () => {
  it('lists shortcuts and the mouse hint, consistent with the status bar', () => {
    const frame = render(<HelpOverlay platform="other" />).lastFrame() ?? ''
    expect(frame).toContain('Keyboard shortcuts')
    expect(frame).toContain('new worktree')
    expect(frame).toContain('send input')
    expect(frame).toContain('Mouse')
  })
})
