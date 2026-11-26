'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { formatDay } from '@/lib/format-date'
import type { SoldWorkProject } from '@/app/api/program/pods/read'

/**
 * Work the client bought as a team: each project, its deliverables, who
 * decides them and what was decided (record 120). Drawn only where there is
 * one. Words: project, deliverable, team. Never a member, a cost or a firm.
 */

const REASONS = [
  { code: 'SCOPE_INCOMPLETE', label: 'Scope incomplete' },
  { code: 'QUALITY', label: 'Quality' },
  { code: 'EVIDENCE_MISSING', label: 'No evidence' },
  { code: 'LATE', label: 'Late' },
  { code: 'DISPUTED_AMOUNT', label: 'Amount disputed' },
  { code: 'SUPERSEDED', label: 'Superseded' },
]

export function SoldWork() {
  const [projects, setProjects] = useState<SoldWorkProject[] | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [says, setSays] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/program/pods')
      const parsed = await readJson(res)
      setProjects(parsed.data.projects)
    } catch {
      setProjects([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function decide(id: string, accept: boolean, reason?: string) {
    try {
      const res = await fetch(`/api/program/milestones/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept, reason }),
      })
      const parsed = await readJson(res)
      setSays({ text: parsed.data.says })
      setRejecting(null)
      load()
    } catch (e: any) {
      setSays({ text: e.message, bad: true })
    }
  }

  if (!projects || projects.length === 0) return null
  return (
    <section>
      <h2 className="font-serif text-lg text-etyme-ink mb-3">Projects</h2>
      {says && <p className={`text-sm mb-2 ${says.bad ? 'text-etyme-danger' : 'text-etyme-verified'}`}>{says.text}</p>}
      <div className="space-y-4">
        {projects.map((p) => (
          <div key={p.name} className="bg-etyme-surface border border-etyme-rule rounded-lg">
            <div className="p-4 border-b border-etyme-rule">
              <p className="text-sm text-etyme-ink">{p.name}{p.fulfilled && <span className="chip ml-2">Fulfilled</span>}</p>
              <p className="text-xs text-etyme-muted">
                Team of {p.headcount}: {p.roles.map((r) => `${r.headcount} ${r.title}`).join(', ')}
              </p>
              <p className="text-xs text-etyme-muted">Decided by {p.acceptor.isYou ? 'you' : p.acceptor.name}</p>
            </div>
            <div className="divide-y divide-etyme-rule">
              {p.deliverables.map((d) => (
                <div key={d.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm text-etyme-ink">{d.name}</p>
                      <p className="text-xs text-etyme-muted">
                        {d.dueOn ? `Due ${formatDay(d.dueOn)}` : 'No due date'}
                        {d.acceptedAt && ` · accepted ${formatDay(d.acceptedAt)}`}
                        {d.reason && ` · rejected: ${d.reason}`}
                      </p>
                    </div>
                    <span className="chip">{d.state}</span>
                    {d.mayDecide && (
                      <div className="flex gap-2">
                        <button onClick={() => decide(d.id, true)} className="text-xs px-3.5 py-2 bg-etyme-verified text-white rounded">Accept</button>
                        <button onClick={() => setRejecting(rejecting === d.id ? null : d.id)} className="text-xs px-3 py-2 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink">Reject</button>
                      </div>
                    )}
                  </div>
                  {rejecting === d.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {REASONS.map((r) => (
                        <button key={r.code} onClick={() => decide(d.id, false, r.code)} className="text-xs px-3 py-1.5 border border-etyme-rule rounded hover:border-etyme-attention hover:text-etyme-attention">{r.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
