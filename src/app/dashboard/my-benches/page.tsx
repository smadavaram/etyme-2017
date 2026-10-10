'use client'

import { readJson } from '@/lib/read-response'
import { Lbl, Panel, Chip, LoadingState, ErrorState } from '@/components/ui'
import { historyLine } from '@/lib/shared-consultant'

import { useEffect, useState, useCallback } from 'react'

/**
 * Who has me, and what have they done with me.
 *
 * A contract consultant is on five or ten benches. They have never been
 * able to see that list in one place, let alone what each agency did with
 * it — how many times they were submitted, to whom, and which agency is
 * currently sitting on them at a client. They find out when a recruiter
 * says "we already have your CV from somebody else", by which point the
 * role is gone and nobody will say why.
 *
 * Every agency on this page can see only their own row of it. None of them
 * can see this page.
 */

interface Hold {
  id: string
  client: string
  role: string | null
  daysLeft: number
}
/** Pay terms the firm stated when it listed them (2026-10-06). */
interface Terms {
  engagementType: string
  payRateCents: number
  rate: string
  words: string
  agreed: boolean
  says: string
}
interface Bench {
  listingId: string
  companyId: string
  company: string
  tier: string
  since: string
  askFirst: boolean
  showBeforeFree: boolean
  submissions: number
  holds: Hold[]
  /** How long they chose to stay here (2026-09-30). Null is until they cancel. */
  stayDays?: number | null
  stay?: string
  ended?: boolean
  mayRenew?: boolean
  /** Whether this firm may show them, without their name, beyond the firms it works with. */
  showInMatches?: boolean
  terms?: Terms | null
}
interface Data {
  benches: Bench[]
  asking: { id: string; company: string; client: string; role: string | null; askedAt: string }[]
  notThese: { id: string; company: string; companyId: string; note: string | null }[]
  history: {
    company: string; client: string; role: string; when: string
    status: string; sentOnTo: string | null
  }[]
  /**
   * Firms that asked to market them and are waiting on an answer. Not a
   * bench yet: nothing reaches anybody until they say yes.
   */
  invited?: { listingId: string; company: string; askedAt: string | null; terms?: Terms | null }[]
  /** Stays that ran out: not a bench any more, and one tap from being one again. */
  ended?: { listingId: string; company: string; stayDays: number | null; stay: string; mayRenew: boolean }[]
  stayChoices?: number[]
  /** Firms that employ them. They need no listing to staff somebody. */
  employers: string[]
  note: string
}




/**
 * How long they stay on a bench — one choice, beside the yes, with
 * "until I cancel" already chosen, so saying yes is never a second
 * question (founder, 2026-09-30).
 */
function StayPicker({ value, onChange, choices, disabled, label }: {
  value: number | null
  onChange: (days: number | null) => void
  choices: number[]
  disabled?: boolean
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-etyme-muted">
      <span>{label}</span>
      <select
        value={value == null ? '' : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1 text-[13px] text-etyme-ink"
      >
        <option value="">Until I cancel</option>
        {choices.map((d) => (
          <option key={d} value={d}>{d} days</option>
        ))}
      </select>
    </label>
  )
}

const STAY_CHOICES_FALLBACK = [5, 7, 15, 25, 50, 60, 500]

const btn = 'px-3 py-1.5 rounded text-[13px] font-medium transition-colors disabled:opacity-40'
const primary = `${btn} bg-etyme-action text-white hover:opacity-90`
const quiet = `${btn} border border-etyme-rule text-etyme-ink hover:bg-etyme-canvas`

export default function MyBenchesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The stay and the matches choice beside each yes, per invitation.
  const [stayFor, setStayFor] = useState<Record<string, number | null>>({})
  const [showFor, setShowFor] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/me/benches')
      const body = await readJson(res)
      setData(body.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(payload: unknown) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch('/api/me/benches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await readJson(res)
      setFlash(body.data?.message ?? 'Saved.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Their answer to a firm that asked to market them. The same rule the
  // emailed link runs, from their own page: until this existed the only
  // way to say yes was the link, and a signed-in consultant read the
  // firm under "Agencies marketing you" without having agreed to anything.
  async function answerAsk(listingId: string, said: 'ACCEPT' | 'DECLINE', terms?: Terms | null) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch(`/api/me/benches/${listingId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          said === 'ACCEPT'
            ? {
                said, stayDays: stayFor[listingId] ?? null, showInMatches: showFor[listingId] === true,
                // The terms printed beside the button. The yes agrees these
                // and nothing else; if the firm changed them, it is refused.
                termsSeen: terms ? { engagementType: terms.engagementType, payRateCents: terms.payRateCents } : null,
              }
            : { said }
        ),
      })
      const body = await readJson(res)
      setFlash(body.data?.says ?? 'Saved.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState says="Opening your benches…" />
  if (error && !data) {
    return (
      <div className="p-8">
        <ErrorState says={error} action={{ label: 'Try again', onClick: () => { load() } }} />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="p-8 max-w-3xl">
      <div className="eyebrow">You</div>
      <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Who has you</h1>
      <p className="text-[15px] text-etyme-muted mt-2 max-w-prose leading-relaxed">
        {data.note}
      </p>

      {flash && <p className="text-[13px] text-etyme-verified mt-4">{flash}</p>}
      {error && <p className="text-[13px] text-etyme-attention mt-4">{error}</p>}

      <div className="mt-6">
        {/* ── Waiting on you ───────────────────────────────────────── */}
        {data.asking.length > 0 && (
          <Panel className="mb-5"
            title="Waiting on you"
            subtitle="You asked these agencies to check with you before putting you in front of anybody."
          >
            <div className="space-y-3">
              {data.asking.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] text-etyme-ink">
                      {a.company} → {a.client}
                    </p>
                    <p className="text-[13px] text-etyme-muted mt-0.5">
                      {[a.role, `asked ${a.askedAt}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className={primary}
                      disabled={busy}
                      onClick={() => send({ answer: a.id, yes: true })}
                    >
                      Yes
                    </button>
                    <button
                      className={quiet}
                      disabled={busy}
                      onClick={() => send({ answer: a.id, yes: false })}
                    >
                      No
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ── Firms asking to market them ─────────────────────────── */}
        {(data.invited?.length ?? 0) > 0 && (
          <Panel className="mb-5"
            title="Asking to market you"
            subtitle="Say yes and the firm can put you forward, and the firms it works with can see you. Say no and that is the end of it. You can take a yes back at any time."
          >
            <div className="space-y-3">
              {data.invited!.map((a) => (
                <div key={a.listingId} className="border-t border-etyme-rule pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] text-etyme-ink">{a.company}</p>
                      {a.askedAt && (
                        <p className="text-[13px] text-etyme-muted mt-0.5 tabular-nums">asked {a.askedAt}</p>
                      )}
                      {/* Pay terms stated with the ask, read before the yes. */}
                      {a.terms ? (
                        <p className="text-[13px] text-etyme-ink mt-1">
                          {a.terms.says} Saying yes agrees these terms.
                        </p>
                      ) : (
                        <p className="text-[13px] text-etyme-muted mt-1">
                          No pay terms yet. Saying yes lets them market you and agrees no pay.
                        </p>
                      )}
                    </div>
                    {/* The yes and how long it lasts are one answer. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <StayPicker
                        label="Stay on their bench"
                        value={stayFor[a.listingId] ?? null}
                        onChange={(d) => setStayFor((m) => ({ ...m, [a.listingId]: d }))}
                        choices={data.stayChoices ?? STAY_CHOICES_FALLBACK}
                        disabled={busy}
                      />
                      <button className={primary} disabled={busy} onClick={() => answerAsk(a.listingId, 'ACCEPT', a.terms)}>
                        {a.terms ? 'Yes, market me on these terms' : 'Yes, market me'}
                      </button>
                      <button className={quiet} disabled={busy} onClick={() => answerAsk(a.listingId, 'DECLINE')}>
                        No
                      </button>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 mt-2 text-[13px] text-etyme-muted cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={showFor[a.listingId] === true}
                      disabled={busy}
                      onChange={() => setShowFor((m) => ({ ...m, [a.listingId]: !m[a.listingId] }))}
                    />
                    <span>
                      Also let {a.company} show me in matches to companies it does not work with yet —
                      my skills and when I am free, never my name, contact or rate.
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ── The benches ──────────────────────────────────────────── */}
        <Panel className="mb-5"
          title="Agencies marketing you"
          subtitle="Every firm that holds your consent to be put forward, with how long you chose to stay. Each firm sees only its own listing."
        >
          {data.benches.length === 0 ? (
            <p className="text-[13px] text-etyme-faint">
              Nobody is marketing you. A bench listing is your permission — yours to give and to take
              back.
              {/* Said here too, because this panel is where somebody looks
                  to find out whether anybody has them at all, and for an
                  employee the answer is yes without a listing. */}
              {data.employers?.length > 0 && (
                <> {data.employers.join(' and ')} staff{data.employers.length === 1 ? 's' : ''} you
                  directly, which needs no listing.</>
              )}
            </p>
          ) : (
            <div className="space-y-5">
              {data.benches.map((b) => (
                <div key={b.listingId} className="pb-5 border-b border-etyme-rule last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[15px] text-etyme-ink">
                        {b.company}{' '}
                        <span className="ml-1.5">
                          <Chip tone={b.tier === 'RETAINED' ? 'verified' : 'passive'}>
                            {b.tier === 'RETAINED' ? 'retained' : 'marketing'}
                          </Chip>
                        </span>
                      </p>
                      <p className="text-[13px] text-etyme-muted mt-0.5 tabular-nums">
                        since {b.since} · {b.submissions}{' '}
                        {b.submissions === 1 ? 'submission' : 'submissions'} in your name
                      </p>
                    </div>
                    <button
                      className={quiet}
                      disabled={busy}
                      onClick={() => send({ revokeListing: b.listingId })}
                    >
                      Take it back
                    </button>
                  </div>

                  {/* Pay terms stated with the listing, and their answer to them. */}
                  {b.terms && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className={`text-[13px] ${b.terms.agreed ? 'text-etyme-muted' : 'text-etyme-ink'}`}>{b.terms.says}</p>
                      {!b.terms.agreed && (
                        <button
                          className={primary}
                          disabled={busy}
                          onClick={() =>
                            send({
                              listingId: b.listingId,
                              agreeTerms: { engagementType: b.terms!.engagementType, payRateCents: b.terms!.payRateCents },
                            })
                          }
                        >
                          Agree these terms
                        </button>
                      )}
                    </div>
                  )}

                  {/* Where this agency currently holds them. The one thing
                      that stops a second agency submitting them there. */}
                  {b.holds.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <Lbl>Representing you at</Lbl>
                      {b.holds.map((h) => (
                        <div key={h.id} className="flex items-baseline justify-between gap-4">
                          <span className="text-[14px] text-etyme-ink">
                            {h.client}
                            {h.role && <span className="text-etyme-muted"> · {h.role}</span>}
                          </span>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="text-[12px] text-etyme-muted tabular-nums">
                              {h.daysLeft}d left
                            </span>
                            <button
                              className="text-[12px] text-etyme-action hover:underline disabled:opacity-40"
                              disabled={busy}
                              onClick={() => send({ releaseHold: h.id })}
                            >
                              take back
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex items-center gap-2 mt-3 text-[13px] text-etyme-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={b.askFirst}
                      disabled={busy}
                      onChange={() => send({ listingId: b.listingId, askFirst: !b.askFirst })}
                    />
                    Ask me before sending me to a client I have not been sent to before
                  </label>

                  {/* Beyond the firms this one works with — the person's own
                      yes, off until they give it (2026-09-30). */}
                  <label className="flex items-start gap-2 mt-2 text-[13px] text-etyme-muted cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={b.showInMatches === true}
                      disabled={busy}
                      onChange={() => send({ listingId: b.listingId, showInMatches: !b.showInMatches })}
                    />
                    <span>
                      Show me in matches to companies {b.company} does not work with yet — my skills and when
                      I am free, never my name, contact or rate. They can only ask to add {b.company} as a supplier.
                    </span>
                  </label>

                  {/* How long they stay. Changeable any time; renewing is one tap. */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <StayPicker
                      label="Stay on this bench"
                      value={b.stayDays ?? null}
                      onChange={(d) => send({ listingId: b.listingId, stayDays: d })}
                      choices={data.stayChoices ?? STAY_CHOICES_FALLBACK}
                      disabled={busy}
                    />
                    {b.mayRenew && (
                      <button className={primary} disabled={busy} onClick={() => send({ renew: b.listingId })}>
                        Renew
                      </button>
                    )}
                  </div>
                  {b.stay && (
                    <p className={`mt-1 text-[13px] ${b.ended ? 'text-etyme-attention' : 'text-etyme-muted'}`}>{b.stay}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Stays that ran out ─────────────────────────────────── */}
        {(data.ended?.length ?? 0) > 0 && (
          <Panel className="mb-5"
            title="Stays that ended"
            subtitle="You chose how long to stay on these benches, and that time ran out. Nobody can put you forward through them now. Anything already sent stays as it is."
          >
            <div className="space-y-3">
              {data.ended!.map((e) => (
                <div key={e.listingId} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] text-etyme-ink">{e.company}</p>
                    <p className="text-[13px] text-etyme-muted mt-0.5">{e.stay}</p>
                  </div>
                  {e.mayRenew && (
                    <button className={primary} disabled={busy} onClick={() => send({ renew: e.listingId })}>
                      Renew for {e.stayDays} days
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ── Clients they will not go to ──────────────────────────── */}
        <Panel className="mb-5"
          title="Clients you will not be sent to"
          subtitle="No agency can submit you here. None of them is told why, or by whom."
        >
          {data.notThese.length === 0 ? (
            <p className="text-[13px] text-etyme-faint">
              Nobody. Usually this is your current client, and it is worth adding before somebody
              submits you there by accident.
            </p>
          ) : (
            <div className="space-y-2">
              {data.notThese.map((n) => (
                <div key={n.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-[14px] text-etyme-ink">
                    {n.company}
                    {n.note && <span className="text-etyme-faint"> · {n.note}</span>}
                  </span>
                  <button
                    className="text-[12px] text-etyme-action hover:underline shrink-0 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => send({ allowAgain: n.id })}
                  >
                    allow again
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Everything done in their name ────────────────────────── */}
        <Panel className="mb-5"
          title="Every time you were put forward"
          subtitle="Every firm that put you forward: the client, the job, what happened and when."
        >
          {data.history.length === 0 ? (
            <p className="text-[13px] text-etyme-faint">Nobody has submitted you yet.</p>
          ) : (
            <div className="space-y-2">
              {data.history.map((h, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4">
                  <span className="text-[14px] text-etyme-ink min-w-0">
                    {h.client}
                    <span className="text-etyme-muted"> · {h.role}</span>
                    <span className="text-etyme-faint"> · by {h.company}</span>
                    {/* Whether it actually went on, which is the question
                        behind "have they submitted me yet". */}
                    <span className="block text-[12px] text-etyme-muted mt-0.5">
                      {historyLine(h)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <Chip
                      tone={
                        h.status === 'PLACED' ? 'verified'
                          : h.status === 'REJECTED' || h.status === 'NOT_SELECTED' ? 'attention'
                            : 'passive'
                      }
                    >
                      {h.status.toLowerCase().replace('_', ' ')}
                    </Chip>
                    <span className="text-[12px] text-etyme-muted tabular-nums">{h.when}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
