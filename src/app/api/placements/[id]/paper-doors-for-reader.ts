import type { PaperDoors } from '@/lib/document-stages/paper-doors'

/**
 * A placement's paper doors, as a reader above the supplier may be sent
 * them (release pass 41): "A sub-vendor's name is the prime's to keep"
 * (CLAUDE.md, 2026-09-17). A client reads the rung it pays and nothing
 * below it, so a door that names or carries a firm below its supplier is
 * not sent, and a sentence naming one says the supplier's supplier
 * instead. Pure.
 *
 * Why it is needed here, for regulatory: `paperDoorsFor` and the arrival
 * reads in lib/document-stages write `owes.name` and `a.firmName` into a
 * door's sentence with no notion of which rung the reader stands on, so
 * every caller that sends doors above the supplier must strip them. A
 * reader-aware sentence there would make this file unnecessary.
 */
export function doorsForReader(
  doors: Record<string, PaperDoors>,
  hidden: readonly { id: string; name: string }[],
  standIn: string
): Record<string, PaperDoors> {
  if (hidden.length === 0) return doors
  const mentions = (text: string) => hidden.some((f) => text.includes(f.id) || (f.name && text.includes(f.name)))
  const out: Record<string, PaperDoors> = {}
  for (const [key, d] of Object.entries(doors)) {
    let says = d.says
    if (says) {
      for (const f of hidden) if (f.name) says = says.split(f.name).join(standIn)
      if (mentions(says)) says = null
    }
    out[key] = { ...d, doors: d.doors.filter((x) => !mentions(JSON.stringify(x))), says }
  }
  return out
}
