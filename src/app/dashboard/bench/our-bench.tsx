'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Stat } from '@/components/ui'
import { plainDate } from '@/lib/plain-date'
import { ListSurface, type Column } from '@/components/list-surface'
import { Thread } from '@/components/thread'
import { possessive } from '@/lib/internal-moves'

/**
 * Our bench — an integrator's own people coming off a project or between
 * projects, and the moves between its projects (CLAUDE.md, 2026-09-30).
 *
 * A decision surface on top of a working one: the list is the firm's
 * people with the free date first, and the one person being acted on
 * opens in a panel above it — ask the manager releasing them, reserve
 * them for your position, confirm the day, place them. What each reader
 * may do is decided by the server (`ourBenchRow` in lib/internal-moves),
 * so no button here is one the route refuses.
 *
 * Below, for a manager, the project team they run: who is on it, and the
 * one act only they may take — flagging who comes off it.
 */

interface Row {
  personId: string
  name: string
  status: 'ROLLING_OFF' | 'KEPT' | 'BETWEEN_PROJECTS' | 'MOVING'
  freeOn: string
  freeOnSays: string
  skillsSay: string
  place: string | null
  project: string | null
  releaser: { id: string; name: string } | null
  releaseId: string | null
  confirmed: boolean
  hold: { id: string; byId: string; byName: string; forTitle: string; forKind: 'ORDER' | 'REQUIREMENT'; until: string } | null
  says: string
  may: { ask: boolean; reserve: boolean; endHold: boolean; confirm: boolean; place: boolean }
}

interface TeamRow {
  sellContractId: string
  personId: string
  name: string
  client: string | null
  city: string | null
  startsOn: string
  endsOn: string | null
  release: { id: string; rollsOffOn: string; keepUntil: string | null; confirmed: boolean } | null
}

interface Position {
  kind: 'ORDER' | 'REQUIREMENT'
  key: string
  title: string
  sellContractId?: string
  requirementId?: string
}

interface Data {
  viewer: { personId: string; as: 'MANAGER' | 'HR'; maySubmit: boolean }
  rows: Row[]
  team: TeamRow[]
  positions: Position[]
  summary: { rollingOff: number; kept: number; between: number; moving: number; held: number }
}

type Act =
  | { kind: 'ASK' | 'RESERVE' | 'PLACE'; row: Row }
  | { kind: 'FLAG'; team: TeamRow }

const STATUS: Record<Row['status'], { text: string; cls: string }> = {
  ROLLING_OFF: { text: 'Rolling off', cls: 'chip--attention' },
  KEPT: { text: 'Staying until', cls: 'chip--passive' },
  BETWEEN_PROJECTS: { text: 'Between projects', cls: 'chip--attention' },
  MOVING: { text: 'Moving', cls: 'chip--verified' },
}

const day = (iso: string | null) => (iso ? plainDate(iso) : null)

export function OurBench({ firmName }: { firmName: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [act, setAct] = useState<Act | null>(null)
  const [said, setSaid] = useState<{ text: string; tone: 'ok' | 'no' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const j = await readJson<{ data: Data }>(await fetch('/api/bench/ours'))
      setData(j.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function send(url: string, method: string, body?: unknown): Promise<any | null> {
    setSaid(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const j = await readJson<any>(res)
      return j
    } catch (e: any) {
      setSaid({ text: e.message, tone: 'no' })
      return null
    }
  }

  async function confirmDay(row: Row) {
    const j = await send(`/api/bench/ours/releases/${row.releaseId}/confirm`, 'POST')
    if (j) setSaid({ text: j.data.says, tone: 'ok' })
    await load()
  }
  async function endHold(row: Row) {
    const j = await send(`/api/bench/ours/holds/${row.hold!.id}`, 'DELETE', {})
    if (j) setSaid({ text: `${row.name} is back on Our bench for any manager.`, tone: 'ok' })
    await load()
  }

  const rows = data?.rows ?? []
  const manager = data?.viewer.as === 'MANAGER'

  const actions = (r: Row) => (
    <div className="flex flex-wrap gap-1.5">
      {r.may.ask && <button className="chip chip--action text-[11px]" onClick={() => setAct({ kind: 'ASK', row: r })}>Ask about {r.name.split(' ')[0]}</button>}
      {r.may.reserve && <button className="chip chip--verified text-[11px]" onClick={() => setAct({ kind: 'RESERVE', row: r })}>Reserve</button>}
      {r.may.confirm && <button className="chip chip--attention text-[11px]" onClick={() => confirmDay(r)}>Confirm last day</button>}
      {r.may.place && <button className="chip chip--verified text-[11px]" onClick={() => setAct({ kind: 'PLACE', row: r })}>Place</button>}
      {r.may.endHold && <button className="chip chip--passive text-[11px]" onClick={() => endHold(r)}>Release hold</button>}
    </div>
  )

  const columns: Column<Row>[] = [
    {
      key: 'name', label: 'Person',
      render: (r) => (
        <div>
          <p className="text-[13px] font-medium text-etyme-ink">{r.name}</p>
          <p className="text-[11px] text-etyme-muted">{r.skillsSay}</p>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: 'freeOn', label: 'Free',
      render: (r) => (
        <div>
          <span className={`chip ${STATUS[r.status].cls} text-[10px]`}>{STATUS[r.status].text}</span>
          <p className="text-[12px] text-etyme-ink mt-1 tabular-nums">{r.freeOnSays}</p>
        </div>
      ),
      sortValue: (r) => r.freeOn,
    },
    { key: 'project', label: 'Project now', render: (r) => <span className="text-[12px] text-etyme-muted">{r.project ?? '—'}</span>, hideOnMobile: true },
    { key: 'place', label: 'Place', render: (r) => <span className="text-[12px] text-etyme-muted">{r.place ?? 'Not on record'}</span>, hideOnMobile: true },
    {
      key: 'releaser', label: 'Released by',
      render: (r) => (
        <div className="text-[12px]">
          <p className="text-etyme-ink">{r.releaser?.name ?? '—'}</p>
          {r.releaser && <p className="text-etyme-muted">{r.confirmed ? 'Day confirmed' : 'Day not confirmed yet'}</p>}
        </div>
      ),
      sortValue: (r) => r.releaser?.name ?? '',
    },
    {
      key: 'hold', label: 'Held',
      render: (r) => r.hold
        ? <span className="text-[12px] text-etyme-ink">{r.hold.byName}, until {day(r.hold.until)}</span>
        : <span className="text-[12px] text-etyme-faint">Nobody</span>,
      sortValue: (r) => r.hold?.byName ?? '',
    },
    { key: 'actions', label: '', render: actions, sortable: false },
  ]

  const teamColumns: Column<TeamRow>[] = [
    { key: 'name', label: 'Person', render: (t) => <span className="text-[13px] font-medium text-etyme-ink">{t.name}</span>, sortValue: (t) => t.name },
    { key: 'client', label: 'Project', render: (t) => <span className="text-[12px] text-etyme-muted">{[t.client, t.city].filter(Boolean).join(', ')}</span> },
    { key: 'endsOn', label: 'Contract ends', render: (t) => <span className="text-[12px] tabular-nums">{day(t.endsOn) ?? 'No end date'}</span>, sortValue: (t) => t.endsOn ?? '9999' },
    {
      key: 'release', label: 'Rolling off',
      render: (t) => t.release
        ? <span className="text-[12px] text-etyme-ink">{day(t.release.rollsOffOn)}{t.release.keepUntil ? `, kept until ${day(t.release.keepUntil)}` : ''}</span>
        : <span className="text-[12px] text-etyme-faint">Not flagged</span>,
    },
    {
      key: 'act', label: '', sortable: false,
      render: (t) => (
        <button className="chip chip--attention text-[11px]" onClick={() => setAct({ kind: 'FLAG', team: t })}>
          {t.release ? 'Move the day' : 'Flag roll-off'}
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-body-sm text-etyme-muted max-w-2xl">
          Your own people coming off a project or between projects. Seen by {possessive(firmName)} managers and HR; no client sees it.
          The manager releasing somebody confirms their last day; the manager taking them places them. HR is told of every step.
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Stat label="Rolling off" value={data.summary.rollingOff} />
          <Stat label="Staying until a date" value={data.summary.kept} />
          <Stat label="Between projects" value={data.summary.between} />
          <Stat label="Held for a position" value={data.summary.held} />
        </div>
      )}

      {said && (
        <p role="status" className={`text-sm rounded border px-3 py-2 ${said.tone === 'ok' ? 'border-etyme-verified/30 bg-etyme-verified/5 text-etyme-ink' : 'border-etyme-attention/40 bg-etyme-attention/5 text-etyme-ink'}`}>
          {said.text}
        </p>
      )}

      {act && data && (
        <ActPanel
          act={act}
          data={data}
          onClose={() => setAct(null)}
          onDone={async (text, tone) => { setSaid({ text, tone }); if (tone === 'ok') setAct(null); await load() }}
        />
      )}

      <ListSurface
        name="our-bench"
        columns={columns}
        data={rows}
        rowKey={(r) => r.personId}
        loading={loading}
        error={error}
        searchFilter={(r, q) => r.name.toLowerCase().includes(q) || r.skillsSay.toLowerCase().includes(q) || (r.project ?? '').toLowerCase().includes(q)}
        searchPlaceholder="Search by name, skill, project…"
        emptyMessage="Nobody on Our bench."
        emptyDetail="Nobody is rolling off and nobody is between projects. A manager flags who comes off a project from the team list below."
        exportName="etyme-our-bench"
        feedOmit={['actions']}
        card={(r) => (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium text-etyme-ink">{r.name}</p>
              <span className={`chip ${STATUS[r.status].cls} text-[10px]`}>{STATUS[r.status].text}</span>
            </div>
            <p className="text-[12px] text-etyme-muted">{r.skillsSay}</p>
            <p className="text-[13px] text-etyme-ink">{r.freeOnSays}</p>
            <p className="text-[12px] text-etyme-muted">{r.says}</p>
            {actions(r)}
          </div>
        )}
      />

      {manager && (
        <section>
          <h2 className="headline-serif text-[18px] text-etyme-ink mb-1">Your project team</h2>
          <p className="text-[12px] text-etyme-muted mb-3">People on the projects you manage. Flag who comes off, and when; they appear on Our bench for the firm&rsquo;s other managers.</p>
          <ListSurface
            name="our-bench-team"
            columns={teamColumns}
            data={data?.team ?? []}
            rowKey={(t) => t.sellContractId}
            loading={loading}
            error={null}
            emptyMessage="Nobody is on a project you manage."
            emptyDetail="Your seat sits on a project, or names your team; the lines under it are listed here."
            exportName="etyme-our-bench-team"
            feedOmit={['act']}
          />
        </section>
      )}
    </div>
  )
}


function ActPanel({ act, data, onClose, onDone }: {
  act: Act
  data: Data
  onClose: () => void
  onDone: (text: string, tone: 'ok' | 'no') => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [position, setPosition] = useState(data.positions[0]?.key ?? '')
  const [until, setUntil] = useState('')
  const [rollsOffOn, setRollsOffOn] = useState(act.kind === 'FLAG' ? act.team.release?.rollsOffOn ?? act.team.endsOn ?? '' : '')
  const [keepUntil, setKeepUntil] = useState(act.kind === 'FLAG' ? act.team.release?.keepUntil ?? '' : '')
  const [startsOn, setStartsOn] = useState('')
  const [threadCount, setThreadCount] = useState(0)

  async function go(url: string, method: string, body: unknown, ok: (j: any) => string) {
    setBusy(true)
    try {
      const j = await readJson<any>(await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      await onDone(ok(j), 'ok')
    } catch (e: any) {
      await onDone(e.message, 'no')
    } finally {
      setBusy(false)
    }
  }

  const title =
    act.kind === 'FLAG' ? `${act.team.name} rolls off ${act.team.client ?? 'the project'}`
      : act.kind === 'ASK' ? `Ask ${act.row.releaser?.name ?? 'the releasing manager'} about ${act.row.name}`
        : act.kind === 'RESERVE' ? `Reserve ${act.row.name}`
          : `Place ${act.row.name}`

  return (
    <section className="bg-etyme-raised border border-etyme-rule rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="headline-serif text-[20px] text-etyme-ink">{title}</h2>
        <button className="text-[12px] text-etyme-muted hover:text-etyme-ink" onClick={onClose}>Close</button>
      </div>

      {act.kind === 'FLAG' && (
        <form
          className="grid gap-3 sm:grid-cols-3 items-end"
          onSubmit={(e) => {
            e.preventDefault()
            go('/api/bench/ours/flag', 'POST', { sellContractId: act.team.sellContractId, rollsOffOn, keepUntil: keepUntil || undefined }, (j) => j.data.says)
          }}
        >
          <label className="text-[12px] text-etyme-muted">Rolls off on
            <input type="date" required value={rollsOffOn} onChange={(e) => setRollsOffOn(e.target.value)} className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
          </label>
          <label className="text-[12px] text-etyme-muted">Staying with me until (optional)
            <input type="date" value={keepUntil} onChange={(e) => setKeepUntil(e.target.value)} className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
          </label>
          <button disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : 'Put on Our bench'}</button>
          <p className="sm:col-span-3 text-[12px] text-etyme-muted">
            The contract ends on {day(act.team.endsOn) ?? 'no set day'}. {act.team.name} and HR are told; no client sees this.
          </p>
        </form>
      )}

      {act.kind === 'ASK' && (
        <div>
          <p className="text-[13px] text-etyme-muted mb-2">{act.row.says}</p>
          <div className="border border-etyme-rule rounded">
            <Thread
              topic="GENERAL"
              topicId={`our-bench:${act.row.personId}`}
              title={`${act.row.name} · Our bench`}
              withCompany={null}
              canOpen={false}
              onChanged={setThreadCount}
              words={{
                empty: '',
                closed: `Nothing asked yet. Your question goes to ${act.row.releaser?.name ?? 'the releasing manager'}, inside the firm.`,
                foot: 'Only people at your firm read this thread.',
                placeholder: 'Reply…',
              }}
            />
          </div>
          {threadCount === 0 && (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault()
                go(`/api/bench/ours/${act.row.personId}/ask`, 'POST', { message: text }, () => `${act.row.releaser?.name ?? 'The releasing manager'} has your question.`)
              }}
            >
              <textarea
                rows={3} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={`e.g. Is ${act.row.name.split(' ')[0]} free from ${day(act.row.freeOn)} for sure?`}
                className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised text-etyme-ink"
              />
              <button disabled={busy || !text.trim()} className="btn-primary mt-2 disabled:opacity-50">{busy ? 'Sending…' : 'Ask'}</button>
            </form>
          )}
        </div>
      )}

      {act.kind === 'RESERVE' && (
        data.positions.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">You have no open position to hold somebody for: no project of yours runs under an order, and no job request was sent to your firm that you may answer.</p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-3 items-end"
            onSubmit={(e) => {
              e.preventDefault()
              const p = data.positions.find((x) => x.key === position)!
              go('/api/bench/ours/holds', 'POST', {
                personId: act.row.personId,
                ...(p.kind === 'ORDER' ? { sellContractId: p.sellContractId } : { requirementId: p.requirementId }),
                until: until || undefined,
              }, (j) => j.data.says)
            }}
          >
            <label className="text-[12px] text-etyme-muted sm:col-span-2">For
              <select value={position} onChange={(e) => setPosition(e.target.value)} className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink bg-etyme-raised">
                {data.positions.map((p) => (
                  <option key={p.key} value={p.key}>{p.kind === 'ORDER' ? 'Your project: ' : 'Job request: '}{p.title}</option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-etyme-muted">Hold until (if empty: two weeks, or the day they are free if that is later)
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
            </label>
            <p className="sm:col-span-2 text-[12px] text-etyme-muted">{act.row.name} is {act.row.freeOnSays.replace(/^Free/, 'free')}. One hold at a time: nobody else can reserve them while you hold them. {act.row.name} and HR are told.</p>
            <button disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Reserving…' : 'Reserve'}</button>
          </form>
        )
      )}

      {act.kind === 'PLACE' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            go(`/api/bench/ours/holds/${act.row.hold!.id}/place`, 'POST', { startsOn: startsOn || undefined }, (j) =>
              [j.data.says, j.data.cityChange].filter(Boolean).join(' '))
          }}
        >
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
            <div><dt className="text-[10px] uppercase tracking-wide text-etyme-muted">Position</dt><dd className="text-etyme-ink">{act.row.hold!.forTitle}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wide text-etyme-muted">Comes off</dt><dd className="text-etyme-ink">{act.row.project ?? 'Between projects'}{act.row.releaser ? `, confirmed by ${act.row.releaser.name}` : ''}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wide text-etyme-muted">Earliest start</dt><dd className="text-etyme-ink tabular-nums">{day(act.row.freeOn)}</dd></div>
          </dl>
          <label className="block text-[12px] text-etyme-muted max-w-xs">Start on (earliest if empty)
            <input type="date" value={startsOn} min={act.row.freeOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
          </label>
          <p className="text-[12px] text-etyme-muted">
            {act.row.hold!.forKind === 'ORDER'
              ? `A new line on your project’s own order, on the order’s terms, at what ${act.row.name} is paid today. Their current placement still ends on the day it says.`
              : `${act.row.name} goes forward to the client’s job request as your firm’s own employee, at what the firm last billed for them. They start there if the client chooses them.`}
            {' '}{act.row.name} and HR are told; nobody approves it.
          </p>
          <button disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Placing…' : act.row.hold!.forKind === 'ORDER' ? `Place ${act.row.name}` : `Put ${act.row.name} forward`}</button>
        </form>
      )}
    </section>
  )
}
