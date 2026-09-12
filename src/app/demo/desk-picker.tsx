'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface Programme {
  slug: string
  name: string
  where: string
  about: string
}

/**
 * The desks at a client programme, in the words of the person at each.
 *
 * What is waiting is stated because it is seeded that way — the point of
 * a desk is to find your own work on it, not a tour.
 */
const DESKS: { desk: string; label: string; waiting: string }[] = [
  { desk: 'programme', label: 'Programme manager', waiting: 'Runs the programme. Sets the rules, chooses the suppliers, sees the spend.' },
  { desk: 'hiring', label: 'Hiring manager', waiting: 'Needs somebody. A week of hours is waiting for your signature.' },
  { desk: 'hr', label: 'HR partner', waiting: 'A requisition over the headcount plan is waiting for your read of the role.' },
  { desk: 'procurement', label: 'Procurement lead', waiting: 'A requisition is waiting for you to say which suppliers may see it.' },
  { desk: 'vp', label: 'Approver', waiting: 'A requisition over the $250k line is in your queue.' },
  { desk: 'ap', label: 'Accounts payable', waiting: 'An invoice has matched the hours and is waiting to be paid.' },
  { desk: 'compliance', label: 'Compliance officer', waiting: 'Tenure across every supplier, and whose paperwork is not on file.' },
]

export function DeskPicker({ programmes, supplier = false }: { programmes: Programme[]; supplier?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sit(slug: string, desk?: string) {
    const key = `${slug}:${desk ?? ''}`
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(desk ? { as: slug, desk } : { as: slug }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not take that seat.')
      router.push(body.data?.landing ?? '/dashboard')
    } catch (err: any) {
      setError(err.message)
      setBusy(null)
    }
  }

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {programmes.map((p) => (
        <section key={p.slug} className="panel flex flex-col p-5">
          <p className="eyebrow">{p.where}</p>
          <h2 className="mt-1 font-serif text-2xl tracking-[-0.02em]">{p.name}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-etyme-muted">{p.about}</p>

          {supplier ? (
            <button
              onClick={() => sit(p.slug)}
              disabled={busy !== null}
              className="btn-primary mt-5 disabled:opacity-50"
            >
              {busy === `${p.slug}:` ? 'Taking the seat…' : `Sit at ${p.name}`}
            </button>
          ) : (
            <ul className="mt-5 flex flex-col divide-y divide-etyme-rule border-t border-etyme-rule">
              {DESKS.map((d) => (
                <li key={d.desk}>
                  <button
                    onClick={() => sit(p.slug, d.desk)}
                    disabled={busy !== null}
                    className="group flex w-full flex-col items-start gap-0.5 py-3 text-left transition-colors
                               hover:text-etyme-action disabled:opacity-50"
                  >
                    <span className="text-sm font-medium">
                      {busy === `${p.slug}:${d.desk}` ? 'Taking the seat…' : d.label}
                      <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </span>
                    <span className="text-[12px] leading-snug text-etyme-faint group-hover:text-etyme-muted">
                      {d.waiting}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {error && (
        <p className="md:col-span-3 text-sm text-etyme-danger">
          {error}
          {/seed-world/.test(error) && ' The shared programmes have to be seeded once by whoever runs this deployment.'}
        </p>
      )}
    </div>
  )
}
