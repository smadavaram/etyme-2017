/**
 * A degree read against the record, where it is accepted or uploaded.
 *
 * Decided by the founder, 2026-11-03 ("A degree is read, not just held").
 * The rules are `degreeReading` in ./degree; this loads what they read:
 * the person's own name, the résumé's education lines
 * (`ConsultantProfile.education`), every other person a copy of the same
 * file was filed for (by `DocFile.fileHash` and `VerificationDoc.fileHash`)
 * and a provider's verification of the degree, recorded verbatim with its
 * name, reference and date, which clears every warning.
 *
 * Nothing here blocks anything. What it returns is a sentence for HR
 * beside the paper, and HR's three doors: ask for the transcript, send it
 * to a verification provider, or send it back with the reason. Etyme
 * renders no verdict on a degree; the provider does.
 */
import { prisma } from '@/lib/db'
import { degreeReading, type DegreeOnPaper, type DegreeReading, type ResumeEducation } from './degree'
import { DEGREE_DOORS } from '@/lib/notify/degree-and-start'

/** Whether a paper of this type or name is a degree. Pure. */
export function isDegreePaper(key: string | null | undefined, name?: string | null): boolean {
  if ((key ?? '').toUpperCase() === 'DEGREE') return true
  return !!name && /\b(degree|diploma)\b/i.test(name) && !/evaluation/i.test(name)
}

/** The fields a degree's own form may post beside the school and the year, each optional. */
export const DEGREE_POSTED = ['qualification', 'fieldOfStudy', 'nameOnDocument', 'honors'] as const

/** A degree's printed facts, as posted by a form: each optional, the year as four digits. Pure. */
export function degreeFromBody(body: Record<string, unknown>): DegreeOnPaper | null {
  const str = (k: string) => (typeof body[k] === 'string' && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, 200) : null)
  const y = str('year') ?? str('graduationYear')
  const year = y && /^\d{4}$/.test(y) ? Number(y) : null
  const paper: DegreeOnPaper = {
    institution: str('institution'),
    qualification: str('qualification'),
    fieldOfStudy: str('fieldOfStudy'),
    nameOnDocument: str('nameOnDocument'),
    year,
  }
  return Object.values(paper).some((v) => v != null) ? paper : null
}

/** The résumé's education lines as the rules read them. Pure; anything malformed is skipped. */
export function resumeEducationFrom(json: unknown): ResumeEducation[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((line) => {
    if (!line || typeof line !== 'object') return []
    const l = line as Record<string, unknown>
    const year = typeof l.year === 'number' ? l.year : typeof l.year === 'string' && /^\d{4}$/.test(l.year) ? Number(l.year) : null
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return [{ school: s(l.institution) ?? s(l.school), qualification: s(l.qualification), year }]
  })
}

/** HR's three doors on a degree that does not look right. */
export interface DegreeDoor { kind: 'TRANSCRIPT' | 'PROVIDER' | 'SEND_BACK'; says: string }
export const DEGREE_DOOR_LIST: DegreeDoor[] = [
  { kind: 'TRANSCRIPT', says: 'Ask for the transcript' },
  { kind: 'PROVIDER', says: 'Send it to a verification provider' },
  { kind: 'SEND_BACK', says: 'Send it back with the reason' },
]

export interface DegreeOnRecord extends DegreeReading {
  /** The doors, offered only where something does not look right. */
  doors: DegreeDoor[]
  /** One line for HR: the findings, or the provider's verification, or null where nothing is said. */
  says: string | null
}

type Db = Pick<typeof prisma, 'person' | 'consultantProfile' | 'verification' | 'docFile' | 'verificationDoc' | 'packetItem' | 'sellContract'>

/** The other people a copy of a file with one of these hashes was filed for, by name. */
async function sameFileFor(personId: string, hashes: string[], db: Db): Promise<string[]> {
  const wanted = [...new Set(hashes.filter(Boolean))]
  if (wanted.length === 0) return []
  const [files, kept] = await Promise.all([
    db.docFile.findMany({ where: { fileHash: { in: wanted } }, select: { docInstance: { select: { subjectType: true, subjectId: true } } } }),
    db.verificationDoc.findMany({ where: { fileHash: { in: wanted } }, select: { verification: { select: { personId: true } } } }),
  ])
  const ids = new Set<string>()
  const itemIds: string[] = []
  for (const f of files) {
    if (f.docInstance.subjectType === 'PERSON') ids.add(f.docInstance.subjectId)
    if (f.docInstance.subjectType === 'PACKET_ITEM') itemIds.push(f.docInstance.subjectId)
  }
  for (const k of kept) if (k.verification.personId) ids.add(k.verification.personId)
  if (itemIds.length) {
    const items = await db.packetItem.findMany({ where: { id: { in: itemIds } }, select: { packet: { select: { subjectPersonId: true } } } })
    for (const i of items) if (i.packet.subjectPersonId) ids.add(i.packet.subjectPersonId)
  }
  ids.delete(personId)
  if (ids.size === 0) return []
  const people = await db.person.findMany({ where: { id: { in: [...ids] } }, select: { name: true }, orderBy: { name: 'asc' } })
  return people.map((p) => p.name)
}

/**
 * Read a degree against the record. `paper` is what the person or HR
 * confirmed is printed on it; where none is given, the person's latest
 * degree on her own record is read. `fileHashes` are the hashes of the
 * copy being looked at.
 */
export async function degreeOnRecord(
  input: {
    personId: string; paper?: DegreeOnPaper | null; fileHashes?: string[]
    /** One job to read against. Left out, the jobs on the person's lines are read (`jobsAskingOf`). */
    job?: { title: string; requires: string | null } | null
    /** The firm reading the paper: only the jobs on its own chain for the person are read. */
    firmId?: string | null
    on?: Date
  },
  db: Db = prisma
): Promise<DegreeOnRecord> {
  const on = input.on ?? new Date()
  const jobs = input.job !== undefined ? (input.job ? [input.job] : []) : await jobsAskingOf({ personId: input.personId, firmId: input.firmId ?? null }, db)
  const [person, profile, degrees, evaluation] = await Promise.all([
    db.person.findUnique({ where: { id: input.personId }, select: { name: true } }),
    db.consultantProfile.findUnique({ where: { personId: input.personId }, select: { education: true } }),
    db.verification.findMany({
      where: { personId: input.personId, type: 'DEGREE' },
      select: { provider: true, qualification: true, fieldOfStudy: true, nameOnDocument: true, issuedAt: true, documents: { select: { fileHash: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    // A provider's verification counts only with its name, its reference and its date.
    db.verification.findFirst({
      where: { personId: input.personId, type: 'EDUCATION_EVALUATION', status: 'CLEAR', provider: { not: null }, referenceId: { not: null } },
      select: { provider: true, referenceId: true, verifiedAt: true, issuedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const latest = degrees[0] ?? null
  const paper: DegreeOnPaper = input.paper ?? {
    institution: latest?.provider ?? null,
    qualification: latest?.qualification ?? null,
    fieldOfStudy: latest?.fieldOfStudy ?? null,
    nameOnDocument: latest?.nameOnDocument ?? null,
    year: latest?.issuedAt ? latest.issuedAt.getUTCFullYear() : null,
  }
  const hashes = [...(input.fileHashes ?? []), ...(input.paper ? [] : (latest?.documents ?? []).map((d) => d.fileHash ?? ''))]
  const evalOn = evaluation?.verifiedAt ?? evaluation?.issuedAt ?? null
  const read = {
    paper,
    personName: person?.name ?? '',
    resume: resumeEducationFrom(profile?.education),
    sameFileFor: await sameFileFor(input.personId, hashes, db),
    verifiedBy: evaluation && evalOn ? { provider: evaluation.provider!, reference: evaluation.referenceId, on: evalOn } : null,
    on,
  }
  return withDoors(readAgainstJobs(read, jobs))
}

/**
 * A degree read against every job on the person's lines that names a
 * qualification: everything the paper itself says once, and one "not what
 * the job asks" per job the paper does not meet. A job that asks none
 * says nothing; a provider's verification clears all of it. Pure.
 */
export function readAgainstJobs(
  read: Omit<Parameters<typeof degreeReading>[0], 'job'>,
  jobs: readonly { title: string; requires: string | null }[]
): DegreeReading {
  const base = degreeReading({ ...read, job: null })
  if (base.verified) return base
  const findings = [...base.findings]
  for (const job of jobs) {
    if (!job.requires) continue
    for (const f of degreeReading({ ...read, job, sameFileFor: [] }).findings) {
      if (f.code === 'NOT_WHAT_THE_JOB_ASKS' && !findings.some((x) => x.says === f.says)) findings.push(f)
    }
  }
  return { verified: null, findings }
}

/**
 * The jobs on a person's live lines that name a qualification
 * (`Requirement.requiredQualification`, the hiring manager's words), each
 * read through the job the line was awarded from. Where a firm is
 * reading, only the lines of the chain it is on for the person: a sub-
 * vendor reads the job its line under the client's line delivers, never
 * another client's.
 */
export async function jobsAskingOf(input: { personId: string; firmId: string | null }, db: Db = prisma): Promise<{ title: string; requires: string }[]> {
  const lines = await db.sellContract.findMany({
    where: { personId: input.personId, state: { notIn: ['ENDED', 'CANCELLED'] } },
    select: {
      companyId: true, clientCompanyId: true, endClientCompanyId: true,
      requirement: { select: { title: true, requiredQualification: true } },
    },
    take: 40,
  })
  const endOf = (l: (typeof lines)[number]) => l.endClientCompanyId ?? l.clientCompanyId
  const chains = input.firmId
    ? new Set(lines.filter((l) => l.companyId === input.firmId || l.clientCompanyId === input.firmId || endOf(l) === input.firmId).map(endOf))
    : null
  const out: { title: string; requires: string }[] = []
  for (const l of lines) {
    if (chains && !chains.has(endOf(l))) continue
    const requires = l.requirement?.requiredQualification?.trim()
    if (!requires || !l.requirement) continue
    if (!out.some((o) => o.title === l.requirement!.title && o.requires === requires)) out.push({ title: l.requirement.title, requires })
  }
  return out
}

/** The doors and the one line, from a reading. Pure. */
export function withDoors(reading: DegreeReading): DegreeOnRecord {
  if (reading.verified) return { ...reading, doors: [], says: reading.verified }
  if (reading.findings.length === 0) return { ...reading, doors: [], says: null }
  // Each finding ends on the doors; said once at the end, not after every line.
  const lines = reading.findings.map((f) => f.says.replace(` ${DEGREE_DOORS}`, '').trim())
  return { ...reading, doors: DEGREE_DOOR_LIST, says: `${lines.join(' ')} ${DEGREE_DOORS}` }
}
