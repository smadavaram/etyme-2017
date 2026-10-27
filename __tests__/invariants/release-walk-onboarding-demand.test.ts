import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayActAt, stageWordOf, stepsOf, type Desks } from '@/lib/supplier-onboarding'
import { inviteRolesFrom } from '@/lib/supplier-desks'
import { applyPrefill, type EarlierApplication } from '@/lib/supplier-link'
import { defaultPanel, budgetField, nobodyToSendTo } from '@/app/dashboard/requisitions/facts'
import { ownJobsAddress, readsMarginClass } from '@/app/dashboard/requirements/words'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The onboarding fix wave from the release walk of 2026-10-27, on a new
 * client: Brackenridge Tools, one Owner (Ruth), recommends Quarrybrook
 * Staffing, raises its first job, and Quarrybrook applies.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const RUTH = 'p-ruth'
/** A client's roles, as every new client gets them. */
const CLIENT_ROLE_SEEDS = rolesFor('CLIENT').map((r) => ({ name: r.name, permissions: [...r.permissions] as string[] }))
const desks = (over: Partial<Desks> = {}): Desks => ({ leadId: null, hrId: null, procurementId: null, ...over })
const base = {
  stage: 'LEAD' as const, permissions: ['*'], callerId: RUTH, recommendedById: RUTH,
  decisions: [], desks: desks(), firmName: 'Quarrybrook Staffing', companyName: 'Brackenridge Tools',
}

describe('a client with one person approving a supplier', () => {
  it('a client with one person is told which role to invite to approve a supplier, and that person can decide the moment they are seated', () => {
    const roles = inviteRolesFrom(CLIENT_ROLE_SEEDS, 'LEAD')
    expect(roles).toEqual(['Program Manager', 'Approver'])
    const alone = mayActAt({ ...base, deskHolders: [RUTH], inviteRoles: roles })
    expect(alone.ok).toBe(false)
    expect(alone.ok === false && alone.code).toBe('NOBODY_ELSE')
    expect(alone.ok === false && alone.message).toContain('Invite somebody as Program Manager or Approver')
    expect(alone.ok === false && alone.message).toContain('The person who recommended a firm cannot approve it')
    expect(alone.ok === false && alone.message).not.toMatch(/a second person/)

    // A Procurement Lead invited first is told the same thing, not to invite "a second person".
    const lead = mayActAt({ ...base, permissions: ['vendors.manage'], callerId: 'p-ian', deskHolders: [RUTH], inviteRoles: roles })
    expect(lead.ok === false && lead.message).toContain('Invite somebody as Program Manager or Approver')

    // The Approver she invites stands in on arrival: the desk lists him, and he holds no governance.write.
    const approver = mayActAt({ ...base, permissions: ['requirements.read', 'governance.read'], callerId: 'p-amara', deskHolders: [RUTH, 'p-amara'], inviteRoles: roles })
    expect(approver.ok, approver.ok === false ? approver.message : '').toBe(true)
    // So does a Program Manager, by permission.
    const pm = mayActAt({ ...base, permissions: ['governance.write'], callerId: 'p-pm', deskHolders: [RUTH, 'p-pm'] })
    expect(pm.ok).toBe(true)
  })

  it('the roles a firm is told to invite are its own, never the Owner’s everything role', () => {
    expect(inviteRolesFrom(CLIENT_ROLE_SEEDS, 'LEAD')).not.toContain('Owner')
    expect(inviteRolesFrom(CLIENT_ROLE_SEEDS, 'PROCUREMENT')).toEqual(['Program Manager', 'Procurement Lead'])
    expect(inviteRolesFrom(CLIENT_ROLE_SEEDS, 'HR')).toEqual(['Program Manager', 'HR Partner'])
    expect(inviteRolesFrom(CLIENT_ROLE_SEEDS, 'FINANCE')).toEqual(['AP Clerk'])
    // A renamed role is said as renamed.
    const renamed = CLIENT_ROLE_SEEDS.map((r) => (r.name === 'Program Manager' ? { ...r, name: 'Program Lead' } : r))
    expect(inviteRolesFrom(renamed, 'LEAD')).toEqual(['Program Lead', 'Approver'])
  })

  it('the chip and the heading on a pending supplier name the same role', () => {
    // No department lead named: every surface says Program manager.
    const chip = stageWordOf('LEAD', false)
    const now = stepsOf('LEAD', 'RECOMMENDED', [], false).find((s) => s.status === 'now')!
    expect(chip).toBe('Program manager')
    expect(now.word).toBe(chip)
    const refusal = mayActAt({ ...base, deskHolders: [RUTH], inviteRoles: ['Program Manager'] })
    expect(refusal.ok === false && refusal.message).toContain(`for ${chip} yet`)
    // A lead named: every surface says Department lead.
    expect(stageWordOf('LEAD', true)).toBe('Department lead')
    expect(stepsOf('LEAD', 'RECOMMENDED', [], true)[0].word).toBe('Department lead')
    // The list route and the queue read the one function, never STAGE_WORD for the chip.
    expect(read('src/app/api/supplier-requests/route.ts')).toMatch(/stageWord: stage === 'DONE' \? STATE_WORD_OF\(state\) : stageWordOf\(stage, desks\.leadId != null, walk\)/)
    expect(read('src/app/api/decisions/route.ts')).toMatch(/stageWordOf\(stage, desks\.leadId != null, walk\)/)
  })
})

describe('the apply form, filled once', () => {
  const earlier: EarlierApplication[] = [{
    requestId: 'sr-northbend', clientName: 'Northbend Athletic', at: '2026-10-02T15:00:00.000Z',
    docs: [
      { key: 'TAX_FORM', fileName: 'w9-2026.pdf', fileUrl: '/api/documents/d1/file', at: '2026-10-02T15:00:00.000Z' },
      { key: 'INSURANCE', fileName: 'coi.pdf', fileUrl: '/api/documents/d2/file', at: '2026-10-02T15:00:00.000Z' },
    ],
    references: [{ name: 'Ana Cruz', company: 'Halden Foods', email: 'ana@halden.example', phone: '' }, { name: 'Bo Lin', company: 'Marrow Labs', email: '', phone: '' }],
    bank: { bankName: 'First Ohio', accountName: 'Quarrybrook Staffing LLC', last4: '4471' },
  }]
  const firm = { name: 'Quarrybrook Staffing', legalName: 'Quarrybrook Staffing LLC', address: '12 Mill St, Dayton, OH', website: 'https://quarrybrook.example', bank: null }

  it('a supplier applying to a second client finds its papers and references filled from the first, and re-sends them in one click', () => {
    const p = applyPrefill({ application: null, recommendedSkills: ['Machinists'], firm, earlier, signedInAtFirm: true, fileKeys: ['TAX_FORM', 'INSURANCE', 'GOOD_STANDING'] })
    expect(p.sentBefore.map((b) => b.key)).toEqual(['TAX_FORM', 'INSURANCE'])
    expect(p.sentBefore[0].says).toBe('Sent before to Northbend Athletic on Oct 2, 2026.')
    expect(p.references.map((r) => r.name)).toEqual(['Ana Cruz', 'Bo Lin'])
    expect(p.referencesSays).toBe('Sent before to Northbend Athletic on Oct 2, 2026.')
    expect(p.bank?.last4).toBe('4471')
    // One click: the page sends every paper sent before in one request.
    const page = read('src/app/apply/[token]/page.tsx')
    expect(page).toMatch(/reuse: data\.prefill\.sentBefore\.map/)
    expect(page).toContain('Send these to ${data.client}')
  })

  it('the apply form opens with the firm’s name and the skills the client typed, and shows nothing sent to another client to a visitor not signed in at the firm', () => {
    const p = applyPrefill({ application: null, recommendedSkills: ['Machinists', 'CNC'], firm, earlier, signedInAtFirm: false, fileKeys: ['TAX_FORM'] })
    expect(p.legalName).toBe('Quarrybrook Staffing LLC')
    expect(p.address).toBe('12 Mill St, Dayton, OH')
    expect(p.website).toBe('https://quarrybrook.example')
    expect(p.skills).toBe('Machinists, CNC')
    expect(p.sentBefore).toEqual([])
    expect(p.references).toEqual([])
    expect(p.bank).toBeNull()
    // What the firm already typed on this link wins over every other source.
    const own = applyPrefill({ application: { legalName: 'QB LLC', skills: ['Welders'] }, recommendedSkills: ['Machinists'], firm, earlier, signedInAtFirm: true, fileKeys: [] })
    expect(own.legalName).toBe('QB LLC')
    expect(own.skills).toBe('Welders')
    // With no record at all, the name the client typed is never invented: blank.
    expect(applyPrefill({ application: null, recommendedSkills: [], firm: null, earlier: [], signedInAtFirm: false, fileKeys: [] }).legalName).toBe('')
  })

  it('every field on the apply form has a label that stays when it is filled', () => {
    const page = read('src/app/apply/[token]/page.tsx')
    expect(page).not.toMatch(/placeholder=/)
    // Every text box and text area sits inside a Labelled, whose words are above the box, not in it.
    const boxes = page.match(/<(input|textarea)\b[^>]*>/g) ?? []
    const typed = boxes.filter((b) => !/type="(file|date)"/.test(b))
    expect(typed.length).toBe(13)
    const labelled = page.match(/<Labelled label="[^"]+"[^>]*>\s*<(input|textarea)/g) ?? []
    expect(labelled.length).toBe(typed.length)
    // A file or a date carries its words on the control.
    expect(page).toContain('aria-label={a.label}')
    expect(page).toContain('aria-label={`${a.label} starts`}')
    expect(page).toContain('aria-label={`${a.label} runs out`}')
  })
})

describe('a new client’s first job', () => {
  it('a new client’s job defaults its interviewer to the hiring manager and says nobody can be sent it until a supplier is approved', () => {
    expect(defaultPanel('Ruth Okonjo')).toEqual(['Ruth Okonjo'])
    expect(defaultPanel(null)).toEqual([])
    const nobody = nobodyToSendTo({ open: true, suppliers: [] })
    expect(nobody).toEqual({ says: 'Nobody to send it to yet.', href: '/dashboard/suppliers', link: 'Recommend a supplier.' })
    expect(nobodyToSendTo({ open: true, suppliers: [{ blocked: true }] })).not.toBeNull()
    expect(nobodyToSendTo({ open: true, suppliers: [{ blocked: false }] })).toBeNull()
    // A register that could not be read is not "none", and a closed job has no next step.
    expect(nobodyToSendTo({ open: true, suppliers: null })).toBeNull()
    expect(nobodyToSendTo({ open: false, suppliers: [] })).toBeNull()
    const form = read('src/app/dashboard/requisitions/page.tsx')
    expect(form).toMatch(/const panel = panelEdited \? typedPanel : defaultPanel\(ownerName\)/)
    expect(read('src/app/dashboard/requisitions/[id]/page.tsx')).toMatch(/nobodyToSendTo\(\{ open: jobOpen && r\.status === 'OPEN'/)
  })

  it('a job form with no budget set up does not ask for one and does not say it goes for approval', () => {
    const none = budgetField(false)
    expect(none.show).toBe(false)
    expect(none.says).toBe('No budget is set up here yet, so this job needs none. Once one is set up, you pick it here.')
    expect(none.says).not.toMatch(/approval/)
    expect(budgetField(true).show).toBe(true)
  })
})

describe('a client on the supplier’s jobs address', () => {
  it('a client typing the supplier’s jobs address lands on its own Jobs and never reads a margin class', () => {
    expect(ownJobsAddress('CLIENT')).toBe('/dashboard/requisitions')
    expect(ownJobsAddress('VENDOR')).toBeNull()
    expect(readsMarginClass('CLIENT')).toBe(false)
    expect(readsMarginClass('VENDOR')).toBe(true)
    const list = read('src/app/dashboard/requirements/page.tsx')
    expect(list).toMatch(/if \(elsewhere\) router\.replace\(elsewhere/)
    // Nothing of the supplier's page is drawn for a client while it moves.
    expect(list).toMatch(/if \(elsewhere\) return <LoadingState/)
    expect(read('src/app/dashboard/requirements/[id]/page.tsx')).toMatch(/requirement\.marginClass && readsMarginClass\(company\?\.kind\)/)
  })
})

import { asksForSeat } from '@/app/dashboard/program/own-refusal'
import { noSeatYet } from '@/lib/program-seat'

describe('a seat for an MSP, granted and asked for on the screens', () => {
  it('a client grants an MSP a seat from its Settings page, never by the API alone', () => {
    const page = read('src/app/dashboard/program/seats/page.tsx')
    expect(page).toContain("import { GrantSeat } from '@/components/settings/grant-seat'")
    expect(page).toMatch(/side === 'CLIENT' && <GrantSeat onGranted=/)
    // Taking the role back asks why in a box on the page, never a browser prompt.
    expect(page).not.toContain('window.prompt')
    expect(page).toContain('Why is {seat.office.name} losing the {seat.role.name} role?')
  })

  it('an MSP with no seat sees Ask for a seat on its first screen', () => {
    expect(asksForSeat('MSP', noSeatYet('Palliser MSP'))).toBe(true)
    expect(asksForSeat('MSP', 'Palliser MSP is not tied to a client yet. A client’s program …')).toBe(true)
    expect(asksForSeat('VENDOR', noSeatYet('Brightmoor'))).toBe(false)
    expect(asksForSeat('MSP', 'Something else entirely.')).toBe(false)
    const program = read('src/app/dashboard/program/page.tsx')
    expect(program).toMatch(/<RefusedWithWayForward wayForward=\{asksForSeat\(sessionKind, refused\) \? <AskForSeat \/> : null\}><RefusedState says=\{refused\} \/>/)
    expect(read('src/app/dashboard/program/seats/page.tsx')).toMatch(/side === 'OFFICE' && nothingYet && <AskForSeat \/>/)
  })
})

import { walkFor, papersChecklist, nextStage, linkSays, stageAsks, stageVerb, recommendSays } from '@/lib/supplier-onboarding'
import { checkedSays } from '@/app/dashboard/requisitions/facts'

describe('the second onboarding walk, on a vendor and its own sub-vendor', () => {
  it('a vendor adding its own sub-vendor checks its papers and never walks a client’s four roles', () => {
    expect(walkFor('CLIENT')).toBe('FOUR')
    expect(walkFor('VENDOR')).toBe('PAPERS')
    expect(walkFor('GSI')).toBe('PAPERS')
    const papers = papersChecklist()
    expect(papers.map((i) => i.key).sort()).toEqual(['AGREEMENT', 'GOOD_STANDING', 'INSURANCE', 'TAX_FORM'])
    expect(papers.every((i) => i.desk === 'HR' && i.required && i.papers)).toBe(true)
    // One person may do it, the one who brought the firm in included.
    const owner = mayActAt({ ...base, stage: 'HR', permissions: ['*'], walk: 'PAPERS' })
    expect(owner.ok).toBe(true)
    const hr = mayActAt({ ...base, stage: 'HR', permissions: ['governance.read'], callerId: 'p-hr', walk: 'PAPERS' })
    expect(hr.ok).toBe(true)
    const recruiter = mayActAt({ ...base, stage: 'HR', permissions: ['consultants.write', 'submissions.create'], callerId: 'p-rec', walk: 'PAPERS' })
    expect(recruiter.ok === false && recruiter.message).toContain('checked by HR, the Compliance Officer or the Owner')
    expect(recruiter.ok === false && recruiter.message).not.toMatch(/Invite|Department lead|Procurement|Finance/)
    expect(nextStage('HR', 'PAPERS')).toBe('DONE')
    expect(stepsOf('HR', 'RECOMMENDED', [], true, 'PAPERS').map((s) => s.word)).toEqual(['Papers', 'Supplier'])
    expect(stageWordOf('HR', true, 'PAPERS')).toBe('Papers')
    expect(stageAsks('HR', 'PAPERS')).toContain('the W-9, the insurance, the good standing and the signed agreement')
    expect(stageVerb('HR', 'PAPERS')).toBe('Its papers are in order')
    expect(recommendSays('PAPERS')).not.toMatch(/four approvals|department lead/)
  })

  it('a second client’s apply form carries every answer the firm gave the first, the certificate dates included', () => {
    const first: EarlierApplication = {
      requestId: 'sr-1', clientName: 'Northbend Athletic', at: '2026-10-02T15:00:00.000Z',
      docs: [{ key: 'INSURANCE', fileName: 'coi.pdf', fileUrl: '/api/documents/d2/file', validFrom: '2026-09-01', validUntil: '2027-08-31' }],
      references: [], bank: null,
      legalName: 'Quarrybrook Staffing LLC', address: '12 Mill St, Dayton, OH', website: 'https://quarrybrook.example',
      experience: 'Nine years placing machinists.',
    }
    const p = applyPrefill({ application: null, recommendedSkills: [], firm: null, earlier: [first], signedInAtFirm: true, fileKeys: ['INSURANCE'] })
    expect(p).toMatchObject({ legalName: 'Quarrybrook Staffing LLC', address: '12 Mill St, Dayton, OH', website: 'https://quarrybrook.example', experience: 'Nine years placing machinists.' })
    expect(p.sentBefore[0]).toMatchObject({ validFrom: '2026-09-01', validUntil: '2027-08-31' })
    // Nobody but a person at the firm reads what it told another client.
    expect(applyPrefill({ application: null, recommendedSkills: [], firm: null, earlier: [first], signedInAtFirm: false, fileKeys: ['INSURANCE'] }).experience).toBe('')
    // And the page puts the carried dates in the boxes and sends them again.
    const page = read('src/app/apply/[token]/page.tsx')
    expect(page).toContain('setDates((cur) => ({ ...carried, ...cur }))')
    expect(page).toMatch(/reuse: data\.prefill\.sentBefore\.map[\s\S]{0,120}dates,/)
  })

  it('HR confirms the dates the supplier gave and never re-types them', () => {
    // The dates reach the item with or without a new file this time.
    expect(read('src/app/api/supplier-apply/[token]/route.ts')).toContain('validFrom: day(t.validFrom) ?? i.validFrom ?? null')
    // And HR's Verified panel opens with them in the boxes.
    expect(read('src/app/dashboard/suppliers/page.tsx')).toContain("validFrom: item.validFrom ? item.validFrom.slice(0, 10) : ''")
  })

  it('a pending firm reads the day it was recommended, one name for its step, and a link sent only when an email left', () => {
    const page = read('src/app/dashboard/suppliers/page.tsx')
    expect(page).toContain('`Recommended ${when(s.pending.recommendedAt)}. `')
    expect(page).toContain('({stageWordOf(d.stage, r.leadNamed, r.walk)})')
    const when = (iso: string) => iso.slice(0, 10)
    expect(linkSays({ applied: null, linkSentAt: null, contactEmail: 'ops@q.example' }, when)).toBe('Link kept for staff to send: no email left. Copy it and send it to the firm.')
    expect(linkSays({ applied: null, linkSentAt: '2026-10-27', contactEmail: 'ops@q.example' }, when)).toBe('Link sent to the firm 2026-10-27; nothing back yet.')
    expect(read('src/app/api/supplier-requests/route.ts')).toContain("if (delivery.state === 'SENT') await prisma.supplierRequest.update")
  })

  it('a job that cleared by rule never says it needs a person, and a job with no supplier says so once', () => {
    const checked = { basis: 'RECORDED' as const, at: '2026-10-27T00:00:00Z', checks: [{ outcome: 'ROUTE', reason: 'No cost center named — nobody owns this spend' }] }
    expect(checkedSays(checked, 'AUTO_APPROVED').routeSuffix).toBe(' — nobody is named to ask, so it cleared with this note')
    expect(checkedSays(checked, 'PENDING_APPROVAL').routeSuffix).toBe(' — needs a person')
    const job = read('src/app/dashboard/requisitions/[id]/page.tsx')
    expect(job).not.toContain('No suppliers on file yet. Add one from Suppliers first.')
    // The Job requests list says the same sentence beside a published job.
    expect(read('src/app/dashboard/requisitions/page.tsx')).toMatch(/nobodyToSendTo\(\{ open: r\.status === 'OPEN' && !r\.archivedAt/)
  })
})
