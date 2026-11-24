import type { InteractiveBackSwipe } from '../../../navigation/back-swipe'
import { listenForPageBackSwipe } from '../../../navigation/page-back-swipe.web'
import { hostOs } from '../../../platform/host-os.web'

export type PageBackConsumer = (() => boolean) & {
  beginBackSwipe?: (edge: boolean) => InteractiveBackSwipe | null
}

// One LIFO stack per page client matches native BackHandler false-fallthrough. Publish shell claim changes only on empty/nonempty edges so stacked sheets cannot flicker native key registration.
export type PageBackConsumers = {
  readonly claim: (consumer: PageBackConsumer) => () => void
  readonly press: () => void
  // Same walk as press, without the shell's unclaimed handoff. A page control reports that itself.
  readonly dispatch: () => boolean
  // Reassert held state after init because ready clears the shell claim; when unheld, its false state is already established and needs no extra frame.
  readonly reassert: () => void
  readonly clear: () => void
}

export function createPageBackConsumers(args: {
  // Publish empty/nonempty edges and held reassertions, not each consumer’s lifetime.
  publishClaim: (claimed: boolean) => void
  // Return an unhandled press to native navigation; a sheet may have closed after claiming it.
  onUnclaimed: () => void
}): PageBackConsumers {
  const held: { consumer: PageBackConsumer }[] = []
  let stopSwipe: (() => void) | null = null

  function publish(before: number): void {
    if (held.length === 0) {
      stopSwipe?.()
      stopSwipe = null
    } else if (stopSwipe === null && typeof document !== 'undefined' && hostOs() === 'ios') {
      stopSwipe = listenForPageBackSwipe(
        document,
        (edge) => held.at(-1)?.consumer.beginBackSwipe?.(edge) ?? null
      )
    }
    if ((before === 0) !== (held.length === 0)) {
      args.publishClaim(held.length > 0)
    }
  }

  // Walk a copy so a handler disposing itself cannot skip the consumer beneath it.
  function taken(): boolean {
    return held.toReversed().some((entry) => entry.consumer())
  }

  return {
    claim: (consumer) => {
      const entry = { consumer }
      stopSwipe?.()
      stopSwipe = null
      const before = held.length
      held.push(entry)
      publish(before)
      return () => {
        const at = held.indexOf(entry)
        if (at === -1) {
          return
        }
        stopSwipe?.()
        stopSwipe = null
        const heldBefore = held.length
        held.splice(at, 1)
        publish(heldBefore)
      }
    },
    press: () => {
      if (!taken()) {
        args.onUnclaimed()
      }
    },
    dispatch: () => taken(),
    reassert: () => {
      if (held.length > 0) {
        args.publishClaim(true)
      }
    },
    clear: () => {
      const before = held.length
      held.length = 0
      publish(before)
    }
  }
}
