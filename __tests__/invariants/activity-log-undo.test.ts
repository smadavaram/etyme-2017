import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  ALL_ACTIONS, UNDONE_BY_THE_LOG, UNDONE_ON_JOBS, LOG_CANNOT_UNDO,
  reversibleHere, readRow, notUndoneHereSays, undoneHere,
} from '@/lib/autonomy'

/**
 * Settings > Activity log, the press walk l2b (2026-11-15). "Reverse this
 * action" on a job sent to a supplier marked the row "Reversed" and the
 * supplier still held the job. The reverse route changes no record, so
 * the log offers an undo only for an act named in one reader
 * (UNDONE_BY_THE_LOG), whatever an old row's stored flag says.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Every action name written anywhere in src, so a name nobody declared is walked too. */
function writtenActionNames(): string[] {
  const names = new Set<string>()
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(f)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/action:\s*[^,\n]*?'([A-Z][A-Z0-9_]+)'/g)) names.add(m[1])
        for (const m of readFileSync(p, 'utf8').matchAll(/\? '([A-Z][A-Z0-9_]+)'/g)) names.add(m[1])
      }
    }
  }
  walk(join(process.cwd(), 'src'))
  return [...names]
}

describe('Settings > Activity log, what Reverse really undoes', () => {
  it('the activity log offers an undo only for an act it can really undo', () => {
    for (const action of ALL_ACTIONS) {
      expect(reversibleHere({ action, reversible: true })).toBe(UNDONE_BY_THE_LOG.has(action))
      expect(reversibleHere({ action, reversible: false })).toBe(false)
    }
    // The reverse route changes no record today, so no act is offered.
    expect(UNDONE_BY_THE_LOG.size).toBe(0)
    expect(readRow({ action: 'ROLLOFF_CLAIMED', reversible: true, reversedAt: null }).undo).toBe(LOG_CANNOT_UNDO)
    expect(LOG_CANNOT_UNDO).toBe('The activity log only records this. It cannot undo it.')
  })

  it('a job sent to suppliers is not undone from the log, and the row says where it is stood down', () => {
    expect(reversibleHere({ action: 'REQUISITION_DISTRIBUTED', reversible: true })).toBe(false)
    const said = 'Suppliers are stood down on Jobs, by cancelling the job, not from this log.'
    expect(UNDONE_ON_JOBS.REQUISITION_DISTRIBUTED).toBe(said)
    // An old row the log crossed out reads where the undo is, never "Already undone".
    expect(readRow({ action: 'REQUISITION_DISTRIBUTED', reversible: true, reversedAt: new Date('2026-11-15T10:00:00Z') }).undo).toBe(said)
    expect(notUndoneHereSays('REQUISITION_DISTRIBUTED')).toBe(said)
    expect(said.split(/\s+/).length).toBeLessThanOrEqual(25)
  })

  it('pressing reverse on such a row by a direct call is refused in the row’s own sentence before anything is marked', () => {
    const route = src('src/app/api/automation/[id]/reverse/route.ts')
    const refusedAt = route.indexOf('const notHere = notUndoneHereSays(entry.action)')
    expect(refusedAt).toBeGreaterThan(0)
    expect(refusedAt).toBeLessThan(route.indexOf('data: { reversedAt: now }'))
    for (const action of ALL_ACTIONS) {
      if (!undoneHere(action)) expect(notUndoneHereSays(action)).toBeTruthy()
    }
  })

  it('the can-be-undone tile counts only what the log can undo', () => {
    const route = src('src/app/api/automation/route.ts')
    expect(route).toContain('reversible: reversibleHere(e),')
    expect(route).toContain('where.AND = [{ action: { in: [...UNDONE_BY_THE_LOG] } }]')
    const page = src('src/app/dashboard/automation/page.tsx')
    expect(page).toContain('const reversibleCount = entries.filter((e) => e.reversible && !e.reversedAt).length')
    expect(page).toContain("{entry.reversible && !isReversed && (\n                      <div className=\"mt-4 pt-3 border-t border-etyme-rule/50\">")
  })

  it('every action name the log knows, or any route writes, is offered an undo only when it is in the reader', () => {
    const names = new Set([...ALL_ACTIONS, ...writtenActionNames()])
    expect(names.has('REQUISITION_DISTRIBUTED')).toBe(true)
    const offered = [...names].filter((action) => reversibleHere({ action, reversible: true }))
    expect(offered.filter((a) => !UNDONE_BY_THE_LOG.has(a))).toEqual([])
  })

  it('every act in the log’s undo reader has its real undo written in the reverse route', () => {
    const route = src('src/app/api/automation/[id]/reverse/route.ts')
    for (const action of UNDONE_BY_THE_LOG) expect(route).toContain(`'${action}'`)
  })
})

describe('the + menu', () => {
  it('Invite candidates asks several people at once and never says an email goes', () => {
    const header = src('src/components/shell/header.tsx')
    expect(header).toContain("description: 'Ask several people at once to join your bench'")
    expect(header).not.toContain('Email several people at once')
  })
})
