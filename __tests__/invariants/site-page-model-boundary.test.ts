/**
 * A firm's public page and the model boundary (CLAUDE.md, "The model
 * boundary, and the four weeks"; found by market 2026-11-01): the page is
 * written by the model only where the firm turned the model on, and every
 * prompt and answer is logged. Held with the switch, the writer and the
 * log handed in (src/app/api/settings/site/write.ts).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeFromRules, type SiteFacts, type SiteVoice } from '@/lib/site-voice'
import type { PromptToRecord } from '@/lib/model-boundary'
import { SITE_PURPOSE, SITE_SAY, factsThatLeave, writePage, type WriteDeps } from '@/app/api/settings/site/write'

const facts: SiteFacts = {
  name: 'Brightmoor Staffing', kind: 'VENDOR', posture: 'PRIME', skills: ['Java', 'Kubernetes'], locations: ['Portland, OR'],
  placements: 41, activeNow: 12, clients: 3, openPositions: 2, comingFree: 4, trainingCourses: 1,
}
const fromModel: SiteVoice = { tagline: 'Java and Kubernetes engineers in Portland.', intro: 'Twelve people on site today.', headings: {}, writtenBy: 'MODEL', note: 'Written for you.' }

function deps(over: Partial<WriteDeps> & { on?: boolean; key?: boolean } = {}) {
  const calls = { model: 0, logged: [] as PromptToRecord[] }
  const d: WriteDeps = {
    modelOn: async () => over.on ?? false,
    writerSetUp: () => over.key ?? true,
    model: over.model ?? (async () => { calls.model++; return fromModel }),
    rules: writeFromRules,
    record: async (p) => { calls.logged.push(p) },
  }
  return { d, calls }
}
const ask = (d: WriteDeps) => writePage({ companyId: 'c1', personId: 'p1', facts }, d)

describe('A firm’s page and the model', () => {
  it('a firm’s page is written by the model only where the firm turned it on, and every prompt is logged', async () => {
    const off = deps({ on: false })
    const page = await ask(off.d)
    expect([page.writtenBy, page.asked, off.calls.model, off.calls.logged.length]).toEqual(['RULES', false, 0, 0])
    expect(page.note).toBe(SITE_SAY.modelOff)
    expect(page.note).toMatch(/Settings/)

    const on = deps({ on: true })
    const written = await ask(on.d)
    expect([written.writtenBy, written.asked, on.calls.model, on.calls.logged.length]).toEqual(['MODEL', true, 1, 1])
    const [log] = on.calls.logged
    expect([log.companyId, log.personId, log.purpose]).toEqual(['c1', 'p1', SITE_PURPOSE])
    expect(log.maskedPrompt).toContain('Placements to date: 41')
    expect(log.maskedAnswer).toContain(fromModel.tagline)
  })

  it('with the switch on and no writer set up on the deployment, nothing is sent and the page says so', async () => {
    const { d, calls } = deps({ on: true, key: false })
    const page = await ask(d)
    expect([page.writtenBy, calls.model, calls.logged.length]).toEqual(['RULES', 0, 0])
    expect(page.note).toBe(SITE_SAY.writerNotSetUp)
  })

  it('an answer that could not be used is still logged, and the page is written by rule from the same facts', async () => {
    for (const model of [async () => null, async () => { throw new Error('slow') }]) {
      const { d, calls } = deps({ on: true, model })
      const page = await ask(d)
      expect([page.writtenBy, page.asked, page.tagline]).toEqual(['RULES', true, writeFromRules(facts).tagline])
      expect(calls.logged.map((l) => l.maskedAnswer)).toEqual([SITE_SAY.answerNotUsed])
    }
  })

  it('what is logged as having left is the firm’s public facts, line by line, and nothing about a person', () => {
    const left = factsThatLeave(facts)
    expect(left.split('\n')[0]).toBe('Company: Brightmoor Staffing')
    expect(left).toContain('What they place or hire: Java, Kubernetes')
    expect(left).not.toMatch(/rate|pay\b|salary|@/i)
  })

  it('no route writes a firm’s page with the model except through the switch', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(f) && !p.endsWith(join('settings', 'site', 'write.ts'))) {
          if (/\b(writeWithModel|writeVoice)\b/.test(readFileSync(p, 'utf8'))) offenders.push(p)
        }
      }
    }
    walk(join(process.cwd(), 'src', 'app'))
    expect(offenders).toEqual([])
  })
})
