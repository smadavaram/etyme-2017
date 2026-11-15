'use client'

import { usePageSection } from '@/components/page-section'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'
import { dayOfMomentFor, readerZone } from '@/lib/when'
import { refusalSentence } from '@/lib/refusal-words'
import { kindWord } from '@/lib/parties'
import { NOT_CLASSIFIED, NEVER_EMAILS, NOT_CLASSIFIED_KIND_LABEL, POSITION_WORDS, NO_POSITION_WORDS, domainCell, addressCell, companyTiles, countedTwiceSays, noPositionTile, rowsUnderFilter, relationshipForKind, type Position } from '@/lib/counterparty'
import { NO_WAY_TO_REACH } from '@/lib/contact-reach'
import { ADD_ANYWAY } from '@/lib/contacts'
import { Chip, Field, FilterChips, FormMessage, Input, LoadingState, PageHead, RefusedState, Select, Stat, SubmitButton, type ChipTone } from '@/components/ui'

/**
 * Companies working surface — manage vendor, client, MSP, and GSI companies.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Eyebrow: "Operate" — companies are an operational concern.
 */

// ── Types ──────────────────────────────────────────────────

type Kind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP' | 'UNCLASSIFIED'

interface Company {
  id: string
  name: string
  slug: string
  /** Null for a firm on Etyme that has not linked with you: its own facts stay with it. */
  kind: Kind | null
  entityType: string | null
  domain: string | null
  domainVerified: boolean
  /** The domain you typed for your own record of a company nobody has claimed. A note, never a claim. */
  notedDomain?: string | null
  /** Where the note came from: typed on Add a company, or on an invitation you sent. */
  notedFrom?: 'TYPED' | 'INVITATION' | null
  currency: string | null
  siteLiveAt: string | null
  networkVerifiedAt: string | null
  createdAt: string | null
  /** A firm on Etyme you wrote down or sent a job to, that has not linked with you (record 61). */
  notLinked?: boolean
  /** The relationship "Ask them to link" asks as, for a row not linked yet. */
  askAs?: 'SUPPLIER' | 'CLIENT' | null
  /** Somebody at the firm signed up or took its record; false for a client somebody else wrote down. */
  onEtyme: boolean
  /** Its Etyme address opens its public page. */
  hasPage: boolean
  /**
   * Where it sits with this firm, read off this firm's own register: a
   * Customer above us, a Supplier below us, a Prime or an MSP. Never read
   * from the Kind (founder, 2026-11-12: two facts, never one).
   */
  positions: Position[]
  /** On this firm's Companies list, holding no position with it. */
  notClassified: boolean
  /** This firm recorded it and nobody there has claimed it. */
  mine: boolean
  customerAgreement: 'SIGNED' | 'UNSIGNED' | 'NONE' | null
  /** What this reader may press on the row, as the routes would answer. */
  may: { extendToSupplier: boolean; extendToCustomer: boolean; setKind: boolean }
}

/**
 * The Kind in its own words, which are never a position's words: a
 * Vendor may be a Customer of ours, and a Client may supply us. So the
 * Kind column never says "Supplier" or "Customer".
 */
function kindOnList(kind: Company['kind']): string {
  switch (kind) {
    case null: return 'Not shown until they link'
    case 'VENDOR': return 'Vendor'
    case 'CLIENT': return 'Client'
    case 'MSP': return 'MSP'
    case 'GSI': return 'GSI'
    case 'CONSULTANT_CORP': return kindWord('CONSULTANT_CORP')
    case 'UNCLASSIFIED': return kindWord('UNCLASSIFIED')
  }
}

/** The quiet line under Positions, where the Kind box is offered below it. */
const KIND_IS_SET_BELOW = 'Kind is set below. It does not make them your supplier or customer.'

/** What extending does, said once beside each button. */
function extendLine(name: string, as: 'SUPPLIER' | 'CUSTOMER'): string {
  return as === 'SUPPLIER'
    ? `Puts ${name} under Suppliers. It does not email them and does not change what kind of company they are.`
    : `Puts ${name} under Customers, with no agreement signed yet. It does not email them and does not change what kind of company they are.`
}

/** The positions as chips, or the words for a row that holds none. Never a bare dash. */
function PositionChips({ row }: { row: Pick<Company, 'positions' | 'notClassified' | 'customerAgreement' | 'notLinked'> }) {
  if (row.notClassified) return <Chip tone="attention">{NOT_CLASSIFIED}</Chip>
  const none = noPositionTile({ positions: row.positions, notClassified: row.notClassified, notLinked: row.notLinked === true })
  if (none === 'NOT_LINKED') return <Chip tone="passive">{NO_POSITION_WORDS.NOT_LINKED}</Chip>
  if (none === 'WORKS_WITH_YOU') return <Chip tone="passive">{NO_POSITION_WORDS.WORKS_WITH_YOU}</Chip>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {row.positions.map((p) => (
        <Chip key={p} tone={p === 'CUSTOMER' ? 'verified' : 'action'}>{POSITION_WORDS[p]}</Chip>
      ))}
      {/* Beside the chip, not inside it: a chip never wraps, and this one ran
          the table past its box at desktop width (walk, 2026-11-15). */}
      {agreementWords(row) && <span className="basis-full text-[11px] leading-snug text-etyme-muted">{agreementWords(row)}</span>}
    </span>
  )
}

/** The customer agreement's words under the Customer chip, or null. */
function agreementWords(row: Pick<Company, 'positions' | 'customerAgreement'>): string | null {
  if (!row.positions.includes('CUSTOMER')) return null
  return row.customerAgreement === 'UNSIGNED' ? 'No agreement signed yet' : row.customerAgreement === 'NONE' ? 'No agreement on file' : null
}

/** The words under "To you", for sorting, search and the export. */
function toYouWords(row: Pick<Company, 'positions' | 'notClassified' | 'notLinked'>): string[] {
  if (row.notClassified) return [NOT_CLASSIFIED]
  const none = noPositionTile({ positions: row.positions, notClassified: row.notClassified, notLinked: row.notLinked === true })
  if (none === 'NOT_LINKED' || none === 'WORKS_WITH_YOU') return [NO_POSITION_WORDS[none]]
  return row.positions.map((p) => POSITION_WORDS[p])
}

/** Extend one company, one press; the route's sentence is handed back. */
async function extendCompany(id: string, as: 'SUPPLIER' | 'CUSTOMER'): Promise<{ ok: boolean; says: string; askToLink: boolean }> {
  try {
    const res = await fetch(`/api/companies/${encodeURIComponent(id)}/extend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as }),
    })
    const body = await res.json().catch(() => ({}) as any)
    if (!res.ok) {
      return { ok: false, says: refusalSentence(body.error?.message, { what: 'Extending a company' }) || 'That did not go through. Try again in a minute.', askToLink: body.error?.code === 'ALREADY_ON_ETYME' }
    }
    return { ok: true, says: body.data?.message ?? 'Done.', askToLink: false }
  } catch {
    return { ok: false, says: 'Network error. Please try again.', askToLink: false }
  }
}

/**
 * The two Extend buttons, drawn only where the route would take the press.
 * A success stays on the row, in the route's own sentence with Undo beside
 * it (`AfterExtend`); a refusal stays beside the button,
 * in the error tone, until it is closed, and a firm on Etyme the reader
 * does not work with is offered "Ask them to link" there (review,
 * 2026-11-13: a refusal read as a success for four seconds and was gone).
 */
function ExtendButtons({ row, onDone, onAsked, withLines = false }: { row: Company; onDone: (as: 'SUPPLIER' | 'CUSTOMER', says: string) => void; onAsked?: () => void; withLines?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ as: 'SUPPLIER' | 'CUSTOMER'; says: string; askToLink: boolean } | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const offered = (['SUPPLIER', 'CUSTOMER'] as const).filter((as) => (as === 'SUPPLIER' ? row.may.extendToSupplier : row.may.extendToCustomer))
  if (offered.length === 0) return null

  async function askToLink(as: 'SUPPLIER' | 'CUSTOMER') {
    setBusy(true)
    try {
      const res = await fetch('/api/trade-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: row.id, relationship: as === 'CUSTOMER' ? 'CLIENT' : 'SUPPLIER' }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        setRefused({ as, says: refusalSentence(body.error?.message, { what: 'Asking a firm to link' }) || 'The ask could not be sent. Try again in a minute.', askToLink: false })
        return
      }
      setRefused(null)
      setAsked(body.data?.says ?? 'Asked. Nothing is on either list until they say yes.')
      onAsked?.()
    } catch {
      setRefused({ as, says: 'Network error. Please try again.', askToLink: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {offered.map((as) => (
        <div key={as}>
          <button
            type="button"
            className="btn-secondary text-[13px]"
            disabled={busy}
            title={extendLine(row.name, as)}
            onClick={async () => {
              setBusy(true)
              setAsked(null)
              const r = await extendCompany(row.id, as)
              setBusy(false)
              if (r.ok) {
                setRefused(null)
                onDone(as, r.says)
              } else {
                setRefused({ as, says: r.says, askToLink: r.askToLink })
              }
            }}
          >
            {busy ? 'Extending…' : as === 'SUPPLIER' ? 'Extend to Supplier' : 'Extend to Customer'}
          </button>
          {withLines && <p className="mt-1 text-[12px] text-etyme-muted">{extendLine(row.name, as)}</p>}
          {refused?.as === as && (
            <div className="mt-1 max-w-xs space-y-1">
              <FormMessage tone="error">{refused.says}</FormMessage>
              <div className="flex flex-wrap items-center gap-2">
                {refused.askToLink && (
                  <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => askToLink(as)}>
                    Ask them to link
                  </button>
                )}
                <button type="button" className="text-[12px] text-etyme-muted underline" onClick={() => setRefused(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {asked && <div className="max-w-xs"><FormMessage tone="ok">{asked}</FormMessage></div>}
    </div>
  )
}

/** What a press of Extend left on its row: the route's sentence, and Undo while it can be taken back. */
interface Pressed {
  as: 'SUPPLIER' | 'CUSTOMER'
  says: string
  tone: 'ok' | 'error'
  /** Undo is offered until it is pressed. */
  undo: boolean
}

/**
 * The sentence an Extend left on its row, with Undo beside it (fix list of
 * 2026-11-14, E3: the only word was a toast that faded, and the only way
 * back was Remove inside the drawer). No confirm step: extending writes
 * one row and emails nobody. Undo calls the same DELETE the drawer's
 * Remove calls, so a position with work hanging off it is refused in the
 * route's own sentence and stays. Drawn only after this seat's own press,
 * which the same permission takes back.
 */
function AfterExtend({ row, pressed, onUndone, onClose }: {
  row: Pick<Company, 'id' | 'name'>
  pressed: Pressed
  onUndone: (next: Pressed) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  async function undo() {
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(row.id)}/extend?as=${pressed.as}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        onUndone({ ...pressed, tone: 'error', undo: false, says: refusalSentence(body.error?.message, { what: 'Undoing an extension' }) || 'That did not go through. Try again in a minute.' })
        return
      }
      onUndone({ ...pressed, tone: 'ok', undo: false, says: body.data?.message ?? 'Undone.' })
    } catch {
      onUndone({ ...pressed, tone: 'error', says: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="max-w-xs space-y-1" onClick={(e) => e.stopPropagation()} data-after-extend={row.id}>
      <FormMessage tone={pressed.tone}>{pressed.says}</FormMessage>
      <div className="flex flex-wrap items-center gap-2">
        {pressed.undo && (
          <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={undo}>
            {busy ? 'Undoing…' : 'Undo'}
          </button>
        )}
        <button type="button" className="text-[12px] text-etyme-muted underline" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/**
 * "Ask them to link", for a firm on Etyme you wrote down or sent a job to
 * that has not linked with you (record 61). The one act on its row: nothing
 * is on either list until they say yes.
 */
function AskToLink({ row, onAsked }: { row: Company; onAsked?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)
  async function ask() {
    setBusy(true)
    try {
      const res = await fetch('/api/trade-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: row.id, relationship: row.askAs ?? 'SUPPLIER' }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) { setSaid({ tone: 'error', says: refusalSentence(body.error?.message, { what: 'Asking a firm to link' }) || 'The ask could not be sent. Try again in a minute.' }); return }
      setSaid({ tone: 'ok', says: body.data?.says ?? 'Asked. Nothing is on either list until they say yes.' })
      onAsked?.()
    } catch {
      setSaid({ tone: 'error', says: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      {said?.tone !== 'ok' && (
        <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={ask}>
          {busy ? 'Asking…' : 'Ask them to link'}
        </button>
      )}
      {said && <div className="max-w-xs"><FormMessage tone={said.tone}>{said.says}</FormMessage></div>}
    </div>
  )
}

/**
 * The line under a company's name. Its address only where the address
 * opens a page; a client nobody has claimed is "Not on Etyme yet", never
 * an address that leads nowhere; anybody else, nothing.
 */
function addressLine(c: Pick<Company, 'slug' | 'onEtyme' | 'hasPage'>): string | null {
  if (c.hasPage) return `${c.slug}.etyme.com`
  if (!c.onEtyme) return 'Not on Etyme yet'
  return null
}

interface Location {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string
  isRemote: boolean
  isPrimary: boolean
}

type PositionFilter = 'ALL' | Position | 'NOT_CLASSIFIED' | 'WORKS_WITH_YOU' | 'NOT_LINKED'

// ── Kind chip mapping ─────────────────────────────────────

function kindTone(kind: Company['kind']): ChipTone {
  switch (kind) {
    case null: return 'passive'
    case 'VENDOR': return 'action'
    case 'CLIENT': return 'verified'
    case 'MSP': return 'attention'
    case 'GSI': return 'passive'
    case 'CONSULTANT_CORP': return 'passive'
    case 'UNCLASSIFIED': return 'passive'
  }
}

// ── Toast ─────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-slide-up">
      <div className="bg-etyme-ink text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {message}
        <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Add Company Modal ─────────────────────────────────────

function AddCompanyModal({ onClose, onCreated, onOpenExisting }: {
  onClose: () => void
  onCreated: (msg: string) => void
  /** Open a company already on this firm's list, by its id. */
  onOpenExisting: (companyId: string) => void
}) {
  const [form, setForm] = useState({
    name: '',
    // "Company — not classified yet" is the first choice and the default
    // (founder, 2026-11-12): a firm you know is recorded by its name, and
    // nothing has to be said about what it is to you until work starts.
    kind: 'UNCLASSIFIED' as Kind,
    // What they are to us. Asked only once a Kind is chosen; a company
    // not classified yet stores no relationship, never a supplier.
    relationship: 'SUPPLIER',
    entityType: '',
    domain: '',
    slug: '',
    // A client is written down through the clients door, with the person
    // there: while the client is not on Etyme, that person is who may
    // approve a week by email for it.
    contactName: '',
    email: '',
    // Send their contact a link to take the record. Off by default: the
    // record is the supplier's own until the client wants it.
    invite: false,
  })
  const recording = form.kind === 'UNCLASSIFIED'
  // A client a supplier writes down is a client, whatever the Kind box
  // said, and it is not given an Etyme address until somebody there joins.
  const isClient = !recording && form.relationship === 'CLIENT'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The same name on this firm's own list: said beside the name, with the
  // one already there to open (founder, 2026-11-12).
  const [twin, setTwin] = useState<{ id: string; says: string; field: 'name' | 'domain' } | null>(null)
  // A refusal about the domain is drawn at the Domain box, beside the
  // Etyme address box, so the next box to fill is the one in front of her
  // (walk, 2026-11-15).
  const [domainSays, setDomainSays] = useState<string | null>(null)
  // A firm already on Etyme: no copy, one click to ask them to link
  // (lib/trade-link, 2026-10-27). A company asked about as not classified
  // yet carries no relationship, so the person says which before asking.
  // The ask names the firm by what the person typed (name, domain,
  // address): the route found it and gives back no id of a firm the
  // caller does not work with (review, 2026-11-13).
  const [linkable, setLinkable] = useState<{ name: string; domain?: string; address?: string; relationship: string | null } | null>(null)
  const [linkAs, setLinkAs] = useState('SUPPLIER')

  // The Etyme address box is theirs, never guessed from the name: the
  // route uses it to find a firm already on Etyme (findFirm), and a guess
  // could name a stranger who happens to hold it (onboarding walk,
  // 2026-10-27).

  async function askToLink() {
    if (!linkable) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/trade-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: linkable.name, domain: linkable.domain, address: linkable.address, relationship: linkable.relationship ?? linkAs }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) { setError(body.error?.message ?? 'The ask could not be sent.'); setLinkable(null); return }
      onCreated(body.data?.says ?? 'Asked. Nothing is on either list until they say yes.')
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLinkable(null)
    setTwin(null)
    setDomainSays(null)
    setError(null)
    // Said here rather than by a greyed button or a browser bubble.
    if (form.name.trim().length < 2) {
      setError('Give the company’s name, at least two letters.')
      return
    }
    setSubmitting(true)

    try {
      const res = isClient
        ? await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              contactName: form.contactName.trim() || undefined,
              email: form.email.trim() || undefined,
              domain: form.domain.trim() || undefined,
              entityType: form.entityType.trim() || undefined,
              address: form.slug.trim() || undefined,
              invite: form.invite && form.email.trim() !== '',
            }),
          })
        : await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              kind: form.kind,
              // Nothing is sent for a company not classified yet.
              ...(recording ? {} : { relationship: form.relationship }),
              entityType: form.entityType.trim() || undefined,
              domain: form.domain.trim() || undefined,
              address: form.slug.trim() || undefined,
            }),
          })

      if (!res.ok) {
        // Parsed inside the failure branch, so an empty body threw
        // from the error handler itself and the message below never
        // ran.
        const body = await res.json().catch(() => ({}) as any)
        const e = body.error ?? {}
        if ((e.code === 'SAME_NAME_ON_YOUR_LIST' || e.code === 'SAME_DOMAIN_ON_YOUR_LIST') && e.companyId) {
          setTwin({ id: e.companyId, says: e.message, field: e.field === 'domain' ? 'domain' : 'name' })
          return
        }
        if (e.field === 'domain' && e.code !== 'ALREADY_ON_ETYME' && e.code !== 'ALREADY_HERE') {
          setDomainSays(refusalSentence(e.message, { what: 'Adding a company' }) || 'That domain could not be used.')
          return
        }
        setError(refusalSentence(body.error?.message, { what: 'Adding a company' }) || 'The company could not be added.')
        setLinkable(e.code === 'ALREADY_ON_ETYME' || e.code === 'ALREADY_HERE'
          ? {
              name: form.name.trim(),
              // A client form may have found the firm by its contact's email domain.
              domain: form.domain.trim() || (isClient && form.email.includes('@') ? form.email.trim().split('@')[1] : '') || undefined,
              address: form.slug.trim() || undefined,
              relationship: e.relationship ?? (recording ? null : form.relationship),
            }
          : null)
        return
      }

      const body = await res.json()
      if (isClient || recording) {
        onCreated(body.data?.message ?? `${form.name} is on your Companies list.`)
        onClose()
        return
      }
      const companyName = body.data?.company?.name ?? form.name
      // The route says what just happened — on your register, or a firm
      // of your own with you as its owner. Two different acts, and the
      // screen used to say "created successfully" for both.
      onCreated(body.data?.says ? `${companyName} — ${body.data.says}` : `${companyName} added`)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add company</h2>
          <button onClick={onClose} aria-label="Close" className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
            {linkable && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {linkable.relationship == null && (
                  <Select aria-label="Ask them to link as" value={linkAs} onChange={(e) => setLinkAs(e.target.value)} className="w-auto">
                    <option value="SUPPLIER">as your supplier</option>
                    <option value="CLIENT">as your customer</option>
                  </Select>
                )}
                <button type="button" className="btn-primary" disabled={submitting} onClick={askToLink}>Ask them to link</button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="add-company-name" className="block text-xs font-semibold text-etyme-muted mb-1">Company name *</label>
            <input
                id="add-company-name"
              type="text"
              required
              aria-required="true"
              aria-invalid={twin ? true : undefined}
              value={form.name}
              onChange={(e) => { setTwin(null); setForm({ ...form, name: e.target.value }) }}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Techpeple Inc."
            />
            {twin?.field === 'name' && (
              <p className="mt-1 text-[12px] text-etyme-attention">
                {twin.says}{' '}
                <button type="button" className="underline text-etyme-action" onClick={() => { onOpenExisting(twin.id); onClose() }}>
                  Open it
                </button>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!isClient && (
            <div>
              <label htmlFor="add-company-kind" className="block text-xs font-semibold text-etyme-muted mb-1">Kind *</label>
              <select
                id="add-company-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as Kind, relationship: relationshipForKind(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="UNCLASSIFIED">{NOT_CLASSIFIED_KIND_LABEL}</option>
                <option value="VENDOR">Vendor</option>
                <option value="CLIENT">Client</option>
                <option value="MSP">MSP</option>
                <option value="GSI">GSI</option>
                <option value="CONSULTANT_CORP">My own consulting corporation — one person</option>
              </select>
            </div>
            )}
            {!recording && (
            <div>
              <label htmlFor="add-company-relationship" className="block text-xs font-semibold text-etyme-muted mb-1">What are they to you? *</label>
              <select
                id="add-company-relationship"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="SUPPLIER">A supplier — we buy from them</option>
                <option value="CLIENT">A client — they buy from us</option>
                <option value="PRIME">A prime — our work flows through them</option>
                <option value="MSP">An MSP — they run the program we work in</option>
              </select>
            </div>
            )}
            {/* Kept on every door, a client's too (2026-11-15): never a box whose answer is thrown away. */}
            <div>
              <label htmlFor="add-company-entity-type" className="block text-xs font-semibold text-etyme-muted mb-1">Entity type</label>
              <input
                id="add-company-entity-type"
                type="text"
                value={form.entityType}
                onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="LLC, Corp, GmbH…"
              />
            </div>
          </div>

          {recording && (
            <p className="text-xs text-etyme-muted">
              Only the name is needed. Extend it to Supplier or Customer from its row when you start working together.
            </p>
          )}

          {isClient && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="add-company-contact" className="block text-xs font-semibold text-etyme-muted mb-1">Their contact</label>
                <input
                id="add-company-contact"
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                  placeholder="Dana Whitfield"
                />
              </div>
              <div>
                <label htmlFor="add-company-email" className="block text-xs font-semibold text-etyme-muted mb-1">Their email</label>
                <input
                id="add-company-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                  placeholder="dana@client.example"
                />
              </div>
              <p className="sm:col-span-2 text-xs text-etyme-muted">
                This is your own record of them until they join. The person you name here can approve
                your timesheets by email.
              </p>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-etyme-ink">
                <input
                  type="checkbox"
                  checked={form.invite}
                  disabled={form.email.trim() === ''}
                  onChange={(e) => setForm({ ...form, invite: e.target.checked })}
                />
                Invite them to Etyme
                {form.email.trim() === '' && <span className="text-xs text-etyme-faint">— give their email first</span>}
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="add-company-domain" className="block text-xs font-semibold text-etyme-muted mb-1">Domain</label>
              <input
                id="add-company-domain"
                type="text"
                value={form.domain}
                aria-invalid={domainSays || twin?.field === 'domain' ? true : undefined}
                onChange={(e) => { setDomainSays(null); if (twin?.field === 'domain') setTwin(null); setForm({ ...form, domain: e.target.value }) }}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="techpeple.example"
              />
              {domainSays && <p className="mt-1 text-[12px] text-etyme-attention">{domainSays}</p>}
              {twin?.field === 'domain' && (
                <p className="mt-1 text-[12px] text-etyme-attention">
                  {twin.says}{' '}
                  <button type="button" className="underline text-etyme-action" onClick={() => { onOpenExisting(twin.id); onClose() }}>
                    Open it
                  </button>
                </p>
              )}
            </div>
            <div>
              <label htmlFor="add-company-address" className="block text-xs font-semibold text-etyme-muted mb-1">Their Etyme address, if they have one</label>
              <div className="flex items-center">
                <input
                id="add-company-address"
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                             text-etyme-muted"
                  placeholder="techpeple"
                />
              </div>
              {form.slug ? (
                <p className="text-[10px] text-etyme-faint mt-1">{form.slug}.etyme.com</p>
              ) : (
                <p className="text-[11px] text-etyme-faint mt-1">The first part of the address their Etyme page opens at, before .etyme.com.</p>
              )}
            </div>
          </div>

          {/* Always, whatever is chosen above (founder, 2026-11-12). The
              invitation box above is the one thing that writes to anybody,
              and it is off until somebody ticks it. */}
          <p className="text-sm text-etyme-ink">
            {NEVER_EMAILS}
            {isClient && form.invite && ' The one exception is the invitation you ticked above. Untick it and nothing is sent.'}
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Saving…' : 'Add company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Company Detail Drawer ─────────────────────────────────

interface TrustSignals {
  medianTenureMonths: number | null
  benchPayHonouredRate: number | null
  medianReplacementDays: number | null
  avgRateGrowthPercent: number | null
  activeBenchSize: number | null
  disclosureRate: number | null
}

/**
 * The account manager on a client (2026-11-08): who sold the deal, read by
 * the award for the sales commission where the job names no owner here.
 * Drawn only for a firm that is a client on this firm's register; the
 * Owner, an Admin or an Account Manager names one, from the firm's own
 * people. Every save says what the route said.
 */
function AccountManagerPanel({ clientId }: { clientId: string }) {
  type Answer = {
    accountManager: { id: string; name: string } | null
    says: string
    mayName: boolean
    refusedSays?: string
    colleagues: { id: string; name: string }[]
    setBy?: string | null
    setAt?: string | null
  }
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [choice, setChoice] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)

  useEffect(() => {
    let gone = false
    fetch(`/api/counterparties?accountManagerFor=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (gone || !body?.data) return
        setAnswer(body.data)
        setChoice(body.data.accountManager?.id ?? '')
      })
      .catch(() => {})
    return () => { gone = true }
  }, [clientId])

  if (!answer) return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/counterparties', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountManagerFor: clientId, personId: choice || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'error', says: body?.error?.message ?? 'The account manager was not saved. Try again in a minute.' })
        return
      }
      setAnswer((a) => (a ? { ...a, accountManager: body.data.accountManager, says: body.data.says } : a))
      setMessage({ tone: 'ok', says: body.data.says })
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <p className="eyebrow mb-1">Account manager</p>
      {!answer.mayName ? (
        <>
          <p className="text-sm">{answer.accountManager?.name ?? 'Nobody named'}</p>
          {answer.refusedSays && <p className="text-[13px] text-etyme-muted mt-1">{answer.refusedSays}</p>}
        </>
      ) : (
        <form onSubmit={save} className="space-y-2">
          <Field label="Who sold this client">
            <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Nobody named</option>
              {answer.colleagues.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <SubmitButton pending={pending} pendingLabel="Saving…" disabled={choice === (answer.accountManager?.id ?? '')}>
            Save
          </SubmitButton>
          {message && <FormMessage tone={message.tone}>{message.says}</FormMessage>}
        </form>
      )}
      {!message && <p className="text-[13px] text-etyme-muted mt-1">{answer.says}</p>}
      {answer.setBy && answer.setAt && (
        <p className="text-[13px] text-etyme-faint mt-1">
          Named by {answer.setBy}, {dayOfMomentFor(new Date(answer.setAt), readerZone())}.
        </p>
      )}
    </div>
  )
}

interface DrawerRead {
  kind: Company['kind']
  positions: Position[]
  mine: boolean
  notClassified: boolean
  customerAgreement: 'SIGNED' | 'UNSIGNED' | 'NONE' | null
  history: { action: string; summary: string; reason: string; at: string; byName: string | null; position: string | null; reversible: boolean; undoSays: string | null }[]
  may: {
    /** Correct the name, the typed domain and the entity type (PATCH /api/companies/:id/record). */
    edit?: boolean
    extend: { SUPPLIER: boolean; CUSTOMER: boolean }
    remove: Partial<Record<'SUPPLIER' | 'CUSTOMER', { ok: boolean; says: string }>>
    setKind: boolean
    setKindSays: string | null
    kinds: string[]
  }
}

/**
 * Correct a company on your own list: its name, the domain you typed and
 * its entity type (2026-11-15). Drawn only where the route takes it, on a
 * record this firm made and nobody has claimed. The same twin rule as Add
 * a company is asked on save; a twin is linked with "Open it". Saving
 * emails nobody.
 */
function EditRecord({ company, onSaved }: { company: Company; onSaved: (says: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: company.name, domain: company.notedDomain ?? '', entityType: company.entityType ?? '' })
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (form.name.trim().length < 2) { setMessage({ tone: 'error', says: 'Give the company’s name, at least two letters.' }); return }
    setPending(true)
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(company.id)}/record`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, domain: form.domain, entityType: form.entityType }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) { setMessage({ tone: 'error', says: refusalSentence(body.error?.message, { what: 'Correcting a company' }) || 'The change was not saved. Try again.' }); return }
      const says = body.data?.message ?? 'Saved.'
      setMessage({ tone: 'ok', says })
      setOpen(false)
      await onSaved(says)
    } catch {
      setMessage({ tone: 'error', says: 'Network error. Please try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      {open ? (
        <form onSubmit={save} noValidate className="space-y-3">
          <p className="eyebrow">Edit</p>
          <Field label="Company name *"><Input required aria-required="true" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Domain"><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="northwind-staffing.example" /></Field>
          <Field label="Entity type"><Input value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} placeholder="LLC, Corp, GmbH…" /></Field>
          <p className="text-[12px] text-etyme-muted">The domain is your own note. It is never a claim on that domain. {NEVER_EMAILS}</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} pendingLabel="Saving…">Save</SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setMessage(null) }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-secondary text-[13px]" onClick={() => { setMessage(null); setOpen(true) }}>Edit</button>
      )}
      {message && <div className="mt-2"><FormMessage tone={message.tone}>{message.says}</FormMessage></div>}
    </div>
  )
}

/**
 * Where this company sits with the reader, its Kind, and what was done to
 * it here, read from GET /api/companies/:id/extend. Every button is one the
 * route takes; a removal it would refuse is said in its own sentence.
 */
function PositionsPanel({ company, onChanged, onClose }: { company: Company; onChanged: (says: string) => void; onClose: () => void }) {
  const [read, setRead] = useState<DrawerRead | null>(null)
  const [unread, setUnread] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)
  const [kindChoice, setKindChoice] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(company.id)}/extend`)
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) { setUnread(refusalSentence(body.error?.message) || 'Where this company sits with you could not be read.'); return }
      setRead(body.data)
      setUnread(null)
    } catch {
      setUnread('Network error. Close and open the company again.')
    }
  }, [company.id])
  useEffect(() => { void load() }, [load])

  async function act(init: { url: string; method: string; body?: unknown }) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(init.url, {
        method: init.method,
        headers: { 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        setMessage({ tone: 'error', says: refusalSentence(body.error?.message) || 'That did not go through. Try again in a minute.' })
        return
      }
      const says = body.data?.message ?? 'Done.'
      setMessage({ tone: 'ok', says })
      await load()
      onChanged(says)
    } catch {
      setMessage({ tone: 'error', says: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  // A refused drawer says the route's own sentence and leads straight back
  // to the list it was opened from (2026-11-15).
  if (unread) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-etyme-muted">{unread}</p>
        <a href="/dashboard/companies" className="text-sm text-etyme-action underline" onClick={(e) => { e.preventDefault(); onClose() }}>
          Back to Companies
        </a>
      </div>
    )
  }
  if (!read) return <LoadingState compact says="Opening where this company sits with you…" />

  const base = `/api/companies/${encodeURIComponent(company.id)}`
  const removable = (['CUSTOMER', 'SUPPLIER'] as const).filter((p) => read.positions.includes(p))
  const others = read.positions.filter((p) => p === 'PRIME' || p === 'MSP')

  return (
    <div className="space-y-6">
      {read.may.edit && <EditRecord company={company} onSaved={async (says) => { await load(); onChanged(says) }} />}
      <div>
        <p className="eyebrow mb-2">Positions</p>
        {read.notClassified && (
          <p className="text-sm text-etyme-ink mb-2">
            <Chip tone="attention">{NOT_CLASSIFIED}</Chip>{' '}
            On your Companies list, and not your supplier or your customer yet.
          </p>
        )}
        {read.positions.length === 0 && !read.notClassified && (
          <p className="text-sm text-etyme-muted mb-2">No position with you on your register.</p>
        )}
        <ul className="space-y-2">
          {removable.map((p) => {
            const r = read.may.remove[p]
            return (
              <li key={p} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-etyme-ink">
                    {POSITION_WORDS[p]}
                    {p === 'CUSTOMER' && read.customerAgreement === 'UNSIGNED' && <span className="text-etyme-muted"> · no agreement signed yet</span>}
                    {p === 'CUSTOMER' && read.customerAgreement === 'SIGNED' && <span className="text-etyme-muted"> · agreement signed</span>}
                    {p === 'CUSTOMER' && read.customerAgreement === 'NONE' && <span className="text-etyme-muted"> · no agreement on file</span>}
                  </span>
                  {r?.ok && (
                    <button type="button" className="btn-secondary text-[13px]" disabled={busy}
                      onClick={() => act({ url: `${base}/extend?as=${p}`, method: 'DELETE' })}>
                      Remove {POSITION_WORDS[p]}
                    </button>
                  )}
                </div>
                {r && !r.ok && <p className="mt-1 text-[12px] text-etyme-muted">{r.says}</p>}
              </li>
            )
          })}
          {others.map((p) => (
            <li key={p} className="bg-etyme-canvas rounded-lg px-3 py-2.5 text-sm text-etyme-ink">{POSITION_WORDS[p]}</li>
          ))}
        </ul>
        {(read.may.extend.SUPPLIER || read.may.extend.CUSTOMER) && (
          <div className="mt-3 space-y-3">
            {(['SUPPLIER', 'CUSTOMER'] as const).filter((as) => read.may.extend[as]).map((as) => (
              <div key={as}>
                <button type="button" className="btn-secondary text-[13px]" disabled={busy}
                  onClick={() => act({ url: `${base}/extend`, method: 'POST', body: { as } })}>
                  {as === 'SUPPLIER' ? 'Extend to Supplier' : 'Extend to Customer'}
                </button>
                <p className="mt-1 text-[12px] text-etyme-muted">{extendLine(company.name, as)}</p>
              </div>
            ))}
          </div>
        )}
        {message && <div className="mt-2"><FormMessage tone={message.tone}>{message.says}</FormMessage></div>}
        {/* Two facts set in two places (E3): said only where the Kind box below is offered. */}
        {read.may.setKind && <p className="mt-2 text-[12px] text-etyme-muted">{KIND_IS_SET_BELOW}</p>}
      </div>

      <div>
        <p className="eyebrow mb-2">Kind</p>
        <Chip tone={kindTone(read.kind)}>{kindOnList(read.kind)}</Chip>
        <p className="mt-1 text-[12px] text-etyme-muted">What kind of company it is. It never decides whether it is your supplier or your customer.</p>
        {read.may.setKind ? (
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!kindChoice) { setMessage({ tone: 'error', says: `Choose what kind of company ${company.name} is first.` }); return }
              void act({ url: `${base}/kind`, method: 'PATCH', body: { kind: kindChoice } })
            }}
          >
            <Field label="Change the kind">
              <Select value={kindChoice} onChange={(e) => setKindChoice(e.target.value)}>
                <option value="">Choose…</option>
                {read.may.kinds.map((k) => (
                  <option key={k} value={k}>{kindOnList(k as Company['kind'])}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton pending={busy} pendingLabel="Saving…">Change</SubmitButton>
          </form>
        ) : (
          read.mine && read.may.setKindSays && <p className="mt-1 text-[12px] text-etyme-muted">{read.may.setKindSays}</p>
        )}
      </div>

      <div>
        <p className="eyebrow mb-2">History</p>
        {read.history.length === 0 ? (
          <p className="text-sm text-etyme-muted">Nothing done to this company on your list yet.</p>
        ) : (
          <ul className="space-y-2">
            {read.history.map((h, i) => (
              <li key={`${h.at}:${i}`} className="text-[13px]">
                <p className="text-etyme-ink">{h.summary}</p>
                <p className="text-[12px] text-etyme-faint">
                  {/* Whether it can be taken back is read now by the route (`historyUndoSays`), never the flag stored when it was written. */}
                  {[h.byName, dayOfMomentFor(new Date(h.at), readerZone()), h.undoSays].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * The people this firm knows at one company, and Add a contact. A row in
 * this firm's own address book: saving one sends nothing to anybody.
 */
function CompanyContacts({ company }: { company: Company }) {
  const [people, setPeople] = useState<{ id: string; name: string; email: string | null; phone: string | null; title: string | null }[] | null>(null)
  const [unread, setUnread] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '' })
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; says: string } | null>(null)
  // The same name here with no email or phone in common: asked, with one press that saves anyway.
  const [namesake, setNamesake] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contacts?at=${encodeURIComponent(company.id)}`)
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) { setUnread(refusalSentence(body.error?.message) || 'The contacts here could not be read.'); return }
      setPeople(body.data?.contacts ?? [])
    } catch {
      setUnread('Network error. Close and open the company again.')
    }
  }, [company.id])
  useEffect(() => { void load() }, [load])

  async function save(e: React.FormEvent, addAnyway = false) {
    e.preventDefault()
    setMessage(null)
    setNamesake(false)
    if (form.name.trim().length < 2) { setMessage({ tone: 'error', says: 'A name, so somebody knows who they are calling.' }); return }
    if (!form.email.trim() && !form.phone.trim()) { setMessage({ tone: 'error', says: NO_WAY_TO_REACH }); return }
    setPending(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, atCompanyId: company.id, kind: 'OTHER', ...(addAnyway ? { addAnyway: true } : {}) }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        setMessage({ tone: 'error', says: refusalSentence(body.error?.message) || 'The contact was not saved. Try again.' })
        if (body.error?.code === 'SAME_NAME') setNamesake(true)
        return
      }
      setMessage({ tone: 'ok', says: `${form.name.trim()} is saved under Contacts. Nothing was sent to them.` })
      setForm({ name: '', email: '', phone: '', title: '' })
      setAdding(false)
      await load()
    } catch {
      setMessage({ tone: 'error', says: 'Network error. Please try again.' })
    } finally {
      setPending(false)
    }
  }

  if (unread) return <p className="text-sm text-etyme-muted">{unread}</p>
  if (!people) return <LoadingState compact says="Opening contacts…" />
  return (
    <div>
      <p className="eyebrow mb-2">Contacts <span className="text-etyme-faint">({people.length})</span></p>
      {people.length === 0 && !adding && <p className="text-sm text-etyme-muted">Nobody here on your contacts yet.</p>}
      <ul className="space-y-1.5">
        {people.map((p) => (
          <li key={p.id} className="text-[13px]">
            <span className="text-etyme-ink">{p.name}</span>
            <span className="text-etyme-faint">{[p.title, p.email, p.phone].filter(Boolean).length > 0 ? ` · ${[p.title, p.email, p.phone].filter(Boolean).join(' · ')}` : ''}</span>
          </li>
        ))}
      </ul>
      {adding ? (
        <form onSubmit={save} noValidate className="mt-3 space-y-3">
          <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dana Whitfield" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <p className="text-[12px] text-etyme-muted">An email address or a phone number. Either one is enough. Saving a contact sends them nothing.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} pendingLabel="Saving…">Save contact</SubmitButton>
            {/* Cancel clears what was typed, so the next try never carries a stale email (press of 2026-11-15). */}
            <button type="button" className="btn-secondary" onClick={() => { setAdding(false); setForm({ name: '', email: '', phone: '', title: '' }); setNamesake(false); setMessage(null) }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-secondary text-[13px] mt-3" onClick={() => { setMessage(null); setAdding(true) }}>Add a contact</button>
      )}
      {message && <div className="mt-2"><FormMessage tone={message.tone}>{message.says}</FormMessage></div>}
      {namesake && adding && (
        <button type="button" className="btn-secondary text-[13px] mt-2" disabled={pending} onClick={(e) => save(e, true)}>{ADD_ANYWAY}</button>
      )}
    </div>
  )
}

function CompanyDrawer({ company, onClose, onChanged, onAsked }: { company: Company; onClose: () => void; onChanged: (says: string) => void; onAsked?: () => void }) {
  // Escape closes the drawer, as it closes every dialog (walk, 2026-11-15).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [trustSignals, setTrustSignals] = useState<TrustSignals | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (company.notLinked) { setLoadingLocations(false); return }
      setLoadingLocations(true)
      try {
        // Fetch locations (all companies) + trust signals (vendors only) in parallel
        const fetches: Promise<Response | null>[] = [
          fetch(`/api/companies/${company.id}/locations`).catch(() => null),
        ]

        // Trust signals only apply to vendor companies (Addendum D §D.3.3)
        if (company.kind === 'VENDOR') {
          fetches.push(
            fetch(`/api/vendors/${company.id}/trust-signals`).catch(() => null)
          )
        }

        const [locRes, trustRes] = await Promise.all(fetches)

        if (locRes?.ok) {
          const body = await locRes.json()
          setLocations(body.data?.locations ?? [])
        }

        if (trustRes?.ok) {
          const body = await trustRes.json()
          if (body.data?.signals) {
            setTrustSignals(body.data.signals)
          }
        }
      } catch {
        // Silently fail — supplementary data
      } finally {
        setLoadingLocations(false)
      }
    }
    fetchData()
  }, [company.id, company.kind, company.notLinked])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{company.name}</h2>
            {addressLine(company) && <p className="text-[13px] text-etyme-muted mt-0.5">{addressLine(company)}</p>}
          </div>
          <button onClick={onClose} aria-label={`Close ${company.name}`} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Two facts, never one: where it sits with you, and what it is. */}
          {company.notLinked ? (
            <div className="space-y-2">
              <p className="text-sm text-etyme-ink">
                {company.name} is on Etyme and has not linked with you. What it says about itself stays with it until it says yes.
              </p>
              <AskToLink row={company} onAsked={onAsked} />
            </div>
          ) : (
            <PositionsPanel company={company} onChanged={onChanged} onClose={onClose} />
          )}

          {/* Asked only of a customer: the route answers for a client on the register and nothing else. */}
          {!company.notLinked && company.positions.includes('CUSTOMER') && <AccountManagerPanel clientId={company.id} />}

          <CompanyContacts company={company} />

          {/* Details grid: none for a firm that has not linked with you. */}
          {!company.notLinked && (<>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="eyebrow mb-1">Domain</p>
              <p className="text-sm break-words">{domainCell(company).domain ?? domainCell(company).note}</p>
              {!company.domain && company.notedDomain && (
                <p className="text-xs text-etyme-muted mt-1">
                  {company.notedFrom === 'INVITATION' ? 'As you typed it on the invitation you sent. Nobody has checked it.' : 'As you typed it. Nobody has checked it.'}
                </p>
              )}
              {company.domain && (
                <span className={`chip mt-1 ${company.domainVerified ? 'chip--verified' : 'chip--attention'}`}>
                  {company.domainVerified ? 'Verified' : 'Unverified'}
                </span>
              )}
            </div>
            <div>
              <p className="eyebrow mb-1">Entity type</p>
              <p className="text-sm">{company.entityType ?? 'Not specified'}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Currency</p>
              <p className="text-sm">{company.currency}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Site live</p>
              <p className="text-sm">
                {company.siteLiveAt ? (
                  <span className="flex items-center gap-1.5">
                    <span className="evidence-dot" />
                    <span className="text-etyme-verified font-medium">Live</span>
                  </span>
                ) : (
                  <span className="text-etyme-faint">Pending</span>
                )}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1">Network verified</p>
              <p className="text-sm">
                {company.networkVerifiedAt ? (
                  <span className="flex items-center gap-1.5">
                    <span className="evidence-dot" />
                    <span className="text-etyme-verified font-medium">Yes</span>
                  </span>
                ) : (
                  <span className="text-etyme-faint">Not yet</span>
                )}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1">Created</p>
              <p className="text-sm tabular-nums">
                {company.createdAt ? dayOfMomentFor(new Date(company.createdAt), readerZone()) : 'Not shown until they link'}
              </p>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-etyme-rule" />

          {/* Locations */}
          <div>
            <p className="eyebrow mb-2">
              Locations
              {!loadingLocations && <span className="text-etyme-faint"> ({locations.length})</span>}
            </p>
            {loadingLocations ? (
              <LoadingState compact says="Opening locations…" />
            ) : locations.length === 0 ? (
              <p className="text-sm text-etyme-muted">No locations added</p>
            ) : (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <div key={loc.id} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-etyme-ink">
                        {loc.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {loc.isPrimary && (
                          <Chip tone="verified">Primary</Chip>
                        )}
                        {loc.isRemote && (
                          <Chip tone="action">Remote</Chip>
                        )}
                      </div>
                    </div>
                    {(loc.city || loc.state || loc.country) && (
                      <p className="text-[11px] text-etyme-muted mt-1">
                        {[loc.city, loc.state, loc.country].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {loc.address && (
                      <p className="text-[11px] text-etyme-faint mt-0.5">{loc.address}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </>)}

          {/* Trust Signals — Addendum D §D.3.3 (vendor companies only) */}
          {trustSignals && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-3">Trust signals</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {trustSignals.medianTenureMonths != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Median tenure</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.medianTenureMonths}<span className="text-sm text-etyme-muted ml-0.5">mo</span></p>
                    </div>
                  )}
                  {trustSignals.benchPayHonouredRate != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Bench pay</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.benchPayHonouredRate}<span className="text-sm text-etyme-muted ml-0.5">%</span></p>
                    </div>
                  )}
                  {trustSignals.medianReplacementDays != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Re-placement</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.medianReplacementDays}<span className="text-sm text-etyme-muted ml-0.5">days</span></p>
                    </div>
                  )}
                  {trustSignals.avgRateGrowthPercent != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Rate growth</p>
                      <p className={`text-lg font-serif tabular-nums ${
                        trustSignals.avgRateGrowthPercent > 0 ? 'text-etyme-verified' :
                        trustSignals.avgRateGrowthPercent < 0 ? 'text-etyme-attention' :
                        ''
                      }`}>
                        {trustSignals.avgRateGrowthPercent > 0 ? '+' : ''}
                        {trustSignals.avgRateGrowthPercent}%
                      </p>
                    </div>
                  )}
                  {trustSignals.activeBenchSize != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Bench size</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.activeBenchSize}</p>
                    </div>
                  )}
                  {trustSignals.disclosureRate != null && (
                    <div className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Disclosure</p>
                      <p className="text-lg font-serif tabular-nums">{trustSignals.disclosureRate}<span className="text-sm text-etyme-muted ml-0.5">%</span></p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-etyme-faint mt-2 italic">
                  Addendum D §D.3.3: Trust signals replace disclosure as the measure of vendor quality.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

/**
 * The tiles over the list, each keyed by the filter its chip sets, so a
 * tile and its chip are one filter. Drawn only above zero where the chip is.
 */
function companyTilesShown(t: ReturnType<typeof companyTiles>): { key: PositionFilter; label: string; count: number; sub: string }[] {
  return [
    { key: 'ALL' as const, label: 'Total', count: t.total, sub: 'on your list' },
    { key: 'CUSTOMER' as const, label: 'Customers', count: t.customers, sub: 'above you' },
    { key: 'SUPPLIER' as const, label: 'Suppliers', count: t.suppliers, sub: 'below you' },
    ...(t.primes > 0 ? [{ key: 'PRIME' as const, label: 'Primes', count: t.primes, sub: 'your work flows through them' }] : []),
    ...(t.msps > 0 ? [{ key: 'MSP' as const, label: 'MSPs', count: t.msps, sub: 'run a program you work in' }] : []),
    { key: 'NOT_CLASSIFIED' as const, label: 'Not classified', count: t.notClassified, sub: 'no position yet' },
    ...(t.worksWithYou > 0 ? [{ key: 'WORKS_WITH_YOU' as const, label: 'Works with you', count: t.worksWithYou, sub: 'through work, no position yet' }] : []),
    ...(t.notLinked > 0 ? [{ key: 'NOT_LINKED' as const, label: NO_POSITION_WORDS.NOT_LINKED, count: t.notLinked, sub: 'on Etyme, not linked with you' }] : []),
  ]
}

/** What the list says when the chosen filter holds nobody, while the firm has companies. */
function emptyUnder(filter: PositionFilter, word: string, total: number): string {
  if (filter === 'ALL' || total === 0) return 'No companies yet.'
  return `None of your companies is under ${word}. Press All to see every company on your list.`
}

export default function CompaniesPage() {
  const section = usePageSection('/dashboard/companies')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [companies, setCompanies] = useState<Company[]>([])
  /** What this list is, in the route's own words. See lib/directory-scope. */
  const [scope, setScope] = useState<{ says: string; title: string; subtitle: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL')
  const [toast, setToast] = useState<string | null>(null)
  // A refusal is the page: its sentence alone, with no tiles or chips
  // around it (sign-up walk, round five, problem 10). And nothing is
  // counted before the first read answers.
  const [refused, setRefused] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)

  // Open the add modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAdd(true)
      router.replace('/dashboard/companies', { scroll: false })
    }
  }, [searchParams, router])

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ?records=1: the companies this firm recorded and has not
      // classified are on this list, and on no picker that reads the
      // route without it (founder, 2026-11-12).
      const res = await fetch('/api/companies?records=1')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(refusalSentence(body.error?.message) || 'Companies is not part of your seat. Ask your company’s owner if you need it.')
        setCompanies([])
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setCompanies(body.data?.companies ?? [])
      // What this list is, said by the route that scoped it, so the
      // heading and the rows cannot describe different things.
      setScope(body.data?.scope ?? null)
    } catch (err: any) {
      setError(refusalSentence(err.message))
      setCompanies([])
    } finally {
      setLoading(false)
      setAnswered(true)
    }
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  // The open drawer reads the row the list now holds, so a correction
  // shows in the drawer the moment it is saved (walk, 2026-11-15: it kept
  // the old name under "is corrected").
  useEffect(() => {
    setSelected((prev) => (prev ? companies.find((c) => c.id === prev.id) ?? prev : prev))
  }, [companies])

  // ?open=<company id> opens that company's drawer, for a company on the
  // reader's own list only; any other id opens nothing and says nothing, so
  // the address never tells a stranger's id from one that does not exist
  // (a refusal elsewhere links here, 2026-11-15). Read once the list is in.
  const openId = searchParams.get('open')
  useEffect(() => {
    if (!answered || !openId) return
    const c = companies.find((x) => x.id === openId)
    if (c) setSelected(c)
    router.replace('/dashboard/companies', { scroll: false })
  }, [answered, openId, companies, router])

  // Bumped after an ask to link is sent, so "Asked, waiting on them" shows at once.
  const [asksRead, setAsksRead] = useState(0)
  const askSent = useCallback(() => setAsksRead((n) => n + 1), [])

  // ── Filtered by position, never by Kind ───────────
  //
  // Founder, 2026-11-12: a company is a Customer or a Supplier because of
  // the relationship with it, whatever kind of company it is. So a Vendor
  // extended to Customer counts under Customers, and a company of any
  // Kind extended to Supplier counts under Suppliers.
  const tileRow = (c: Company) => ({ positions: c.positions, notClassified: c.notClassified, notLinked: c.notLinked === true })
  const holds = (c: Company, f: PositionFilter) =>
    f === 'ALL' ? true
      : f === 'NOT_CLASSIFIED' || f === 'WORKS_WITH_YOU' || f === 'NOT_LINKED' ? noPositionTile(tileRow(c)) === f
      : c.positions.includes(f)
  // What a press of Extend left on each row, kept on the row after the
  // list is read again (the buttons go once the position is held). A row
  // carrying one stays on a filtered list until its sentence is closed,
  // so the sentence and its Undo never leave with the row.
  const [pressed, setPressed] = useState<Record<string, Pressed>>({})
  const underFilter = useMemo(
    () => rowsUnderFilter(companies, (c) => holds(c, positionFilter), new Set(Object.keys(pressed))),
    [companies, positionFilter, pressed],
  )
  const filtered = underFilter.rows
  // A new filter is a new question: the sentences of the old one close.
  const chooseFilter = (f: PositionFilter) => { setPressed({}); setPositionFilter(f) }

  // ── Stats, by position ────────────────────────────
  // Every row on the list is in a tile (2026-11-15): Customers, Suppliers,
  // Not classified, and, drawn only above zero, Primes, MSPs, "Works with
  // you" (on the list through work, holding no position) and "Not linked
  // yet". One reader counts them all (`companyTiles` in lib/counterparty).
  const tiles = companyTiles(companies.map(tileRow))
  const customerCount = tiles.customers
  const supplierCount = tiles.suppliers
  const primeCount = tiles.primes
  const mspCount = tiles.msps
  const notClassifiedCount = tiles.notClassified

  function afterExtend(id: string) {
    return (as: 'SUPPLIER' | 'CUSTOMER', says: string) => {
      setPressed((p) => ({ ...p, [id]: { as, says, tone: 'ok', undo: true } }))
      void fetchCompanies()
    }
  }
  function afterUndo(id: string) {
    return (next: Pressed) => {
      setPressed((p) => ({ ...p, [id]: next }))
      if (next.tone === 'ok') void fetchCompanies()
    }
  }
  const closePressed = (id: string) => () => setPressed((p) => { const { [id]: _gone, ...rest } = p; return rest })
  const rowActs = (row: Company) => (
    <div className="flex flex-col gap-2">
      {pressed[row.id] && <AfterExtend row={row} pressed={pressed[row.id]} onUndone={afterUndo(row.id)} onClose={closePressed(row.id)} />}
      <ExtendButtons row={row} onDone={afterExtend(row.id)} onAsked={askSent} />
    </div>
  )

  // ── Column definitions ────────────────────────────
  const columns: Column<Company>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.name}</p>
          {addressLine(row) && <p className="text-[11px] text-etyme-faint">{addressLine(row)}</p>}
        </div>
      ),
      sortValue: (row) => row.name,
      width: 'min-w-[200px]',
    },
    {
      // The identifier (founder, 2026-11-15: "The email is the identifier"),
      // so it stands beside the name. A domain this firm typed says so.
      key: 'domain',
      label: 'Domain',
      render: (row) => {
        const d = domainCell(row)
        return d.domain ? (
          <span className="text-sm text-etyme-ink">
            {d.domain}
            {d.note && <span className="ml-1 text-[11px] text-etyme-faint">· {d.note}</span>}
          </span>
        ) : (
          <span className="text-etyme-faint text-[12px]">{d.note}</span>
        )
      },
      sortValue: (row) => domainCell(row).domain ?? '',
      exportValue: (row) => domainCell(row).domain ?? domainCell(row).note ?? '',
    },
    {
      key: 'slug',
      // The reader's word for it is the address they signed up with
      // (sign-up walk, round five, problem 19), never the system's.
      label: 'Etyme address',
      // A firm nobody there has joined reads "Not on Etyme", never a dash.
      render: (row) => {
        const a = addressCell(row)
        return a.slug
          ? <span className="text-etyme-muted text-[12px] font-mono">{a.slug}</span>
          : <span className="text-etyme-faint text-[12px]">{a.note}</span>
      },
      sortValue: (row) => addressCell(row).slug ?? addressCell(row).note ?? '',
      exportValue: (row) => addressCell(row).slug ?? addressCell(row).note ?? '',
      hideOnMobile: true,
    },
    {
      key: 'positions',
      label: 'To you',
      render: (row) => <PositionChips row={row} />,
      sortValue: (row) => toYouWords(row).join(' '),
      exportValue: (row) => toYouWords(row).join(', '),
    },
    {
      key: 'kind',
      label: 'Kind',
      render: (row) => (
        <Chip tone={kindTone(row.kind)}>{kindOnList(row.kind)}</Chip>
      ),
      sortValue: (row) => kindOnList(row.kind),
      exportValue: (row) => kindOnList(row.kind),
    },
    {
      key: 'entityType',
      label: 'Entity type',
      render: (row) => (
        <span className="text-etyme-muted">{row.entityType ?? (row.notLinked ? 'Not shown' : 'Not given')}</span>
      ),
      sortValue: (row) => row.entityType ?? '',
      hideOnMobile: true,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => (
        <span className="text-[12px] tabular-nums text-etyme-muted">
          {row.createdAt ? dayOfMomentFor(new Date(row.createdAt), readerZone()) : 'Not shown'}
        </span>
      ),
      sortValue: (row) => (row.createdAt ? new Date(row.createdAt).getTime() : 0),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (row.notLinked ? <AskToLink row={row} onAsked={askSent} /> : rowActs(row)),
      exportValue: () => null,
    },
  ]

  // ── Search filter ─────────────────────────────────
  const searchFilter = (row: Company, q: string) =>
    row.name.toLowerCase().includes(q) ||
    row.slug.toLowerCase().includes(q) ||
    (domainCell(row).domain ?? '').toLowerCase().includes(q) ||
    (row.entityType ?? '').toLowerCase().includes(q) ||
    kindOnList(row.kind).toLowerCase().includes(q) ||
    toYouWords(row).some((w) => w.toLowerCase().includes(q))

  // ── Filter tabs ───────────────────────────────────
  const filterTabs: { key: PositionFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: companies.length },
    // Where each sits with you, read off your register, never its Kind.
    { key: 'CUSTOMER', label: 'Customers', count: customerCount },
    { key: 'SUPPLIER', label: 'Suppliers', count: supplierCount },
    // A filter with nothing behind it is not offered.
    ...(primeCount > 0 ? [{ key: 'PRIME' as const, label: 'Primes', count: primeCount }] : []),
    ...(mspCount > 0 ? [{ key: 'MSP' as const, label: 'MSPs', count: mspCount }] : []),
    { key: 'NOT_CLASSIFIED', label: NOT_CLASSIFIED, count: notClassifiedCount },
    ...(tiles.worksWithYou > 0 ? [{ key: 'WORKS_WITH_YOU' as const, label: 'Works with you', count: tiles.worksWithYou }] : []),
    ...(tiles.notLinked > 0 ? [{ key: 'NOT_LINKED' as const, label: NO_POSITION_WORDS.NOT_LINKED, count: tiles.notLinked }] : []),
  ]
  const filterWord = filterTabs.find((t) => t.key === positionFilter)?.label ?? ''

  function handleCreated(msg: string) {
    setToast(msg)
    fetchCompanies()
    askSent()
  }

  if (refused) return <RefusedState says={refused} />
  if (!answered) return <LoadingState says="Opening companies…" />

  return (
    <>
      {/* Not "companies on the platform". This list is the firms this
          company trades with, and it said otherwise to a one-person
          nursing corporation. */}
      <PageHead
        eyebrow={section}
        title={scope?.title ?? 'Companies'}
        subtitle={scope?.subtitle ?? 'The firms you have dealings with.'}
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            Add company
          </button>
        }
      />

      <LinkAsks onAnswered={handleCreated} reread={asksRead} />

      {/* Stats row, by position: what each is to you, never its Kind. */}
      <div className={`${tiles.countedTwice > 0 ? 'mb-2' : 'mb-6'} grid grid-cols-2 gap-3 lg:grid-cols-4`}>
        {/* Each tile filters the list as its chip does: one filter, two doors (walk, 2026-11-15). */}
        {companyTilesShown(tiles).map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={positionFilter === t.key}
            onClick={() => chooseFilter(t.key)}
            className={`rounded-panel text-left transition-shadow hover:shadow-lift ${positionFilter === t.key ? 'ring-2 ring-etyme-ink' : ''}`}
          >
            <Stat label={t.label} value={t.count} sub={t.sub} />
          </button>
        ))}
      </div>
      {tiles.countedTwice > 0 && <p className="mb-6 text-[12px] text-etyme-muted">{countedTwiceSays(tiles.countedTwice)}</p>}

      {/* Data table with kind filter tabs */}
      <ListSurface<Company>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by name, Etyme address, or domain…"
        emptyMessage={emptyUnder(positionFilter, filterWord, companies.length)}
        emptyDetail={positionFilter === 'ALL' || companies.length === 0 ? 'A firm appears here once you trade with it, or once you add it with Add company. Saving a company never emails them.' : undefined}
        onRowClick={(row) => setSelected(row)}
        card={(row) => (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-etyme-ink break-words">{row.name}</p>
                {addressLine(row) && <p className="text-[12px] text-etyme-faint">{addressLine(row)}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <PositionChips row={row} />
                {row.kind && <Chip tone={kindTone(row.kind)}>{kindOnList(row.kind)}</Chip>}
              </div>
            </div>
            <p className="mt-1 text-[12px] text-etyme-muted">{domainCell(row).domain ? `${domainCell(row).domain}${domainCell(row).note ? ` · ${domainCell(row).note}` : ''}` : domainCell(row).note}</p>
            {row.notLinked && <div className="mt-3"><AskToLink row={row} onAsked={askSent} /></div>}
            {!row.notLinked && pressed[row.id] && (
              <div className="mt-3">
                <AfterExtend row={row} pressed={pressed[row.id]} onUndone={afterUndo(row.id)} onClose={closePressed(row.id)} />
              </div>
            )}
            {(row.may.extendToSupplier || row.may.extendToCustomer) && (
              <div className="mt-3">
                <ExtendButtons row={row} onDone={afterExtend(row.id)} onAsked={askSent} />
                <p className="mt-1 text-[12px] text-etyme-muted">Extending does not email them and does not change what kind of company they are.</p>
              </div>
            )}
          </div>
        )}
        exportName="companies"
        phoneView="feed"
        defaultPageSize={20}
        filters={
          <FilterChips label="What they are to you" options={filterTabs} value={positionFilter} onChange={chooseFilter} />
        }
      />

      {/* Footer count */}
      {!loading && underFilter.matching > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {underFilter.matching} compan{underFilter.matching !== 1 ? 'ies' : 'y'}
          {positionFilter !== 'ALL' && ` (${filterWord.toLowerCase()})`}
        </p>
      )}

      {/* Modals */}
      {showAdd && (
        <AddCompanyModal
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
          onOpenExisting={(id) => { const c = companies.find((x) => x.id === id); if (c) setSelected(c) }}
        />
      )}
      {selected && <CompanyDrawer company={selected} onClose={() => setSelected(null)} onChanged={(says) => { setToast(says); void fetchCompanies() }} onAsked={askSent} />}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  )
}

// ── Asks to link, from firms already on Etyme ─────────────

/**
 * The asks other firms on Etyme made of this one (lib/trade-link,
 * 2026-10-27): who, as what in this firm's own words, Yes or Not now.
 * Nothing is on either list until the yes. Draws nothing where there is
 * no open ask.
 */
function LinkAsks({ onAnswered, reread = 0 }: { onAnswered: (msg: string) => void; reread?: number }) {
  const [asks, setAsks] = useState<{ id: string; says: string }[]>([])
  // The asks this firm made that are still open: their sentence only, no buttons (walk, 2026-11-15).
  const [waiting, setWaiting] = useState<{ id: string; says: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const body = await fetch('/api/trade-links').then((r) => r.json()).catch(() => null)
    setAsks(Array.isArray(body?.data?.received) ? body.data.received : [])
    setWaiting(waitingAsks(body?.data?.made))
  }, [])
  useEffect(() => { void load() }, [load, reread])
  async function answer(id: string, action: 'accept' | 'not-now') {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/trade-links/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) { setError(body.error?.message ?? 'That answer did not go through.'); return }
      onAnswered(body.data?.says ?? 'Answered.')
      await load()
    } finally {
      setBusy(false)
    }
  }
  if (asks.length === 0 && waiting.length === 0) return null
  return (
    <div className="panel p-5 mb-6">
      {asks.length > 0 && <h2 className="font-serif text-[17px] text-etyme-ink">Asks to link</h2>}
      {error && <p className="mt-2 text-sm text-etyme-danger">{error}</p>}
      {asks.length > 0 && <ul className="mt-3 space-y-2">
        {asks.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px] text-etyme-ink">
            <span>{a.says}</span>
            <span className="flex gap-2">
              <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => answer(a.id, 'accept')}>Yes, link</button>
              <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => answer(a.id, 'not-now')}>Not now</button>
            </span>
          </li>
        ))}
      </ul>}
      {waiting.length > 0 && (
        <>
          <h2 className={`font-serif text-[17px] text-etyme-ink ${asks.length > 0 ? 'mt-5' : ''}`}>Asked, waiting on them</h2>
          <ul className="mt-3 space-y-2">
            {waiting.map((w) => <li key={w.id} className="text-[14px] text-etyme-ink">{w.says}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}

/** The asks this firm made that nobody has answered, as the route words them. Nothing else of the other firm is kept. */
function waitingAsks(made: unknown): { id: string; says: string }[] {
  if (!Array.isArray(made)) return []
  return made.filter((m: any) => m?.state === 'WAITING' && typeof m.says === 'string').map((m: any) => ({ id: String(m.id), says: m.says }))
}
