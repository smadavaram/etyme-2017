'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
import { datesHelp, applyHeading } from '@/lib/supplier-onboarding'
import { useCallback, useEffect, useState } from 'react'

/**
 * The firm's own page.
 *
 * A client is considering this firm as a supplier and Procurement needs
 * its side: a W-9, a certificate of insurance, bank details, past
 * experience, two references, and if it has them, revenue proof and a
 * proposal. One page, nothing to sign up for, come back as often as it
 * takes. Files are recorded by name against the item they answer; the
 * client's Procurement desk verifies each one before it counts.
 */

interface Ask {
  key: string; label: string; required: boolean; state: string; fileName: string | null
  says?: string | null
  /** Whether the desk will be asked for the two dates before it can verify it. */
  wantsDates?: boolean
  validFrom?: string | null
  validUntil?: string | null
}
interface Apply {
  client: string
  firm: string
  contactName: string | null
  decided: boolean
  state: string
  /** Once approved: the sentence and the link to take the account. */
  claim: { says: string; url: string } | null
  asks: Ask[]
  application: Record<string, any> | null
  /** What the form opens with (`applyPrefill` in lib/supplier-link). */
  prefill: {
    legalName: string; address: string; website: string; skills: string
    bank: { bankName: string; accountName: string; last4: string } | null
    references: { name: string; company: string; email: string; phone: string }[]
    sentBefore: { key: string; fileName: string; requestId: string; clientName: string; at: string; says: string }[]
    referencesSays: string | null
    signedInAtFirm: boolean
  } | null
}

/**
 * A field with its label above it, always: a placeholder is gone the
 * moment somebody types, and a filled form of twenty-five boxes with no
 * words beside them cannot be checked (release walk, 2026-10-27).
 */
function Labelled({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-etyme-muted">{label}</span>
      {children}
    </label>
  )
}

const BOX = 'w-full rounded border border-etyme-rule px-3 py-2 text-[13px]'
const EMPTY_REF = { name: '', company: '', email: '', phone: '' }

/**
 * The three things a firm answers with something other than a file.
 *
 * An exclusion rather than a list of files, because the list of files is
 * the client's now: a client that requires a certificate of good standing
 * or its own site induction on every order has that item on this page,
 * and a fixed set of four keys gave it a line in "what we ask for" and
 * nowhere to upload it.
 */
const NOT_A_FILE = new Set(['BANK', 'EXPERIENCE', 'REFERENCES'])

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<Apply | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ legalName: '', address: '', duns: '', website: '', experience: '', skills: '', bankName: '', accountName: '', last4: '' })
  const [refs, setRefs] = useState([{ name: '', company: '', email: '', phone: '' }, { name: '', company: '', email: '', phone: '' }])
  /** The file itself, read in the browser, so the client's team has something to examine. */
  const [files, setFiles] = useState<Record<string, { fileName: string; size: number; type: string; content: string }>>({})
  /**
   * The two dates printed on a certificate, typed by the firm that holds
   * it. They are not a verdict: a desk still verifies the document, and
   * what is typed here is what the desk sees in the boxes rather than a
   * blank form filled in off a PDF. Without them the desk cannot call the
   * item verified at all, so asking the firm that has the paper in its
   * hand is the cheapest place to ask.
   */
  const [dates, setDates] = useState<Record<string, { validFrom: string; validUntil: string }>>({})

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/supplier-apply/${token}`))
      setData(body.data)
      const a = body.data.application ?? {}
      const p = body.data.prefill
      if (p) {
        setForm((f) => ({
          ...f,
          legalName: p.legalName, address: p.address, website: p.website, skills: p.skills,
          duns: a.duns ?? '', experience: a.experience ?? '',
          bankName: p.bank?.bankName ?? '', accountName: p.bank?.accountName ?? '', last4: p.bank?.last4 ?? '',
        }))
        if (p.references.length) setRefs([...p.references, EMPTY_REF].slice(0, Math.max(2, p.references.length)))
      }
    } catch (err: any) {
      setError(err.message)
    }
  }, [token])
  useEffect(() => { load() }, [load])

  /** The papers sent to another client, sent again here in one click. */
  async function sendAgain() {
    if (!data?.prefill?.sentBefore.length) return
    setBusy(true); setSaid(null); setError(null)
    try {
      const body = await readJson(await fetch(`/api/supplier-apply/${token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reuse: data.prefill.sentBefore.map((b) => ({ requestId: b.requestId, key: b.key })),
          references: refs.filter((r) => r.name || r.company),
        }),
      }))
      setSaid(body.data.says)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    setBusy(true); setSaid(null); setError(null)
    try {
      const body = await readJson(await fetch(`/api/supplier-apply/${token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          legalName: form.legalName, address: form.address, duns: form.duns, website: form.website, experience: form.experience, skills: form.skills,
          bank: { bankName: form.bankName, accountName: form.accountName, last4: form.last4 },
          references: refs.filter((r) => r.name || r.company),
          docs: Object.entries(files).map(([key, f]) => ({
            key, fileName: f.fileName, size: f.size, type: f.type, content: f.content,
            validFrom: dates[key]?.validFrom || null,
            validUntil: dates[key]?.validUntil || null,
          })),
        }),
      }))
      setSaid(body.data.says)
      setFiles({})
      setDates({})
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pick = (key: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    // The bytes go with the name, as base64: the route keeps the file, not just what it was called.
    const buf = new Uint8Array(await f.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    setFiles((cur) => ({ ...cur, [key]: { fileName: f.name, size: f.size, type: f.type || 'application/octet-stream', content: btoa(bin) } }))
  }

  return (
    <main className="min-h-screen bg-etyme-canvas px-4 py-10 text-etyme-ink">
      <div className="mx-auto max-w-[720px]">
        <EtymeLogo />
        {error && !data && <div className="panel mt-8"><p className="text-[13px] text-etyme-attention">{error}</p></div>}
        {data && (
          <div className="mt-8 space-y-6">
            <header>
              <p className="eyebrow">{applyHeading({ clientName: data.client, decided: data.decided, state: data.state })}</p>
              <h1 className="headline-serif mt-2 text-[32px] leading-[1.05]">{data.firm}</h1>
              <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
                {data.decided
                  ? data.claim
                    ? <>{data.claim.says} <a href={data.claim.url} className="text-etyme-action underline">{data.claim.url}</a></>
                    : `${data.client} has ${data.state === 'APPROVED' ? 'approved' : 'decided on'} ${data.firm}. This link has done its job.`
                  : `${data.contactName ? `${data.contactName.split(' ')[0]}, ` : ''}Procurement at ${data.client} needs a few things before they can say yes. Supply them here — in one sitting or several. Nothing to sign up for.`}
              </p>
            </header>

            {!data.decided && (
              <>
                <section className="panel space-y-2">
                  <p className="stat-label">What {data.client} asks for</p>
                  <ul className="divide-y divide-etyme-rule">
                    {data.asks.map((a) => (
                      <li key={a.key} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <span className={`w-5 text-center ${a.state === 'HELD' ? 'text-etyme-verified' : a.state === 'PROVIDED' ? 'text-etyme-action' : 'text-etyme-faint'}`}>{a.state === 'HELD' ? '✓' : a.state === 'PROVIDED' ? '•' : '○'}</span>
                        <span className="flex-1 min-w-[200px]">
                          {a.label}{!a.required && <span className="text-etyme-faint"> · if you have it</span>}
                          {a.says && <span className="block text-[11px] text-etyme-faint">{a.says}</span>}
                        </span>
                        <span className="text-[12px] text-etyme-faint">
                          {a.state === 'HELD' ? 'verified' : a.state === 'PROVIDED' ? `received${a.fileName ? ` · ${a.fileName}` : ''}` : a.state === 'WAIVED' ? 'not needed' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Your firm</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Labelled label="Legal name"><input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className={BOX} /></Labelled>
                    <Labelled label="Website"><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={BOX} /></Labelled>
                    <Labelled label="Registered address" className="sm:col-span-2"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={BOX} /></Labelled>
                    <Labelled label="D-U-N-S number, if you have one"><input value={form.duns} onChange={(e) => setForm({ ...form, duns: e.target.value })} className={BOX} /></Labelled>
                    <Labelled label="What you supply — jobs, skills"><input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className={BOX} /></Labelled>
                  </div>
                  <Labelled label="Past experience and delivery — who you placed, where, how long they stayed">
                    <textarea value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} rows={4} className={BOX} />
                  </Labelled>
                </section>

                {data.prefill && data.prefill.sentBefore.length > 0 && (
                  <section className="panel space-y-3">
                    <p className="stat-label">Sent before</p>
                    <ul className="divide-y divide-etyme-rule">
                      {data.prefill.sentBefore.map((b) => (
                        <li key={b.key} className="py-2 text-[13px]">
                          {data.asks.find((a) => a.key === b.key)?.label ?? b.key} — {b.fileName}
                          <span className="block text-[11px] text-etyme-faint">{b.says}</span>
                        </li>
                      ))}
                    </ul>
                    <button onClick={sendAgain} disabled={busy} className="rounded-lg border border-etyme-action px-4 py-2 text-[13px] font-semibold text-etyme-action disabled:opacity-40">
                      {busy ? 'Sending…' : `Send these to ${data.client}`}
                    </button>
                  </section>
                )}

                <section className="panel space-y-3">
                  <p className="stat-label">Documents</p>
                  {data.asks.filter((a) => !NOT_A_FILE.has(a.key)).map((a) => (
                    <label key={a.key} className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="flex-1 min-w-[220px]">
                        {a.label}
                        {a.says && <span className="block text-[11px] text-etyme-faint">{a.says}</span>}
                      </span>
                      <input type="file" onChange={pick(a.key)} className="text-[12px]" aria-label={a.label} />
                      {files[a.key] && <span className="text-[12px] text-etyme-action">{files[a.key].fileName}</span>}
                      {!files[a.key] && a.fileName && <span className="text-[12px] text-etyme-faint">on file: {a.fileName}</span>}
                      {a.wantsDates && (
                        <span className="flex w-full flex-wrap items-center gap-2 pl-0 text-[12px] text-etyme-muted">
                          <span className="w-full text-[11px] text-etyme-faint">
                            {datesHelp(a.key)}
                          </span>
                          <label className="flex items-center gap-1">
                            Starts
                            <input
                              type="date"
                              value={dates[a.key]?.validFrom ?? (a.validFrom ? a.validFrom.slice(0, 10) : '')}
                              onChange={(e) => setDates((cur) => ({ ...cur, [a.key]: { validFrom: e.target.value, validUntil: cur[a.key]?.validUntil ?? (a.validUntil ? a.validUntil.slice(0, 10) : '') } }))}
                              aria-label={`${a.label} starts`}
                              className="rounded border border-etyme-rule px-2 py-1 text-[12px]"
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            Runs out
                            <input
                              type="date"
                              value={dates[a.key]?.validUntil ?? (a.validUntil ? a.validUntil.slice(0, 10) : '')}
                              onChange={(e) => setDates((cur) => ({ ...cur, [a.key]: { validFrom: cur[a.key]?.validFrom ?? (a.validFrom ? a.validFrom.slice(0, 10) : ''), validUntil: e.target.value } }))}
                              aria-label={`${a.label} runs out`}
                              className="rounded border border-etyme-rule px-2 py-1 text-[12px]"
                            />
                          </label>
                        </span>
                      )}
                    </label>
                  ))}
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Bank details for payment</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Labelled label="Bank"><input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className={BOX} /></Labelled>
                    <Labelled label="Account name"><input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} className={BOX} /></Labelled>
                    <Labelled label="Last four digits"><input value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value })} inputMode="numeric" className={BOX} /></Labelled>
                  </div>
                  <p className="text-[12px] text-etyme-faint">Only the bank, the account name and the last four digits are kept here. Full details go on the payment form {data.client} sends once you are approved.</p>
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Two references</p>
                  {data.prefill?.referencesSays && <p className="text-[11px] text-etyme-faint">{data.prefill.referencesSays}</p>}
                  {refs.map((r, i) => (
                    <fieldset key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <legend className="mb-1 text-[11px] text-etyme-faint">Reference {i + 1}</legend>
                      <Labelled label="Name"><input value={r.name} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={BOX} /></Labelled>
                      <Labelled label="Company"><input value={r.company} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)))} className={BOX} /></Labelled>
                      <Labelled label="Email"><input value={r.email} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} className={BOX} /></Labelled>
                      <Labelled label="Phone"><input value={r.phone} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} className={BOX} /></Labelled>
                    </fieldset>
                  ))}
                </section>

                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={send} disabled={busy} className="rounded-lg bg-etyme-action px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-40">
                    {busy ? 'Sending…' : `Send to ${data.client}`}
                  </button>
                  <span className="text-[12px] text-etyme-faint">You can come back and add the rest later.</span>
                </div>
                {said && <p className="text-[13px] text-etyme-verified">{said}</p>}
                {error && <p className="text-[13px] text-etyme-attention">{error}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
