export type InteractiveBackSwipe = {
  width?: number
  update: (progress: number) => void
  finish: (commit: boolean) => void
  cancel: () => void
}

export function backSwipeDirection(dx: number, dy: number): 'wait' | 'back' | 'reject' {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) {
    return 'wait'
  }
  return dx > Math.abs(dy) * 1.5 ? 'back' : 'reject'
}

export function backSwipeCommits(progress: number, velocity: number): boolean {
  return velocity > -0.3 && (progress >= 0.5 || (progress >= 0.08 && velocity >= 0.5))
}
