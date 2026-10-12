/**
 * The twin's conversation, Door 2: what a person types into the panel
 * and what comes back. Pure — no database, no model, no network — so the
 * rules are tested as rules (`__tests__/invariants/twin-conversation.test.ts`).
 *
 * The founder's brief (CLAUDE.md, "The job twin"): rules first, the model
 * second. Five questions are answered from the ledger and the record by
 * plain code before any model is called:
 *
 *   what needs me                         the twin's questions this seat may answer
 *   why <entry>                           the ledger's own rule and rationale
 *   approve <item>                        a confirm card; the panel calls the one approval route
 *   reject <item> because <reason>        the same, with the reason
 *   invoice variance by supplier …        per supplier, from the twin's invoice verdicts
 *
 * Anything else goes to the model with the ledger lines as context, and
 * only if a key is configured. The model describes; it never acts and it
 * is never the gate. Nothing in this file or the route writes state: a
 * yes or a no is sent by the panel to POST /api/twin/approvals/:id, the
 * one door the web and Teams share.
 */

// ── What was asked ───────────────────────────────────────────────────

export type Intent =
  | { kind: 'HELP' }
  | { kind: 'NEEDS' }
  | { kind: 'WHY'; ref: string | null }
  | { kind: 'DECIDE'; decision: 'APPROVED' | 'REJECTED'; ref: string; reason: string | null }
  | { kind: 'VARIANCE' }
  | { kind: 'ASK'; text: string }

/** "#3", "INV-1003.", "'abc'" — a reference as somebody types it, cleaned. */
function cleanRef(s: string): string | null {
  const r = s
    .trim()
    .replace(/[?.!,;:]+$/, '')
    .replace(/^(on|is|about|for|entry|item|number|no\.?)\s+/i, '')
    .replace(/^(the\s+)?(entry|item|receipt|invoice|question)\s+/i, '')
    .replace(/^#/, '')
    .replace(/^['"“‘]|['"”’]$/g, '')
    .trim()
  return r ? r : null
}

/**
 * Read what a person typed into one of the five rule questions, or ASK.
 * Case and trailing punctuation do not matter; word order mostly does,
 * because "approve" at the start is an instruction and in the middle of a
 * sentence is a question about approving.
 */
export function readAsk(raw: string): Intent {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text || /^(help|\?|what can you do\??|what do you answer\??)$/i.test(text)) return { kind: 'HELP' }

  const lower = text.toLowerCase()
  if (/\bvariance\b/.test(lower) && /\bsuppliers?\b/.test(lower)) return { kind: 'VARIANCE' }

  if (
    /^(what|who|anything)\b.*\b(needs?|waiting on|waits? (for|on)|for)\s+me\b/.test(lower) ||
    /^(needs me|my queue|waiting on me|what is waiting( on me)?)\??$/.test(lower)
  ) return { kind: 'NEEDS' }

  const why = text.match(/^why\b\s*(.*)$/i)
  if (why) return { kind: 'WHY', ref: cleanRef(why[1]) }

  const approve = text.match(/^(approve|yes to|say yes to)\s+(.+)$/i)
  if (approve) {
    const ref = cleanRef(approve[2])
    if (ref) return { kind: 'DECIDE', decision: 'APPROVED', ref, reason: null }
  }

  const reject = text.match(/^(reject|decline|say no to|no to)\s+(.+?)(?:\s+(?:because|as|since|reason:?)\s+(.+))?$/i)
  if (reject) {
    const ref = cleanRef(reject[2])
    const reason = reject[3]?.trim().replace(/\s+/g, ' ') || null
    if (ref) return { kind: 'DECIDE', decision: 'REJECTED', ref, reason }
  }

  return { kind: 'ASK', text }
}

/** The rule questions, as a reader would type them. Drawn as one-tap prompts. */
export const RULE_QUESTIONS: readonly string[] = [
  'What needs me?',
  'Show me invoice variance by supplier this quarter',
]

export const WHAT_I_ANSWER =
  'I answer these from the ledger: “What needs me?”, “Why 1” (or why and an entry), ' +
  '“Approve 1”, “Reject 1 because …”, and “Show me invoice variance by supplier this quarter”.'

// ── The model ────────────────────────────────────────────────────────

/** Whether a model can be asked on this deployment. The key only, never its value. */
export function modelConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim())
}

export const NO_MODEL =
  'The model is not set up on this deployment, so I can answer only the questions the rules cover. ' + WHAT_I_ANSWER

/** The one sentence the model says for any act. Checked in the test, so it cannot drift. */
export const ASK_THE_DESK = 'I cannot do that; ask the desk.'

/**
 * The model's instruction. It may describe what the ledger lines say and
 * nothing more. The lines are the whole of what it knows; an act of any
 * kind gets the one sentence above, because the model is never the gate.
 */
export const MODEL_SYSTEM = [
  'You answer questions about a company’s contingent workforce program, for a person signed in to Etyme.',
  'You are given lines from the program manager twin’s ledger. They are the only facts you have.',
  'Describe only what is on those lines. Do not guess, estimate or add a figure that is not on a line.',
  'When you cite a line, give its id in square brackets, exactly as written, like [ck123].',
  `If you are asked to do anything — approve, reject, pay, send, change, end, sign or write — answer exactly: "${ASK_THE_DESK}"`,
  'If the lines do not answer the question, say so in one sentence.',
  'Use plain American English, short sentences, no more than eight lines. Say job request, time limit, invoice receipt and bill.',
].join('\n')

export interface LedgerLine {
  id: string
  ts: string
  says: string
  outcome: string
  entityType: string
  entityId: string
  ruleCited: string
  rationale: string
}

/** The context the model is given: one line per entry, newest first, capped. */
export function ledgerContext(lines: readonly LedgerLine[], cap = 60): string {
  return lines
    .slice(0, cap)
    .map((l) => `[${l.id}] ${l.ts.slice(0, 10)} · ${l.outcome} · ${l.says} · ${l.entityType} ${l.entityId} · Rule: ${l.ruleCited} · Why: ${l.rationale}`)
    .join('\n')
}

/** Ids the model cited in square brackets that really are ledger lines it was given. */
export function citedIds(text: string, lines: readonly LedgerLine[]): string[] {
  const known = new Set(lines.map((l) => l.id))
  const out: string[] = []
  for (const m of text.matchAll(/\[([A-Za-z0-9_-]{6,})\]/g)) {
    if (known.has(m[1]) && !out.includes(m[1])) out.push(m[1])
  }
  return out
}

// ── Links ────────────────────────────────────────────────────────────

/**
 * Where a figure's source opens. An invoice receipt opens on its own
 * page, a person on theirs, and anything else on the ledger's entry.
 * `/dashboard/twin` is the architect's twin page; its entries carry the
 * anchor `entry-<id>`.
 */
export function hrefFor(entityType: string, entityId: string, entryId?: string): string {
  if (entityType === 'Invoice') return `/dashboard/invoices/${entityId}`
  if (entityType === 'Person') return `/dashboard/people/${entityId}`
  return entryHref(entryId ?? entityId)
}

export function entryHref(entryId: string): string {
  return `/dashboard/twin#entry-${entryId}`
}

// ── The answers ──────────────────────────────────────────────────────

export interface Link { label: string; href: string }

/** One of the twin's questions this seat may answer. */
export interface WaitingItem {
  /** 1-based, in the order shown; "approve 1" means this one. */
  n: number
  approvalId: string
  entryId: string
  /** What the act does, from the twin's vocabulary. */
  says: string
  /** "INV-1003 from Veritan Talent" · a person's name. */
  title: string
  ruleCited: string
  rationale: string
  href: string
}

export interface VarianceReceipt {
  invoiceId: string
  number: string | null
  supplierName: string | null
  verdict: 'CLEAN' | 'MISMATCH' | 'BLOCKED'
  lines: ReadonlyArray<{ hoursBilled: number; hoursAccepted: number | null; isHours: boolean }>
}

export interface VarianceRow {
  supplier: string
  receipts: number
  clean: number
  mismatch: number
  held: number
  hoursBilled: number
  /** What the paying firm accepted on the weeks it accepted. */
  hoursAccepted: number
  /**
   * Hours billed above the hours accepted, summed over accepted weeks
   * only. Null where no week on any receipt was accepted, because a
   * difference against nothing is not a number anybody can stand behind.
   */
  hoursOverAccepted: number | null
  /** Hours billed on weeks nobody has accepted yet, never folded into the figure above. */
  hoursNotAccepted: number
  /** Each receipt behind the row. */
  receiptLinks: Link[]
}

export type Answer =
  | { kind: 'TEXT'; says: string; links?: Link[] }
  | { kind: 'NEEDS'; says: string; items: WaitingItem[] }
  | { kind: 'WHY'; says: string; ruleCited: string; rationale: string; links: Link[] }
  | { kind: 'CONFIRM'; says: string; decision: 'APPROVED' | 'REJECTED'; reason: string | null; item: WaitingItem }
  | { kind: 'VARIANCE'; says: string; period: { from: string; to: string; label: string }; rows: VarianceRow[] }
  | { kind: 'MODEL'; says: string; links: Link[] }

/** Hours as a clerk writes them: "41.5", "40". */
export function hrs(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** The calendar quarter a day falls in, UTC: [from, to) and "Q4 2026". */
export function quarterOf(now: Date): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear()
  const q = Math.floor(now.getUTCMonth() / 3)
  return {
    from: new Date(Date.UTC(y, q * 3, 1)),
    to: new Date(Date.UTC(y, q * 3 + 3, 1)),
    label: `Q${q + 1} ${y}`,
  }
}

const NO_SUPPLIER = 'Supplier not named on the record'

/**
 * Invoice variance by supplier: one row per supplier, from the twin's
 * verdict on each receipt. Hours are rounded only when shown.
 */
export function varianceBySupplier(receipts: readonly VarianceReceipt[]): VarianceRow[] {
  const by = new Map<string, VarianceRow & { anyAccepted: boolean }>()
  for (const r of receipts) {
    const key = r.supplierName?.trim() || NO_SUPPLIER
    const row = by.get(key) ?? {
      supplier: key, receipts: 0, clean: 0, mismatch: 0, held: 0,
      hoursBilled: 0, hoursAccepted: 0, hoursOverAccepted: 0, hoursNotAccepted: 0,
      receiptLinks: [], anyAccepted: false,
    }
    row.receipts++
    if (r.verdict === 'CLEAN') row.clean++
    else if (r.verdict === 'MISMATCH') row.mismatch++
    else row.held++
    for (const l of r.lines) {
      if (!l.isHours) continue
      row.hoursBilled += l.hoursBilled
      if (l.hoursAccepted == null) {
        row.hoursNotAccepted += l.hoursBilled
        continue
      }
      row.anyAccepted = true
      row.hoursAccepted += l.hoursAccepted
      row.hoursOverAccepted = (row.hoursOverAccepted ?? 0) + Math.max(0, l.hoursBilled - l.hoursAccepted)
    }
    row.receiptLinks.push({ label: r.number ?? 'Invoice receipt', href: hrefFor('Invoice', r.invoiceId) })
    by.set(key, row)
  }
  return [...by.values()]
    .map(({ anyAccepted, ...row }) => ({ ...row, hoursOverAccepted: anyAccepted ? row.hoursOverAccepted : null }))
    .sort((a, b) => (b.mismatch + b.held) - (a.mismatch + a.held) || a.supplier.localeCompare(b.supplier))
}

/** The sentence over the variance table. */
export function varianceSays(rows: readonly VarianceRow[], label: string): string {
  if (rows.length === 0) return `The twin has recorded no invoice receipts in ${label}.`
  const receipts = rows.reduce((s, r) => s + r.receipts, 0)
  const off = rows.reduce((s, r) => s + r.mismatch + r.held, 0)
  const over = rows.reduce((s, r) => s + (r.hoursOverAccepted ?? 0), 0)
  return (
    `${receipts} invoice receipt${receipts === 1 ? '' : 's'} from ${rows.length} supplier${rows.length === 1 ? '' : 's'} in ${label}` +
    (off === 0 ? ', all clean.' : `; ${off} ${off === 1 ? 'is' : 'are'} not clean, ${hrs(over)} hours billed over what was accepted.`) +
    ' Checked again against the three-way check as you asked.'
  )
}

/** The twin's questions, as a reply. */
export function needsSays(items: readonly WaitingItem[]): string {
  if (items.length === 0) return 'Nothing from the twin is waiting on you.'
  return items.length === 1
    ? 'The twin is asking you one thing. Approve it here, or reject it with a reason.'
    : `The twin is asking you ${items.length} things. Approve each here, or reject it with a reason.`
}

/**
 * Find the item a person meant: its number in the list, its question's
 * id, its ledger entry's id, or the invoice receipt's number.
 */
export function findItem(items: readonly WaitingItem[], ref: string): WaitingItem | null {
  const r = ref.trim().toLowerCase()
  if (/^\d+$/.test(r)) return items.find((i) => i.n === Number(r)) ?? null
  return (
    items.find((i) => i.approvalId.toLowerCase() === r || i.entryId.toLowerCase() === r) ??
    items.find((i) => i.title.toLowerCase().split(' ')[0] === r) ??
    null
  )
}

/** What a confirm card says the button will do, in the same words the result confirms. */
export function confirmSays(decision: 'APPROVED' | 'REJECTED', item: WaitingItem, reason: string | null): string {
  return decision === 'APPROVED'
    ? `Approve ${item.title}? ${item.says} It is recorded in the twin’s ledger under your name.`
    : `Reject ${item.title}, because “${reason}”? The twin does nothing, and your reason is recorded in its ledger under your name.`
}

/**
 * The request the panel sends for a yes or a no. The one approval route
 * the web and Teams share, with the surface named; nothing else writes.
 */
export function decisionRequest(approvalId: string, decision: 'APPROVED' | 'REJECTED', reason: string | null): {
  url: string
  init: { method: 'POST'; headers: Record<string, string>; body: string }
} {
  return {
    url: `/api/twin/approvals/${encodeURIComponent(approvalId)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: reason ?? undefined, surface: 'WEB' }),
    },
  }
}

// ── Answering ────────────────────────────────────────────────────────

/** What the route reads. Every one is a read; none writes. */
export interface Readers {
  waiting(): Promise<WaitingItem[]>
  /** An entry in the reader's scope by its id, its question's id, or the entity it is about. */
  entry(ref: string): Promise<{ id: string; says: string; ruleCited: string; rationale: string; entityType: string; entityId: string } | null>
  receiptsIn(from: Date, to: Date): Promise<VarianceReceipt[]>
  ledgerLines(): Promise<LedgerLine[]>
  /** Asks the model; only called where a key is configured. */
  model(system: string, question: string, context: string): Promise<string | null>
}

/**
 * One answer to one message. Rules first; the model only for ASK, and
 * only where a key is configured.
 */
export async function respond(
  text: string,
  read: Readers,
  opts: { env: Record<string, string | undefined>; now?: Date }
): Promise<Answer> {
  const intent = readAsk(text)

  switch (intent.kind) {
    case 'HELP':
      return { kind: 'TEXT', says: WHAT_I_ANSWER + (modelConfigured(opts.env) ? ' Anything else, I read from the ledger and say only what is on it.' : '') }

    case 'NEEDS': {
      const items = await read.waiting()
      return { kind: 'NEEDS', says: needsSays(items), items }
    }

    case 'WHY': {
      if (!intent.ref) return { kind: 'TEXT', says: 'Say which one: “Why 1” for the first thing waiting on you, or why and an entry.' }
      let ref = intent.ref
      if (/^\d+$/.test(ref)) {
        const item = findItem(await read.waiting(), ref)
        if (!item) return { kind: 'TEXT', says: `There is no item ${ref} waiting on you. Ask “What needs me?” to see the list.` }
        ref = item.entryId
      }
      const e = await read.entry(ref)
      if (!e) return { kind: 'TEXT', says: `There is no ledger entry “${intent.ref}” you can read. Check the entry, or ask “What needs me?”.` }
      return {
        kind: 'WHY',
        says: e.says,
        ruleCited: e.ruleCited,
        rationale: e.rationale,
        links: [
          { label: 'The ledger entry', href: entryHref(e.id) },
          ...(e.entityType === 'Invoice' || e.entityType === 'Person'
            ? [{ label: e.entityType === 'Invoice' ? 'The invoice receipt' : 'The person', href: hrefFor(e.entityType, e.entityId) }]
            : []),
        ],
      }
    }

    case 'DECIDE': {
      const items = await read.waiting()
      const item = findItem(items, intent.ref)
      if (!item) {
        return {
          kind: 'TEXT',
          says: items.length === 0
            ? 'Nothing from the twin is waiting on you, so there is nothing to answer.'
            : `“${intent.ref}” is not one of the ${items.length} thing${items.length === 1 ? '' : 's'} waiting on you. Ask “What needs me?” to see them by number.`,
        }
      }
      if (intent.decision === 'REJECTED' && !intent.reason) {
        return { kind: 'TEXT', says: `Say why, so the twin and whoever reads the ledger know: “Reject ${item.n} because …”.` }
      }
      return { kind: 'CONFIRM', says: confirmSays(intent.decision, item, intent.reason), decision: intent.decision, reason: intent.reason, item }
    }

    case 'VARIANCE': {
      const q = quarterOf(opts.now ?? new Date())
      const rows = varianceBySupplier(await read.receiptsIn(q.from, q.to))
      return {
        kind: 'VARIANCE',
        says: varianceSays(rows, q.label),
        period: { from: q.from.toISOString().slice(0, 10), to: q.to.toISOString().slice(0, 10), label: q.label },
        rows,
      }
    }

    case 'ASK': {
      if (!modelConfigured(opts.env)) return { kind: 'TEXT', says: NO_MODEL }
      const lines = await read.ledgerLines()
      if (lines.length === 0) return { kind: 'TEXT', says: 'The twin’s ledger has nothing you can read yet, so there is nothing to describe. ' + WHAT_I_ANSWER }
      const said = await read.model(MODEL_SYSTEM, intent.text, ledgerContext(lines))
      if (!said) return { kind: 'TEXT', says: 'The model did not answer just now. ' + WHAT_I_ANSWER }
      const byId = new Map(lines.map((l) => [l.id, l]))
      return {
        kind: 'MODEL',
        says: said,
        links: citedIds(said, lines).map((id) => {
          const l = byId.get(id)!
          return { label: `Entry ${id.slice(-6)}`, href: hrefFor(l.entityType, l.entityId, l.id) }
        }),
      }
    }
  }
}
