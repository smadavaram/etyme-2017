'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { readJson } from '@/lib/read-response'
import { compact, rate } from '@/lib/money-display'
import { ListSurface, type Column } from '@/components/list-surface'
import { Stat, Chip, Panel, RefusedState, LoadingState, ErrorState } from '@/components/ui'
import type { RegionsData } from '@/app/api/program/regions/read'
import type { Figures, RegionRow, ManagerRow, ContractorRow, SpendLine } from '@/app/api/program/regions/rollup'

/**
 * The program by region — a tab of the client's Today, never a second
 * dashboard (founder, 2026-10-27, "go ahead and build this", on the
 * region map).
 *
 * One page read at three altitudes, all from `GET /api/program/regions`:
 *
 *   - the head of operations and the CFO: one row per region, the four
 *     flows side by side, and what stopped named in the first line;
 *   - a region (picked by them, or the regional manager's own): its
 *     hiring managers, and how each of its countries runs;
 *   - a hiring manager: their contractors.
 *
 * A regional manager's seat reads its own region and nothing else; the
 * route narrows every read, so this page has no picker for them and no
 * way back to the rollup.
 */

const BASE = '/dashboard/program?view=regions'

function hrefFor(q: { region?: string | null; manager?: string | null }): string {
  const p = new URLSearchParams()
  p.set('view', 'regions')
  if (q.region) p.set('region', q.region)
  if (q.manager) p.set('manager', q.manager)
  return `/dashboard/program?${p.toString()}`
}

export function ByRegion() {
  const router = useRouter()
  const params = useSearchParams()
  const region = params.get('region')
  const manager = params.get('manager')
  const [data, setData] = useState<RegionsData | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    setRefused(null)
    try {
      const q = new URLSearchParams()
      if (region) q.set('region', region)
      if (manager) q.set('manager', manager)
      const res = await fetch(`/api/program/regions${q.toString() ? `?${q}` : ''}`)
      if (res.status === 403 || res.status === 404) {
        const said = await res.json().catch(() => ({}))
        setRefused(said.error?.message ?? 'This region is not on your page.')
        return
      }
      const body = await readJson(res)
      setData(body.data)
    } catch (err: any) {
      setError(err?.message ?? 'The program by region could not be read.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Read again whenever the address picks another region or manager.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, manager])

  if (loading && !data) return <LoadingState says="Reading every plant…" />
  if (refused) return <RefusedState says={refused} />
  if (error || !data) {
    return <ErrorState says={<>The program by region could not be read.{error ? <> {error}</> : null}</>} action={{ label: 'Try again', onClick: load }} />
  }

  const wholeProgram = data.reader.reach === 'PROGRAM'
  const go = (href: string) => router.push(href as Route)

  return (
    <>
      <div className="mb-6 max-w-3xl">
        <p className="eyebrow">
          By region · {data.client.name}
          {data.reader.label ? ` · ${data.reader.label} only` : ''}
        </p>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl leading-tight tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          {data.greeting.says}
        </h1>
        <Trail data={data} wholeProgram={wholeProgram} />
      </div>

      {data.level === 'PROGRAM' && <Rollup data={data} onRegion={(label) => go(hrefFor({ region: label }))} />}
      {data.level === 'REGION' && data.region && (
        <RegionView data={data} onManager={(id) => go(hrefFor({ region: data.region!.label, manager: id ?? 'none' }))} />
      )}
      {data.level === 'MANAGER' && data.manager && <ManagerView data={data} />}

      <p className="mt-6 text-[12px] text-etyme-muted">
        Spend this month is an {data.spendSays}, in each plant’s own money; nothing is converted.
        {data.receiptsSays ? ` ${data.receiptsSays}` : ''}
        {data.limitSays ? ` ${data.limitSays}` : ''}
      </p>
    </>
  )
}

/** Where the reader is, and the way back up. */
function Trail({ data, wholeProgram }: { data: RegionsData; wholeProgram: boolean }) {
  const t = data.level === 'PROGRAM' ? data.total : data.region?.figures
  const parts: ReactNode[] = []
  if (data.level !== 'PROGRAM' && wholeProgram) {
    parts.push(<Link key="all" href={BASE as Route} className="text-etyme-action underline-offset-2 hover:underline">All regions</Link>)
  }
  if (data.level === 'MANAGER' && data.region && (wholeProgram || data.reader.reach === 'REGION')) {
    parts.push(<Link key="region" href={hrefFor({ region: data.region.label }) as Route} className="text-etyme-action underline-offset-2 hover:underline">{data.region.label}</Link>)
  }
  return (
    <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">
      {parts.length > 0 && <>{parts.reduce<ReactNode[]>((acc, p, i) => (i ? [...acc, ' · ', p] : [p]), [])}. </>}
      {data.level === 'PROGRAM' && t && (
        <>Every plant, every supplier, one list: {plural(t.plants, 'plant')}, {plural(t.contractors, 'contractor')} on site. Pick a region to see its hiring managers.</>
      )}
      {data.level === 'REGION' && t && data.region && (
        <>
          {data.region.label}
          {data.region.leads.length > 0 ? `, run by ${data.region.leads.join(' and ')}` : ''}:{' '}
          {plural(t.hiringManagers, 'hiring manager')}, {plural(t.contractors, 'contractor')} on site. Pick a manager to see their contractors.
        </>
      )}
      {data.level === 'MANAGER' && data.manager && (
        <>{data.manager.name} · {data.manager.plants.join(', ')} · {plural(data.manager.contractors.length, 'contractor')} on site.</>
      )}
    </p>
  )
}

// ── The rollup: one row per region ───────────────────────────────────

function Rollup({ data, onRegion }: { data: RegionsData; onRegion: (label: string) => void }) {
  const t = data.total
  const columns: Column<RegionRow>[] = [
    { key: 'label', label: 'Region', render: (r) => <span className="font-medium text-etyme-ink">{r.label}</span> },
    { key: 'leads', label: 'Regional manager', render: (r) => r.leads.join(', ') || '—', sortValue: (r) => r.leads.join(', '), exportValue: (r) => r.leads.join(', ') },
    ...figureColumns<RegionRow>(data.total.receipts !== null),
  ]
  return (
    <>
      <FlowStats f={t} says={data.oneCurrency.says} />
      <ListSurface
        name="program-by-region"
        exportName="program-by-region"
        columns={columns}
        data={data.regions}
        rowKey={(r) => r.label}
        onRowClick={(r) => onRegion(r.label)}
        searchPlaceholder="Search regions…"
        emptyMessage="No plant carries a region yet."
        emptyDetail="A region is a label on a site. Name one on a site and it appears here."
      />
    </>
  )
}

// ── One region: its hiring managers, and how each country runs ───────

function RegionView({ data, onManager }: { data: RegionsData; onManager: (id: string | null) => void }) {
  const r = data.region!
  const columns: Column<ManagerRow>[] = [
    { key: 'manager', label: 'Hiring manager', render: (m) => <span className="font-medium text-etyme-ink">{m.manager}</span> },
    { key: 'plant', label: 'Plant' },
    ...figureColumns<ManagerRow>(r.figures.receipts !== null),
  ]
  return (
    <>
      <FlowStats f={r.figures} says={data.oneCurrency.says} />
      <ListSurface
        name="program-region-managers"
        exportName="region-hiring-managers"
        columns={columns}
        data={r.managers}
        rowKey={(m) => `${m.siteId ?? ''}|${m.managerId ?? ''}`}
        onRowClick={(m) => onManager(m.managerId)}
        searchPlaceholder="Search managers and plants…"
        emptyMessage={`Nobody manages a plant in ${r.label} yet.`}
      />
      <Countries rows={r.countries} region={r.label} />
    </>
  )
}

function Countries({ rows, region }: { rows: NonNullable<RegionsData['region']>['countries']; region: string }) {
  if (rows.length === 0) return null
  return (
    <Panel className="mt-6" title={`How each country runs here`} subtitle={`The same flows everywhere in ${region}. What changes is the papers asked for, the pay rhythm and the one rule watched. Only lines checked against the law are shown.`}>
      <ul className="divide-y divide-etyme-rule text-[14px]">
        {rows.map((c) => (
          <li key={c.country} className="py-3 first:pt-0 last:pb-0">
            <p className="font-medium text-etyme-ink">{c.name}</p>
            {c.papers.length > 0 && (
              <p className="mt-1 text-etyme-muted">Papers before day one: {c.papers.map((p) => p.label).join('; ')}.</p>
            )}
            {c.pay && <p className="mt-1 text-etyme-muted">Pay: {c.pay.says}.</p>}
            {c.rule && (
              <p className="mt-1 text-etyme-muted">
                <Chip tone={c.rule.enforcement === 'BLOCK' ? 'attention' : 'passive'}>{c.rule.enforcement === 'BLOCK' ? 'Blocks' : 'Warns'}</Chip>{' '}
                {c.rule.says}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ── One hiring manager: their contractors ────────────────────────────

function ManagerView({ data }: { data: RegionsData }) {
  const m = data.manager!
  const columns: Column<ContractorRow>[] = [
    { key: 'name', label: 'Contractor', render: (c) => <span className="font-medium text-etyme-ink">{c.name}</span> },
    { key: 'job', label: 'Job', render: (c) => c.job ?? '—' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'rateMinor', label: 'Rate', align: 'right', render: (c) => rate(c.rateMinor, c.currency), exportValue: (c) => rate(c.rateMinor, c.currency) },
    { key: 'monthsHere', label: 'Months here', align: 'right' },
    { key: 'daysLeft', label: 'Time limit', render: (c) => <LimitChip days={c.daysLeft} />, sortValue: (c) => c.daysLeft ?? Number.MAX_SAFE_INTEGER, exportValue: (c) => c.daysLeft },
    {
      key: 'weeksToSign', label: 'Timesheet',
      render: (c) => c.weeksToSign > 0 ? <Chip tone="attention">{plural(c.weeksToSign, 'week')} to sign</Chip> : <Chip tone="verified">Signed</Chip>,
    },
    { key: 'papersAsked', label: 'Papers asked', align: 'right' },
  ]
  return (
    <ListSurface
      name="program-manager-contractors"
      exportName="hiring-manager-contractors"
      columns={columns}
      data={m.contractors}
      rowKey={(c) => c.contractId}
      searchPlaceholder="Search contractors…"
      emptyMessage={`${m.name} has nobody on site.`}
    />
  )
}

// ── The figures, the same on every level ─────────────────────────────

function FlowStats({ f, says }: { f: Figures; says: string }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <Stat label="Contractors on site" value={f.contractors} sub={`${plural(f.plants, 'plant')}, ${plural(f.hiringManagers, 'hiring manager')}`} />
      <Stat label="Open jobs" value={f.openJobs} />
      <Stat label="Weeks to sign" value={f.weeksToSign} tone={f.weeksToSign > 0 ? 'attention' : 'default'} />
      <Stat label="Starts waiting on papers" value={f.papers.onHold} tone={f.papers.onHold > 0 ? 'attention' : 'default'} sub={`${plural(f.papers.asked, 'paper')} asked, not in yet`} />
      <Stat
        label="Invoice receipts"
        value={f.receipts ? `${f.receipts.paid} paid` : null}
        tone={f.receipts && f.receipts.held > 0 ? 'attention' : 'default'}
        sub={f.receipts ? `${f.receipts.held} held over the hours · ${f.receipts.ready} ready to pay` : 'read by the AP clerk and finance'}
      />
      <Stat
        label="Spend this month"
        value={<SpendValue spend={f.spend} one={f.spendOneCurrency} />}
        sub={f.spend.length > 1 ? <>{spendSub(f.spend)}{f.spendOneCurrency ? <><br />{says}</> : null}</> : undefined}
      />
    </div>
  )
}

function SpendValue({ spend, one }: { spend: SpendLine[]; one: SpendLine | null }) {
  if (one) return <>{compact(one.minor, one.currency)}</>
  if (spend.length === 0) return <>—</>
  if (spend.length === 1) return <>{compact(spend[0].minor, spend[0].currency)}</>
  // No rate for one of them: money's rollup leaves the figure blank, and
  // the figure says how many currencies it is in, never a sum across them.
  return <>in {spend.length} currencies</>
}

function spendSub(spend: SpendLine[]): string | undefined {
  if (spend.length <= 1) return undefined
  return spend.map((s) => compact(s.minor, s.currency)).join(' · ')
}

function figureColumns<T extends Figures>(withReceipts: boolean): Column<T>[] {
  const cols: Column<T>[] = [
    { key: 'plants', label: 'Plants', align: 'right' },
    { key: 'contractors', label: 'Contractors', align: 'right' },
    { key: 'openJobs', label: 'Open jobs', align: 'right' },
    {
      key: 'weeksToSign', label: 'Weeks to sign', align: 'right',
      render: (r) => r.weeksToSign > 0 ? <Chip tone="attention">{r.weeksToSign}</Chip> : '0',
    },
    {
      key: 'papers', label: 'Papers', sortValue: (r) => r.papers.onHold * 1000 + r.papers.asked,
      exportValue: (r) => `${r.papers.asked} asked, ${r.papers.onHold} on hold`,
      render: (r) => r.papers.onHold > 0
        ? <Chip tone="attention">{plural(r.papers.onHold, 'start')} on hold</Chip>
        : <Chip tone="verified">{r.papers.asked} asked</Chip>,
    },
  ]
  if (withReceipts) {
    cols.push({
      key: 'receipts', label: 'Invoice receipts', sortValue: (r) => (r.receipts?.held ?? 0) * 1000 + (r.receipts?.paid ?? 0),
      exportValue: (r) => r.receipts ? `${r.receipts.paid} paid, ${r.receipts.held} held, ${r.receipts.ready} ready` : '',
      render: (r) => !r.receipts ? '—' : r.receipts.held > 0
        ? <Chip tone="attention">{r.receipts.held} held</Chip>
        : <Chip tone="verified">{r.receipts.paid} paid{r.receipts.ready > 0 ? ` · ${r.receipts.ready} to pay` : ''}</Chip>,
    })
  }
  cols.push(
    {
      key: 'nearestLimit', label: 'Nearest time limit',
      sortValue: (r) => r.nearestLimit?.days ?? Number.MAX_SAFE_INTEGER,
      exportValue: (r) => r.nearestLimit ? `${r.nearestLimit.days} days, ${r.nearestLimit.personName}` : '',
      render: (r) => r.nearestLimit
        ? <span title={`${r.nearestLimit.personName}, ${r.nearestLimit.plant}`}><LimitChip days={r.nearestLimit.days} /></span>
        : '—',
    },
    {
      key: 'spend', label: 'Spend this month', align: 'right', sortable: false,
      exportValue: (r) => r.spend.map((s) => compact(s.minor, s.currency)).join('; '),
      render: (r) => r.spend.length === 0 ? '—' : (
        <span className="inline-flex flex-col items-end">{r.spend.map((s) => <span key={s.currency}>{compact(s.minor, s.currency)}</span>)}</span>
      ),
    },
  )
  return cols
}

function LimitChip({ days }: { days: number | null }) {
  if (days === null) return <>—</>
  if (days < 0) return <Chip tone="danger">past by {plural(-days, 'day')}</Chip>
  if (days <= 30) return <Chip tone="attention">{plural(days, 'day')}</Chip>
  return <>{plural(days, 'day')}</>
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
