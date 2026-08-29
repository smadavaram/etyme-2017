/**
 * The delivery matrix has to be true.
 *
 * It was an HTML page, and within two agent runs it was wrong: accounts
 * receivable still read "not started" after it had been built and tested,
 * and the outbound screening pack had no row at all. Nobody noticed,
 * because a page cannot notice.
 *
 * The rule this codebase learned the expensive way, over the positioning
 * of the home page: **a page describing what is true is wrong within a
 * month; a test is wrong for exactly one commit.**
 *
 * So an agent that builds something and does not record it here breaks
 * the build, on its own commit, while it is still the cheapest moment to
 * fix. That is what turns "update the matrix" from an intention into a
 * step.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MATRIX, allProcesses, groupsFor, coverage } from '@/lib/matrix'
import { DOMAINS } from '@/lib/domains'

const ROOT = process.cwd()
const here = (p: string) => existsSync(join(ROOT, p))

describe('A claim of BUILT is checkable, so nobody can report a feature that is not there', () => {

  it('every process claiming BUILT names the files that implement it', () => {
    const empty = allProcesses()
      .filter((r) => r.l3.status === 'BUILT' && (r.l3.implementedBy ?? []).length === 0)
      .map((r) => `${r.l3.code} ${r.l3.name}`)
    expect(empty, `BUILT with nothing behind it:\n  ${empty.join('\n  ')}`).toEqual([])
  })

  it('every file the matrix names actually exists', () => {
    // The specific failure this catches: a column added, a row marked
    // built, and nothing ever written that touches it.
    const missing = allProcesses().flatMap((r) =>
      (r.l3.implementedBy ?? [])
        .filter((f) => !here(f))
        .map((f) => `${r.l3.code} names ${f}, which does not exist`)
    )
    expect(missing, missing.join('\n  ')).toEqual([])
  })

  it('every process claiming BUILT names tests, and they exist', () => {
    const bad = allProcesses()
      .filter((r) => r.l3.status === 'BUILT')
      .flatMap((r) => {
        const tests = r.l3.testedBy ?? []
        if (tests.length === 0) return [`${r.l3.code} ${r.l3.name} — BUILT with no tests named`]
        return tests.filter((t) => !here(t)).map((t) => `${r.l3.code} names ${t}, which does not exist`)
      })
    expect(bad, bad.join('\n  ')).toEqual([])
  })

  it('a PARTIAL process still names what does exist, so the gap is visible', () => {
    const vague = allProcesses()
      .filter((r) => r.l3.status === 'PARTIAL' && (r.l3.implementedBy ?? []).length === 0)
      .map((r) => `${r.l3.code} ${r.l3.name}`)
    expect(vague, vague.join('\n  ')).toEqual([])
  })

  it('nothing not started pretends to have code behind it', () => {
    const odd = allProcesses()
      .filter((r) => (r.l3.status === 'NONE' || r.l3.status === 'SPEC') && (r.l3.implementedBy ?? []).length > 0)
      .map((r) => r.l3.code)
    expect(odd).toEqual([])
  })
})

describe('The matrix and the agent map cannot drift apart', () => {

  it('every L2 an agent domain claims to answer for is in the matrix', () => {
    const known = new Set(MATRIX.flatMap((l1) => l1.groups.map((g) => g.code)))
    const orphans = DOMAINS.flatMap((d) =>
      d.l2.filter((c) => !known.has(c)).map((c) => `${d.agent} claims ${c}, which is not in the matrix`)
    )
    expect(orphans, orphans.join('\n  ')).toEqual([])
  })

  it('every L2 in the matrix has a domain that really exists', () => {
    const agents = new Set(DOMAINS.map((d) => d.key))
    const bad = MATRIX.flatMap((l1) =>
      l1.groups.filter((g) => !agents.has(g.domain)).map((g) => `${g.code} -> ${g.domain}`)
    )
    expect(bad).toEqual([])
  })

  it('every domain owns at least one group, or it is a domain with no work', () => {
    for (const d of DOMAINS) {
      expect(groupsFor(d.key).length, `${d.agent} owns no L2 group`).toBeGreaterThan(0)
    }
  })
})

describe('The shape holds — levels, codes and owners', () => {

  it('codes are unique the whole way down', () => {
    const codes = [
      ...MATRIX.map((l) => l.code),
      ...MATRIX.flatMap((l) => l.groups.map((g) => g.code)),
      ...allProcesses().map((r) => r.l3.code),
    ]
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('an L3 code sits under the L2 it claims to be part of', () => {
    // L3.4.2.1 belongs under L2.4.2. A code that does not match its
    // parent is a row somebody moved and did not renumber.
    const wrong = allProcesses()
      .filter((r) => !r.l3.code.startsWith('L3.' + r.l2.code.slice(3) + '.'))
      .map((r) => `${r.l3.code} is under ${r.l2.code}`)
    expect(wrong, wrong.join('\n  ')).toEqual([])
  })

  it('every process names an owner and at least one task', () => {
    for (const r of allProcesses()) {
      expect(r.l3.owner.length, r.l3.code).toBeGreaterThan(2)
      expect(r.l3.tasks.length, r.l3.code).toBeGreaterThan(0)
    }
  })

  it('L4 tasks say what somebody does, not what a module is called', () => {
    // "Ageing calculation" is a module. "Buckets from the due date, not
    // the invoice date" is a task somebody can be held to.
    for (const r of allProcesses()) {
      for (const t of r.l3.tasks) {
        expect(t.length, `${r.l3.code}: "${t}"`).toBeGreaterThan(12)
      }
    }
  })
})

describe('It can say where the build actually stands', () => {

  it('counts the whole matrix', () => {
    const c = coverage()
    expect(c.total).toBe(c.built + c.partial + c.spec + c.none)
    expect(c.total).toBeGreaterThan(50)
  })

  it('counts one domain at a time, so an agent can see its own ground', () => {
    const money = coverage('MONEY')
    expect(money.total).toBeGreaterThan(10)
    expect(money.says).toContain('processes built')
  })

  it('can name the least finished group without anybody hardcoding which it is', () => {
    // This test used to assert that accounts payable had nothing built,
    // which was true when it was written and stopped being true the next
    // time somebody built something there. A test that pins the current
    // state of the build fails on every commit that improves it, which
    // is noise rather than signal. So it checks the arithmetic instead.
    const groups = MATRIX.flatMap((l1) => l1.groups).map((g) => ({
      code: g.code,
      built: g.processes.filter((p) => p.status === 'BUILT').length,
      total: g.processes.length,
    }))

    const worst = groups.reduce((a, b) => (a.built / a.total <= b.built / b.total ? a : b))
    expect(worst.total).toBeGreaterThan(0)
    expect(worst.built / worst.total).toBeLessThan(1)
  })

  it('a group is never counted as more built than it has processes', () => {
    for (const l1 of MATRIX) {
      for (const g of l1.groups) {
        const built = g.processes.filter((p) => p.status === 'BUILT').length
        expect(built, g.code).toBeLessThanOrEqual(g.processes.length)
      }
    }
  })
})
