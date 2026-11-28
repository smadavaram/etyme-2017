'use client'

/**
 * The left column's slots in the Ask Etyme view (founder, 2026-11-08,
 * "One app, two tabs").
 *
 * In Ask Etyme the column under the switch holds New conversation,
 * search, Pinned and the conversations. The column is the shell's; what
 * is in it is conversation's, because the threads, the pinned questions
 * and what "new" means live on the Ask Etyme page. So the shell draws
 * three empty places and the page fills them:
 *
 *   <RailSlot name="top">…New conversation and search…</RailSlot>
 *   <RailSlot name="pinned">…the pinned questions…</RailSlot>
 *   <RailSlot name="conversations">…the list…</RailSlot>
 *
 * A slot is a portal, so what the page puts in it keeps the page's own
 * state and handlers: a click in the column is a click in the page. The
 * shell prints the "Pinned" and "Conversations" headings only while the
 * page fills that slot, so an empty column never shows a heading over
 * nothing.
 *
 * Two columns can be on screen at once in the document (the rail, which
 * is hidden on a phone, and the phone's menu sheet when it is open). The
 * last one drawn holds the slot, and when it goes the slot moves back,
 * so the sheet shows the conversations while it is open.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type RailSlotName = 'top' | 'pinned' | 'conversations'

const targets: Record<RailSlotName, HTMLElement[]> = { top: [], pinned: [], conversations: [] }
const fills: Record<RailSlotName, number> = { top: 0, pinned: 0, conversations: 0 }
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((f) => f())

function subscribe(f: () => void): () => void {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

/** Where a slot is drawn now: the last column to offer it. */
function targetOf(name: RailSlotName): HTMLElement | null {
  const list = targets[name]
  return list.length > 0 ? list[list.length - 1] : null
}

/**
 * What the Ask Etyme page puts in the left column. Draws nothing where
 * no column is on screen.
 */
export function RailSlot({ name, children }: { name: RailSlotName; children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, () => targetOf(name), () => null)
  useEffect(() => {
    fills[name] += 1
    tell()
    return () => { fills[name] -= 1; tell() }
  }, [name])
  return target ? createPortal(children, target) : null
}

/** Whether the page fills a slot now. */
export function useSlotFilled(name: RailSlotName): boolean {
  return useSyncExternalStore(subscribe, () => fills[name] > 0, () => false)
}

/**
 * The place in the column a slot is drawn, with its heading while it is
 * filled. Drawn by the sidebar only.
 */
export function RailSlotOutlet({ name, heading }: { name: RailSlotName; heading?: string }) {
  const filled = useSlotFilled(name)
  const mine = useRef<HTMLDivElement | null>(null)
  const ref = useCallback((el: HTMLDivElement | null) => {
    // The place this column offered before, if any, is no longer offered.
    if (mine.current) targets[name] = targets[name].filter((t) => t !== mine.current)
    mine.current = el
    if (el) targets[name] = [...targets[name], el]
    tell()
  }, [name])
  return (
    <div data-rail-slot={name}>
      {heading && filled && <div className="eyebrow px-2.5 pt-4 pb-1">{heading}</div>}
      <div ref={ref} />
    </div>
  )
}
