'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CLIENT_DESKS, type ClientDesk, type ClientProgram, type Program } from './seats'
import { visitId } from '@/lib/public-site/count'

/**
 * The doors on /demo, drawn two ways since 2026-10-15.
 *
 * The founder, on a drawing of every public page cut to one screen:
 * "no one is reading large content … make it real and make it simple".
 * So a client is a card — its name, one line of what is waiting, three
 * roles and "More roles" — and every other door is a row in one
 * compact list: the company or person, its kind, one line, Open.
 *
 * It is a cut of words, not of doors. Every seat the page offered
 * before is still one or two clicks away: the client roles under "More
 * roles", a firm's own roles under "Roles" on its row, and every other
 * firm and every person under the fold at the foot of the list. What a
 * door used to say at length (`about`, `industry`) stays in the seat
 * list, checked against the seed, and is the hover text on its name.
 *
 * All doors post to the same route with the same three shapes of body
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
      const visit = visitId()
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The tab's visit id, so the route counts this seat once for this
        // visit (`demoVisit` in lib/demo-session). An empty id is not sent.
        body: JSON.stringify({ ...body, ...(visit ? { visit, page: '/demo' } : {}) }),
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

/** The longer words a door used to draw, kept as the hover text on its name. */
const more = (d: Program) => `${d.industry}. ${d.about}`

/** One role, as a chip. */
function RoleChip({ label, busy, locked, onClick, title }: { label: string; busy: boolean; locked: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={title}
      className="rounded-md border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[12px]
                 font-medium transition-colors hover:border-etyme-action
                 hover:text-etyme-action disabled:opacity-50"
    >
      {busy ? 'Opening…' : label}
    </button>
  )
}

/**
 * The three roles on a client card before "More roles": the person who
 * runs the program, the one who needs somebody, the one who pays. In the
 * drawing's order. Every other role is one click behind them.
 */
const FIRST_ROLES = ['programme', 'hiring', 'ap'] as const

/**
 * The three client programs: a name, one line of what is waiting today,
 * and the roles.
 */
export function ProgramDoors({ programs }: { programs: ClientProgram[] }) {
  const { busy, error, sit } = useSeat()
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const first = CLIENT_DESKS.filter((d) => (FIRST_ROLES as readonly string[]).includes(d.desk))
  const rest = CLIENT_DESKS.filter((d) => !(FIRST_ROLES as readonly string[]).includes(d.desk))

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {programs.map((p) => {
          const chip = (d: ClientDesk) => {
            const key = `${p.slug}:${d.desk}`
            return (
              <RoleChip
                key={d.label}
                label={d.label}
                title={d.waiting}
                busy={busy === key}
                locked={busy !== null}
                onClick={() => { if (!busy) sit(key, { as: p.slug, ...(d.desk ? { desk: d.desk } : {}) }) }}
              />
            )
          }
          return (
            <section key={p.slug} className="panel flex flex-col p-5">
              <h3 title={more(p)} className="font-serif text-[22px] leading-tight tracking-[-0.02em]">
                {p.name}
              </h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed">{p.waiting}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {first.map(chip)}
                {opened[p.slug] ? (
                  rest.map(chip)
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpened({ ...opened, [p.slug]: true })}
                    className="rounded-md px-2 py-1.5 text-[12px] font-medium text-etyme-action hover:underline"
                  >
                    More roles
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
      <Refusal error={error} />
    </div>
  )
}

/** A row in the list under the clients: a firm, or a person. */
type Row = { door: Program; open: Record<string, string> }


/**
 * The suppliers, and everybody else, as one compact list.
 *
 * Company and its kind, one line of what is waiting, Open. A firm that
 * seats more than one role keeps its whole row of roles behind "Roles"
 * on its line. Phone first: on a narrow screen a row stacks.
 */
export function DoorRows({ firms = [], people = [] }: { firms?: Program[]; people?: Program[] }) {
  const { busy, error, sit } = useSeat()
  // A firm opened with no role takes its first seat, as its Owner chip
  // always did; a person is asked for by name, and the route looks the
  // name up in the seat list.
  const rows: Row[] = [
    ...firms.map((f) => ({ door: f, open: { as: f.slug } })),
    ...people.map((c) => ({ door: c, open: { person: c.slug } })),
  ]
  const [roles, setRoles] = useState<string | null>(null)

  return (
    <div>
      <ul className="divide-y divide-etyme-rule border-y border-etyme-rule">
        {rows.map(({ door: d, open }) => (
          <li key={d.slug} className="py-3 sm:grid sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:items-baseline sm:gap-4">
            <div>
              <p title={more(d)} className="text-[14px] font-semibold">{d.name}</p>
              <p className="text-[12.5px] text-etyme-muted">{d.where}</p>
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed sm:mt-0">{d.waiting}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3 sm:mt-0 sm:justify-end">
              {d.desks && (
                <button
                  type="button"
                  onClick={() => setRoles(roles === d.slug ? null : d.slug)}
                  className="text-[13px] text-etyme-muted hover:text-etyme-action"
                >
                  Roles
                </button>
              )}
              <button
                type="button"
                onClick={() => { if (!busy) sit(d.slug, open) }}
                disabled={busy !== null}
                className="text-[13px] font-medium text-etyme-action transition-opacity hover:opacity-70 disabled:opacity-50"
              >
                {busy === d.slug ? 'Opening…' : 'Open →'}
              </button>
            </div>
            {d.desks && roles === d.slug && (
              <div className="mt-3 flex flex-wrap gap-2 sm:col-span-3">
                {d.desks.map((r) => {
                  const key = `${d.slug}:${r.desk}:${r.who ?? ''}`
                  return (
                    <RoleChip
                      key={r.label}
                      label={r.label}
                      title={r.waiting}
                      busy={busy === key}
                      locked={busy !== null}
                      onClick={() => { if (!busy) sit(key, { as: d.slug, ...(r.desk ? { desk: r.desk } : {}), ...(r.who ? { who: r.who } : {}) }) }}
                    />
                  )
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Refusal error={error} />
    </div>
  )
}

/**
 * Opens the fold when the page is reached at an address inside it.
 *
 * The home page's door for workers links to `/demo#candidate`, and that
 * section is under the fold now; landing on a closed fold would be a
 * link to nothing a reader can see.
 */
export function OpenOnArrival({ fold }: { fold: string }) {
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const target = document.getElementById(id)
    const details = document.getElementById(fold)
    if (target && details instanceof HTMLDetailsElement && details.contains(target)) {
      details.open = true
      target.scrollIntoView()
    }
  }, [fold])
  return null
}
