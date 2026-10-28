'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { ListSurface, type Column } from '@/components/list-surface'
import { Check, ErrorState, Field, Input, LoadingState, PageHead, RefusedState, SubmitButton } from '@/components/ui'
import { sourceWords, savedByWords, managerFromWords, managerLoadWords, siteShort, type SiteManager, type SiteSource } from '@/lib/site-rules'

/**
 * Settings → Sites: where people work, who hires there, and which
 * approved suppliers fill jobs there (founder, 2026-10-28, "Build it,
 * sites sounds good", on the drawing of Corvane Packaging's 31 plants).
 *
 * Two screens, as drawn: every site grouped by region, with its regional
 * manager, country, time zone, hiring managers, suppliers and
 * contractors; and one site open, with its address, time zone, region,
 * days off, managers and the supplier ticks, the refusal under them.
 * Every answer says where it came from. The reads and the rules are
 * lib/sites and lib/site-rules, through /api/settings/locations.
 *
 * Not here, on purpose: "Read sites from our website". The guarded
 * website read decided on 2026-10-27 is not built, so the link is not
 * drawn rather than drawn and refused.
 */

interface Site {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string
  timeZone: string | null
  region: string | null
  isPrimary: boolean
  source: SiteSource
  recordedBy: string | null
  recordedAt: string | null
  contractors: number
  placements: number
  managers: SiteManager[]
  suppliers: { id: string; name: string; source: SiteSource; lapsed: boolean }[]
  everyApproved: boolean
}

interface Read {
  sites: Site[]
  approved: { id: string; name: string }[]
  regionalManagers: Record<string, string>
  company: { id: string; name: string; kind: string }
  region: string | null
  daysOff: number[]
  mayEdit: boolean
  mayName: boolean
}

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NO_REGION = 'No region'
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export default function SitesPage() {
  const eyebrow = usePageSection('/dashboard/settings/sites')
  const [read, setRead] = useState<Read | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/locations')
      if (res.status === 403) {
        const j = await res.json().catch(() => null)
        setRefused(j?.error?.message ?? 'Sites are read by whoever sets up the company, and by Procurement.')
        return
      }
      const j = await readJson(res)
      setRead(j.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])
  useEffect(() => {
    load()
    const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('site') : null
    if (id) setOpenId(id)
  }, [load])

  const groups = useMemo(() => {
    if (!read) return []
    const by = new Map<string, Site[]>()
    for (const s of read.sites) {
      const k = s.region ?? NO_REGION
      by.set(k, [...(by.get(k) ?? []), s])
    }
    // The region with the primary site first, then the rest by contractors.
    return [...by.entries()]
      .map(([region, sites]) => ({ region, sites, contractors: sites.reduce((n, s) => n + s.contractors, 0), home: sites.some((s) => s.isPrimary) }))
      .sort((a, b) => Number(b.home) - Number(a.home) || b.contractors - a.contractors || a.region.localeCompare(b.region))
  }, [read])

  const columns: Column<Site>[] = useMemo(() => [
    { key: 'name', label: 'Site', render: (s) => <span className="text-etyme-ink">{s.name}{s.isPrimary && <span className="ml-2 text-[11px] text-etyme-faint">primary</span>}</span>, sortValue: (s) => s.name },
    { key: 'country', label: 'Country', render: (s) => <span className="text-etyme-muted">{s.country}</span> },
    { key: 'timeZone', label: 'Time zone', render: (s) => <span className="text-etyme-muted">{s.timeZone ?? 'The company’s'}</span>, hideOnMobile: true },
    { key: 'managers', label: 'Hiring managers', render: (s) => <span>{s.managers.map((m) => m.name).join(', ') || <span className="text-etyme-faint">Nobody yet</span>}</span>, sortValue: (s) => s.managers[0]?.name ?? '', exportValue: (s) => s.managers.map((m) => m.name).join('; ') },
    {
      key: 'suppliers', label: 'Suppliers who may fill jobs here',
      render: (s) => s.everyApproved
        ? <span className="text-etyme-faint">Every approved supplier</span>
        : <span>{s.suppliers.filter((x) => !x.lapsed).map((x) => x.name).join(', ')}</span>,
      exportValue: (s) => (s.everyApproved ? 'Every approved supplier' : s.suppliers.map((x) => x.name).join('; ')),
      hideOnMobile: true,
    },
    { key: 'contractors', label: 'Contractors', align: 'right', render: (s) => <span className="tabular-nums">{s.contractors}</span>, sortValue: (s) => s.contractors },
  ], [])

  if (refused) return <RefusedState says={refused} />
  if (error && !read) return <ErrorState says={error} />
  if (!read) return <LoadingState says="Opening your sites…" />

  const open = openId ? read.sites.find((s) => s.id === openId) ?? null : null
  if (open) {
    return <OneSite site={open} read={read} onBack={() => setOpenId(null)} onSaved={load} onNext={(id) => setOpenId(id)} eyebrow={eyebrow} />
  }

  const total = read.sites.length
  const imported = read.sites.filter((s) => s.source === 'IMPORT').length
  return (
    <div className="mx-auto max-w-[1080px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={eyebrow}
        title="Sites"
        subtitle="Where people work. A job is posted at a site, a placement is at a site, and days off and the time zone follow the site."
      />
      <p className="text-[12.5px] text-etyme-muted tabular-nums">
        {plural(total, 'site')}{groups.length > 1 ? `, ${plural(groups.length, 'region')}` : ''}
        {read.region ? `. Your seat covers ${read.region}.` : '.'}
        {imported > 0 ? ` ${imported} from your contractor list.` : ''}
      </p>

      {groups.map((g, i) => {
        const isShown = shown[g.region] ?? i === 0
        const lead = read.regionalManagers[g.region]
        return (
          <section key={g.region} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-etyme-rule pb-1 text-[12.5px] text-etyme-muted">
              <p>
                <span className="text-etyme-ink">{g.region}</span>
                {lead ? ` · regional manager ${lead}` : ''} · {plural(g.sites.length, 'site')} · {plural(g.contractors, 'contractor')}
              </p>
              {groups.length > 1 && (
                <button className="text-etyme-action-press" onClick={() => setShown({ ...shown, [g.region]: !isShown })}>
                  {isShown ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            {isShown && (
              <ListSurface<Site>
                name="sites"
                columns={columns}
                data={g.sites}
                rowKey={(s) => s.id}
                onRowClick={(s) => setOpenId(s.id)}
                searchPlaceholder="Search sites…"
                exportName={`sites-${g.region.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                emptyMessage="No sites in this region."
                card={(s) => (
                  <button onClick={() => setOpenId(s.id)} className="panel w-full text-left">
                    <p className="text-[15px] text-etyme-ink">{s.name}</p>
                    <p className="text-[12.5px] text-etyme-muted">
                      {[s.managers.map((m) => m.name).join(', ') || 'No hiring manager yet',
                        s.everyApproved ? 'every approved supplier' : plural(s.suppliers.filter((x) => !x.lapsed).length, 'supplier'),
                        plural(s.contractors, 'contractor')].join(' · ')}
                    </p>
                  </button>
                )}
              />
            )}
          </section>
        )
      })}

      {read.mayEdit && (
        <p className="text-[13px] text-etyme-muted">
          <button className="text-etyme-action-press" onClick={() => setAdding(!adding)}>+ Add a site</button>
          {' · '}
          <a className="text-etyme-action-press" href="/dashboard/data">Add sites from a file</a>
          <span className="text-etyme-faint"> (choose Sites on the Import page)</span>
        </p>
      )}
      {adding && <AddSite region={read.region} onDone={() => { setAdding(false); load() }} />}
    </div>
  )
}

function AddSite({ region, onDone }: { region: string | null; onDone: () => void }) {
  const [f, setF] = useState({ name: '', city: '', state: '', country: 'US', timeZone: '', region: region ?? '' })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  async function save() {
    setBusy(true); setSaid(null)
    try {
      await readJson(await fetch('/api/settings/locations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) }))
      onDone()
    } catch (e: any) { setSaid(e.message) } finally { setBusy(false) }
  }
  return (
    <form className="panel grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Field label="Name"><Input value={f.name} onChange={set('name')} placeholder="Dayton, Ohio" /></Field>
      <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
      <Field label="State or province"><Input value={f.state} onChange={set('state')} /></Field>
      <Field label="Country (two letters)"><Input value={f.country} onChange={set('country')} maxLength={2} /></Field>
      <Field label="Time zone"><Input value={f.timeZone} onChange={set('timeZone')} placeholder="America/New_York" /></Field>
      <Field label="Region"><Input value={f.region} onChange={set('region')} disabled={Boolean(region)} /></Field>
      <div className="sm:col-span-3 flex items-center gap-3">
        <SubmitButton pending={busy} pendingLabel="Saving…" disabled={!f.name.trim()}>Add the site</SubmitButton>
        {said && <p className="text-[12.5px] text-etyme-attention">{said}</p>}
      </div>
    </form>
  )
}

function OneSite({ site, read, onBack, onSaved, onNext, eyebrow }: {
  site: Site
  read: Read
  onBack: () => void
  onSaved: () => void
  onNext: (id: string) => void
  eyebrow: string | null
}) {
  const [f, setF] = useState({
    address: site.address ?? '', city: site.city ?? '', state: site.state ?? '',
    country: site.country, timeZone: site.timeZone ?? '', region: site.region ?? '',
  })
  const [ticked, setTicked] = useState<string[]>(site.everyApproved ? [] : site.suppliers.filter((s) => !s.lapsed).map((s) => s.id))
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const place = read.sites.findIndex((s) => s.id === site.id)
  const next = read.sites[place + 1] ?? null
  const fromN = new Set(site.suppliers.filter((s) => !s.lapsed).map((s) => s.id)).size
  const managers = site.managers.map((m) => m.name)
  const daysOff = read.daysOff.map((d) => DAY[d])

  async function save() {
    setBusy(true); setSaid(null); setRefusal(null)
    try {
      if (read.mayEdit) {
        await readJson(await fetch('/api/settings/locations', {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: site.id, ...f }),
        }))
      }
      const res = await fetch(`/api/settings/locations/${site.id}/suppliers`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierIds: ticked }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setRefusal(j?.error?.message ?? 'The suppliers were not saved.')
        return
      }
      setSaid('Saved.')
      onSaved()
    } catch (e: any) { setRefusal(e.message) } finally { setBusy(false) }
  }

  const saved = savedByWords(site.recordedBy, site.recordedAt)
  return (
    <div className="mx-auto max-w-[860px] space-y-6 px-4 py-6">
      <p className="text-[13px] text-etyme-muted">
        <button className="text-etyme-action-press" onClick={onBack}>‹ Sites</button> · {place + 1} of {read.sites.length}
      </p>
      <PageHead
        eyebrow={eyebrow}
        title={site.name}
        subtitle={`${plural(site.contractors, 'contractor')} on site${site.everyApproved ? '' : ` from ${plural(fromN, 'supplier')}`}.${managers.length ? ` ${listWords(managers)} ${managers.length === 1 ? 'hires' : 'hire'} here.` : ''}`}
      />

      <section className="space-y-3">
        <h2 className="font-serif text-[18px] text-etyme-ink">Address</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Street"><Input value={f.address} onChange={set('address')} disabled={!read.mayEdit} placeholder="Not found. Type it." /></Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} disabled={!read.mayEdit} /></Field>
          <Field label="State or province"><Input value={f.state} onChange={set('state')} disabled={!read.mayEdit} /></Field>
          <Field label="Country"><Input value={f.country} onChange={set('country')} disabled={!read.mayEdit} maxLength={2} /></Field>
          <Field label="Time zone"><Input value={f.timeZone} onChange={set('timeZone')} disabled={!read.mayEdit} placeholder="The company’s" /></Field>
          <Field label="Region"><Input value={f.region} onChange={set('region')} disabled={!read.mayEdit || Boolean(read.region)} /></Field>
        </div>
        <p className="text-[11.5px] text-etyme-faint">
          {sourceWords(site.source)}.{f.region && read.regionalManagers[f.region] ? ` ${read.regionalManagers[f.region]} reads this site.` : ''}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-[18px] text-etyme-ink">Days off at this site</h2>
        <p className="text-[13.5px] text-etyme-ink">
          Same as the company: {daysOff.length ? listWords(daysOff) : 'no weekday off'}, and the public holidays of {site.country}.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-[18px] text-etyme-ink">Hiring managers here</h2>
        {site.managers.length === 0 && <p className="text-[13px] text-etyme-faint">Nobody has posted a job here yet.</p>}
        {site.managers.map((m) => (
          <div key={m.personId} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-etyme-rule py-2">
            <p className="text-[14px] text-etyme-ink">{m.name} <span className="text-[12.5px] text-etyme-muted">· {managerLoadWords(m)}</span></p>
            <p className="text-[11.5px] text-etyme-faint">{managerFromWords(m.from)}</p>
          </div>
        ))}
        {read.mayEdit && <a className="text-[13px] text-etyme-action-press" href="/dashboard/access">+ Add a hiring manager, or invite one</a>}
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-[18px] text-etyme-ink">Suppliers who may fill jobs here</h2>
        <p className="text-[12.5px] text-etyme-muted">
          Of your {plural(read.approved.length, 'approved supplier')}. A job at {siteShort(site)} goes to the ticked ones unless the hiring manager changes it.
          {ticked.length === 0 ? ' With none ticked, it goes to every approved supplier.' : ''}
        </p>
        <div className="space-y-1">
          {read.approved.map((firm) => {
            const named = ticked.includes(firm.id)
            return (
              <Check
                key={firm.id}
                className="flex"
                checked={named}
                disabled={!read.mayName}
                onChange={() => setTicked(named ? ticked.filter((x) => x !== firm.id) : [...ticked, firm.id])}
                label={<span>{firm.name}{!named && <span className="text-etyme-faint"> · approved for {read.company.name}, not named at {siteShort(site)}</span>}</span>}
              />
            )
          })}
          {site.suppliers.filter((s) => s.lapsed).map((s) => (
            <p key={s.id} className="text-[12.5px] text-etyme-attention">{s.name} was named here and is no longer approved for {read.company.name}, so no job goes to them.</p>
          ))}
        </div>
        <p className="border-l-2 border-etyme-attention bg-etyme-raised px-3 py-2 text-[12.5px] text-etyme-ink">
          {refusal ?? 'A supplier not approved for ' + read.company.name + ' cannot be ticked here. Procurement approves a firm first, under Suppliers; then any site may name it.'}
        </p>
      </section>

      {(read.mayEdit || read.mayName) && (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton type="button" pending={busy} pendingLabel="Saving…" onClick={save}>Save</SubmitButton>
          {next && <button className="text-[13px] text-etyme-action-press" onClick={() => onNext(next.id)}>Next site: {siteShort(next)} ›</button>}
          {said && <p className="text-[12.5px] text-etyme-verified">{said}</p>}
        </div>
      )}
      {saved && <p className="text-[12px] text-etyme-faint">{saved}</p>}
    </div>
  )
}
