'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CLIENT_DESKS, type ClientProgram, type Program } from './seats'

/**
 * The doors on /demo, drawn three ways.
 *
 * A client program is several jobs, so it draws a row of desks and one
 * click seats you at the one that is yours. A supplying firm is one
 * seat: the delivery manager or the owner, whoever holds the book. A
 * person is neither — they are the only one at their own seat, which is
 * the whole difference between a firm and the person the work is about.
 *
 * All three post to the same route with the same three shapes of body
 * (`{as, desk}`, `{as}`, `{person}`) and land wherever it says. Nothing
 * about which seats exist or where they land is decided here.
 */

/** POST /api/demo, and go where it says. One place, so three doors cannot drift. */
function useSeat() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sit(key: string, body: Record<string, string>) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const answer = await res.json()
      if (!res.ok) throw new Error(answer.error?.message ?? 'Could not take that seat.')
      router.push(answer.data?.landing ?? '/dashboard')
    } catch (err: any) {
      setError(err.message)
      setBusy(null)
    }
  }

  return { busy, error, sit }
}

/** The refusal, in the words the route used, with the one thing to do about it. */
function Refusal({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="mt-4 text-sm leading-relaxed text-etyme-danger">
      {error}
      {/seed-world/.test(error) &&
        ' The shared programs have to be seeded once by whoever runs this deployment.'}
    </p>
  )
}

/**
 * The three client programs, each with its desks as a row of chips.
 *
 * The town and one true sentence about what is waiting there today,
 * then the desks. A visitor who has run a contingent program for ten
 * years reads their own job title and presses it; nobody has to be told
 * what a program manager is.
 */
export function ProgramDoors({ programs }: { programs: ClientProgram[] }) {
  const { busy, error, sit } = useSeat()

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {programs.map((p) => (
          <section key={p.slug} className="panel flex flex-col p-5">
            <p className="eyebrow">{p.where}</p>
            <h3 className="mt-1 font-serif text-[26px] leading-tight tracking-[-0.02em]">
              {p.name}
            </h3>
            <p className="mt-3 text-[14px] leading-relaxed">{p.waiting}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-etyme-muted">{p.about}</p>

            <p className="lbl mt-auto pt-5 text-etyme-faint">Sit at a desk</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CLIENT_DESKS.map((d) => {
                const key = `${p.slug}:${d.desk}`
                return (
                  <button
                    key={d.desk}
                    onClick={() => sit(key, { as: p.slug, ...(d.desk ? { desk: d.desk } : {}) })}
                    disabled={busy !== null}
                    title={d.waiting}
                    className="rounded-md border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[12px]
                               font-medium transition-colors hover:border-etyme-action
                               hover:text-etyme-action disabled:opacity-50"
                  >
                    {busy === key ? 'Taking the seat…' : d.label}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <Refusal error={error} />
    </div>
  )
}

/**
 * A supplying firm: one seat, one button, both halves of its book named.
 *
 * Quieter than the programs above on purpose. The client is the
 * customer; a supplier is here because its client is, and reads this
 * over the client's shoulder.
 */
export function FirmDoors({ firms }: { firms: Program[] }) {
  const { busy, error, sit } = useSeat()

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {firms.map((f) => (
          <section key={f.slug} className="flex flex-col rounded-panel border border-etyme-rule p-4">
            <p className="eyebrow">{f.where}</p>
            <h3 className="mt-1 font-serif text-[19px] leading-tight tracking-[-0.02em]">{f.name}</h3>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-etyme-muted">{f.about}</p>
            <button
              onClick={() => sit(f.slug, { as: f.slug })}
              disabled={busy !== null}
              className="mt-4 self-start text-[13px] font-medium text-etyme-action
                         transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              {busy === f.slug ? 'Taking the seat…' : `Sit at ${f.name} →`}
            </button>
          </section>
        ))}
      </div>
      <Refusal error={error} />
    </div>
  )
}

/**
 * A person, who is not a firm.
 *
 * Asked for by name — the route looks the handle up in the seat list
 * rather than trusting an address off the wire — and always lands on
 * `/dashboard/my-work`, which is the one page in this product that
 * belongs to a person and not to a company.
 */
export function PersonDoors({ people }: { people: Program[] }) {
  const { busy, error, sit } = useSeat()

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {people.map((c) => (
          <section key={c.slug} className="flex flex-col rounded-panel border border-etyme-rule p-4">
            <p className="eyebrow">{c.where}</p>
            <h3 className="mt-1 font-serif text-[19px] leading-tight tracking-[-0.02em]">{c.name}</h3>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-etyme-muted">{c.about}</p>
            <button
              onClick={() => sit(c.slug, { person: c.slug })}
              disabled={busy !== null}
              className="mt-4 self-start text-[13px] font-medium text-etyme-action
                         transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              {busy === c.slug ? 'Taking the seat…' : `Sit as ${c.name.split(' ')[0]} →`}
            </button>
          </section>
        ))}
      </div>
      <Refusal error={error} />
    </div>
  )
}
