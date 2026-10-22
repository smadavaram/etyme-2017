import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as submitCandidate } from '@/app/api/submissions/route'
import { POST as proposeRound } from '@/app/api/submissions/[id]/interviews/route'

/**
 * Two papers the screen walk of 2026-10-22 found asked too late: a
 * license, checked only at the start, and the client's NDA, never asked
 * at interview. Both now come up where the person is put forward and
 * where the round is booked, through the real routes.
 *
 *   Talvern Medical    the client. Its order to Brightline asks the worker
 *                      for an NDA. Its order to Pacer says a missing
 *                      license blocks.
 *   Brightline Health  a supplier putting its own nurses forward.
 *   Pacer Clinical     a second supplier, whose order insists on the license.
 *   Colleen            a nurse with a current state license.
 *   Dana               a nurse with no license on file.
 *   Eli                a nurse whose license ran out last month.
 */

const CLIENT = 'program@talvern.test'
const BRIGHT = 'owner@brightline.test'
const PACER = 'owner@pacer.test'
const DAY = 86_400_000
const now = Date.now()
const at = (d: number) => new Date(now + d * DAY)

const co = { client: '', bright: '', pacer: '' }
const who: Record<string, string> = {}
let nurseJob = ''

async function company(name: string, slug: string, kind: any, email: string) {
  const c = await prisma.company.create({ data: { name, slug, kind, currency: 'USD', defaultPaymentTerms: 30 } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: `${name} owner`, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'papers walk' } })
  return { id: c.id, personId: p.id }
}

async function nurse(name: string, companyId: string, role: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase()}@nurses.test` } })
  await prisma.context.create({ data: { personId: p.id, companyId, type: 'EMPLOYEE', roleId: role, grantReason: 'staff nurse' } })
  await prisma.verification.create({ data: { personId: p.id, type: 'I9_EVERIFY', status: 'CLEAR', provider: 'E-Verify', uploadedById: p.id } })
  return p.id
}

async function license(personId: string, expiresAt: Date) {
  await prisma.verification.create({
    data: {
      personId, type: 'PROFESSIONAL_LICENSE', status: 'CLEAR', provider: 'Wisconsin Board of Nursing',
      issuedAt: at(-700), expiresAt, verifiedAt: at(-30), result: { license: 'RN 154-882', state: 'WI' }, uploadedById: personId,
    },
  })
}

async function order(issuedToId: string, number: string, row: { documentTypeKey: string; blocks?: boolean | null }) {
  const o = await prisma.workOrder.create({
    data: { issuedById: co.client, issuedToId, recordedById: co.client, number, amount: 250_000, startDate: at(-30) },
  })
  await prisma.documentRequirement.create({
    data: { workOrderId: o.id, documentTypeKey: row.documentTypeKey, owedBy: 'WORKER', required: true, blocks: row.blocks ?? null },
  })
}

const submit = async (email: string, fromCompanyId: string, personId: string, extra: Record<string, unknown> = {}) => {
  as(email)
  const r = await json(await submitCandidate(req('POST', '/api/submissions', {
    requirementId: nurseJob, personIds: [personId], rate: 9_500, fromCompanyId, ...extra,
  })))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return r.body.data.results[0]
}

beforeAll(async () => {
  await resetDatabase()
  const client = await company('Talvern Medical', 'talvern', 'CLIENT', CLIENT)
  co.client = client.id
  who.clientOwner = client.personId
  const bright = await company('Brightline Health', 'brightline', 'VENDOR', BRIGHT)
  co.bright = bright.id
  const pacer = await company('Pacer Clinical', 'pacer', 'VENDOR', PACER)
  co.pacer = pacer.id

  for (const firm of [bright, pacer]) {
    for (const type of ['INSURANCE_GL', 'INSURANCE_WC'] as const) {
      await prisma.verification.create({
        data: { companyId: firm.id, type, status: 'CLEAR', provider: 'Hartford', issuedAt: at(-100), expiresAt: at(300), uploadedById: firm.personId },
      })
    }
  }

  const brightNurse = await prisma.role.create({ data: { companyId: co.bright, name: 'Nurse', permissions: ['assignments.read'] } })
  const pacerNurse = await prisma.role.create({ data: { companyId: co.pacer, name: 'Nurse', permissions: ['assignments.read'] } })
  who.colleen = await nurse('Colleen', co.bright, brightNurse.id)
  who.dana = await nurse('Dana', co.bright, brightNurse.id)
  who.eli = await nurse('Eli', co.bright, brightNurse.id)
  who.fern = await nurse('Fern', co.pacer, pacerNurse.id)
  await license(who.colleen, at(700))
  await license(who.eli, at(-20))

  await order(co.bright, 'PO-TAL-1', { documentTypeKey: 'NDA' })
  await order(co.pacer, 'PO-TAL-2', { documentTypeKey: 'PROFESSIONAL_LICENSE', blocks: true })

  const r = await prisma.requirement.create({
    data: {
      companyId: co.client, title: 'Registered nurse, occupational health', skills: ['Occupational health'], status: 'OPEN', approvalState: 'APPROVED',
      headcount: 4, months: 6, startDate: at(14), raisedById: client.personId, ownerId: client.personId,
    },
  })
  nurseJob = r.id
  for (const firm of [co.bright, co.pacer]) {
    await prisma.requirementInvitation.create({
      data: { requirementId: nurseJob, fromCompanyId: co.client, toCompanyId: firm, status: 'SENT', payMin: 8_000, payMax: 11_000, expiresAt: at(30) },
    })
  }
}, 240_000)

describe('a licensed job asks for the license when the person is put forward', () => {
  it('a nurse with a current license is put forward with nothing said about it', async () => {
    const r = await submit(BRIGHT, co.bright, who.colleen)
    expect(r.status, JSON.stringify(r)).toBe('created')
    expect(r.licenseWarning).toBeUndefined()
    who.colleenSubmission = r.submissionId
  })

  it('a nurse with no license on file is warned in a sentence and asked for a reason, and nothing is written until it is given', async () => {
    const r = await submit(BRIGHT, co.bright, who.dana)
    expect(r.status).toBe('needs_reason')
    expect(r.code).toBe('LICENSE_NONE_ON_FILE')
    expect(r.error).toBe(
      'Dana has no state nursing license on file, and “Registered nurse, occupational health” is a licensed job. ' +
        'The submission can go ahead with a reason; nobody starts without a current license.'
    )
    expect(await prisma.submission.count({ where: { personId: who.dana } })).toBe(0)
  })

  it('with a reason, the submission goes through and the warning, its reason code and the reason are on the person’s access row', async () => {
    const reason = 'Her Wisconsin license transfer is approved; the card arrives next week.'
    const r = await submit(BRIGHT, co.bright, who.dana, { reason })
    expect(r.status, JSON.stringify(r)).toBe('created')
    expect(r.licenseCode).toBe('LICENSE_NONE_ON_FILE')
    const row = await prisma.accessLog.findFirst({ where: { action: 'SUBMIT', subjectId: who.dana }, orderBy: { at: 'desc' } })
    expect(row?.reason).toContain('License warned (LICENSE_NONE_ON_FILE)')
    expect(row?.reason).toContain(`Reason given: ${reason}`)
  })

  it('a nurse whose license ran out before the job starts is warned with the day it ran out', async () => {
    const r = await submit(BRIGHT, co.bright, who.eli)
    expect(r.status).toBe('needs_reason')
    expect(r.code).toBe('LICENSE_LAPSED')
    expect(r.error).toContain("Eli's professional license (RN 154-882, WI) ran out on")
  })

  it('where the client’s order says a missing license blocks, the supplier is refused in a sentence and the refusal is logged', async () => {
    const r = await submit(PACER, co.pacer, who.fern, { reason: 'She is licensed; the copy is with our HR.' })
    expect(r.status).toBe('error')
    expect(r.code).toBe('LICENSE_NONE_ON_FILE')
    expect(r.error).toContain("The client's order says nobody is put forward for this job without a current one.")
    expect(await prisma.submission.count({ where: { personId: who.fern } })).toBe(0)
    const logged = await prisma.accessLog.findFirst({ where: { action: 'SUBMIT', subjectId: who.fern } })
    expect(logged?.reason).toContain('LICENSE_NONE_ON_FILE')
  })
})

describe('the client’s NDA is asked when the interview is booked', () => {
  const book = async (submissionId: string) => {
    as(CLIENT)
    const start = at(3)
    return json(await proposeRound(
      req('POST', `/api/submissions/${submissionId}/interviews`, { slots: [{ start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() }] }),
      { params: Promise.resolve({ id: submissionId }) }
    ))
  }

  it('booking a round asks the candidate for the NDA the client’s order requires, and the booking says so', async () => {
    const r = await book(who.colleenSubmission)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.nda).toBe(
      "Colleen has been asked to sign Talvern Medical's non-disclosure agreement before the interview, because Talvern Medical's orders require one."
    )
    expect(r.body.data.says).toContain(r.body.data.nda)
    const paper = await prisma.docInstance.findFirst({
      where: { subjectType: 'PERSON', subjectId: who.colleen, template: { companyId: co.client } },
      include: { template: true },
    })
    expect(paper).toMatchObject({ status: 'SENT', template: { name: 'Non-disclosure agreement', needsSignature: true } })
    let told = null
    for (let i = 0; i < 20 && !told; i++) {
      told = await prisma.notification.findFirst({ where: { personId: who.colleen, entityId: paper!.id } })
      if (!told) await new Promise((res) => setTimeout(res, 100))
    }
    expect(told?.title).toBe('Talvern Medical asks for Non-disclosure agreement')
  })

  it('a second round does not ask for the NDA twice', async () => {
    await prisma.interview.updateMany({ where: { submissionId: who.colleenSubmission }, data: { outcome: 'ADVANCE', state: 'COMPLETED' } })
    const r = await book(who.colleenSubmission)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.nda).toBe("Colleen has been asked for Talvern Medical's non-disclosure agreement and has not signed it yet.")
    expect(await prisma.docInstance.count({ where: { subjectType: 'PERSON', subjectId: who.colleen } })).toBe(1)
  })
})
