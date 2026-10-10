/**
 * A lead from the "Ask a person" form reaches a person.
 *
 * The form promises "somebody reads this and writes back". Until
 * 2026-09-27 `POST /api/market/leads` stored the row and emailed nobody,
 * so the promise was kept only when somebody at Etyme happened to open
 * the staff list. A census request already emailed staff; a lead now
 * goes the same way — `tellStaff` in `lib/alerts`, to the addresses on
 * `ETYME_STAFF_EMAILS`, through the one configured sender.
 *
 * Three things the founder approved and these sentences hold:
 * the team hears; the lead is kept whatever happens to the email and a
 * failure becomes an Incident; and pressing the button twice is not two
 * alarms.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    marketingLead: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    incident: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}))

const sent: { to: string; subject: string; body: string }[] = []
let senderFails = false
let senderConfigured = true
vi.mock('@/lib/senders', () => ({
  emailSender: () =>
    senderConfigured
      ? {
          channel: 'EMAIL',
          async send(to: string, subject: string, body: string) {
            if (senderFails) throw new Error('Resend returned 500')
            sent.push({ to, subject, body })
          },
        }
      : null,
}))

vi.mock('@/lib/api-context', () => ({ getSessionEmail: vi.fn(async () => 'founder@etyme.com') }))

import { prisma } from '@/lib/db'
import { POST, GET } from '@/app/api/market/leads/route'
import {
  ASK_COPY,
  leadArrivedNotice,
  shouldTellStaff,
  whoHearsSays,
} from '@/lib/public-site/leads'

const db = prisma as any

const ravi = {
  email: 'Ravi@Techpeple.Example',
  name: 'Ravi Menon',
  companyName: 'Techpeple',
  source: 'HOME_PAGE',
  asked: 'We run 40 contractors through 3 primes and cannot say who is where.',
  filledInMs: 9000,
}

function ask(body: Record<string, unknown>) {
  return POST(
    new NextRequest('https://etyme.example/api/market/leads', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

/** Mail that is about a lead, as opposed to a failure alert. */
const leadMail = () => sent.filter((m) => m.subject.startsWith('Somebody asked'))

beforeEach(() => {
  sent.length = 0
  senderFails = false
  senderConfigured = true
  process.env.ETYME_STAFF_EMAILS = 'founder@etyme.com, ops@etyme.com'
  vi.clearAllMocks()
  db.marketingLead.findUnique.mockResolvedValue(null)
  db.marketingLead.upsert.mockResolvedValue({ id: 'lead_1' })
  db.incident.create.mockResolvedValue({ id: 'inc_1' })
  db.incident.findFirst.mockResolvedValue(null)
  db.incident.update.mockResolvedValue({})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.ETYME_STAFF_EMAILS
})

describe('A lead from the ask form reaches a person', () => {

  it('a lead from the ask form is emailed to the people who answer', async () => {
    const res = await ask(ravi)
    expect(res.status).toBe(200)
    expect(leadMail().map((m) => m.to)).toEqual(['founder@etyme.com', 'ops@etyme.com'])
    expect(db.incident.create).not.toHaveBeenCalled()
  })

  it('the email says who wrote, their work email, the sentence they left, where they wrote from, and where the list is', async () => {
    await ask(ravi)
    const m = leadMail()[0]
    expect(m.subject).toBe('Somebody asked: Ravi Menon, Techpeple')
    expect(m.body).toContain('Ravi Menon (ravi@techpeple.example) at Techpeple')
    expect(m.body).toContain('"We run 40 contractors through 3 primes and cannot say who is where."')
    expect(m.body).toContain('the ask form on the home page')
    expect(m.body).toContain('https://etyme.example/api/market/leads')
  })

  it('the email tells the team nothing automatic follows, so nobody mistakes it for a sequence', () => {
    const { body } = leadArrivedNotice({ email: 'a@b.com', source: 'HOME_PAGE', listUrl: 'x' })
    expect(body).toContain('Nothing automatic follows')
    expect(body).toContain('reply to a@b.com yourself')
  })

  it('a lead who left no sentence still reaches a person, and the email says they left only an address', async () => {
    await ask({ email: 'dana@talvern.example', source: 'HOME_PAGE', filledInMs: 9000 })
    const m = leadMail()[0]
    expect(m.subject).toBe('Somebody asked: dana@talvern.example')
    expect(m.body).toContain('They left no sentence — only an address.')
  })

})

describe('Saving the lead never depends on the email', () => {

  it('a lead is kept even when the email cannot be sent, and the failure is reported', async () => {
    senderFails = true
    const res = await ask(ravi)
    expect(db.marketingLead.upsert).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(db.incident.create).toHaveBeenCalled()
    const incident = db.incident.create.mock.calls[0][0].data
    expect(incident.where).toBe('A lead from the ask form reached nobody')
    expect(incident.message).toContain('ravi@techpeple.example is stored (lead lead_1) and nobody was told')
    expect(incident.message).toContain('Resend returned 500')
  })

  it('a lead is kept when nobody is named to hear it, and the silence is reported', async () => {
    delete process.env.ETYME_STAFF_EMAILS
    const res = await ask(ravi)
    expect(res.status).toBe(200)
    expect(db.marketingLead.upsert).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(0)
    expect(db.incident.create.mock.calls[0][0].data.message).toContain('No ETYME_STAFF_EMAILS is set')
  })

  it('a lead is kept when the email step itself throws, and that is reported', async () => {
    senderConfigured = true
    const spy = vi.spyOn(await import('@/lib/alerts'), 'tellStaff').mockRejectedValueOnce(new Error('connection reset'))
    const res = await ask(ravi)
    expect(res.status).toBe(200)
    expect(db.marketingLead.upsert).toHaveBeenCalledTimes(1)
    expect(db.incident.create.mock.calls[0][0].data.message).toBe('connection reset')
    spy.mockRestore()
  })

  it('the visitor sees the same thanks whether or not anybody could be told', async () => {
    const told = await (await ask(ravi)).json()
    senderFails = true
    delete process.env.ETYME_STAFF_EMAILS
    const untold = await (await ask(ravi)).json()
    expect(told).toEqual({ data: { says: ASK_COPY.thanks } })
    expect(untold).toEqual(told)
  })
})

describe('Nobody is alarmed twice for one person', () => {

  it('a visitor who writes twice does not send the team two alarms', async () => {
    await ask(ravi)
    expect(leadMail()).toHaveLength(2) // one per staff address, one lead
    db.marketingLead.findUnique.mockResolvedValue({
      id: 'lead_1', email: 'ravi@techpeple.example', asked: ravi.asked,
      consentAt: new Date(), convertedAt: null,
    })
    await ask({ ...ravi, asked: 'Also: we pay two suppliers differently for one skill.' })
    await ask(ravi)
    expect(leadMail()).toHaveLength(2)
    // Both later asks are still stored, merged into the one row.
    expect(db.marketingLead.upsert).toHaveBeenCalledTimes(3)
    expect(db.marketingLead.upsert.mock.calls[1][0].update.asked).toContain('two suppliers')
  })

  it('only the first message from an address alarms the team, which bounds the mail however often the button is pressed', () => {
    expect(shouldTellStaff(false)).toBe(true)
    expect(shouldTellStaff(true)).toBe(false)
  })

  it('a script caught by the hidden field alarms nobody and stores nothing', async () => {
    const res = await ask({ ...ravi, company_website: 'http://spam.example' })
    expect(res.status).toBe(400)
    expect(db.marketingLead.upsert).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
})

describe('The staff list says when nobody is told', () => {

  it('the list of leads says plainly when leads are stored and nobody is told', async () => {
    db.marketingLead.findMany.mockResolvedValue([])
    process.env.ETYME_STAFF_EMAILS = ''
    const body = await (await GET()).json()
    expect(body.data.told.told).toBe(false)
    expect(body.data.told.says).toContain('Leads are being stored and nobody is told')
    expect(body.data.told.says).toContain('ETYME_STAFF_EMAILS is not set')
  })

  it('the list says nobody is told when staff are named but there is no way to email them', () => {
    const v = whoHearsSays(2, false)
    expect(v.told).toBe(false)
    expect(v.says).toContain('no email sender is configured')
  })

  it('the list says who hears when both are set', () => {
    const v = whoHearsSays(2, true)
    expect(v.told).toBe(true)
    expect(v.says).toContain('the 2 addresses on ETYME_STAFF_EMAILS')
  })
})
