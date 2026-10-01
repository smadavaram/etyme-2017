'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { readJson } from '@/lib/read-response'

/**
 * One week, and how the client approved it.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). Two ways a client approves a week
 * without signing in, and this is where both start and where both are read:
 *
 *   - **Approve by email** sends the client's approver a one-time link with
 *     Approve and Send back;
 *   - **Attach evidence** records an approval the client already gave by
 *     email — the email itself, a PDF, or an export from its own system —
 *     always naming the person who gave it.
 *
 * Only the worker on their own week, or the timesheet desk at a supplier
 * on the chain, sees the form; it picks the contracts the approval applies
 * to, all of them unless fewer are ticked. Every firm the approval applies
 * to reads it here with only its own contracts named, opens the evidence,
 * and each open is logged. No rate is shown, to anybody.
 */

interface Contract { id: string; label: string; mine?: boolean }
interface Approval {
  id: string
  how: 'LINK' | 'EVIDENCE'
  state: string
  words: string | null
  approverName: string
  approverEmail: string
  sentBy: string
  sentAt: string
  sendBack: string | null
  evidence: { kind: string; fileName: string; sizeBytes: number; href: string } | null
  contracts: Contract[]
}
interface Seen {
  week: { id: string; personName: string; period: string; totalHours: number; status: string; clientName: string; clientApproved: boolean }
  approvals: Approval[]
  act: { ok: true; as: string; contracts: Contract[]; refused: string | null } | { ok: false; says: string }
}

const STATE_WORDS: Record<string, { label: string; chip: string }> = {
  WAITING: { label: 'Link sent, waiting', chip: 'chip chip--action' },
  APPROVED: { label: 'Approved', chip: 'chip chip--verified' },
  SENT_BACK: { label: 'Sent back', chip: 'chip chip--attention' },
  CLOSED: { label: 'Link closed', chip: 'chip chip--passive' },
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`
}

export default function WeekPage() {
  const { id } = useParams<{ id: string }>()
  const [seen, setSeen] = useState<Seen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'LINK' | 'EVIDENCE'>('LINK')
  const [form, setForm] = useState({ approverName: '', approverEmail: '', kind: 'EMAIL', approvedOn: '', pastedText: '' })
  const [file, setFile] = useState<File | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [said, setSaid] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/week-approvals?timesheetId=${encodeURIComponent(id)}`))
      setSeen(body.data)
      if (body.data.act.ok) setPicked(new Set(body.data.act.contracts.map((c: Contract) => c.id)))
    } catch (err: any) {
      setError(err.message)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  async function send() {
    if (!seen || !seen.act.ok) return
    setBusy(true)
    setRefusal(null)
    setSaid(null)
    const all = seen.act.contracts.length === picked.size
    try {
      let res: Response
      if (mode === 'LINK') {
        res = await fetch('/api/week-approvals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            timesheetId: id, how: 'LINK', approverName: form.approverName, approverEmail: form.approverEmail,
            contracts: all ? null : [...picked],
          }),
        })
      } else {
        const fd = new FormData()
        fd.set('timesheetId', id)
        fd.set('how', 'EVIDENCE')
        fd.set('approverName', form.approverName)
        fd.set('approverEmail', form.approverEmail)
        fd.set('kind', form.kind)
        if (form.approvedOn) fd.set('approvedOn', form.approvedOn)
        if (file) fd.set('file', file)
        if (form.pastedText.trim()) fd.set('pastedText', form.pastedText)
        if (!all) for (const c of picked) fd.append('contracts', c)
        res = await fetch('/api/week-approvals', { method: 'POST', body: fd })
      }
      const body = await readJson(res)
      setSaid(body.data.says)
      await load()
    } catch (err: any) {
      setRefusal(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div>
  if (!seen) return <p className="text-[13px] text-etyme-muted">Loading the week…</p>

  const w = seen.week
  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      <header>
        <p className="eyebrow">Hours · {w.clientName}</p>
        <h1 className="headline-serif mt-2 text-[30px] leading-[1.1] text-balance">{w.personName}, {w.period}</h1>
        <p className="mt-2 text-[14px] text-etyme-muted">
          <span className="tabular-nums">{w.totalHours}</span> hours ·{' '}
          {w.status === 'APPROVED' ? 'approved by every firm' : w.clientApproved ? `approved by ${w.clientName}; the firms below accept it in turn` : w.status === 'SUBMITTED' ? `waiting on ${w.clientName}` : 'not sent in yet'}
        </p>
      </header>

      <section className="panel space-y-3">
        <p className="stat-label">Approved outside Etyme</p>
        {seen.approvals.length === 0 && <p className="text-[13px] text-etyme-muted">Nothing yet. A client’s approval by email, or the evidence of one, shows here.</p>}
        <ul className="divide-y divide-etyme-rule">
          {seen.approvals.map((a) => (
            <li key={a.id} className="space-y-1 py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className={STATE_WORDS[a.state]?.chip ?? 'chip chip--passive'}>{STATE_WORDS[a.state]?.label ?? a.state}</span>
                <span className="font-semibold">{a.words ?? `${a.how === 'LINK' ? 'Link to' : 'Evidence from'} ${a.approverName}`}</span>
              </div>
              <p className="text-etyme-muted">
                {a.approverName} · {a.approverEmail} · {a.how === 'LINK' ? 'link sent' : 'attached'} by {a.sentBy} on {a.sentAt}
              </p>
              {a.sendBack && <p className="text-etyme-attention">Sent back: {a.sendBack}</p>}
              {a.evidence && (
                <p>
                  <a className="text-etyme-action underline" href={a.evidence.href}>
                    Open the evidence
                  </a>{' '}
                  <span className="text-etyme-faint">— {a.evidence.kind}, {a.evidence.fileName}, {size(a.evidence.sizeBytes)}</span>
                </p>
              )}
              <p className="text-[12px] text-etyme-faint">Applies to: {a.contracts.map((c) => c.label).join(' · ')}</p>
            </li>
          ))}
        </ul>
      </section>

      {seen.act.ok && (
        <section className="panel space-y-3">
          <p className="stat-label">Get {w.clientName}’s approval without signing in</p>
          {seen.act.refused ? (
            <p className="text-[13px] text-etyme-muted">{seen.act.refused}</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button className={mode === 'LINK' ? 'filter-tab filter-tab--active' : 'filter-tab filter-tab--inactive'} onClick={() => setMode('LINK')}>
                  Approve by email
                </button>
                <button className={mode === 'EVIDENCE' ? 'filter-tab filter-tab--active' : 'filter-tab filter-tab--inactive'} onClick={() => setMode('EVIDENCE')}>
                  Attach evidence
                </button>
              </div>
              <p className="text-[13px] text-etyme-muted">
                {mode === 'LINK'
                  ? `The approver gets a link with Approve and Send back. No account needed. It works once and runs out in seven days.`
                  : `The approval ${w.clientName} already gave: the email, a PDF, or an export from its own system. Name the person who gave it.`}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={form.approverName} onChange={(e) => setForm({ ...form, approverName: e.target.value })} placeholder={`Approver at ${w.clientName}`} className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                <input value={form.approverEmail} onChange={(e) => setForm({ ...form, approverEmail: e.target.value })} placeholder="Their email address" className="rounded border border-etyme-rule px-3 py-2 text-[13px]" />
              </div>
              {mode === 'EVIDENCE' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded border border-etyme-rule px-3 py-2 text-[13px]">
                      <option value="EMAIL">The approval email</option>
                      <option value="PDF">A PDF</option>
                      <option value="EXPORT">An export from their own system</option>
                    </select>
                    <label className="flex items-center gap-2 text-[13px]">
                      Approved on
                      <input type="date" value={form.approvedOn} onChange={(e) => setForm({ ...form, approvedOn: e.target.value })} className="rounded border border-etyme-rule px-2 py-1 text-[13px]" />
                    </label>
                  </div>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
                  <textarea value={form.pastedText} onChange={(e) => setForm({ ...form, pastedText: e.target.value })} rows={3} placeholder="Or paste the approval email here" className="w-full rounded border border-etyme-rule px-3 py-2 text-[13px]" />
                </div>
              )}
              <div className="space-y-1">
                <p className="lbl">Applies to</p>
                {seen.act.contracts.map((c, i) => (
                  <label key={c.id} className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      // The client's own contract is where its signature is
                      // given, so it is always included.
                      disabled={i === 0}
                      onChange={(e) => {
                        const next = new Set(picked)
                        if (e.target.checked) next.add(c.id)
                        else next.delete(c.id)
                        setPicked(next)
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <button className="btn-primary" disabled={busy} onClick={send}>
                {mode === 'LINK' ? 'Send the link' : 'Attach and record the approval'}
              </button>
              {said && <p className="text-[13px] text-etyme-verified">{said}</p>}
              {refusal && <p className="text-[13px] text-etyme-attention">{refusal}</p>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
