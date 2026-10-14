import type { ReactNode } from 'react'
import { compact, rate, amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'
import { stageWordFor } from '@/app/dashboard/requirements/words'
import { submissionStatusWord } from '@/app/dashboard/submissions/words'
import type { EmbedStep } from '@/lib/sample-seat'
import type { Read } from './read'
import { TryIt } from './try-it'

/**
 * The five screens of the frame, drawn on the server from the rows the
 * dashboard's own routes returned (`./read`). No fetch in the browser to
 * draw them, no menus, no header: the screen and nothing else.
 *
 * A list is a table from 640 pixels up and a list of cards below, so the
 * frame fits a 375-wide phone with no sideways scroll. Figures are
 * tabular; headings are serif.
 */

export const STEP_TITLE: Record<EmbedStep, string> = {
  overview: 'Program',
  source: 'Job requests and suppliers',
  submit: 'Submissions',
  approve: 'Weeks waiting for a signature',
  pay: 'Invoice receipts',
}

// ── Pieces ─────────────────────────────────────────────────────────

export function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-etyme-canvas p-3 font-sans text-etyme-ink sm:p-5">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-etyme-faint">Northbend Athletic · Program manager</p>
          <h1 className="font-serif text-xl tracking-tight sm:text-2xl">{title}</h1>
        </div>
        <span className="rounded-full border border-etyme-rule bg-etyme-surface px-2 py-0.5 text-[11px] text-etyme-muted">
          Sample company · read-only
        </span>
      </header>
      {children}
    </main>
  )
}

function Panel({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-lg border border-etyme-rule bg-etyme-surface p-3">
      <h2 className="font-serif text-base tracking-tight">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-etyme-muted">{sub}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'attention' }) {
  return (
    <div className="min-w-0 rounded-lg border border-etyme-rule bg-etyme-surface p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">{label}</p>
      <p className={`font-serif text-2xl tabular-nums ${tone === 'attention' ? 'text-etyme-attention' : ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-etyme-muted">{sub}</p>}
    </div>
  )
}

interface Col<T> {
  label: string
  cell: (row: T) => ReactNode
  /** A figure: right-aligned and tabular. */
  num?: boolean
}

/** One list, two ways: a table from `sm` up, cards below it. */
function Rows<T>({ cols, rows, rowKey, empty }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-etyme-muted">{empty}</p>
  const [first, ...rest] = cols
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-etyme-rule text-left text-[10px] uppercase tracking-wider text-etyme-faint">
              {cols.map((c) => (
                <th key={c.label} className={`py-1.5 pr-3 font-medium ${c.num ? 'text-right' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-b border-etyme-rule last:border-0 align-top">
                {cols.map((c) => (
                  <td key={c.label} className={`py-1.5 pr-3 ${c.num ? 'text-right' : ''}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-md border border-etyme-rule bg-etyme-raised p-2.5 text-sm">
            <div className="font-medium">{first.cell(r)}</div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
              {rest.map((c) => (
                <div key={c.label} className="contents">
                  <dt className="text-etyme-faint">{c.label}</dt>
                  <dd className="min-w-0 break-words">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

function Refused({ says }: { says: string }) {
  return <p className="rounded-md border border-etyme-rule bg-etyme-surface p-3 text-sm text-etyme-muted">{says}</p>
}

const day = (iso: string | null | undefined) => (iso ? formatDay(iso) : '—')

// ── The screens ────────────────────────────────────────────────────

export function Screen({ step, reads }: { step: EmbedStep; reads: Record<string, Read<any>> }) {
  switch (step) {
    case 'overview': return <Overview program={reads.program} />
    case 'source': return <Source requisitions={reads.requisitions} suppliers={reads.suppliers} />
    case 'submit': return <Submit submissions={reads.submissions} />
    case 'approve': return <Approve timesheets={reads.timesheets} />
    case 'pay': return <Pay invoices={reads.invoices} />
  }
}

function Overview({ program }: { program: Read<any> }) {
  if (!program.ok) return <Refused says={program.says} />
  const p = program.data
  const s = p.summary
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="On site" value={s.activeContractors} sub={`through ${s.vendors} ${s.vendors === 1 ? 'supplier' : 'suppliers'}`} />
        <Stat label="This month" value={compact(s.monthlySpend)} sub="an estimate, not signed time" />
        <Stat label="Waiting for you" value={s.pendingApprovals} tone={s.pendingApprovals > 0 ? 'attention' : undefined} sub="weeks and expenses" />
        <Stat label="Ending soon" value={s.endingSoon} sub={`${s.openRoles} open job ${s.openRoles === 1 ? 'request' : 'requests'}`} />
      </div>
      <Panel title="Contractors" sub="Every contractor on site, the supplier, and the rate you pay.">
        <Rows
          rows={p.contractors as any[]}
          rowKey={(c) => c.contractId}
          empty="Nobody is on site yet."
          cols={[
            { label: 'Contractor', cell: (c) => c.person?.name },
            { label: 'Supplier', cell: (c) => c.vendor?.phrase ?? c.vendor?.name },
            { label: 'Rate', num: true, cell: (c) => rate(c.billRate) },
            { label: 'On site since', cell: (c) => day(c.startDate) },
            { label: 'Ends', cell: (c) => day(c.endDate) },
          ]}
        />
      </Panel>
      <Panel title="By supplier" sub={s.monthlySpendBasis}>
        <Rows
          rows={p.vendors as any[]}
          rowKey={(v) => v.id}
          empty="No supplier has anybody on site."
          cols={[
            { label: 'Supplier', cell: (v) => v.name },
            { label: 'People', num: true, cell: (v) => v.headcount },
            { label: 'Average rate', num: true, cell: (v) => rate(v.avgRate) },
            { label: 'This month', num: true, cell: (v) => compact(v.totalMonthlySpend) },
            { label: 'Standing', cell: (v) => v.standing },
          ]}
        />
      </Panel>
    </>
  )
}

function Source({ requisitions, suppliers }: { requisitions: Read<any>; suppliers: Read<any> }) {
  return (
    <>
      <Panel title="Job requests" sub="Within plan, a job request publishes itself to the suppliers you chose.">
        {requisitions.ok ? (
          <>
            <Rows
              rows={requisitions.data.requisitions as any[]}
              rowKey={(r) => r.id}
              empty="No job requests yet."
              cols={[
                { label: 'Job request', cell: (r) => r.title },
                { label: 'Status', cell: (r) => stageWordFor(r) },
                { label: 'Rate band', num: true, cell: (r) => `${compact(r.billMin)}–${rate(r.billMax)}` },
                { label: 'Submissions', num: true, cell: (r) => r.counts?.submissions ?? 0 },
                { label: 'Where', cell: (r) => r.location ?? '—' },
              ]}
            />
            <div className="mt-2"><TryIt label="Raise a job request" href="/api/requisitions" /></div>
          </>
        ) : <Refused says={requisitions.says} />}
      </Panel>
      <Panel title="Suppliers" sub="Who may supply you, how many people each has on site, and what paperwork each still owes.">
        {suppliers.ok ? (
          <Rows
            rows={suppliers.data.suppliers as any[]}
            rowKey={(v) => v.companyId}
            empty="No suppliers yet."
            cols={[
              { label: 'Supplier', cell: (v) => v.name },
              { label: 'On site', num: true, cell: (v) => v.onSiteCount ?? 0 },
              { label: 'Agreement', cell: (v) => (v.agreement ? 'Signed' : 'None on file') },
              { label: 'Still owes', cell: (v) => ((v.owes as string[]) ?? []).join(', ') || 'Nothing' },
            ]}
          />
        ) : <Refused says={suppliers.says} />}
      </Panel>
    </>
  )
}

function Submit({ submissions }: { submissions: Read<any> }) {
  if (!submissions.ok) return <Refused says={submissions.says} />
  return (
    <Panel title="Submissions" sub="Every person a supplier put forward, the job, and the rate they asked.">
      <Rows
        rows={submissions.data.submissions as any[]}
        rowKey={(s) => s.id}
        empty="No supplier has put anybody forward yet."
        cols={[
          { label: 'Person', cell: (s) => s.person?.name },
          { label: 'Job request', cell: (s) => s.requirement?.title },
          { label: 'Supplier', cell: (s) => s.fromCompany?.name },
          { label: 'Rate', num: true, cell: (s) => rate(s.rate) },
          { label: 'Status', cell: (s) => submissionStatusWord(s.status) },
          { label: '', cell: (s) => (s.award?.open ? <TryIt label="Place" href={`/api/submissions/${s.id}/award`} /> : null) },
        ]}
      />
    </Panel>
  )
}

function Approve({ timesheets }: { timesheets: Read<any> }) {
  if (!timesheets.ok) return <Refused says={timesheets.says} />
  return (
    <Panel title="Waiting for a signature" sub="Each week is checked against its contract before anybody signs it.">
      <Rows
        rows={timesheets.data.timesheets as any[]}
        rowKey={(t) => t.id}
        empty="No week is waiting."
        cols={[
          { label: 'Person', cell: (t) => t.person?.name },
          { label: 'Job', cell: (t) => t.sellContract?.engagement?.title ?? '—' },
          { label: 'Week', cell: (t) => `${day(t.periodStart)} – ${day(t.periodEnd)}` },
          { label: 'Hours', num: true, cell: (t) => t.totalHours ?? '—' },
          { label: 'Check', cell: (t) => (t.flag ? <span className="text-etyme-attention">{t.flag}</span> : 'Within the contract') },
          { label: '', cell: (t) => <TryIt label="Approve" href={`/api/timesheets/${t.id}/approve`} /> },
        ]}
      />
    </Panel>
  )
}

const PAYABLE_WORD: Record<string, string> = {
  ISSUED: 'Not submitted yet', SUBMITTED: 'Submitted', PARTIALLY_PAID: 'Part paid', PAID: 'Paid', CANCELLED: 'Cancelled',
}

function Pay({ invoices }: { invoices: Read<any> }) {
  if (!invoices.ok) return <Refused says={invoices.says} />
  const rows = (invoices.data.invoices as any[]).filter((i) => i.direction === 'PAYABLE')
  return (
    <Panel
      title="Invoice receipts"
      sub={`${invoices.data.summary?.owedInAll?.says ?? ''} The check: the hours, the invoice receipt and the contract rate must all agree.`.trim()}
    >
      <Rows
        rows={rows}
        rowKey={(i) => i.id}
        empty="No supplier has sent an invoice yet."
        cols={[
          { label: 'Supplier', cell: (i) => i.engagement?.vendorCompany?.name ?? '—' },
          { label: 'Invoice', cell: (i) => i.number },
          { label: 'Amount', num: true, cell: (i) => amount(i.totalMinor, i.currency) },
          { label: 'Check', cell: (i) => (i.receipt ? <span className={i.receipt.matches ? 'text-etyme-verified' : 'text-etyme-attention'}>{i.receipt.verdict}</span> : '—') },
          { label: 'Status', cell: (i) => PAYABLE_WORD[i.status] ?? i.status },
          { label: '', cell: (i) => (i.status === 'SUBMITTED' && i.receipt?.matches ? <TryIt label="Pay" href={`/api/invoices/${i.id}/payments`} /> : null) },
        ]}
      />
    </Panel>
  )
}
