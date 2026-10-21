/**
 * One message per person per night, across both halves of the nightly
 * check.
 *
 * `cron/watch` says two kinds of thing: the paper letters
 * (`lib/notify/documents`, conversation's — every paper running out or
 * never filed, already one letter per person), and the firm's own
 * findings (a supplier's cover, a contractor's license, an order nearly
 * spent, a seat nobody uses — grouped per person in the route). An
 * owner who holds both desks read two messages the same night. This
 * folds them: a person with both reads one message, the papers and the
 * findings in it, worst first; a person with one reads it unchanged.
 *
 * Pure. The route sends what this returns and writes the record of each
 * paper having been told.
 */
import type { NotifyParams } from '@/lib/notify'
import { NIGHT_LETTER, oneLetterPerPerson, type LapseLetter, type NightLetter } from '@/lib/notify/documents'

/** The firm's own findings for one person, as the route built them. */
export interface FindingNote extends NotifyParams {
  /** The worst finding stops work today. */
  blocking: boolean
  /** The keys of every finding inside it. */
  keys: string[]
}

export interface Tonight {
  /** Paper letters for people with no finding tonight: sent by conversation's door, unchanged. */
  lettersAlone: LapseLetter[]
  /** Findings for people with no paper letter tonight: sent as they are. */
  notesAlone: FindingNote[]
  /** People with both: one message, and the paper facts it carries, to be recorded. */
  together: { message: NotifyParams; facts: LapseLetter[] }[]
}

export function oneMessageTonight(letters: readonly LapseLetter[], notes: readonly FindingNote[]): Tonight {
  const noteOf = new Map<string, FindingNote>()
  for (const n of notes) noteOf.set(n.personId, n)
  const nights = oneLetterPerPerson([...letters])
  const both = new Set(nights.filter((n) => noteOf.has(n.personId)).map((n) => n.personId))

  return {
    lettersAlone: letters.filter((l) => !both.has(l.personId)),
    notesAlone: notes.filter((n) => !both.has(n.personId)),
    together: nights
      .filter((n) => both.has(n.personId))
      .map((night) => ({ message: togetherAs(night, noteOf.get(night.personId)!), facts: night.facts })),
  }
}

function more(n: number, what: string): string {
  return n === 1 ? `one more ${what}` : `${n} more ${what}s`
}

/**
 * The one message: the worse half leads. A paper that stops work, or a
 * finding that does, comes first; on a tie the papers lead, because
 * they carry a date somebody can act before.
 */
export function togetherAs(night: NightLetter, note: FindingNote): NotifyParams {
  const paperStops = night.facts.some((f) => f.data.stopsWork)
  const findingFirst = note.blocking && !paperStops
  const papers = night.facts.length
  const findings = note.keys.length

  const findingSection = `${note.title}\n${note.body}`
  const paperSection = night.facts.length === 1 ? `${night.title}\n${night.body}` : night.body
  const title = findingFirst
    ? `${note.title}, and ${more(papers, 'paper')}`
    : `${night.title}, and ${more(findings, 'thing to look at')}`

  const paperKeys = night.facts.flatMap((f) => [f.saidKey, ...(f.data.alsoSaid ?? [])])
  const first = findingFirst ? note.keys[0] : night.facts[0].saidKey
  const every = [...new Set([...paperKeys, ...note.keys])]

  return {
    personId: night.personId,
    companyId: night.companyId ?? note.companyId,
    type: 'SYSTEM',
    title,
    body: findingFirst ? `${findingSection}\n\n${paperSection}` : `${paperSection}\n\n${findingSection}`,
    entityId: findingFirst ? note.entityId : night.entityId,
    // The papers' letter is always an email; a finding folded into it rides along.
    channel: 'EMAIL',
    data: {
      // Read back by both halves: the papers' reader finds the mark, the
      // findings' reader finds the mark too, and each finds its own keys.
      letter: NIGHT_LETTER,
      saidKey: first,
      alsoSaid: every.filter((k) => k !== first),
      documentIds: [...new Set(night.facts.map((f) => f.data.documentId))],
      count: papers + findings,
      stopsWork: night.facts.filter((f) => f.data.stopsWork).length + (note.blocking ? 1 : 0),
      kinds: (note.data as { kinds?: unknown } | undefined)?.kinds ?? [],
    },
  }
}
