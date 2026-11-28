/**
 * The answer key for outreach.push (record 135). It re-reads the pushes the
 * firm drafted inside the window and holds each to the letter's own rules:
 * the words pass `draftRefusal`, state no amount of money and carry no web
 * address of their own. It never takes the drafter's report.
 */
import type { PrismaClient } from '@prisma/client'
import { draftRefusal } from '@/lib/outreach/match-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

const MONEY = /[$€£₹]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|dollars?)\b/i
const ADDRESS = /https?:\/\/|www\./i

export const outreachPush: SkillChecker<PrismaClient> = async (companyId, _k, window, _refs, read): Promise<CheckerResult> => {
  const rows = await read.outreachPush.findMany({ where: { companyId, createdAt: { gte: window.from, lt: window.to } }, select: { id: true, subject: true, body: true } })
  if (rows.length === 0) return unknownBecause('No push was drafted inside the window, so there is nothing to read back.')
  for (const r of rows) {
    const text = `${r.subject}\n${r.body}`
    const problem = draftRefusal({ subject: r.subject, body: r.body }) ?? (MONEY.test(text) ? 'It states an amount of money.' : ADDRESS.test(text) ? 'It carries a web address of its own.' : null)
    if (problem) return { verdict: 'FAIL', reason: `A drafted push is not fit to send: ${problem}`, evidence: `Push ${r.id}`, unitsFound: 0 }
  }
  return { verdict: 'PASS', reason: 'Every drafted push passes the letter rules, states no money and carries no address of its own.', evidence: `${rows.length} pushes`, unitsFound: rows.length }
}
