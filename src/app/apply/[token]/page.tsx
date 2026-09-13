'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
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

interface Ask { key: string; label: string; required: boolean; state: string; fileName: string | null }
interface Apply {
  client: string
  firm: string
  contactName: string | null
  decided: boolean
  state: string
  asks: Ask[]
  application: Record<string, any> | null
}

const FILE_KEYS = new Set(['TAX_FORM', 'INSURANCE', 'REVENUE', 'PROPOSAL'])

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<Apply | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ legalName: '', address: '', duns: '', website: '', experience: '', skills: '', bankName: '', accountName: '', last4: '' })
  const [refs, setRefs] = useState([{ name: '', company: '', email: '', phone: '' }, { name: '', company: '', email: '', phone: '' }])
  const [files, setFiles] = useState<Record<string, { fileName: string; size: number }>>({})

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/supplier-apply/${token}`))
      setData(body.data)
      const a = body.data.application
      if (a) {
        setForm((f) => ({ ...f, legalName: a.legalName ?? '', address: a.address ?? '', duns: a.duns ?? '', website: a.website ?? '', experience: a.experience ?? '', skills: (a.skills ?? []).join(', '), bankName: a.bank?.bankName ?? '', accountName: a.bank?.accountName ?? '', last4: a.bank?.last4 ?? '' }))
        if (Array.isArray(a.references) && a.references.length) setRefs([...a.references, { name: '', company: '', email: '', phone: '' }].slice(0, Math.max(2, a.references.length)))
      }
    } catch (err: any) {
      setError(err.message)
    }
  }, [token])
  useEffect(() => { load() }, [load])

  async function send() {
    setBusy(true); setSaid(null); setError(null)
    try {
      const body = await readJson(await fetch(`/api/supplier-apply/${token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          legalName: form.legalName, address: form.address, duns: form.duns, website: form.website, experience: form.experience, skills: form.skills,
          bank: { bankName: form.bankName, accountName: form.accountName, last4: form.last4 },
          references: refs.filter((r) => r.name || r.company),
          docs: Object.entries(files).map(([key, f]) => ({ key, fileName: f.fileName, size: f.size })),
        }),
      }))
      setSaid(body.data.says)
      setFiles({})
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pick = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFiles((cur) => ({ ...cur, [key]: { fileName: f.name, size: f.size } }))
  }

  return (
    <main className="min-h-screen bg-etyme-canvas px-4 py-10 text-etyme-ink">
      <div className="mx-auto max-w-[720px]">
        <EtymeLogo />
        {error && !data && <div className="panel mt-8"><p className="text-[13px] text-etyme-attention">{error}</p></div>}
        {data && (
          <div className="mt-8 space-y-6">
            <header>
              <p className="eyebrow">{data.client} is considering you as a supplier</p>
              <h1 className="headline-serif mt-2 text-[32px] leading-[1.05]">{data.firm}</h1>
              <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
                {data.decided
                  ? `${data.client} has ${data.state === 'APPROVED' ? 'approved' : 'decided on'} ${data.firm}. This link has done its job.`
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
                        <span className="flex-1 min-w-[200px]">{a.label}{!a.required && <span className="text-etyme-faint"> · if you have it</span>}</span>
                        <span className="text-[12px] text-etyme-faint">
                          {a.state === 'HELD' ? 'verified' : a.state === 'PROVIDED' ? `received${a.fileName ? ` · ${a.fileName}` : ''}` : a.state === 'WAIVED' ? 'not needed' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Your firm</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Legal name" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                    <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                    <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Registered address" className="rounded border border-etyme-rule px-3 py-2 text-[13px] sm:col-span-2" />
                    <input value={form.duns} onChange={(e) => setForm({ ...form, duns: e.target.value })} placeholder="D-U-N-S number (if you have one)" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                    <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="What you supply — roles, skills" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                  </div>
                  <textarea value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} rows={4} placeholder="Past experience and delivery — who you have placed, where, how long they stayed" className="w-full rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Documents</p>
                  {data.asks.filter((a) => FILE_KEYS.has(a.key)).map((a) => (
                    <label key={a.key} className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="flex-1 min-w-[220px]">{a.label}</span>
                      <input type="file" onChange={pick(a.key)} className="text-[12px]" aria-label={a.label} />
                      {files[a.key] && <span className="text-[12px] text-etyme-action">{files[a.key].fileName}</span>}
                      {!files[a.key] && a.fileName && <span className="text-[12px] text-etyme-faint">on file: {a.fileName}</span>}
                    </label>
                  ))}
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Bank details for payment</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                    <input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Account name" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                    <input value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value })} placeholder="Last four digits" inputMode="numeric" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                  </div>
                  <p className="text-[12px] text-etyme-faint">Only the bank, the account name and the last four digits are kept here. Full details go on the payment form {data.client} sends once you are approved.</p>
                </section>

                <section className="panel space-y-3">
                  <p className="stat-label">Two references</p>
                  {refs.map((r, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <input value={r.name} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                      <input value={r.company} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)))} placeholder="Company" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                      <input value={r.email} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                      <input value={r.phone} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Phone" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                    </div>
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
