import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useWorktreeSessionPress } from './worktree-session-press'

function Probe({
  onPress,
  hold
}: {
  onPress: () => void
  hold: { current?: ReturnType<typeof useWorktreeSessionPress> }
}): null {
  hold.current = useWorktreeSessionPress(onPress)
  return null
}

describe('useWorktreeSessionPress', () => {
  it('lets the session row take the touch instead of the workspace behind it', () => {
    const onPress = vi.fn()
    const hold: { current?: ReturnType<typeof useWorktreeSessionPress> } = {}
    act(() => {
      create(createElement(Probe, { onPress, hold }))
    })
    const press = hold.current
    if (!press) {
      throw new Error('the press handlers were not installed')
    }
    press.claim()
    press.press()
    expect(onPress).not.toHaveBeenCalled()
    press.press()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
