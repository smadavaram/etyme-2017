/**
 * Every name the product itself gives a kind of paper, by its key.
 *
 * Walk 7, 2026-11-08, item 2: the placement asks for an NDA as "Signed
 * non-disclosure agreement" (the start packet's word) and the line's set
 * calls it "Non-disclosure agreement" (the dictionary's). A paper is
 * credited against a requirement only by an exact name, never a guess
 * (`typeKeyForTemplate`, guess: false), so the request Halcyon opened was
 * not read as the NDA Samuel owed, and his page listed one paper twice.
 *
 * This is not a guess: each name here is one the product wrote for that
 * key. A name two keys share is dropped, because it names neither. Pure.
 *
 * Owned by regulatory.
 */
import { BUILT_IN } from '@/lib/document-type'
import { PACKETS } from '@/lib/packets'

type Name = { key: string; label: string }

const PRODUCT_NAMES: Name[] = (() => {
  const all: Name[] = [
    ...BUILT_IN.map((t) => ({ key: t.key, label: t.label })),
    ...PACKETS.flatMap((p) => p.items.map((i) => ({ key: i.key, label: i.label }))),
  ]
  const keysOf = new Map<string, Set<string>>()
  for (const n of all) {
    const k = n.label.trim().toLowerCase()
    keysOf.set(k, (keysOf.get(k) ?? new Set()).add(n.key))
  }
  const seen = new Set<string>()
  return all.filter((n) => {
    const k = n.label.trim().toLowerCase()
    if ((keysOf.get(k)?.size ?? 0) > 1 || seen.has(k)) return false
    seen.add(k)
    return true
  })
})()

/**
 * The names a paper may be read by: the caller's own first (a line's set,
 * a firm's own names win), then every name the product gives a kind.
 */
export function paperNames(own: readonly Name[] = []): Name[] {
  const taken = new Set(own.map((n) => n.label.trim().toLowerCase()))
  return [...own, ...PRODUCT_NAMES.filter((n) => !taken.has(n.label.trim().toLowerCase()))]
}
