/**
 * The education cases of the document matrix, through the real routes as
 * the real seats (founder, 2026-11-03: "A degree is read, not just held").
 *
 * Eight cases, seven in the decision's order: a degree with every field right
 * (accepted); a future year (warned, HR told why); a year the résumé
 * contradicts (warned); another person's name (sent back with the
 * reason); a file already filed for somebody else (warned, both names to
 * HR only); a provider's verdict clearing a warned degree; and the worker
 * told, in words, what was asked and why; and (2026-11-08) a degree that
 * is not the qualification the job on the line asks for. A warning is the route taking
 * the paper and saying, beside it, what does not look right: counted as
 * held, never as refused, because nothing about a degree stops a start.
 *
 * Nothing here writes a row. Owned by regulatory.
 */
import { randomBytes } from 'node:crypto'
import type { Actor, Res } from '../../actors'
import type { Ctx } from '../../stage'
import { docMatrix, type DocAction } from './doc-matrix'
import { pdf, type PaperFile } from './paper-files'
import { askOf, answerWith, examineAt } from './registration'
import { degreeAskedOfYou, degreeSentBack } from '@/lib/notify/degree-and-start'

export const DEGREE_KIND = 'Degree certificate'
const ATTACH: DocAction = 'attach a file'
const FILL: DocAction = 'fill a form from fields'

/** The placement the cases stand on, as both-ways finds it. */
export interface EducationSubject {
  lineId: string
  personId: string
  personName: string
  supplier: { id: string; name: string }
  worker: Actor
  hr: Actor
}

/** What the examine route said about the degree, beside the paper. Pure. */
export function degreeSaid(res: Pick<Res, 'ok' | 'json'>): string | null {
  return res.ok ? ((res.json?.data?.degree?.says as string | null | undefined) ?? null) : null
}

/** A degree certificate as a PDF, with what is printed on it. Pure but for the serial. */
export function degreeFile(slug: string, printed: { name: string; school: string; qualification: string; year: number }): PaperFile {
  return pdf(`${slug}-degree-${randomBytes(3).toString('hex')}.pdf`, 'Degree certificate', [
    `${printed.school} confers upon ${printed.name}`,
    `the degree of ${printed.qualification},`,
    `awarded in ${printed.year}.`,
  ])
}

/** The fields HR records from the paper on Accept. Pure. */
export function printedFields(p: { name: string; school: string; qualification: string; year: number }): Record<string, string> {
  return { institution: p.school, qualification: p.qualification, nameOnDocument: p.name, year: String(p.year) }
}

/** The résumé's own line for a degree, where the record has one. */
async function resumeLine(ctx: Ctx, personId: string): Promise<{ school: string | null; qualification: string | null; year: number | null } | null> {
  const profile = await ctx.read.consultantProfile.findUnique({ where: { personId }, select: { education: true } })
  const lines = Array.isArray(profile?.education) ? (profile!.education as Record<string, unknown>[]) : []
  const line = lines.find((l) => typeof l?.year === 'number' || (typeof l?.year === 'string' && /^\d{4}$/.test(l.year as string)))
  if (!line) return null
  return {
    school: (line.institution as string) ?? (line.school as string) ?? null,
    qualification: (line.qualification as string) ?? null,
    year: Number(line.year),
  }
}

/** The worker's notice about a paper, by its words. */
async function told(ctx: Ctx, personId: string, entityId: string, body: string): Promise<boolean> {
  const n = await ctx.read.notification.findFirst({ where: { personId, entityId, body }, select: { id: true } })
  return !!n
}

/** Ask the worker for her degree; the request's id. */
async function ask(s: EducationSubject): Promise<string | null> {
  return askOf('hiring', s.hr, DEGREE_KIND, 'CANDIDATE', false, 'PERSON', s.personId)
}

export async function education(ctx: Ctx, s: EducationSubject, other: { actor: Actor; personId: string; personName: string } | null): Promise<void> {
  const year = new Date().getUTCFullYear()
  const line = await resumeLine(ctx, s.personId)
  const right = {
    name: s.personName,
    school: line?.school ?? 'State University',
    qualification: line?.qualification ?? 'Bachelor of Science',
    year: line?.year ?? year - 6,
  }

  // 7 (asked first, because every other case starts with it). The worker told what was asked, and why.
  const first = await ask(s)
  if (!first) return docMatrix.skipped(`${s.supplier.name} could not ask ${s.personName} for a degree certificate`)
  const asked = degreeAskedOfYou({ firmName: s.supplier.name })
  if (await told(ctx, s.personId, first, asked)) {
    docMatrix.took(DEGREE_KIND, ATTACH, { ok: true, status: 200, sentence: null }, `${s.personName} told in words: “${asked}”`)
  } else {
    docMatrix.finding(DEGREE_KIND, `${s.personName} was asked for a degree and no notice said what was asked and why`, 'regulatory')
  }

  // 1. Every field right: accepted, nothing said beside it.
  const file = degreeFile(s.supplier.id, right)
  if (!docMatrix.took(DEGREE_KIND, ATTACH, await answerWith(ctx, 'hiring', s.worker, first, file, false), `${s.personName} sends her degree certificate from her page`)) return
  const ok = await examineAt('hiring', s.hr, first, { verdict: 'ACCEPT', ...printedFields(right) })
  if (ok.ok && degreeSaid(ok) === null) docMatrix.took(DEGREE_KIND, FILL, ok, `every field right (${right.school}, ${right.year}): accepted, nothing said beside it`)
  else if (ok.ok) docMatrix.finding(DEGREE_KIND, `a degree with every field right was accepted with “${degreeSaid(ok)}” beside it`, 'regulatory')
  else docMatrix.took(DEGREE_KIND, FILL, ok, 'every field right: accepted')

  // 2. A future year: taken, and HR told why.
  const ahead = await ask(s)
  if (ahead && (await answerWith(ctx, 'hiring', s.worker, ahead, degreeFile(s.supplier.id, { ...right, year: year + 2 }), false)).ok) {
    const res = await examineAt('hiring', s.hr, ahead, { verdict: 'ACCEPT', ...printedFields({ ...right, year: year + 2 }) })
    docMatrix.held(DEGREE_KIND, FILL, degreeSaid(res) ?? res.sentence, res.ok, 'warned: a graduation year that has not come yet', /has not come yet/)

    // 6. A provider's verdict clears the warned degree.
    const ref = `WES-${randomBytes(3).toString('hex').toUpperCase()}`
    const rec = await s.hr.post('/api/compliance/verifications', {
      contractId: s.lineId, about: 'PERSON', type: 'EDUCATION_EVALUATION', provider: 'WES', reference: ref,
      renderedOn: new Date().toISOString().slice(0, 10), outcome: 'CLEAR', providerSays: 'Degree verified as awarded.',
    })
    if (docMatrix.took(DEGREE_KIND, FILL, rec, `WES’s verification recorded verbatim, reference ${ref}`)) {
      const list = await s.hr.get('/api/documents?view=instances')
      const row = (list.json?.data?.instances as { id: string; degree?: { says: string | null; verified: string | null } | null }[] | undefined)?.find((r) => r.id === ahead)
      if (row?.degree?.verified && /verified the degree/.test(row.degree.verified)) {
        docMatrix.took(DEGREE_KIND, FILL, { ok: true, status: 200, sentence: null }, 'the warned degree now reads “WES verified the degree…”, every warning cleared')
      } else {
        docMatrix.finding(DEGREE_KIND, `after WES’s verification the warned degree read “${row?.degree?.says ?? 'nothing'}” beside it`, 'regulatory')
      }
    }
  } else docMatrix.skipped('a degree with a future year: the ask or the upload did not go')

  // 3. A year the résumé contradicts: warned. Only where the résumé names a year.
  if (line?.year) {
    const off = await ask(s)
    if (off && (await answerWith(ctx, 'hiring', s.worker, off, degreeFile(s.supplier.id, { ...right, year: line.year - 3 }), false)).ok) {
      const res = await examineAt('hiring', s.hr, off, { verdict: 'ACCEPT', ...printedFields({ ...right, year: line.year - 3 }) })
      docMatrix.held(DEGREE_KIND, FILL, degreeSaid(res) ?? res.sentence, res.ok, 'warned: a year the résumé contradicts', /the résumé says/)
    }
  } else docMatrix.skipped(`${s.personName}’s résumé names no year for a degree, so a year it contradicts cannot be tried`)

  // 4. Another person's name: sent back with the reason, and the worker told in the firm's words.
  const wrong = await ask(s)
  if (wrong && (await answerWith(ctx, 'hiring', s.worker, wrong, degreeFile(s.supplier.id, { ...right, name: 'Anita Desai' }), false)).ok) {
    const reason = `The certificate is in the name Anita Desai, not ${s.personName}`
    const back = await examineAt('hiring', s.hr, wrong, { verdict: 'SEND_BACK', reason })
    if (docMatrix.sentBack(DEGREE_KIND, FILL, back, reason)) {
      const said = degreeSentBack({ firmName: s.supplier.name, reason })
      if (!(await told(ctx, s.personId, wrong, said))) docMatrix.finding(DEGREE_KIND, `the degree was sent back and ${s.personName} was not told “${said}”`, 'regulatory')
    }
  }

  // 5. The same file already filed for somebody else: warned, both names to HR only.
  if (other) {
    const theirs = await askOf('hiring', s.hr, DEGREE_KIND, 'CANDIDATE', false, 'PERSON', other.personId)
    if (theirs && (await answerWith(ctx, 'hiring', other.actor, theirs, file, false)).ok) {
      const res = await examineAt('hiring', s.hr, theirs, { verdict: 'ACCEPT' })
      docMatrix.held(DEGREE_KIND, FILL, degreeSaid(res) ?? res.sentence, res.ok, 'warned: the same file already filed for somebody else', `already filed by ${s.personName}`)
      // Said to HR only: neither person's notices carry the other's name.
      const leaked = await ctx.read.notification.findFirst({ where: { personId: { in: [s.personId, other.personId] }, body: { contains: 'already filed by' } }, select: { id: true } })
      if (leaked) docMatrix.finding(DEGREE_KIND, 'a person was told that a file was already filed by somebody else; that is HR’s to read only', 'regulatory')
    } else docMatrix.skipped(`${s.supplier.name} could not ask ${other.personName} for a degree, so the same file for two people was not tried`)
  } else docMatrix.skipped('a second worker, to file the same degree for somebody else')

  // 8. Not what the job asks: the job the line was awarded from names a
  // qualification and the paper shows another. Warned, never refused.
  const job = await ctx.read.sellContract.findUnique({ where: { id: s.lineId }, select: { requirement: { select: { title: true, requiredQualification: true } } } })
  const asks = job?.requirement?.requiredQualification?.trim()
  if (asks) {
    const notIt = { ...right, qualification: 'Associate of Applied Arts' }
    const off = await ask(s)
    if (off && (await answerWith(ctx, 'hiring', s.worker, off, degreeFile(s.supplier.id, notIt), false)).ok) {
      const res = await examineAt('hiring', s.hr, off, { verdict: 'ACCEPT', ...printedFields(notIt) })
      docMatrix.held(DEGREE_KIND, FILL, degreeSaid(res) ?? res.sentence, res.ok, `warned: not the ${asks} the ${job!.requirement!.title} job asks for`, /job asks for/)
    }
  } else docMatrix.skipped(`the job on ${s.personName}’s line names no qualification, so “not what the job asks” cannot be tried`)
}
