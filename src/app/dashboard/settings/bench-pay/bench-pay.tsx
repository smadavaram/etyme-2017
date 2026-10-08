'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * Bench pay: what a firm pays the people waiting for a project, and
 * whether a public holiday on the bench is paid.
 *
 * Read and changed by the owner, the admin and the finance desk only
 * (`mayChangeBenchPay`). Any other seat reads the route's own sentence
 * saying who can change it. The holiday switch is a row per turn
 * (`BenchHolidaySwitch`), so the screen shows who turned it and when,
 * and the turns before it.
 */

interface Choice { value: string; label: string; means: string }
interface BenchPay {
  policy: {
    benchPolicy: string
    benchRateBps: number | null
    benchCarryDays: number | null
    reserveBps: number | null
    reserveOnExit: string
    says: string
  }
  choices: { policies: Choice[]; onExit: { value: string; means: string }[] }
  holidays: {
    paid: boolean
    says: string
    turned: string | null
    integratorNote: string | null
    perPerson: string
    history: string[]
  }
}

const toPct = (bps: number | null) => (bps == null ? '' : String(bps / 100))
const toBps = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100))
const toDays = (s: string) => (s.trim() === '' ? null : Number(s))

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
      <h2 className="font-serif text-[19px] text-etyme-ink tracking-[-0.02em]">{title}</h2>
      {subtitle && <p className="text-[13px] text-etyme-muted mt-1 mb-4 max-w-prose">{subtitle}</p>}
      {children}
    </section>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">{children}</div>
}

/**
 * `head`: the page's own heading, drawn only above a page this desk may
 * read. A refused page is the sentence alone — no heading and no prose
 * about what "you pay" (sign-up walk, round seven, problem 6). Settings
 * draws the section as a tab with no head of its own, and keeps the panel.
 */
export function BenchPaySection({ head }: { head?: React.ReactNode } = {}) {
  const [data, setData] = useState<BenchPay | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [policy, setPolicy] = useState('NO_PAY')
  const [rate, setRate] = useState('')
  const [carry, setCarry] = useState('')
  const [reserve, setReserve] = useState('')
  const [onExit, setOnExit] = useState('PAY_OUT')

  const take = useCallback((d: BenchPay) => {
    setData(d)
    setPolicy(d.policy.benchPolicy)
    setRate(toPct(d.policy.benchRateBps))
    setCarry(d.policy.benchCarryDays == null ? '' : String(d.policy.benchCarryDays))
    setReserve(toPct(d.policy.reserveBps))
    setOnExit(d.policy.reserveOnExit)
  }, [])

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/settings/bench')
      if (res.status === 403) {
        const body = await res.json().catch(() => null)
        setRefused(body?.error?.message ?? 'This desk cannot read bench pay.')
        return
      }
      try {
        take((await readJson(res)).data)
      } catch (e: any) {
        setError(e.message)
      }
    })()
  }, [take])

  async function save(payload: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch('/api/settings/bench', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await readJson(res)
      take(body.data)
      setFlash(body.data.message)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (refused && head !== undefined) return <p className="text-[13px] text-etyme-ink">{refused}</p>
  if (refused) {
    return (
      <Panel title="Bench pay">
        <p className="text-[13px] text-etyme-ink">{refused}</p>
      </Panel>
    )
  }
  if (!data) {
    return error
      ? <>{head}<Panel title="Bench pay"><p className="text-[13px] text-etyme-attention">{error}</p></Panel></>
      : <p className="text-etyme-muted text-sm">Loading bench pay…</p>
  }

  const h = data.holidays
  return (
    <>
      {head}
      {flash && (
        <div className="mb-5 rounded-md border border-etyme-verified/30 bg-etyme-verified/5 p-3">
          <p className="text-[13px] text-etyme-verified">{flash}</p>
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 p-3">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      <Panel
        title="Bench pay policy"
        subtitle="What you pay people waiting for a project. Bench cost, bench burn and bench profit are all worked out under this."
      >
        <p className="text-[14px] text-etyme-ink mb-4">{data.policy.says}</p>

        <div className="space-y-2 mb-4">
          {data.choices.policies.map((c) => (
            <label key={c.value} className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="radio" name="benchPolicy" value={c.value} checked={policy === c.value}
                onChange={() => setPolicy(c.value)} className="mt-1" />
              <span><span className="text-etyme-ink font-medium">{c.label}.</span>{' '}
                <span className="text-etyme-muted">{c.means}</span></span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {policy === 'REDUCED_RATE' && (
            <div>
              <Lbl>Share of their pay, %</Lbl>
              <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal"
                className="w-full rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[13px] tabular-nums" />
            </div>
          )}
          {policy === 'RESERVE_FUNDED' && (
            <>
              <div>
                <Lbl>Held back from each share, %</Lbl>
                <input value={reserve} onChange={(e) => setReserve(e.target.value)} inputMode="decimal"
                  className="w-full rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[13px] tabular-nums" />
              </div>
              <div>
                <Lbl>When they leave</Lbl>
                <select value={onExit} onChange={(e) => setOnExit(e.target.value)}
                  className="w-full rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[13px]">
                  {data.choices.onExit.map((o) => <option key={o.value} value={o.value}>{o.means}</option>)}
                </select>
              </div>
            </>
          )}
          {policy !== 'NO_PAY' && (
            <div>
              <Lbl>Carry days (empty for no limit)</Lbl>
              <input value={carry} onChange={(e) => setCarry(e.target.value)} inputMode="numeric"
                className="w-full rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[13px] tabular-nums" />
            </div>
          )}
        </div>

        <button
          disabled={busy}
          onClick={() => save({
            benchPolicy: policy,
            ...(policy === 'REDUCED_RATE' ? { benchRateBps: toBps(rate) } : {}),
            ...(policy === 'RESERVE_FUNDED' ? { reserveBps: toBps(reserve), reserveOnExit: onExit } : {}),
            ...(policy !== 'NO_PAY' ? { benchCarryDays: toDays(carry) } : {}),
          })}
          className="px-3 py-1.5 rounded bg-etyme-action text-white text-[13px] disabled:opacity-50"
        >
          Save policy
        </button>
      </Panel>

      <Panel title="Pay public holidays on the bench" subtitle={h.integratorNote ?? 'Off by default. Turned on here for the firm, then on Our bench for each person.'}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] text-etyme-ink">{h.says}</p>
            <p className="text-[12px] text-etyme-muted mt-1">{h.turned ?? (h.integratorNote ? 'On by default. Nobody has turned it.' : 'Off by default. Nobody has turned it.')}</p>
          </div>
          <button
            disabled={busy}
            onClick={() => save({ holidayPay: !h.paid })}
            aria-pressed={h.paid}
            className={`shrink-0 px-3 py-1.5 rounded text-[13px] disabled:opacity-50 ${
              h.paid ? 'bg-etyme-surface border border-etyme-rule text-etyme-ink' : 'bg-etyme-action text-white'
            }`}
          >
            {h.paid ? 'Turn off' : 'Turn on'}
          </button>
        </div>
        <p className="text-[13px] text-etyme-muted mt-3">{h.perPerson}</p>
        {h.history.length > 1 && (
          <div className="mt-4">
            <Lbl>Earlier turns</Lbl>
            <ul className="text-[12px] text-etyme-muted space-y-0.5">
              {h.history.slice(1).map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </Panel>
    </>
  )
}
