'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson, isRefusal } from '@/lib/read-response'
import { Panel } from '@/components/ui'
import { ListSurface, type Column } from '@/components/list-surface'
import { COLUMNS, COUNT_LABELS, DASH, PERIOD_LABELS } from '@/lib/skills/performance-words'
import type { Cells } from '@/lib/skills/performance-words'

/**
 * Plan against actual, for each agent and each skill (records 123, 125).
 * Every cell is a number, a dash or a short label from `performance-words`;
 * a dash carries the label that says why. Read by the Owner and Admins;
 * any other seat is refused at the route and this draws nothing. The Owner
 * alone sets a target. No price or charge is shown anywhere. A table and a
 * feed from the same columns (list-surface), the feed first on a phone.
 */

type Period = 'DAY' | 'WEEK' | 'MONTH'
interface Line {
  kind: 'SKILL' | 'AGENT'
  key: string
  name: string
  cells: Cells
  graded: string
  tiers: string
  ledgerActs: number | null
  outputSkill: string | null
}
interface PanelData { period: Period; agents: Line[]; skills: Line[] }

const PERIODS: Period[] = ['DAY', 'WEEK', 'MONTH']
const chipTone = (chip: string) =>
  chip === 'Above target' ? 'text-etyme-verified' : chip === 'Below target' ? 'text-etyme-attention' : 'text-etyme-muted'

function Figure({ c }: { c: { text: string; why: string | null } }) {
  return (
    <span className="tabular-nums">
      {c.text}
      {c.why && <span className="ml-1 text-[12px] text-etyme-muted">{c.why}</span>}
    </span>
  )
}

export function PerformancePanel({ canSet, entityId }: { canSet: boolean; entityId: string }) {
  const [period, setPeriod] = useState<Period>('WEEK')
  const [data, setData] = useState<PanelData | null>(null)
  const [hidden, setHidden] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saying, setSaying] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/decision-items/agents/performance?period=${period}`))
      setData(body.data); setErr(null)
    } catch (e: any) {
      if (isRefusal(e)) { setHidden(true); return }
      setErr(e.message)
    }
  }, [period])
  useEffect(() => { load() }, [load])

  async function setTarget(l: Line) {
    const v = window.prompt(`Target for ${l.name}, a whole number, or empty to clear it`, l.cells.target.why ? '' : l.cells.target.text)
    if (v === null) return
    setSaying(null)
    const target = v.trim() === '' ? null : Number(v)
    try {
      await readJson(await fetch('/api/decision-items/agents/targets', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectKind: l.kind, subjectKey: l.key, period, target, actingEntityId: entityId || null }),
      }))
      setSaying('Saved.'); await load()
    } catch (e: any) { setSaying(e.message) }
  }

  if (hidden) return null

  const columns = (first: string): Column<Line>[] => [
    { key: 'name', label: first, sortValue: (l) => l.name, exportValue: (l) => l.name },
    { key: 'chip', label: COLUMNS.target, sortable: false, render: (l) => <span className={chipTone(l.cells.chip)}>{l.cells.chip}</span>, exportValue: (l) => l.cells.chip },
    { key: 'planned', label: COLUMNS.planned, align: 'right', render: (l) => <Figure c={l.cells.planned} />, exportValue: (l) => l.cells.planned.text },
    { key: 'actual', label: COLUMNS.actual, align: 'right', render: (l) => <Figure c={l.cells.actual} />, exportValue: (l) => l.cells.actual.text },
    {
      key: 'target', label: `${COLUMNS.target} number`, align: 'right', sortable: false,
      render: (l) => (
        <span className="tabular-nums">
          <Figure c={l.cells.target} />
          {canSet && <button className="ml-2 underline text-[12px]" onClick={() => setTarget(l)} aria-label={`Set target for ${l.name}`}>Set</button>}
        </span>
      ),
      exportValue: (l) => l.cells.target.text,
    },
    { key: 'variance', label: COLUMNS.variance, align: 'right', render: (l) => <Figure c={l.cells.variance} />, exportValue: (l) => l.cells.variance.text },
    { key: 'varPct', label: COLUMNS.varPct, align: 'right', render: (l) => <Figure c={l.cells.varPct} />, exportValue: (l) => l.cells.varPct.text },
    { key: 'completion', label: COLUMNS.completion, align: 'right', render: (l) => <Figure c={l.cells.completion} />, exportValue: (l) => l.cells.completion.text },
    { key: 'graded', label: COUNT_LABELS.passed, sortable: false, hideOnMobile: true, render: (l) => <span className="tabular-nums text-etyme-muted">{l.graded}</span>, exportValue: (l) => l.graded },
    { key: 'tiers', label: COUNT_LABELS.rules, sortable: false, hideOnMobile: true, render: (l) => <span className="tabular-nums text-etyme-muted">{l.tiers}</span>, exportValue: (l) => l.tiers },
    ...(first === 'Agent'
      ? [{ key: 'ledgerActs', label: COUNT_LABELS.ledgerActs, align: 'right' as const, render: (l: Line) => <span className="tabular-nums">{l.ledgerActs ?? DASH}</span>, exportValue: (l: Line) => l.ledgerActs ?? DASH }]
      : []),
  ]

  return (
    <div className="mt-6">
      <Panel
        title="Performance"
        subtitle="Planned is what the agent set out to do. Actual is what was checked against the record."
        action={(
          <div role="tablist" aria-label="Period" className="flex gap-1 text-[13px]">
            {PERIODS.map((p) => (
              <button key={p} role="tab" aria-selected={p === period} onClick={() => setPeriod(p)}
                className={p === period ? 'rounded px-2 py-1 bg-etyme-sunk text-etyme-ink' : 'rounded px-2 py-1 text-etyme-muted underline'}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      >
        {err && <p className="text-[13px] text-etyme-attention">{err}</p>}
        {!data && !err && <p className="text-[13px] text-etyme-muted py-2">Opening performance…</p>}
        {data && (
          <div className="space-y-6">
            <ListSurface<Line> name="agent-performance" exportName="agent-performance" phoneView="feed" searchable={false}
              columns={columns('Agent')} data={data.agents} rowKey={(l) => `${l.kind}:${l.key}`} emptyMessage="No agent is on the firm’s list yet." />
            <ListSurface<Line> name="skill-performance" exportName="skill-performance" phoneView="feed" searchable={false}
              columns={columns('Skill')} data={data.skills} rowKey={(l) => `${l.kind}:${l.key}`} emptyMessage="No skill is registered yet." />
          </div>
        )}
        {saying && <p className="mt-2 text-[13px] text-etyme-muted">{saying}</p>}
      </Panel>
    </div>
  )
}
