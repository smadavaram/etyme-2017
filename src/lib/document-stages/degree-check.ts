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

type Db = Pick<typeof prisma, 'person' | 'consultantProfile' | 'verification' | 'docFile' | 'verificationDoc' | 'packetItem'>

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
  input: { personId: string; paper?: DegreeOnPaper | null; fileHashes?: string[]; job?: { title: string; requires: string | null } | null; on?: Date },
  db: Db = prisma
): Promise<DegreeOnRecord> {
  const on = input.on ?? new Date()
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
  const reading = degreeReading({
    paper,
    personName: person?.name ?? '',
    resume: resumeEducationFrom(profile?.education),
    job: input.job ?? null,
    sameFileFor: await sameFileFor(input.personId, hashes, db),
    verifiedBy: evaluation && evalOn ? { provider: evaluation.provider!, reference: evaluation.referenceId, on: evalOn } : null,
    on,
  })
  return withDoors(reading)
}

/** The doors and the one line, from a reading. Pure. */
export function withDoors(reading: DegreeReading): DegreeOnRecord {
  if (reading.verified) return { ...reading, doors: [], says: reading.verified }
  if (reading.findings.length === 0) return { ...reading, doors: [], says: null }
  // Each finding ends on the doors; said once at the end, not after every line.
  const lines = reading.findings.map((f) => f.says.replace(` ${DEGREE_DOORS}`, '').trim())
  return { ...reading, doors: DEGREE_DOOR_LIST, says: `${lines.join(' ')} ${DEGREE_DOORS}` }
}
