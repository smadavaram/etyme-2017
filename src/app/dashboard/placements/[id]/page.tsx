'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'

/**
 * One placement, top to bottom.
 *
 * The screen the demo did not have. There were sixty lists and four
 * things you could open, so a vendor could be shown sets of records and
 * could not follow one person through their working life — where they
 * came from, who sent them on, who met them, what was agreed on both
 * sides, whether they are cleared, whether they filed, whether we were
 * paid, and what we made.
 *
 * Every one of those facts already existed. None was reachable from the
 * others, and a product whose parts do not connect reads as a database
 * with a menu.
 *
 * ── Why it is shaped as a thread ─────────────────────────────────────
 *
 * CLAUDE.md distinguishes decision surfaces from working surfaces. A
 * list of two hundred timesheets is a working surface: dense, sortable,
 * fast. One placement is the other kind — three to ten things, read in
 * order, with prose and space. So this is a single column of stations in
 * the order they actually happen, and the eye can run down it.
 *
 * The station that matters most is the chain, because it is the one no
 * applicant tracking system can draw: a person reaching a client through
 * two firms, one week of hours, and a margin at each hop that neither
 * hop can see.
 */

interface Placement {
  id: string
  person: { id: string; name: string; skills: string[]; location: string | null; workAuth: string | null }
  supplier: { id: string; name: string }
  client: { id: string; name: string }
  endClient: { id: string; name: string } | null
  hiringManager: { id: string; name: string } | null
  state: string
  startDate: string | null
  endDate: string | null
  paymentTerms: number | null
  currency: string
  viewer: { isSupplier: boolean; seeBill: boolean; seePay: boolean; seeMargin: boolean }
  origin: {
    id: string; title: string; skills: string[]; location: string | null
    raisedBy: { id: string; name: string }; neededBy: string | null; approvalState: string
  } | null
  invitation: { status: string; payMin: number | null; payMax: number | null; message: string | null } | null
  submission: {
    id: string; status: string; rate: number | null
    submittedAt: string | null; forwardedAt: string | null
    from: { id: string; name: string }; to: { id: string; name: string } | null
    checkState: string
    sentOnBy: { company: { id: string; name: string }; at: string | null; rate: number | null } | null
  } | null
  interviews: Array<{
    id: string; round: number; stage: string; mode: string; state: string
    scheduledAt: string | null; decidedAt: string | null; feedback: string | null
  }>
  contracts: {
    sell: { id: string; billRate: number | null; state: string; purchaseOrder: { number: string; amount: number; currency: string } | null }
    buy: { id: string; contractType: string; state: string; vendor: { id: string; name: string } | null; payRate: number | null } | null
  }
  chain: { hopsBelow: number; weEmployThem: boolean }
  compliance: {
    person: Array<{ type: string; status: string; provider: string | null; expiresAt: string | null }>
    supplierCover: Array<{ type: string; status: string; expiresAt: string | null }>
  }
  timesheets: Array<{
    id: string; periodStart: string; periodEnd: string; hours: number; status: string
    clientApproved: { hours: number; at: string } | null
    employerAccepted: { hours: number; at: string } | null
    billedByUs: boolean
  }>
  money: {
    hoursAccepted: number
    invoices: Array<{ id: string; number: string; status: string; hours: number; weeks: number; amount: number | null; total: number; paid: number; dueAt: string }>
    billed: number | null; collected: number | null
    revenue: number | null; cost: number | null; margin: number | null
  }
}

const rate = (n: number | null) => (n == null ? '—' : `$${n.toFixed(0)}/hr`)
const cash = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** A word for a state, in the tone it deserves. */
function tone(status: string): string {
  const s = status.toUpperCase()
  if (['CLEAR', 'APPROVED', 'IN_PROGRESS', 'PLACED', 'ACCEPTED', 'PAID', 'DONE'].includes(s)) return 'chip--verified'
  if (['FLAGGED', 'FAILED', 'EXPIRED', 'REJECTED', 'BLOCKED', 'OVERDUE'].includes(s)) return 'chip--danger'
  if (['PENDING', 'IN_REVIEW', 'SUBMITTED', 'DRAFT', 'SENT', 'PROPOSED'].includes(s)) return 'chip--attention'
  return 'chip--passive'
}

const words = (s: string) => s.replace(/_/g, ' ').toLowerCase()

/** One station on the thread. */
function Station({
  n, title, subtitle, children,
}: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="relative pl-10 pb-8">
      {/* The thread itself. It is the whole point of the screen, so it is
          drawn rather than implied by spacing. */}
      <div className="absolute left-[11px] top-7 bottom-0 w-px bg-etyme-rule" aria-hidden="true" />
      <div
        className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full
                   border border-etyme-rule bg-etyme-raised text-[11px] tabular-nums text-etyme-muted"
        aria-hidden="true"
      >
        {n}
      </div>
      <h2 className="headline-serif text-[17px] text-etyme-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="mt-1 text-[14px] tabular-nums text-etyme-ink">{value}</div>
    </div>
  )
}

export default function PlacementPage() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const [p, setP] = useState<Placement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const res = await fetch(`/api/placements/${id}`)
      const body = await readJson(res)
      if (!live) return
      if (!res.ok) setError(body?.error?.message ?? 'That placement could not be opened.')
      else setP(body.data)
    })()
    return () => { live = false }
  }, [id])

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="mb-4">
          <Link href="/dashboard/contracts" className="text-[12px] text-etyme-action hover:underline">
            ← Contracts
          </Link>
        </div>
        <div className="panel py-16 text-center">
          <p className="text-sm text-etyme-danger">{error}</p>
        </div>
      </div>
    )
  }

  if (!p) {
    return (
      <div className="animate-fade-in">
        <div className="panel py-16 text-center">
          <p className="text-body-sm text-etyme-muted">Opening the placement…</p>
        </div>
      </div>
    )
  }

  const where = p.endClient ?? p.client
  const chainLine = p.chain.weEmployThem
    ? `${p.supplier.name} employs ${p.person.name.split(' ')[0]} directly.`
    : `${p.person.name.split(' ')[0]} reaches ${where.name} through ${p.chain.hopsBelow + 1} firm${p.chain.hopsBelow ? 's' : ''}.`

  return (
    <div className="animate-fade-in max-w-3xl">
      <div className="mb-6">
        <Link href="/dashboard/contracts" className="text-[12px] text-etyme-action hover:underline">
          ← Contracts
        </Link>
      </div>

      {/* ── Who, where, and how it stands ── */}
      <div className="panel mb-8">
        <div className="eyebrow mb-2">{where.name}</div>
        <h1 className="headline-serif text-heading text-etyme-ink">{p.person.name}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
          {p.origin?.title ?? 'Placement'}
          {p.person.location ? ` · ${p.person.location}` : ''}
          {p.startDate ? ` · started ${day(p.startDate)}` : ''}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`chip ${tone(p.state)}`}>{words(p.state)}</span>
          {p.person.skills.slice(0, 4).map((s) => (
            <span key={s} className="chip chip--passive">{s}</span>
          ))}
        </div>

        {/* What a client is shown, and what it is not.
            A buyer sees the rate it pays and the hours it approved. What
            the supplier pays underneath, and what it keeps, is the
            supplier's business — showing a buyer an empty "Paying" column
            invites exactly the question the column cannot answer. */}
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-etyme-rule pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={p.viewer.isSupplier ? 'Billing' : 'You pay'} value={rate(p.contracts.sell.billRate)} />
          {p.viewer.isSupplier && <Fact label="Paying" value={rate(p.contracts.buy?.payRate ?? null)} />}
          <Fact label="Hours accepted" value={p.money.hoursAccepted || '—'} />
          {p.viewer.isSupplier && (
            <Fact
              label="Margin"
              value={
                p.money.margin == null
                  ? <span className="text-etyme-faint">not set</span>
                  : cash(p.money.margin)
              }
            />
          )}
        </div>
      </div>

      {/* ── The thread ── */}
      <Station
        n={1}
        title="Where the work came from"
        subtitle={
          p.origin
            ? `${p.origin.raisedBy.name} needed somebody${p.origin.neededBy ? ` by ${day(p.origin.neededBy)}` : ''}.`
            : 'No requirement is recorded against this placement.'
        }
      >
        {p.origin && (
          <div className="card">
            <Link href={`/dashboard/requirements/${p.origin.id}`} className="text-[14px] text-etyme-action hover:underline">
              {p.origin.title}
            </Link>
            {p.invitation && (
              <p className="mt-2 text-[13px] text-etyme-muted">
                You were invited at{' '}
                <span className="tabular-nums text-etyme-ink">
                  {p.invitation.payMin != null && p.invitation.payMax != null
                    ? `$${p.invitation.payMin}–$${p.invitation.payMax}/hr`
                    : 'no stated band'}
                </span>
                . Nobody else can see the band you were given.
              </p>
            )}
          </div>
        )}
      </Station>

      <Station
        n={2}
        title="How they reached you"
        subtitle={
          p.submission?.sentOnBy
            ? `${p.submission.sentOnBy.company.name} put them forward to you on ${day(p.submission.sentOnBy.at)}.`
            : p.submission
              ? `Submitted by ${p.submission.from.name}${p.submission.to ? ` to ${p.submission.to.name}` : ''}.`
              : 'This placement has no submission behind it.'
        }
      >
        {p.submission && (
          <div className="card flex flex-wrap items-center gap-x-8 gap-y-3">
            <Fact label="Submitted" value={day(p.submission.submittedAt)} />
            <Fact label="At" value={rate(p.submission.rate)} />
            {p.submission.sentOnBy && <Fact label="Their price" value={rate(p.submission.sentOnBy.rate)} />}
            <div>
              <div className="lbl">Package</div>
              <span className={`chip ${tone(p.submission.checkState)} mt-1`}>{words(p.submission.checkState)}</span>
            </div>
          </div>
        )}
      </Station>

      <Station
        n={3}
        title="Who met them"
        subtitle={
          p.interviews.length
            ? `${p.interviews.length} round${p.interviews.length === 1 ? '' : 's'}, in order.`
            : 'Nobody has interviewed them for this role.'
        }
      >
        {p.interviews.length > 0 && (
          <ol className="space-y-2">
            {p.interviews.map((i) => (
              <li key={i.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[14px] text-etyme-ink">
                    Round {i.round} · {words(i.stage)}
                  </span>
                  {/* The separator is a character rather than a margin.
                      Spacing that exists only in CSS reads back as
                      "screenphone" to anything that flattens the markup —
                      a screen reader, a copy-paste, a search index. And
                      an onsite interview held onsite says it once. */}
                  {words(i.mode) !== words(i.stage) && (
                    <span className="text-[13px] text-etyme-muted"> · {words(i.mode)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] tabular-nums text-etyme-muted">{day(i.scheduledAt)}</span>
                  <span className={`chip ${tone(i.state)}`}>{words(i.state)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Station>

      <Station n={4} title="What was agreed, on both sides" subtitle={chainLine}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card">
            <div className="lbl mb-2">
              {p.viewer.isSupplier
                ? `You sell to ${p.client.name}`
                : `${p.supplier.name} sells to you`}
            </div>
            <div className="stat-value">{rate(p.contracts.sell.billRate)}</div>
            <p className="mt-2 text-[13px] text-etyme-muted">
              {p.paymentTerms ? `Net ${p.paymentTerms}` : 'Terms not set'}
              {p.contracts.sell.purchaseOrder ? ` · PO ${p.contracts.sell.purchaseOrder.number}` : ' · no purchase order'}
            </p>
          </div>
          {/* The buy side belongs to the supplier and is shown only to
              them. A client reading "You employ them" about somebody
              another firm employs is worse than a gap. */}
          {p.viewer.isSupplier && (
          <div className="card">
            <div className="lbl mb-2">
              {p.contracts.buy?.vendor ? `You buy from ${p.contracts.buy.vendor.name}` : 'You employ them'}
            </div>
            <div className="stat-value">{rate(p.contracts.buy?.payRate ?? null)}</div>
            <p className="mt-2 text-[13px] text-etyme-muted">
              {p.contracts.buy
                ? p.contracts.buy.vendor
                  ? `${p.contracts.buy.contractType} · no purchase order is raised to a person you employ`
                  : `${p.contracts.buy.contractType} · your own employee`
                : 'No buy contract yet, so this placement has a price and no cost.'}
            </p>
          </div>
          )}
        </div>
      </Station>

      <Station
        n={5}
        title="Cleared to work"
        subtitle="Work authorisation stops a placement. The rest are worth chasing."
      >
        <div className="flex flex-wrap gap-2">
          {p.compliance.person.length === 0 && p.compliance.supplierCover.length === 0 ? (
            <p className="text-[13px] text-etyme-muted">Nothing has been recorded against this person yet.</p>
          ) : (
            [...p.compliance.person, ...p.compliance.supplierCover].map((v, i) => (
              <span key={`${v.type}-${i}`} className={`chip ${tone(v.status)}`}>
                {words(v.type)} · {words(v.status)}
              </span>
            ))
          )}
        </div>
      </Station>

      <Station
        n={6}
        title="The hours"
        subtitle="Filed once by the person. Two signatures, from two different companies — the client says the work happened, the employer accepts what it will pay for."
      >
        {p.timesheets.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">No weeks filed yet.</p>
        ) : (
          <div className="overflow-scroll-x">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-etyme-rule text-left">
                  <th className="lbl pb-2">Week</th>
                  <th className="lbl pb-2 text-right">Hours</th>
                  <th className="lbl pb-2">Client</th>
                  <th className="lbl pb-2">Employer</th>
                  <th className="lbl pb-2">Billed</th>
                </tr>
              </thead>
              <tbody>
                {p.timesheets.map((t) => (
                  <tr key={t.id} className="border-b border-etyme-rule/60">
                    <td className="py-2 tabular-nums text-etyme-ink">{t.periodStart} → {t.periodEnd}</td>
                    <td className="py-2 text-right tabular-nums text-etyme-ink">{t.hours}</td>
                    <td className="py-2 text-etyme-muted">
                      {t.clientApproved ? `${t.clientApproved.hours} approved` : 'not yet'}
                    </td>
                    <td className="py-2 text-etyme-muted">
                      {t.employerAccepted ? `${t.employerAccepted.hours} accepted` : 'not yet'}
                    </td>
                    <td className="py-2">
                      <span className={`chip ${t.billedByUs ? 'chip--verified' : 'chip--passive'}`}>
                        {t.billedByUs ? 'billed' : 'not billed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Station>

      <Station
        n={7}
        title="The money"
        subtitle={
          !p.viewer.isSupplier
            ? 'What this placement has been invoiced at, and what has been settled.'
            : p.money.margin == null
              ? 'Margin stays blank until somebody sets a cost. A number here that nobody agreed would look like good news.'
              : 'What this placement brought in, what it cost, and what is left.'
        }
      >
        <div className="card mb-3 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Two different numbers, and the label has to match the one
              shown. Revenue is what the hours are worth; billed is what
              has actually gone out on an invoice. A buyer reading
              "invoiced to you" beside the accrued figure is being told
              they owe more than anybody has asked them for. */}
          <Fact
            label={p.viewer.isSupplier ? 'Revenue' : 'Invoiced to you'}
            value={cash(p.viewer.isSupplier ? p.money.revenue : p.money.billed)}
          />
          {p.viewer.isSupplier && <Fact label="Cost" value={cash(p.money.cost)} />}
          {p.viewer.isSupplier && <Fact label="Margin" value={cash(p.money.margin)} />}
          <Fact label={p.viewer.isSupplier ? 'Collected' : 'Paid'} value={cash(p.money.collected)} />
        </div>

        {p.money.invoices.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">Nothing invoiced against this placement yet.</p>
        ) : (
          <ul className="space-y-2">
            {p.money.invoices.map((inv) => (
              <li key={inv.id} className="card flex flex-wrap items-center justify-between gap-3">
                <Link href={`/dashboard/invoices/${inv.id}`} className="text-[14px] text-etyme-action hover:underline">
                  {inv.number}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-[13px] tabular-nums text-etyme-muted">
                    {inv.hours} hrs{inv.weeks > 1 ? ` · ${inv.weeks} weeks` : ''}
                  </span>
                  <span className="text-[14px] tabular-nums text-etyme-ink">{cash(inv.amount)}</span>
                  <span className="text-[13px] tabular-nums text-etyme-muted">due {inv.dueAt}</span>
                  <span className={`chip ${tone(inv.status)}`}>{words(inv.status)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Station>
    </div>
  )
}
