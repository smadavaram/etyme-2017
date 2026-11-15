'use client'

import { useCallback, useEffect, useState } from 'react'
import { ListSurface, type Column } from '@/components/list-surface'
import { NO_WAY_TO_REACH } from '@/lib/contact-reach'
import Link from 'next/link'
import type { Route } from 'next'
import { worksAtChoices, rolesOffered, OWN_FIRM_KIND, ADD_ANYWAY, type WorksAtChoice } from '@/lib/contacts'
import { mayAddConsultant, ADDS_CONSULTANTS } from '@/lib/consultant-portfolio/who-adds'
import { desksHolding } from '@/lib/permissions'
import { mayOpen } from '@/lib/nav-table'
import { usePageSection } from '@/components/page-section'
import { useSession } from '@/components/session-provider'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { refusalSentence } from '@/lib/refusal-words'
import { Chip, EmptyState, ErrorState, FilterChips, FormMessage, LoadingState, PageHead, RefusedState } from '@/components/ui'

/**
 * Contacts: the people you know, at the companies on your list and at
 * your own firm, by what you would call them about.
 *
 * Contacts is people. Its Companies tab read the register alone and said
 * it had none beside a Companies page listing hundreds (fix
 * list of 2026-11-14, B4), so it is gone, and one link opens Companies,
 * whose drawer holds each company's contacts.
 *
 * A working surface: search first, dense rows, every state handled.
 */

/** Where a colleague who needs a login is invited, and where a person the firm pays is added. */
const USERS_HREF = '/dashboard/access'
const ADD_CANDIDATE_HREF = '/dashboard/consultants?new=1'
const COMPANIES_HREF = '/dashboard/companies'


const PEOPLE_COLUMNS: Column<any>[] = [
  { key: 'name', label: 'Person', render: (c) => <span className="text-etyme-ink">{c.name}</span> },
  { key: 'at', label: 'Firm', render: (c) => <span className="text-etyme-muted">{c.at.name}</span>, sortValue: (c) => c.at.name },
  { key: 'title', label: 'Role', render: (c) => <span className="text-etyme-muted">{c.title ?? '—'}</span>, hideOnMobile: true },
  { key: 'kindLabel', label: 'Team', render: (c) => <Chip>{c.kindLabel}</Chip> },
  { key: 'email', label: 'Email', render: (c) => c.email ? <a href={`mailto:${c.email}`} className="text-etyme-action" onClick={(e) => e.stopPropagation()}>{c.email}</a> : '—' },
  { key: 'joined', label: 'Here', render: (c) => (c.joined ? <Chip tone="verified">on the platform</Chip> : <span className="text-etyme-faint">—</span>), sortValue: (c) => (c.joined ? 1 : 0), hideOnMobile: true },
]

export default function ContactsPage() {
  const session = useSession()
  const permissions = sidebarPropsFrom(session).permissions ?? null
  const [contacts, setContacts] = useState<any>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // The sentence after Add contact saves: who, where, and that nothing was sent.
  const [saved, setSaved] = useState<string | null>(null)
  // A refusal is the page: its sentence alone, with no tabs, search or
  // "Add contact" around it (sign-up walk, round six, problem 12).
  const [refused, setRefused] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await fetch(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      const cb = await c.json().catch(() => ({}))
      if (c.status === 403) {
        setRefused(refusalSentence(cb?.error?.message) || 'Contacts is not part of your seat. Ask your company’s owner if you need it.')
        return
      }
      if (!c.ok) throw new Error(cb.error?.message ?? `HTTP ${c.status}`)
      setContacts(cb.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  const people = (contacts?.contacts ?? []).filter((c: any) => !kind || c.kind === kind)
  // The kind only once the session has it: a literal fallback here drew a
  // supplier's heading over a client's page while it loaded (sign-up walk,
  // round three, item 16). Unknown reader, no heading.
  const readerKind = session.company?.kind ?? null
  // Read off the reader's own trimmed menu, so a seat with no desk is
  // never headed by a section it does not have (round seven).
  const eyebrow = usePageSection('/dashboard/contacts')

  if (refused) return <RefusedState says={refused} />
  if (contacts === null && loading) return <LoadingState says="Opening contacts…" />

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      {/* The section this page sits under on the reader's own menu:
          Operate for a firm that sells, Network for a client, and the
          client's word for an office sitting at a client's desk. Null
          while the session loads, and PageHead then draws no eyebrow; the
          line under the title waits for the reader's kind the same way. */}
      <PageHead
        eyebrow={eyebrow}
        title="Contacts"
        subtitle={readerKind ? 'The people you know at the companies on your list, and at your own firm. Private to this company — nobody else’s screen shows yours.' : undefined}
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-etyme-rule pb-3">
        {/* Contacts is people; the companies are on Companies, one click away. */}
        {mayOpen(COMPANIES_HREF, permissions) && (
          <Link href={COMPANIES_HREF} className="text-[13px] text-etyme-action">Companies</Link>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search names, companies, titles"
          className="ml-auto w-full rounded-lg border border-etyme-rule px-3 py-1.5 text-[13px] sm:w-64"
        />
        <button onClick={() => { setSaved(null); setAdding(true) }} className="btn-primary text-[13px]">
          Add contact
        </button>
      </div>

      {saved && <FormMessage tone="ok">{saved}</FormMessage>}
      {loading && <LoadingState compact says="Opening contacts…" />}
      {error && <ErrorState says={error} action={{ label: 'Try again', onClick: () => load() }} />}

      {/* ── People ─────────────────────────────────────────── */}
      {!loading && contacts && (
        <>
          {/* Each card says what to call the person about, so the chip
              carries the desk's name alone. */}
          <FilterChips<string>
            label="Their role at their firm"
            // Only roles somebody on the list holds (lib/contacts kindsHeld).
            options={[{ key: '', label: 'Everyone' }, ...(contacts.held ?? []).map((k: any) => ({ key: k.key, label: k.label }))]}
            value={kind ?? ''}
            onChange={(k) => setKind(k === '' ? null : k)}
          />

          <ListSurface<any>
            name="contacts-people"
            // The page searches for itself, in the box above both lists.
            searchable={false}
            defaultView="feed"
            columns={PEOPLE_COLUMNS}
            data={people}
            rowKey={(c) => c.id}
            exportName="contacts"
            defaultPageSize={50}
            card={(c) => (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{c.name}</p>
                  <p className="text-[12px] text-etyme-faint">
                    {[c.title, c.at.name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.joined && <Chip tone="verified">on the platform</Chip>}
                  <Chip>{c.kindLabel}</Chip>
                </div>
              </div>
              {c.via && <p className="mt-1 text-[12px] text-etyme-muted">{c.via}</p>}
              {c.callAbout && (
                <p className="mt-1 text-[12px] text-etyme-muted">Call about: {c.callAbout}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-etyme-muted">
                {c.email && <a href={`mailto:${c.email}`} style={{ color: 'var(--color-action)' }}>{c.email}</a>}
                {c.phone && <span className="tabular-nums">{c.phone}</span>}
              </div>
            </div>
            )}
          />

          {people.length === 0 && (
            <EmptyState
              says={q || kind
                ? 'Nobody matches that.'
                : 'Nobody on the rolodex yet. Add the person you most recently phoned — the hiring manager, the AP clerk — and it stops being empty.'}
            />
          )}
        </>
      )}

      {adding && contacts && (
        <AddContactModal
          companies={worksAtChoices(contacts.worksAt)}
          permissions={permissions}
          readerKind={readerKind}
          onClose={() => setAdding(false)}
          onCreated={(says) => {
            setAdding(false)
            setSaved(says)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddContactModal({
  companies,
  permissions,
  readerKind,
  onClose,
  onCreated,
}: {
  companies: WorksAtChoice[]
  permissions: readonly string[] | null
  readerKind: string | null
  onClose: () => void
  onCreated: (says: string) => void
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', atCompanyId: '', kind: 'OTHER' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The route's link beside its refusal, such as Add a company.
  const [errorLink, setErrorLink] = useState<{ href: string; label: string } | null>(null)
  const atOwnFirm = companies.some((c) => c.own && c.id === form.atCompanyId)
  // Team member only at the firm's own firm (lib/contacts rolesOffered).
  const kinds = rolesOffered(atOwnFirm)
  // A firm that pays its own people adds them under Candidates; a client's
  // or an MSP's menu has no such page.
  const paysPeople = readerKind === 'VENDOR' || readerKind === 'GSI'
  const mayInvite = mayOpen(USERS_HREF, permissions)
  // The link only where the seat's own route would take the add; anybody
  // else reads which role adds a person the firm pays (walk, 2026-11-15).
  const mayAddCandidate = paysPeople && mayOpen(ADD_CANDIDATE_HREF, permissions) && mayAddConsultant(permissions ?? [])
  const addsPeople = desksHolding(ADDS_CONSULTANTS, readerKind).slice(0, 3)
  // The same name at this company with no email or phone in common: asked,
  // with one press that saves anyway (2026-11-15).
  const [namesake, setNamesake] = useState(false)

  function chooseCompany(id: string) {
    const own = companies.some((c) => c.own && c.id === id)
    // A colleague starts on Team member; leaving the own firm puts a
    // Team member back on Other, since that role is only for colleagues.
    const kind = own ? (form.kind === 'OTHER' ? OWN_FIRM_KIND : form.kind) : form.kind === OWN_FIRM_KIND ? 'OTHER' : form.kind
    setForm({ ...form, atCompanyId: id, kind })
  }
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Checked here, not left to the browser. A native refusal inside a
  // modal on a phone is invisible — the Add consultant form proved it.
  function problems(): Record<string, string> {
    const p: Record<string, string> = {}
    if (form.name.trim().length < 2) p.name = 'A name, so somebody knows who they are calling.'
    if (!form.atCompanyId) p.atCompanyId = 'Say which company they work at.'
    const email = form.email.trim()
    // The route says the same sentence (lib/contacts), so a script that
    // skips this form is refused in the same words.
    if (!email && !form.phone.trim()) p.email = NO_WAY_TO_REACH
    if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      p.email = `"${email}" is not an email address. Leave it blank if you only have a phone number.`
    }
    return p
  }

  async function handleSubmit(e: React.FormEvent, addAnyway = false) {
    e.preventDefault()
    setNamesake(false)
    const found = problems()
    setFieldErrors(found)
    if (Object.keys(found).length > 0) {
      setError(Object.values(found)[0])
      return
    }
    setSubmitting(true)
    setError(null)
    setErrorLink(null)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addAnyway ? { ...form, addAnyway: true } : form),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error?.message ?? 'Could not save the contact.')
        // Drawn only where the page will take the reader.
        if (body.error?.href && mayOpen(body.error.href, permissions)) setErrorLink({ href: body.error.href, label: body.error.hrefLabel ?? 'Open it' })
        // The same-person question is asked once, in the banner with its
        // button, never again under Name (press of 2026-11-15).
        if (body.error?.code === 'SAME_NAME') setNamesake(true)
        else if (body.error?.field) setFieldErrors({ [body.error.field]: body.error.message })
        return
      }
      const at = companies.find((c) => c.id === form.atCompanyId)
      onCreated(`${form.name.trim()} is in your Contacts at ${at?.name.replace(/ \(your own firm\)$/, '') ?? 'that company'}. Nothing was sent to them.`)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const field = (name: keyof typeof form, label: string, placeholder: string, type = 'text', required = false) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-etyme-muted">{label}</label>
      {/* required says so to a screen reader; noValidate on the form
          keeps the browser from blocking with a bubble nobody sees in a
          modal on a phone, so the sentence above is what explains it. */}
      <input
        required={required}
        aria-required={required || undefined}
        type={type}
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        aria-invalid={!!fieldErrors[name]}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${fieldErrors[name] ? 'border-etyme-attention' : 'border-etyme-rule'}`}
        placeholder={placeholder}
      />
      {fieldErrors[name] && <p className="mt-1 text-[12px] text-etyme-attention">{fieldErrors[name]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card mx-4 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">Add contact</h2>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            {errorLink && (
              <>
                {' '}
                <Link href={errorLink.href as Route} className="font-semibold underline">{errorLink.label}</Link>
              </>
            )}
            {namesake && (
              <div className="mt-3">
                <button type="button" className="btn-secondary text-[13px]" disabled={submitting} onClick={(e) => handleSubmit(e, true)}>
                  {ADD_ANYWAY}
                </button>
              </div>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Stacked on a phone, always. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('name', 'Name *', 'Dana Whitfield — first and last', 'text', true)}
            <div>
              <label className="mb-1 block text-xs font-semibold text-etyme-muted">Works at *</label>
              <select
                required
                aria-required="true"
                value={form.atCompanyId}
                onChange={(e) => chooseCompany(e.target.value)}
                aria-invalid={!!fieldErrors.atCompanyId}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${fieldErrors.atCompanyId ? 'border-etyme-attention' : 'border-etyme-rule'}`}
              >
                <option value="">Select…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {fieldErrors.atCompanyId && (
                <p className="mt-1 text-[12px] text-etyme-attention">{fieldErrors.atCompanyId}</p>
              )}
              {atOwnFirm && (
                <p className="mt-1 text-[12px] text-etyme-muted">
                  Saving a colleague here gives them no login and sends them nothing.
                  {mayInvite && <> A colleague who needs a login is invited under <Link href={USERS_HREF} className="text-etyme-action">Users &amp; permissions</Link>.</>}
                  {mayAddCandidate && <> A person you pay is added under <Link href={ADD_CANDIDATE_HREF} className="text-etyme-action">Candidates</Link>.</>}
                  {paysPeople && !mayAddCandidate && addsPeople.length > 0 && <> A person you pay is added under Candidates, by {addsPeople.length === 1 ? addsPeople[0] : `${addsPeople.slice(0, -1).join(', ')} or ${addsPeople[addsPeople.length - 1]}`}.</>}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('email', 'Email', 'dana@client.example', 'email')}
            {field('phone', 'Phone', '(303) 555-0100', 'tel')}
          </div>
          <p className="-mt-2 text-[12px] text-etyme-muted">An email address or a phone number. Either one is enough.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('title', 'Title', 'Director, Contingent Workforce')}
            <div>
              <label className="mb-1 block text-xs font-semibold text-etyme-muted">Their role at that firm (optional)</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full rounded-lg border border-etyme-rule bg-white px-3 py-2 text-sm"
              >
                {kinds.map((k) => (
                  <option key={k.key} value={k.key}>{k.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-etyme-muted">
                {atOwnFirm ? 'Not sure? Leave it on Team member.' : 'Not sure? Leave it on Other.'}
              </p>
              {fieldErrors.kind && <p className="mt-1 text-[12px] text-etyme-attention">{fieldErrors.kind}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Saving…' : 'Add contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
