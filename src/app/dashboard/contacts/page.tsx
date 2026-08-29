'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Who we work with, and who to call there.
 *
 * Two tabs over one idea. Companies is the register — who they are to
 * us, whether an agreement backs it, whether anything is live between
 * us. People is the rolodex — the humans at those firms, by what you
 * would call them about.
 *
 * A working surface: search first, dense rows, every state handled.
 */

const TABS = ['PEOPLE', 'COMPANIES'] as const
type Tab = (typeof TABS)[number]

export default function ContactsPage() {
  const [tab, setTab] = useState<Tab>('PEOPLE')
  const [contacts, setContacts] = useState<any>(null)
  const [reg, setReg] = useState<any>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, r] = await Promise.all([
        fetch(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
        fetch('/api/counterparties'),
      ])
      const cb = await c.json()
      const rb = await r.json()
      if (!c.ok) throw new Error(cb.error?.message ?? `HTTP ${c.status}`)
      if (!r.ok) throw new Error(rb.error?.message ?? `HTTP ${r.status}`)
      setContacts(cb.data)
      setReg(rb.data)
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

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Operate</p>
        <h1 className="headline-serif text-[30px] leading-tight">Who we work with</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-etyme-muted">
          The register of firms and the people at them. Private to this
          company — a rolodex is a commercial asset, and nobody else&rsquo;s
          screen shows yours.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-etyme-rule pb-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-1 pb-1 text-[13px] capitalize"
            style={
              tab === t
                ? { borderBottom: '2px solid var(--color-action)', color: 'var(--color-ink)', fontWeight: 600 }
                : { color: 'var(--color-muted)' }
            }
          >
            {t === 'PEOPLE' ? 'People' : 'Companies'}
          </button>
        ))}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search names, companies, titles"
          className="ml-auto w-full rounded-lg border border-etyme-rule px-3 py-1.5 text-[13px] sm:w-64"
        />
        {tab === 'PEOPLE' && (
          <button onClick={() => setAdding(true)} className="btn-primary text-[13px]">
            Add contact
          </button>
        )}
      </div>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}
      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {/* ── People ─────────────────────────────────────────── */}
      {!loading && tab === 'PEOPLE' && contacts && (
        <>
          <div className="flex flex-wrap gap-2">
            {contacts.kinds.map((k: any) => (
              <button
                key={k.key}
                onClick={() => setKind(kind === k.key ? null : k.key)}
                className={`chip ${kind === k.key ? 'chip--action' : 'chip--passive'}`}
                title={k.callAbout}
              >
                {k.label}
              </button>
            ))}
          </div>

          {people.map((c: any) => (
            <article key={c.id} className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{c.name}</p>
                  <p className="text-[12px] text-etyme-faint">
                    {[c.title, c.at.name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.joined && <span className="chip chip--verified">on the platform</span>}
                  <span className="chip chip--passive">{c.kindLabel}</span>
                </div>
              </div>
              {c.callAbout && (
                <p className="mt-1 text-[12px] text-etyme-muted">Call about: {c.callAbout}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-etyme-muted">
                {c.email && <a href={`mailto:${c.email}`} style={{ color: 'var(--color-action)' }}>{c.email}</a>}
                {c.phone && <span className="tabular-nums">{c.phone}</span>}
              </div>
            </article>
          ))}

          {people.length === 0 && (
            <div className="panel">
              <p className="text-[13px] text-etyme-muted">
                {q || kind
                  ? 'Nobody matches that.'
                  : 'Nobody on the rolodex yet. Add the person you most recently phoned — the hiring manager, the AP clerk — and it stops being empty.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Companies ──────────────────────────────────────── */}
      {!loading && tab === 'COMPANIES' && reg && (
        <>
          {reg.rows
            .filter((r: any) => !q || r.otherCompanyName.toLowerCase().includes(q.toLowerCase()))
            .map((r: any) => (
              <article key={`${r.otherCompanyId}:${r.relationship}`} className="panel">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px] font-semibold text-etyme-ink">{r.otherCompanyName}</p>
                  <div className="flex items-center gap-2">
                    {r.status === 'BLOCKED' && <span className="chip chip--attention">blocked</span>}
                    {r.status === 'PROSPECT' && <span className="chip chip--passive">prospect</span>}
                    {r.hasAgreement && <span className="chip chip--verified">agreement on file</span>}
                    <span className="chip chip--action">{r.relationship.toLowerCase()}</span>
                  </div>
                </div>
                <p className="mt-1 text-[13px] text-etyme-muted">{r.says}</p>
                <p className="mt-1 text-[12px] text-etyme-faint">
                  {r.contacts > 0
                    ? `${r.contacts} contact${r.contacts === 1 ? '' : 's'} on file`
                    : 'No contacts on file — a counterparty with nobody to call is a logo, not a relationship.'}
                </p>
              </article>
            ))}

          {reg.rows.length === 0 && (
            <div className="panel">
              <p className="text-[13px] text-etyme-muted">
                No counterparties yet. Add a company from the Companies screen and
                say what they are to you, or invite a supplier — either writes the
                register.
              </p>
            </div>
          )}
        </>
      )}

      {adding && contacts && (
        <AddContactModal
          companies={(reg?.rows ?? []).map((r: any) => ({ id: r.otherCompanyId, name: r.otherCompanyName }))}
          kinds={contacts.kinds}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddContactModal({
  companies,
  kinds,
  onClose,
  onCreated,
}: {
  companies: { id: string; name: string }[]
  kinds: { key: string; label: string; callAbout: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', atCompanyId: '', kind: 'OTHER' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Checked here, not left to the browser. A native refusal inside a
  // modal on a phone is invisible — the Add consultant form proved it.
  function problems(): Record<string, string> {
    const p: Record<string, string> = {}
    if (form.name.trim().length < 2) p.name = 'A name, so somebody knows who they are calling.'
    if (!form.atCompanyId) p.atCompanyId = 'Say which company they work at.'
    const email = form.email.trim()
    if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      p.email = `"${email}" is not an email address. Leave it blank if you only have a phone number.`
    }
    return p
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const found = problems()
    setFieldErrors(found)
    if (Object.keys(found).length > 0) {
      setError(Object.values(found)[0])
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error?.message ?? 'Could not save the contact.')
        if (body.error?.field) setFieldErrors({ [body.error.field]: body.error.message })
        return
      }
      onCreated()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const field = (name: keyof typeof form, label: string, placeholder: string, type = 'text') => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-etyme-muted">{label}</label>
      <input
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
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Stacked on a phone, always. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('name', 'Name *', 'Dana Whitfield — first and last')}
            <div>
              <label className="mb-1 block text-xs font-semibold text-etyme-muted">Works at *</label>
              <select
                value={form.atCompanyId}
                onChange={(e) => setForm({ ...form, atCompanyId: e.target.value })}
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
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('email', 'Email', 'dana@client.com', 'email')}
            {field('phone', 'Phone', '(303) 555-0100', 'tel')}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('title', 'Title', 'Director, Contingent Workforce')}
            <div>
              <label className="mb-1 block text-xs font-semibold text-etyme-muted">What you call them about</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full rounded-lg border border-etyme-rule bg-white px-3 py-2 text-sm"
              >
                {kinds.map((k) => (
                  <option key={k.key} value={k.key}>{k.label}</option>
                ))}
              </select>
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
