import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildProof, clientCertifiedLines } from '@/lib/training/proof'
import { mayWrite } from '@/lib/domains'

/** Record 120: the proof on the bench, what a client reads, and the routes' doors. */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const D = (s: string) => new Date(`${s}T00:00:00Z`)
const now = D('2026-12-01')
const cohort = { name: 'Spring data cohort', courseTitle: 'Python for data' }
const attempts = [
  { skill: 'Python', score: 60, attempt: 1, assessedAt: D('2026-11-10') },
  { skill: 'python', score: 82, attempt: 2, assessedAt: D('2026-11-20') },
]

describe('the proof on the bench shows where she came from and what she holds', () => {
  it('with no cohort, no score and no certification there is no proof block at all', () => {
    expect(buildProof({ cohort: null, assessments: [], certifications: [], listing: null, ask: null }, now)).toBeNull()
  })
  it('both attempts at a skill are shown, the latest first and named as her current score', () => {
    const p = buildProof({ cohort, assessments: attempts, certifications: [], listing: null, ask: null }, now)!
    expect(p.scores).toEqual([{ skill: 'python', latest: 82, attempts: [{ attempt: 2, score: 82, on: '2026-11-20' }, { attempt: 1, score: 60, on: '2026-11-10' }] }])
  })
  it('a certification shows its title, when it was issued, when it expires and whether it is current', () => {
    const p = buildProof({ cohort, assessments: [], certifications: [{ title: 'Data engineer', issuedAt: D('2026-11-25'), expiresAt: D('2028-11-25') }], listing: null, ask: null }, now)!
    expect(p.certifications).toEqual([{ title: 'Data engineer', issued: '2026-11-25', expires: '2028-11-25', standing: 'CURRENT' }])
  })
})

describe('her yes date and method are read from her bench listing, the one consent record', () => {
  const asked = { answeredVia: null as string | null }
  const via = (v: string) => ({ answeredVia: v })
  const listing = (l: Partial<{ state: string; grantedAt: Date | null; respondedAt: Date | null; revokedAt: Date | null }>) =>
    ({ state: 'INVITED', grantedAt: null, respondedAt: null, revokedAt: null, ...l })
  const consent = (listingRow: ReturnType<typeof listing> | null, ask: { answeredVia: string | null } | null) =>
    buildProof({ cohort, assessments: attempts, certifications: [], listing: listingRow, ask }, now)!.consent
  it('a listing nobody has answered pre-fills nothing', () => {
    expect(consent(listing({}), asked)).toBeNull()
  })
  it('a listing she declined pre-fills nothing', () => {
    expect(consent(listing({ state: 'DECLINED', respondedAt: D('2026-11-28') }), via('OWN_PAGE'))).toBeNull()
  })
  it('a granted listing shows the day she said yes and the door she used, not the way she was asked', () => {
    expect(consent(listing({ state: 'GRANTED', grantedAt: D('2026-11-28'), respondedAt: D('2026-11-28') }), via('OWN_PAGE'))).toEqual({ yesOn: '2026-11-28', method: 'OWN_PAGE' })
  })
  it('an ask that says yes while the listing is no longer granted shows no yes', () => {
    expect(consent(listing({ state: 'DECLINED', respondedAt: D('2026-12-01') }), via('OWN_PAGE'))).toBeNull()
    expect(consent(listing({ state: 'GRANTED', respondedAt: D('2026-11-28'), revokedAt: D('2026-11-30') }), via('OWN_PAGE'))).toBeNull()
  })
  it('a yes on the listing is shown even where the ask row says nothing, with the method unknown rather than invented', () => {
    expect(consent(listing({ state: 'GRANTED', grantedAt: D('2026-11-28') }), null)).toEqual({ yesOn: '2026-11-28', method: null })
  })
  it('a firm’s own employee, told and never asked, has no listing and so no yes line', () => {
    expect(consent(null, { answeredVia: null })).toBeNull()
  })
})

describe('a client never reads training, a cohort or a score', () => {
  const certs = [
    { title: 'Data engineer', issuedAt: D('2026-11-25'), expiresAt: D('2028-11-25') },
    { title: 'Forklift operator', issuedAt: D('2025-01-01'), expiresAt: null },
    { title: 'Lapsed one', issuedAt: D('2024-01-01'), expiresAt: D('2025-01-01') },
  ]
  it('a finished course reads to a client only as "Certified: title, issued, expires"', () => {
    expect(clientCertifiedLines(certs, now)).toEqual([
      'Certified: Data engineer, issued 2026-11-25, expires 2028-11-25',
      'Certified: Forklift operator, issued 2025-01-01, does not expire',
    ])
  })
  it('a lapsed certification is not read as certified', () => {
    expect(clientCertifiedLines(certs, now).join(' ')).not.toContain('Lapsed one')
  })
  it('what a client reads holds none of the words training, cohort, course, score or assessment', () => {
    expect(clientCertifiedLines(certs, now).join(' ')).not.toMatch(/train|cohort|course|score|assess/i)
  })

  const CLIENT_READ_PATHS = [
    'src/app/api/people', 'src/app/api/submissions', 'src/app/api/requirements', 'src/app/api/interviews',
    'src/app/api/placements', 'src/app/api/tenure', 'src/app/api/program', 'src/app/api/suppliers',
    'src/app/api/contracts', 'src/app/api/week-approvals',
    'src/app/dashboard/submissions', 'src/app/dashboard/requirements', 'src/app/dashboard/interviews',
    'src/app/dashboard/placements', 'src/app/dashboard/tenure', 'src/app/dashboard/program', 'src/app/dashboard/suppliers',
  ]
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${n}`
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out)
      else if (/\.(ts|tsx)$/.test(n)) out.push(rel)
    }
    return out
  }
  it('no route or page a client reads touches a cohort, an assessment, a certification, an enrollment or the training modules', () => {
    for (const dir of CLIENT_READ_PATHS) {
      for (const f of walk(dir)) {
        expect(read(f), f).not.toMatch(/prisma\.(cohort|assessment|certification|benchAsk|enrollment)\b|@\/lib\/training|lib\/training\/proof/)
      }
    }
  })
})

describe('every new route asks the caller, then the plugin, then reads', () => {
  const ROUTES = [
    'src/app/api/training/cohorts/route.ts',
    'src/app/api/training/cohorts/[id]/route.ts',
    'src/app/api/training/enrollments/[id]/assessments/route.ts',
    'src/app/api/training/enrollments/[id]/certification/route.ts',
    'src/app/api/training/enrollments/[id]/bench-ask/route.ts',
  ]
  it('each handler checks staffOnly, then pluginGate for Train to bench, before its first read of the database', () => {
    for (const f of ROUTES) {
      const src = read(f)
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? []
      expect((src.match(/pluginGate\(caller, 'TRAIN_TO_BENCH'\)/g) ?? []).length, f).toBe(handlers.length)
      for (const part of src.split(/export async function /).slice(1)) {
        expect(part.indexOf('getCallerContext'), f).toBeLessThan(part.indexOf('pluginGate'))
        expect(part.indexOf('staffOnly'), f).toBeLessThan(part.indexOf('pluginGate'))
        expect(part.indexOf('pluginGate'), f).toBeLessThan(part.indexOf('prisma.'))
      }
    }
  })
  it('no route here deletes a training row, so switching off only hides', () => {
    for (const f of ROUTES) expect(read(f), f).not.toMatch(/\.(delete|deleteMany)\(/)
  })
  it('the bench ask never writes GRANTED: only her own answer makes the listing live', () => {
    expect(read('src/app/api/training/enrollments/[id]/bench-ask/route.ts')).not.toMatch(/GRANTED'\s*[,}]|state:\s*'GRANTED'/)
  })
  it('the bench ask reuses the one ask path: the invitation, the letter and the name the firm typed', () => {
    const src = read('src/app/api/training/enrollments/[id]/bench-ask/route.ts')
    for (const reused of ['invitation(', 'inviteUrl(', 'inviteText(', 'askByEmail(', 'firmReadsAt(', 'nameAskedUnder(']) expect(src, reused).toContain(reused)
  })
  it('the respond door writes her answer on the ask once, guarded so a second write changes nothing', () => {
    const src = read('src/app/api/me/benches/[id]/respond/route.ts')
    expect(src).toContain('mayRecordAnswer(lastAsk)')
    expect(src).toMatch(/benchAsk\.updateMany\(\{\s*where: \{ id: openAsk\.id, answer: null \}/)
  })
  it('the training specialist may write every file of this module', () => {
    for (const f of [...ROUTES, 'src/lib/training.ts', 'src/lib/training/proof.ts', 'src/lib/training/proof-read.ts', 'src/lib/training/cohort-read.ts', 'src/app/dashboard/training/cohorts.tsx', 'src/app/api/me/benches/[id]/respond/route.ts', 'src/app/api/bench/profit/route.ts']) {
      expect(mayWrite('etyme-supply', f).mayWrite, f).toBe(true)
    }
  })
})

describe('the review’s fixes are in the routes themselves', () => {
  it('the cohort and course reads ask for consultants.read, refuse through recordRefusal and log the trainees read', () => {
    const helper = read('src/lib/training/caller.ts')
    expect(helper).toContain("hasPermission(caller.permissions, 'consultants.read')")
    expect(helper).toContain('await recordRefusal(')
    expect(helper).toContain('logBulkAccess(')
    for (const f of ['src/app/api/training/cohorts/route.ts', 'src/app/api/training/route.ts']) {
      const get = read(f).split('export async function GET')[1].split('export async function POST')[0]
      expect(get, f).toContain('await traineeReadRefusal(')
      expect(get, f).toContain('logTraineeReads(')
    }
  })
  it('two attempts, two certifications and two enrollments are each written under an advisory lock, and a unique clash is never a 500', () => {
    const a = read('src/app/api/training/enrollments/[id]/assessments/route.ts')
    expect(a).toContain("pg_advisory_xact_lock(hashtext(${'assessment:'")
    expect(a).toContain("'P2002'")
    const c = read('src/app/api/training/enrollments/[id]/certification/route.ts')
    expect(c).toContain("pg_advisory_xact_lock(hashtext(${'certification:'")
    expect(c).toContain("'P2002'")
    const e = read('src/app/api/training/enrollments/route.ts')
    expect(e).toContain("pg_advisory_xact_lock(hashtext(${'enrollment:'")
    expect(e.indexOf("'enrollment:'")).toBeLessThan(e.indexOf('tx.enrollment.findUnique'))
  })
  it('the two doors that take her answer fill only an ask whose method is her own page or the email link', () => {
    for (const f of ['src/app/api/me/benches/[id]/respond/route.ts', 'src/app/api/bench-invite/[token]/route.ts']) {
      const src = read(f)
      expect(src, f).toMatch(/benchAsk\.findFirst\([^)]*select: \{ id: true, answer: true, method: true \}/)
      expect(src, f).toContain('mayRecordAnswer(lastAsk)')
    }
  })
  it('certification reads only the assessors of the enrollment’s current run', () => {
    expect(read('src/app/api/training/enrollments/[id]/certification/route.ts')).toContain('currentRunAssessors(row.assessments, row.enrolledAt)')
  })
})

describe('the Training page', () => {
  const page = read('src/app/dashboard/training/cohorts.tsx')
  it('offers "Ask her onto the bench" only where her own enrollment is complete, and shows the ask’s state', () => {
    expect(page).toMatch(/t\.status === 'COMPLETED' && \(/)
    expect(page.indexOf("t.status === 'COMPLETED' && (")).toBeLessThan(page.indexOf('Ask her onto the bench'))
    expect(page).toContain('t.ask.says')
  })
  it('keeps every earlier attempt in view beside the latest', () => {
    expect(page).toContain("join(', then ')")
  })
  it('a course’s price reads as catalog only and never as something Etyme bills or collects', () => {
    const courses = read('src/app/dashboard/training/page.tsx')
    expect(courses).toContain('catalog price')
    expect(courses).toContain('Etyme does not bill or collect it')
    expect(courses + page).not.toMatch(/Etyme (bills|charges|collects) /i)
  })
})

describe('the bench profit page draws courses only while the plugin is on', () => {
  it('the enrollments are read only where Train to bench is on for the firm', () => {
    const src = read('src/app/api/bench/profit/route.ts')
    expect(src).toContain("pluginOn(companyId, 'TRAIN_TO_BENCH')")
    expect(src).toContain('trainingOn ? { course: { companyId } } : { id: { in: [] } }')
  })
})
