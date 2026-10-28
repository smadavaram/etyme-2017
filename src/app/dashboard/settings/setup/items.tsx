'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { Check, Field, FormMessage, Input, Select, SubmitButton, Textarea } from '@/components/ui'
import { WeekPanel } from '@/components/settings/week-panel'
import { PayrollPanel } from '@/components/settings/payroll-panel'
import { InviteTeammate } from '@/components/invite-teammate'
import { ENTITY_TYPES, type ItemKey, type ItemWords, type ChecklistRow } from '@/lib/setup-checklist'

/**
 * Each checklist item's screen: one column, a short heading, plain fields
 * with their defaults filled, and under the two buttons the line saying
 * what skipping stops and who saved it when. The week, the payroll, the
 * team and the sites reuse the screens that already answer them.
 */

export interface SetupRead {
  company: { id: string; name: string; kind: string }
  checklist: { rows: ChecklistRow[]; owed: ItemKey[]; intro: string; countLine: string }
  words: Record<ItemKey, ItemWords>
  stamps: Partial<Record<ItemKey, string>>
  detail: any
  says?: string | null
}

const PATH: Partial<Record<ItemKey, string>> = {
  COMPANY: 'company',
  ADDRESSES: 'addresses',
  PEOPLE_IN_CHARGE: 'people-in-charge',
  PAPERS: 'papers',
  BANK: 'bank',
  DOMAIN: 'domain',
  INTEGRATIONS: 'integrations',
}

interface Props {
  item: ItemKey
  place: string
  read: SetupRead
  onDone: (next: SetupRead) => void
  onReload: () => void
}

/** The frame every item shares, and the two buttons. */
function Frame({ item, place, read, onDone, save, children, saveLabel = 'Save and continue' }: Props & {
  /** The body to PUT, or null where Save only records the item done. */
  save: (() => unknown) | null
  children: ReactNode
  saveLabel?: string
}) {
  const w = read.words[item]
  const [busy, setBusy] = useState<'SAVE' | 'SKIP' | null>(null)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function send(kind: 'SAVE' | 'SKIP') {
    setBusy(kind); setSaid(null)
    try {
      const path = PATH[item]
      const res = kind === 'SAVE' && save && path
        ? await fetch(`/api/settings/setup/${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(save()) })
        : await fetch('/api/settings/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, outcome: kind === 'SAVE' ? 'DONE' : 'SKIPPED' }) })
      const j = await readJson(res)
      if (j.data?.says) setSaid({ tone: 'ok', text: j.data.says })
      onDone(j.data)
    } catch (e: any) {
      setSaid({ tone: 'error', text: e.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="max-w-[620px] space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.09em] text-etyme-muted">{place}</p>
        <h2 className="mt-1.5 font-serif text-[24px] tracking-[-0.02em] text-etyme-ink">{w.label}</h2>
        <p className="mt-1 text-[13.5px] text-etyme-muted">{w.sub}</p>
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-2.5 pt-2">
        <SubmitButton type="button" pending={busy === 'SAVE'} pendingLabel="Saving…" disabled={busy !== null} onClick={() => send('SAVE')}>{saveLabel}</SubmitButton>
        <SubmitButton type="button" tone="secondary" pending={busy === 'SKIP'} pendingLabel="Skipping…" disabled={busy !== null} onClick={() => send('SKIP')}>Skip for now</SubmitButton>
      </div>
      {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
      <p className="text-[12.5px] text-etyme-muted">{w.skipStops}</p>
      <p className="text-[12px] text-etyme-faint">{read.stamps[item]}</p>
    </section>
  )
}

function Lbl({ children }: { children: ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.09em] text-etyme-muted">{children}</p>
}

function From({ says }: { says?: string | null }) {
  return says ? <span className="text-[11.5px] text-etyme-faint">{says}</span> : null
}

export function ItemBody(p: Props) {
  switch (p.item) {
    case 'COMPANY': return <CompanyItem {...p} />
    case 'ADDRESSES': return <AddressesItem {...p} />
    case 'SITES': return <SitesItem {...p} />
    case 'PEOPLE_IN_CHARGE': return <PeopleItem {...p} />
    case 'HOW_YOU_WORK': return <WorkItem {...p} />
    case 'PAPERS': return <PapersItem {...p} />
    case 'BANK': return <BankItem {...p} />
    case 'COMPANIES': return <CompaniesItem {...p} />
    case 'TEAM': return <TeamItem {...p} />
    case 'DOMAIN': return <DomainItem {...p} />
    case 'INTEGRATIONS': return <IntegrationsItem {...p} />
  }
}

// ── Your company ─────────────────────────────────────────────────────

type Source = { source: 'DOMAIN' | 'PAPER' | 'PERSON'; quote?: string | null }

function CompanyItem(p: Props) {
  const d = p.read.detail.COMPANY
  const guess = d.domainFill
  const [f, setF] = useState({
    legalName: d.legalName || d.signedUpAs,
    dba: d.dba,
    entityType: d.entityType,
    establishedYear: d.establishedYear,
    website: d.website || guess?.website || '',
    phone: d.phone,
    taxId: d.taxId,
    currency: d.currency,
    timeZone: d.timeZone,
  })
  const [sources, setSources] = useState<Record<string, Source>>(
    !d.website && guess ? { website: { source: 'DOMAIN', quote: guess.quote } } : {},
  )
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value })
    setSources(({ [k]: _drop, ...rest }) => rest)
  }
  const from = (k: string) => {
    const s = sources[k]
    if (s?.source === 'DOMAIN') return `Guessed from your work email: “${s.quote}”. Change it if that is wrong.`
    if (s?.source === 'PAPER') return `From your W-9: “${s.quote}”. Check it, then save.`
    return d.sources?.[k] ?? null
  }

  return (
    <Frame {...p} save={() => ({ ...f, sources })}>
      <PaperReader
        onUse={(values) => {
          const next = { ...f }
          const src = { ...sources }
          for (const v of values) {
            if (v.field === 'legalName' || v.field === 'dba' || v.field === 'taxId') {
              (next as any)[v.field] = v.value
              src[v.field] = { source: 'PAPER', quote: v.quote }
            }
          }
          setF(next); setSources(src)
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Legal name" help={<From says={from('legalName')} />}><Input value={f.legalName} onChange={set('legalName')} /></Field>
        <Field label="Business name, if different" help={<From says={from('dba')} />}><Input value={f.dba} onChange={set('dba')} /></Field>
        <Field label="Kind of company">
          <Select value={f.entityType} onChange={set('entityType')}>
            <option value="">Choose one</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Established (year)"><Input inputMode="numeric" value={f.establishedYear} onChange={set('establishedYear')} placeholder="2019" /></Field>
        <Field label="Website" help={<From says={from('website')} />}><Input value={f.website} onChange={set('website')} placeholder="tapin.com" /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="EIN" help={<From says={from('taxId')} />}><Input value={f.taxId} onChange={set('taxId')} placeholder="12-3456789" /></Field>
        <Field label="Currency"><Input value={f.currency} onChange={set('currency')} maxLength={3} /></Field>
        <Field label="Time zone" help="Your primary site’s. Each site may have its own."><Input value={f.timeZone} onChange={set('timeZone')} placeholder="America/Chicago" /></Field>
      </div>
      <p className="text-[12px] text-etyme-faint">The logo is added from your public page. Etyme does not read your website yet.</p>
    </Frame>
  )
}

/** "Fill from a paper": a W-9 or a certificate of insurance, read and shown, used only on a yes. */
function PaperReader({ onUse }: { onUse: (values: { field: string; value: string; quote: string }[]) => void }) {
  const [openBox, setOpenBox] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [read, setRead] = useState<any>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [filed, setFiled] = useState<string | null>(null)

  async function readIt(file?: File) {
    setBusy(true); setSaid(null); setRead(null); setFiled(null)
    try {
      const res = file
        ? await fetch('/api/settings/setup/read-paper', { method: 'POST', body: (() => { const fd = new FormData(); fd.append('file', file); return fd })() })
        : await fetch('/api/settings/setup/read-paper', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await readJson(res)
      setRead(j.data)
    } catch (e: any) { setSaid(e.message) } finally { setBusy(false) }
  }

  /** A certificate goes on file with the company's own papers, where its dates are watched. */
  async function fileCover() {
    const v = (f: string) => read.values.find((x: any) => x.field === f)?.value
    try {
      await readJson(await fetch('/api/outbound-pack/documents', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'INSURANCE_GL', issuedAt: v('coverFrom'), expiresAt: v('coverUntil'), note: v('insurer') ? `Insurer: ${v('insurer')}` : undefined, confirmed: true }),
      }))
      setFiled('On file with your own papers. Etyme watches the date it ends.')
    } catch (e: any) { setSaid(e.message) }
  }

  if (!openBox) {
    return (
      <p className="text-[13px] text-etyme-muted">
        <button type="button" className="text-etyme-action-press" onClick={() => setOpenBox(true)}>Fill from a paper you have</button>
        {' '}— a W-9 or a certificate of insurance. Nothing is saved until you press Save.
      </p>
    )
  }
  return (
    <div className="space-y-2 border-l-2 border-etyme-rule pl-3">
      <Lbl>Fill from a paper</Lbl>
      <Field label="The file (PDF or text)">
        <Input type="file" accept="application/pdf,text/plain" onChange={(e) => { const file = e.target.files?.[0]; if (file) readIt(file) }} />
      </Field>
      <Field label="Or paste the text of the form"><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <SubmitButton type="button" tone="secondary" pending={busy} pendingLabel="Reading…" disabled={!text.trim()} onClick={() => readIt()}>Read it</SubmitButton>
      {said && <FormMessage tone="error">{said}</FormMessage>}
      {read && (
        <div className="space-y-1.5">
          <p className="text-[12.5px] text-etyme-muted">{read.says}</p>
          {read.modelSays && <p className="text-[12px] text-etyme-faint">{read.modelSays}</p>}
          {read.values.map((v: any) => (
            <p key={v.field} className="text-[13px] text-etyme-ink">
              {v.label}: <span className="font-medium">{v.value}</span>
              <span className="block text-[11.5px] text-etyme-faint">Read from “{v.quote}”{v.readBy === 'MODEL' ? ', by the document reader' : ''}</span>
            </p>
          ))}
          {read.missing?.length > 0 && <p className="text-[12px] text-etyme-faint">Not found: {read.missing.join(', ')}. Type them.</p>}
          {read.kind === 'W9' && read.values.length > 0 && (
            <SubmitButton type="button" tone="secondary" onClick={() => onUse(read.values)}>Use these values</SubmitButton>
          )}
          {read.kind === 'COI' && read.values.some((v: any) => v.field === 'coverUntil') && !filed && (
            <SubmitButton type="button" tone="secondary" onClick={fileCover}>Put the certificate on file</SubmitButton>
          )}
          {filed && <FormMessage tone="ok">{filed}</FormMessage>}
        </div>
      )}
    </div>
  )
}

// ── Addresses ────────────────────────────────────────────────────────

function AddressFields({ a, onChange, from }: { a: any; onChange: (next: any) => void; from?: (k: string) => string | null }) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...a, [k]: e.target.value })
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <Field label="Street" className="sm:col-span-3" help={<From says={from?.('street')} />}><Input value={a.street} onChange={set('street')} placeholder="Street and number" /></Field>
      <Field label="City"><Input value={a.city} onChange={set('city')} /></Field>
      <Field label="State"><Input value={a.state} onChange={set('state')} /></Field>
      <Field label="ZIP code"><Input value={a.postalCode} onChange={set('postalCode')} /></Field>
      <Field label="Country (two letters)"><Input value={a.country} onChange={set('country')} maxLength={2} /></Field>
    </div>
  )
}

function AddressesItem(p: Props) {
  const d = p.read.detail.ADDRESSES
  const [legal, setLegal] = useState(d.legal)
  const [billing, setBilling] = useState(d.billing)
  const [same, setSame] = useState<boolean>(d.billingSameAsLegal)
  return (
    <Frame {...p} save={() => ({ legal, billing, billingSameAsLegal: same })}>
      <div className="space-y-2">
        <Lbl>Legal address</Lbl>
        <AddressFields a={legal} onChange={setLegal} from={(k) => d.sources?.[`legal.${k}`] ?? null} />
      </div>
      <div className="space-y-2">
        <Lbl>Billing address</Lbl>
        <Check checked={same} onChange={() => setSame(!same)} label="Same as the legal address" />
        {!same && <AddressFields a={billing} onChange={setBilling} />}
      </div>
      <div className="space-y-1.5">
        <Lbl>Where people work</Lbl>
        {d.sites.map((s: any) => (
          <p key={s.id} className="border-b border-etyme-rule py-1.5 text-[13.5px] text-etyme-ink">
            {s.name}{s.isPrimary && <span className="text-etyme-faint"> · primary</span>}
            <span className="block text-[12px] text-etyme-muted">{s.place}</span>
          </p>
        ))}
        <Link href={'/dashboard/settings/sites' as any} className="text-[13px] text-etyme-action-press">Sites: add one, or change one</Link>
      </div>
    </Frame>
  )
}

// ── Sites ────────────────────────────────────────────────────────────

function SitesItem(p: Props) {
  const d = p.read.detail.SITES
  return (
    <Frame {...p} save={null} saveLabel={d.confirmSays}>
      <p className="text-[13.5px] text-etyme-ink">
        {d.count === 0 ? 'No sites yet.' : `${d.count} ${d.count === 1 ? 'site' : 'sites'}: ${d.names.join(', ')}${d.count > d.names.length ? ', and more' : ''}.`}
      </p>
      <Link href={'/dashboard/settings/sites' as any} className="text-[13px] text-etyme-action-press">Open Sites to name each site’s suppliers and hiring managers</Link>
    </Frame>
  )
}

// ── The people in charge ─────────────────────────────────────────────

function PeopleItem(p: Props) {
  const d = p.read.detail.PEOPLE_IN_CHARGE
  const [duties, setDuties] = useState<any[]>(d.duties)
  const [accounts, setAccounts] = useState<string>(d.accountsEmail)
  const [said, setSaid] = useState<string | null>(null)
  const set = (i: number, patch: any) => setDuties(duties.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  /** Somebody not seated yet is invited through Users & permissions' own door. */
  async function invite(i: number) {
    const x = duties[i]
    setSaid(null)
    try {
      const roles = (await readJson(await fetch('/api/roles'))).data?.roles ?? []
      const role = roles.find((r: any) => r.name === x.inviteRole)
      const j = await readJson(await fetch('/api/access/invite', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: x.name, email: x.email, roleId: role?.id }),
      }))
      setSaid(j.data?.says ?? `${x.email} has been invited.`)
      p.onReload()
    } catch (e: any) { setSaid(e.message) }
  }

  const guessed = d.accountsEmailGuessed && accounts === d.accountsEmail
  return (
    <Frame {...p} save={() => ({ duties, accountsEmail: accounts, sources: guessed ? { accountsEmail: { source: 'DOMAIN', quote: accounts } } : {} })}>
      {duties.map((x, i) => (
        <div key={x.duty} className="space-y-2">
          <Lbl>{x.label}</Lbl>
          <Field label="Somebody seated here">
            <Select value={x.personId} onChange={(e) => set(i, { personId: e.target.value })}>
              <option value="">Somebody not seated yet</option>
              {d.seats.map((s: any) => <option key={s.personId} value={s.personId}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>)}
            </Select>
          </Field>
          {!x.personId && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={x.name} onChange={(e) => set(i, { name: e.target.value })} /></Field>
              <Field label="Work email"><Input value={x.email} onChange={(e) => set(i, { email: e.target.value })} /></Field>
              {x.inviteRole && x.name && x.email && (
                <p className="text-[12.5px] text-etyme-muted sm:col-span-2">
                  <button type="button" className="text-etyme-action-press" onClick={() => invite(i)}>Invite {x.name} as {x.inviteRole}</button>
                  {x.invitedAt ? ' · invited' : ''}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="space-y-2">
        <Lbl>Accounts email</Lbl>
        <Field label="Where suppliers send invoices and clients send payments" help={guessed ? 'Guessed from your work email. Change it if that is wrong.' : undefined}>
          <Input value={accounts} onChange={(e) => setAccounts(e.target.value)} />
        </Field>
      </div>
      {said && <FormMessage tone="ok">{said}</FormMessage>}
    </Frame>
  )
}

// ── How you work ─────────────────────────────────────────────────────

function WorkItem(p: Props) {
  const d = p.read.detail.HOW_YOU_WORK
  return (
    <Frame {...p} save={null}>
      <WeekPanel canEdit />
      {d.asksPayroll ? <PayrollPanel canEdit shiftSection={false} /> : <p className="text-[13px] text-etyme-muted">{d.noPayrollLine}</p>}
      <Link href="/dashboard/settings" className="text-[13px] text-etyme-action-press">Holidays and days off are on Settings</Link>
    </Frame>
  )
}

// ── Papers you require ───────────────────────────────────────────────

function PapersItem(p: Props) {
  const d = p.read.detail.PAPERS
  const [sets, setSets] = useState<any[]>(d.sets)
  const toggle = (si: number, ii: number, patch: any) =>
    setSets(sets.map((s, a) => (a !== si ? s : { ...s, items: s.items.map((it: any, b: number) => (b === ii ? { ...it, ...patch } : it)) })))
  return (
    <Frame {...p} save={() => ({ sets: sets.map((s) => ({ party: s.party, items: s.items.map((i: any) => ({ key: i.key, required: i.required, waivedReason: i.waivedReason || undefined })) })) })} saveLabel="Confirm and continue">
      {sets.map((s, si) => (
        <div key={s.party} className="space-y-1.5">
          <Lbl>{s.says}{s.confirmed ? ' · confirmed' : ''}</Lbl>
          {s.items.map((i: any, ii: number) => (
            <div key={i.key} className="border-b border-etyme-rule py-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Check
                  checked={i.required}
                  disabled={!i.waivable}
                  onChange={() => toggle(si, ii, { required: !i.required })}
                  label={<span>{i.label}{(s.party === 'WORKERS_W2' || s.party === 'CORP_TO_CORP') && <span className="text-etyme-faint"> · {i.stage === 'APPLICATION' ? 'asked before an offer' : 'asked after the offer'}</span>}</span>}
                />
                {i.waivable
                  ? <button type="button" className="text-[12px] text-etyme-action-press" onClick={() => toggle(si, ii, i.waiving || i.waivedReason ? { waiving: false, waivedReason: '' } : { waiving: true })}>{i.waiving || i.waivedReason ? 'Ask for it' : 'Waive'}</button>
                  : <span className="text-[12px] text-etyme-faint">Cannot be waived</span>}
              </div>
              {(i.waiving || i.waivedReason) && (
                <Field label="Why you do not ask for it">
                  <Input value={i.waivedReason ?? ''} onChange={(e) => toggle(si, ii, { waivedReason: e.target.value })} />
                </Field>
              )}
            </div>
          ))}
        </div>
      ))}
      <Link href={'/dashboard/documents' as any} className="text-[13px] text-etyme-action-press">Add a paper Etyme does not list</Link>
    </Frame>
  )
}

// ── Bank details ─────────────────────────────────────────────────────

function BankItem(p: Props) {
  const d = p.read.detail.BANK
  const [f, setF] = useState({ bankName: d.bankName, accountName: d.accountName, accountNumber: '', routingNumber: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Frame {...p} save={() => ({ ...f, accountNumber: f.accountNumber || d.last4, routingNumber: f.routingNumber || d.routingLast4 })}>
      {d.shows && (
        <p className="text-[13.5px] text-etyme-ink">
          {d.shows}
          <span className="block text-[12px] text-etyme-muted">{d.standing}{d.enteredBy ? ` Entered by ${d.enteredBy}.` : ''}</span>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bank"><Input value={f.bankName} onChange={set('bankName')} /></Field>
        <Field label="Name on the account"><Input value={f.accountName} onChange={set('accountName')} /></Field>
        <Field label="Account number" help="Only the last four digits are kept."><Input inputMode="numeric" autoComplete="off" value={f.accountNumber} onChange={set('accountNumber')} placeholder={d.last4 ? `ending ${d.last4}` : ''} /></Field>
        <Field label="Routing number" help="Only the last four digits are kept."><Input inputMode="numeric" autoComplete="off" value={f.routingNumber} onChange={set('routingNumber')} placeholder={d.routingLast4 ? `ending ${d.routingLast4}` : ''} /></Field>
      </div>
      {!d.shows && <p className="text-[12.5px] text-etyme-muted">{d.standing}</p>}
    </Frame>
  )
}

// ── Your companies ───────────────────────────────────────────────────

function CompaniesItem(p: Props) {
  const d = p.read.detail.COMPANIES
  return (
    <Frame {...p} save={null}>
      <p className="text-[13.5px] text-etyme-ink">
        {d.count === 0 ? 'No companies yet.' : `${d.count} ${d.count === 1 ? 'company or contract' : 'companies and contracts'} on the record.`}
      </p>
      <p className="text-[13px] text-etyme-muted">
        <Link href={d.href} className="text-etyme-action-press">Add a company</Link>
        {' · '}
        <Link href="/dashboard/data" className="text-etyme-action-press">Add them from a file</Link>
        <span className="text-etyme-faint"> (your client or supplier list)</span>
      </p>
    </Frame>
  )
}

// ── Your team ────────────────────────────────────────────────────────

function TeamItem(p: Props) {
  const d = p.read.detail.TEAM
  return (
    <Frame {...p} save={null}>
      <p className="text-[13px] text-etyme-muted">{d.seats} {d.seats === 1 ? 'person is' : 'people are'} seated here.</p>
      <InviteTeammate onInvited={() => p.onReload()} />
    </Frame>
  )
}

// ── Your domain ──────────────────────────────────────────────────────

function DomainItem(p: Props) {
  const d = p.read.detail.DOMAIN
  const [domain, setDomain] = useState<string>(d.suggested)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function act(body: any) {
    setSaid(null)
    try {
      const j = await readJson(await fetch('/api/settings/setup/domain', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      setSaid({ tone: 'ok', text: j.data.says ?? 'Saved.' })
      p.onDone(j.data)
    } catch (e: any) { setSaid({ tone: 'error', text: e.message }) }
  }
  const verified = d.claims.some((c: any) => c.verified)
  return (
    <Frame {...p} save={null} saveLabel={verified ? 'Save and continue' : 'Continue without it'}>
      {d.claims.map((c: any) => (
        <div key={c.domain} className="space-y-1 border-b border-etyme-rule py-2">
          <p className="text-[13.5px] text-etyme-ink">{c.domain} · <span className={c.verified ? 'text-etyme-verified' : 'text-etyme-attention'}>{c.verified ? 'verified' : 'not verified yet'}</span></p>
          {c.record && (
            <>
              <p className="text-[12.5px] text-etyme-muted">Add this TXT record to your DNS, then check.</p>
              <p className="break-all font-mono text-[12px] text-etyme-ink">{c.record.name}<br />{c.record.value}</p>
              <SubmitButton type="button" tone="secondary" onClick={() => act({ action: 'CHECK', id: c.id })}>Check now</SubmitButton>
            </>
          )}
        </div>
      ))}
      {!verified && !d.claims.some((c: any) => c.record) && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Your domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="tapin.com" /></Field>
          <SubmitButton type="button" tone="secondary" disabled={!domain.trim()} onClick={() => act({ action: 'CLAIM', domain })}>Get the record</SubmitButton>
        </div>
      )}
      {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
    </Frame>
  )
}

// ── Integrations ─────────────────────────────────────────────────────

function IntegrationsItem(p: Props) {
  const d = p.read.detail.INTEGRATIONS
  const [url, setUrl] = useState('')
  return (
    <Frame {...p} save={url.trim() ? () => ({ teamsWebhookUrl: url.trim() }) : null}>
      <p className="text-[13px] text-etyme-ink">{d.teams.says}</p>
      <Field label="Teams channel link" help="From a Workflows “Post to a channel when a webhook request is received” flow.">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <Link href="/dashboard/integrations" className="text-[13px] text-etyme-action-press">The export for your accounting system</Link>
    </Frame>
  )
}
