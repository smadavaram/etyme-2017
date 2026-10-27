'use client'

import type { ReactNode } from 'react'

/**
 * A refusal and its one way forward, as one block.
 *
 * A refused page is the sentence and nothing else (sign-up walk, round
 * four): no heading, tile or zero beside it. Where the sentence names a
 * thing the reader can do here — an MSP with no seat asking a client for
 * one — the doing is part of the sentence, the way "Get it on file, then
 * start" is, and it is drawn inside the refusal rather than beside a page.
 * The sentence is the shared RefusedState, passed as the child; null as
 * the way forward draws the sentence alone.
 */
export function RefusedWithWayForward({ children, wayForward }: { children: ReactNode; wayForward: ReactNode | null }) {
  if (!wayForward) return <>{children}</>
  return (
    <div data-state="refused-with-way-forward" className="max-w-xl space-y-2">
      {children}
      {wayForward}
    </div>
  )
}
