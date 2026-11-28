/**
 * The words in a week's Status cell, from what the row knows.
 *
 * A week stays SUBMITTED until every signature is in, so the cell says
 * what the reader can act on: SIGNED where this reader signed, or where
 * the reader's own week was signed at the top of the chain; and who the
 * week waits on next, by name. Colleen Byrne read her own week as
 * "SUBMITTED · Nobody approves their own hours." while it had been signed
 * by Harlow Health and waited on Halcyon Talent (the third walk,
 * 2026-10-26); it now reads "Signed · waiting on Halcyon Talent".
 */
export interface StatusRow {
  status: string
  signature?: {
    youSigned: boolean
    waitingOn: string | null
    signedAtTop?: boolean
  } | null
}

export interface StatusWords {
  /** The chip: SIGNED, or the week's own status. */
  chip: string
  /** Whether the chip reads as signed. */
  signed: boolean
  /** "waiting on <firm>", or null. */
  waiting: string | null
}

export function statusWords(row: StatusRow): StatusWords {
  const submitted = row.status === 'SUBMITTED'
  const sig = row.signature ?? null
  const signed = submitted && !!sig && (sig.youSigned || !!sig.signedAtTop)
  const waiting = submitted && sig?.waitingOn ? `waiting on ${sig.waitingOn}` : null
  return { chip: signed ? 'SIGNED' : row.status, signed, waiting }
}

/** The cell as one line, the way a person reads it: "Signed · waiting on Halcyon Talent". */
export function statusLine(row: StatusRow): string {
  const w = statusWords(row)
  const head = w.signed ? 'Signed' : w.chip.charAt(0) + w.chip.slice(1).toLowerCase()
  return w.waiting ? `${head} · ${w.waiting}` : head
}
