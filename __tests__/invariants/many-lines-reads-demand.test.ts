import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Regulatory's many-lines reads (lib/contract-clearance:
 * lineExtrasForSellLines, requirementsForSellLines) and money's one-pass
 * three-way check (matchInvoices in lib/invoice-match), switched into the
 * queue, the program page, the region reads and the supplier register.
 */

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
const findings = code('src/app/api/program/desk-findings.ts')

describe('every start’s paperwork, every firm’s line set and every receipt are read at once', () => {
  it('a start’s paperwork read alone is the many-lines read with one line, so one start and many cannot be answered differently', () => {
    expect(findings).toMatch(/export async function startPaperwork\([\s\S]*?const one = await startPaperworkFor\(\[c\], \{ supplierPhraseOf: \(\) => opts\.supplierPhrase/)
  })

  it('every start’s people and firms are read once, and every line’s own set and extras through regulatory’s many-lines read', () => {
    expect(findings).toContain('{ where: { personId: { in: personIds } }, select: { ...VERIFICATION_SHAPE, personId: true } }')
    expect(findings).toContain('{ where: { companyId: { in: companyIds }, personId: null }, select: { ...VERIFICATION_SHAPE, companyId: true } }')
    expect(findings).toContain('lineExtrasForSellLines(lines.map((c) => c.id)),')
    // Each line reads exactly the rows a read of its own would have handed it, without the grouping key.
    expect(findings).toContain('for (const { personId, ...row } of personRows) {')
    expect(findings).toContain('for (const { companyId, ...row } of firmRows) {')
  })

  it('the queue, the program page and the region reads ask for every start at once, never one start after another', () => {
    for (const f of ['src/app/api/decisions/route.ts', 'src/app/api/program/view.ts', 'src/app/api/program/regions/read.ts']) {
      const src = code(f)
      expect(src, f).toContain('startPaperworkFor(')
      expect(src, f).not.toMatch(/await startPaperwork\(/)
    }
  })

  it('the supplier register asks every firm’s line set in the same moment, so the reads underneath are batched, until a many-lines set read exists', () => {
    const desks = code('src/lib/supplier-desks.ts')
    expect(desks).toMatch(/const each = await Promise\.all\(\s*supplierIds\.map\(async \(id\) => \{/)
    expect(desks).not.toContain('requirementsForSellLines(')
  })

  it('the queue checks every open invoice receipt it lists in one pass', () => {
    const route = code('src/app/api/decisions/route.ts')
    expect(route.match(/matchInvoices\(/g)?.length).toBe(1)
    expect(route).not.toMatch(/\bmatchInvoice\(/)
  })

  it('the award tells each group of people in one statement, the same notice each, the groups still in order: the awarded firm, each firm below it, then the person', () => {
    const award = code('src/app/api/submissions/[id]/award/route.ts')
    expect(award).toContain("import { notify, notifyBulk } from '@/lib/notify'")
    expect(award).toMatch(/for \(const notice of \[handoff\.toPaper, handoff\.toSell\]\) \{\s*if \(!notice\) continue\s*await notifyBulk\(notice\.personIds\.map/)
    expect(award).toMatch(/for \(const \[n, hop\] of below\.entries\(\)\) \{[\s\S]*?await notifyBulk\(desks\.map/)
    // Never one notice per person in a loop.
    expect(award).not.toMatch(/Promise\.all\([a-zA-Z.]+\.map\(\([a-zA-Z]+\) =>\s*notify\(/)
  })
})
