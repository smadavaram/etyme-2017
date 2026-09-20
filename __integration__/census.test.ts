import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, resetDatabase, prisma } from './harness'

import { POST as askForCensus } from '@/app/api/census/request/route'
import { POST as acceptAgreement } from '@/app/api/census/agree/route'
import { POST as uploadFiles } from '@/app/api/census/upload/route'
import { GET as readReview, POST as actOnCensus } from '@/app/api/census/review/route'
import { POST as importCensus } from '@/app/api/census/import/route'
import { TEMPLATE_CSV } from '@/lib/census-import'
import { KEPT_DAYS_AFTER_RECEIPT, UPLOAD_WINDOW_DAYS, day } from '@/lib/census'
import { runCensusSweep } from '@/lib/data-request'

/**
 * A client sends us their own contractor data before they are a
 * customer, and everything that protects it is a rule rather than a
 * permission: nobody at the client has an account, so there is nothing
 * to authenticate and nothing to authorise.
 *
 * This is the whole walk of `docs/census-brief.md` — asked, agreed,
 * uploaded, read by one named person, delivered, and deleted on a day
 * that was written down before anybody knew what was in the file.
 */

const STAFF = 'census.runner@etyme.invalid'
const OTHER_STAFF = 'someone.else@etyme.invalid'
const OUTSIDER = 'nosey@outsider.invalid'

const ROWS = [
  'Veritan Talent,Validation Engineer,Tualatin OR,2024-02-01,2026-12-31,92.50,40,C-1001',
  'Veritan Talent,Warehouse Lead,Tualatin OR,2023-01-09,2026-12-31,44.00,37.5,C-1002',
  'Auralis Software,Validation Engineer,Elmira NY,2025-03-03,2026-12-31,110.00,40,C-1003',
]
const FILLED = [TEMPLATE_CSV.split('\n')[0], ...ROWS].join('\n') + '\n'

/** A real multipart post, the way a browser sends one. */
function upload(token: string, files: { name: string; type: string; body: string }[]): NextRequest {
  const form = new FormData()
  for (const f of files) form.append('files', new File([f.body], f.name, { type: f.type }))
  return new NextRequest(`http://localhost:3000/api/census/upload?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: form,
  })
}

const DAY = 86_400_000

let northbendId = ''
let northbendToken = ''
let cavanaughId = ''
let fileId = ''
let sandboxId = ''
let sandboxSlug = ''
let northbendPeople: string[] = []
let quotedDeletionDate = ''

describe('A client asks for a contractor census, and the file goes on the day we said', () => {
  beforeAll(async () => {
    await resetDatabase()
    process.env.ETYME_STAFF_EMAILS = `${STAFF},${OTHER_STAFF}`

    // The named person at Etyme, and a colleague. Both are staff by
    // address and neither holds a seat at any company.
    await prisma.person.create({ data: { name: 'Ruth Calder', primaryEmail: STAFF } })
    await prisma.person.create({ data: { name: 'Tom Ackley', primaryEmail: OTHER_STAFF } })

    // Somebody with a real seat and every permission at their own firm.
    const firm = await prisma.company.create({
      data: { name: 'Outsider Industries', slug: 'census-outsider', kind: 'VENDOR', currency: 'USD' },
    })
    const role = await prisma.role.create({
      data: { companyId: firm.id, name: 'Owner', permissions: ['*'], isDefault: true },
    })
    const nosey = await prisma.person.create({ data: { name: 'Nosey Parker', primaryEmail: OUTSIDER } })
    await prisma.context.create({
      data: { personId: nosey.id, companyId: firm.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Their own firm' },
    })
  }, 300_000)

  // ── Asking ──────────────────────────────────────────────────────────

  it('a client can ask for a census without creating an account', async () => {
    const res = await json(await askForCensus(req('POST', '/api/census/request', {
      companyName: 'Northbend Athletic',
      contactName: 'Dana Whitlock',
      workEmail: 'dana.whitlock@northbend.invalid',
      desk: 'FINANCE',
      supplierCount: 9,
      option: 'TEMPLATE',
    })))
    expect(res.status).toBe(200)
    northbendId = res.body.data.id
    expect(northbendId).toBeTruthy()

    // Nobody signed in, and nothing about them was verified.
    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(row.status).toBe('REQUESTED')
    expect(await prisma.person.findFirst({ where: { primaryEmail: 'dana.whitlock@northbend.invalid' } })).toBeNull()
    expect(await prisma.company.findFirst({ where: { name: 'Northbend Athletic' } })).toBeNull()
  })

  it('a census asked for from a personal address is refused in a sentence that says why a work address is wanted', async () => {
    const res = await json(await askForCensus(req('POST', '/api/census/request', {
      companyName: 'Northbend Athletic',
      contactName: 'Dana Whitlock',
      workEmail: 'dana.whitlock@gmail.com',
      desk: 'FINANCE',
    })))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('personal address')
    expect(await prisma.censusRequest.count()).toBe(1)
  })

  it('the place in the line and the name of the person who will run it are what the client is told', async () => {
    const res = await json(await askForCensus(req('POST', '/api/census/request', {
      companyName: 'Cavanaugh Glassworks',
      contactName: 'Marcus Vine',
      workEmail: 'marcus.vine@cavanaugh.invalid',
      desk: 'PROCUREMENT',
    })))
    expect(res.status).toBe(200)
    cavanaughId = res.body.data.id
    // Northbend is still open, so this one is second.
    expect(res.body.data.queuePosition).toBe(2)
    expect(res.body.data.queueSays).toContain('one census')
    expect(res.body.data.assignedTo).toBe(STAFF)
  })

  // ── Nothing moves until the agreement is accepted ───────────────────

  it('before the agreement is accepted there is no link at all, so there is nowhere to send a file', async () => {
    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(row.uploadToken).toBeNull()
    expect(row.uploadExpires).toBeNull()

    const res = await json(await uploadFiles(upload('', [{ name: 'x.csv', type: 'text/csv', body: FILLED }])))
    expect(res.status).toBe(401)
    expect(res.body.error.message).toContain('Open the link we emailed')
    expect(await prisma.censusFile.count()).toBe(0)
  })

  it('an upload on a link that is not ours is refused without telling somebody guessing that they were close', async () => {
    const res = await json(await uploadFiles(upload('not-a-real-token', [{ name: 'x.csv', type: 'text/csv', body: FILLED }])))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('not one we sent')
    expect(await prisma.censusFile.count()).toBe(0)
  })

  it('nobody at Etyme may take a census into review before somebody at the client has accepted the agreement', async () => {
    as(STAFF)
    const res = await json(await actOnCensus(req('POST', '/api/census/review', { id: northbendId, act: 'REVIEW' })))
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('accepted the census agreement')
  })

  it('an acceptance with no name is refused, because a row that says only "accepted" cannot say who accepted', async () => {
    const res = await json(await acceptAgreement(req('POST', '/api/census/agree', { id: northbendId, acceptedBy: '' })))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('name of whoever')
  })

  it('the agreement is accepted by name, the edition is written down, and the link is minted at that moment and runs out a fortnight later', async () => {
    const res = await json(await acceptAgreement(req('POST', '/api/census/agree', {
      id: northbendId,
      acceptedBy: 'Priya Raman, General Counsel',
      workEmail: 'dana.whitlock@northbend.invalid',
    })))
    expect(res.status).toBe(200)
    northbendToken = res.body.data.uploadToken
    expect(northbendToken).toHaveLength(64)

    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(row.status).toBe('AGREED')
    expect(row.agreementAcceptedBy).toBe('Priya Raman, General Counsel')
    expect(row.agreementVersion).toBeTruthy()
    const fortnight = Math.round((row.uploadExpires!.getTime() - row.agreementAcceptedAt!.getTime()) / DAY)
    expect(fortnight).toBe(UPLOAD_WINDOW_DAYS)
  })

  it('accepting twice hands back the link that exists rather than minting a second one nobody can revoke', async () => {
    const res = await json(await acceptAgreement(req('POST', '/api/census/agree', {
      id: northbendId, acceptedBy: 'Priya Raman, General Counsel',
    })))
    expect(res.status).toBe(200)
    expect(res.body.data.uploadToken).toBe(northbendToken)
    expect(res.body.data.says).toContain('does not make a second one')
  })

  // ── What arrives, and the day it goes ───────────────────────────────

  it('a file we cannot open is refused with its own sentence and nothing is written down', async () => {
    const res = await json(await uploadFiles(upload(northbendToken, [
      { name: 'contractors.zip', type: 'application/zip', body: 'PK...' },
    ])))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('contractors.zip')
    expect(await prisma.censusFile.count()).toBe(0)
  })

  it('the confirmation says what arrived and the day it is deleted, and that day is the one on the row', async () => {
    const res = await json(await uploadFiles(upload(northbendToken, [
      { name: 'northbend-contractors.csv', type: 'text/csv', body: FILLED },
      { name: 'Q3 Veritan invoices.pdf', type: 'application/pdf', body: '%PDF-1.4 ...' },
    ])))
    expect(res.status).toBe(200)
    expect(res.body.data.says).toContain('Received, 2 files')

    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(row.status).toBe('RECEIVED')
    expect(row.receivedFileCount).toBe(2)
    // The one date, read from the one column: what the client was quoted
    // is what the nightly sweep will read.
    quotedDeletionDate = day(row.deleteBy!)
    expect(res.body.data.says).toContain(quotedDeletionDate)
    expect(new Date(res.body.data.deleteBy).getTime()).toBe(row.deleteBy!.getTime())

    const outFor = Math.round((row.deleteBy!.getTime() - row.filesReceivedAt!.getTime()) / DAY)
    expect(outFor).toBe(KEPT_DAYS_AFTER_RECEIPT)
  })

  it('sending one more file later does not buy the client three more weeks of us holding their data', async () => {
    const before = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    const res = await json(await uploadFiles(upload(northbendToken, [
      { name: 'late-addition.csv', type: 'text/csv', body: 'supplier,role\n' },
    ])))
    expect(res.status).toBe(200)
    const after = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(after.receivedFileCount).toBe(3)
    expect(after.deleteBy!.getTime()).toBe(before.deleteBy!.getTime())
    expect(res.body.data.keptBecause).toContain('It is not moved')
  })

  // ── Who may open it ─────────────────────────────────────────────────

  it('a customer with every permission at their own firm cannot open a census, and the refusal says whose promise that is', async () => {
    as(OUTSIDER)
    const res = await json(await readReview(req('GET', `/api/census/review?id=${northbendId}`)))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('promise made to the client')
  })

  it('the named person can see the queue holding no seat at any company', async () => {
    as(STAFF)
    const res = await json(await readReview(req('GET', '/api/census/review')))
    expect(res.status).toBe(200)
    expect(res.body.data.censuses).toHaveLength(2)
    const northbend = res.body.data.censuses.find((c: { id: string }) => c.id === northbendId)
    expect(northbend.yours).toBe(true)
    expect(northbend.deletionSays).toContain(quotedDeletionDate)
  })

  it('the rows are loaded into a private company of the client’s own, and only then are there people to record a read against', async () => {
    as(STAFF)
    const res = await json(await importCensus(req('POST', '/api/census/import', { requestId: northbendId })))
    expect(res.status).toBe(200)
    expect(res.body.data.imported).toBe(3)
    sandboxId = res.body.data.sandboxCompanyId
    sandboxSlug = (await prisma.company.findUniqueOrThrow({ where: { id: sandboxId } })).slug
    northbendPeople = (await prisma.sellContract.findMany({
      where: { clientCompanyId: sandboxId }, select: { personId: true },
    })).map((c) => c.personId)

    const file = await prisma.censusFile.findFirstOrThrow({
      where: { requestId: northbendId, fileName: 'northbend-contractors.csv' },
    })
    fileId = file.id
  })

  it('a member of Etyme staff who is not the named person cannot open the file, and is told to reassign it rather than read it quietly', async () => {
    as(OTHER_STAFF)
    const res = await json(await readReview(req('GET', `/api/census/review?fileId=${fileId}`)))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain(STAFF)

    // The refusal is the interesting one, and it is on the record.
    const refusals = await prisma.accessLog.findMany({ where: { action: 'CENSUS_READ', allowed: false } })
    expect(refusals.length).toBe(3)
    expect(refusals[0].reason).toContain('northbend-contractors.csv')
  })

  it('the person the client was told about opens the file, and the read is recorded before the bytes go out', async () => {
    as(STAFF)
    const res = await readReview(req('GET', `/api/census/review?fileId=${fileId}`))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('C-1001')

    const ruth = await prisma.person.findFirstOrThrow({ where: { primaryEmail: STAFF } })
    const reads = await prisma.accessLog.findMany({
      where: { action: 'CENSUS_READ', allowed: true, actorPersonId: ruth.id },
    })
    // One per contractor whose details were in the file.
    expect(reads.length).toBe(3)

    const file = await prisma.censusFile.findUniqueOrThrow({ where: { id: fileId } })
    expect(file.readCount).toBe(2)
  })

  // ── The page goes back ──────────────────────────────────────────────

  it('delivering the page keeps it as it was sent, and what we could not see is never left blank', async () => {
    as(STAFF)
    const res = await json(await actOnCensus(req('POST', '/api/census/review', {
      id: northbendId, act: 'DELIVER',
      gapsNote: 'The Veritan invoices are a scan and were read by hand.',
    })))
    expect(res.status).toBe(200)

    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(row.status).toBe('DELIVERED')
    expect(row.deliveredAt).not.toBeNull()
    expect(row.pageHtml).toContain('Northbend Athletic')
    expect(row.gapsNote).toContain('read by hand')
    expect(row.gapsNote!.length).toBeGreaterThan(0)
    // Delivering does not move the day the data goes.
    expect(day(row.deleteBy!)).toBe(quotedDeletionDate)
  })

  // ── The nightly sweep ───────────────────────────────────────────────

  it('a census three days from its date with the page still unsent tells the named person, once a night', async () => {
    // Cavanaugh accepted, sent a file, and nothing has gone back.
    const agreed = await json(await acceptAgreement(req('POST', '/api/census/agree', {
      id: cavanaughId, acceptedBy: 'Elin Sorenson, Counsel',
    })))
    await uploadFiles(upload(agreed.body.data.uploadToken, [
      { name: 'cavanaugh.csv', type: 'text/csv', body: FILLED },
    ]))
    await prisma.censusRequest.update({
      where: { id: cavanaughId },
      data: { status: 'IN_REVIEW', deleteBy: new Date(Date.now() + 2 * DAY) },
    })

    const first = await runCensusSweep(new Date())
    expect(first.warned).toBe(1)
    expect(first.deleted).toBe(0)

    const ruth = await prisma.person.findFirstOrThrow({ where: { primaryEmail: STAFF } })
    const told = await prisma.notification.findMany({ where: { personId: ruth.id, entityId: cavanaughId } })
    expect(told).toHaveLength(1)
    expect(told[0].body).toContain('has not been sent')

    // Run it again the same night and nobody is told twice.
    const second = await runCensusSweep(new Date())
    expect(second.warned).toBe(0)
  })

  it('a census that became a program keeps its data, and the deletion is called off with a reason', async () => {
    as(STAFF)
    // They read their page and signed, so their rows are already loaded.
    await importCensus(req('POST', '/api/census/import', { requestId: cavanaughId }))

    const noReason = await json(await actOnCensus(req('POST', '/api/census/review', {
      id: cavanaughId, act: 'PROGRAM_STARTED', because: '',
    })))
    expect(noReason.status).toBe(422)
    expect(noReason.body.error.message).toContain('Say why')

    const res = await json(await actOnCensus(req('POST', '/api/census/review', {
      id: cavanaughId, act: 'PROGRAM_STARTED',
      because: 'Cavanaugh signed for a program on 2026-09-20, so their rows are the opening balance of it.',
    })))
    expect(res.status).toBe(200)

    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: cavanaughId } })
    expect(row.status).toBe('PROGRAM_STARTED')
    expect(row.deletionCancelledBecause).toContain('opening balance')

    const logged = await prisma.automationLog.findFirstOrThrow({ where: { action: 'CENSUS_DELETION_CANCELLED' } })
    expect(logged.summary).toContain('called off')
    expect(logged.reversible).toBe(true)

    // Long past its day, and it is not swept.
    await prisma.censusRequest.update({ where: { id: cavanaughId }, data: { deleteBy: new Date(Date.now() - 90 * DAY) } })
    const swept = await runCensusSweep(new Date())
    expect(swept.deleted).toBe(0)
    expect(await prisma.censusFile.count({ where: { requestId: cavanaughId } })).toBe(1)
  })

  it('on the day it said, the files go, the rows loaded from them go, and the private company they sat in goes', async () => {
    const before = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(await prisma.sellContract.count({ where: { clientCompanyId: sandboxId } })).toBe(3)

    // The morning after the date on their confirmation.
    const theDay = new Date(before.deleteBy!.getTime() + 60_000)
    const outcome = await runCensusSweep(theDay)
    expect(outcome.deleted).toBe(1)

    expect(await prisma.censusFile.count({ where: { requestId: northbendId } })).toBe(0)
    expect(await prisma.sellContract.count({ where: { clientCompanyId: sandboxId } })).toBe(0)
    expect(await prisma.company.findUnique({ where: { id: sandboxId } })).toBeNull()
    // The supplier companies made from their file, and only theirs —
    // Cavanaugh sent the same supplier names and keeps its own.
    expect(await prisma.company.count({ where: { slug: { startsWith: `${sandboxSlug}-s-` } } })).toBe(0)
    expect(await prisma.person.count({ where: { id: { in: northbendPeople } } })).toBe(0)
    expect(await prisma.company.count({ where: { isCensusSandbox: true, name: 'Veritan Talent' } })).toBe(1)
  })

  it('what is left is the row that proves we deleted on the day we said, with the count and the bytes kept', async () => {
    const row = await prisma.censusRequest.findUniqueOrThrow({ where: { id: northbendId } })
    expect(row.status).toBe('DELETED')
    expect(row.deletedAt).not.toBeNull()
    expect(row.receivedFileCount).toBe(3)
    expect(row.receivedBytes).toBeGreaterThan(0)
    expect(row.sandboxCompanyId).toBeNull()
    // The page as it was sent survives the numbers behind it, which is
    // the point of storing it rather than recomputing it.
    expect(row.pageHtml).toContain('Northbend Athletic')
  })

  it('a census already deleted is not deleted again, and nothing more can be done to it', async () => {
    const again = await runCensusSweep(new Date(Date.now() + 365 * DAY))
    expect(again.deleted).toBe(0)

    as(STAFF)
    const res = await json(await actOnCensus(req('POST', '/api/census/review', { id: northbendId, act: 'REVIEW' })))
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('deleted on the day')
  })
})
