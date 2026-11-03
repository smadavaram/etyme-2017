/**
 * A degree is read, not just held — decided by the founder, 2026-11-03.
 *
 * What the record itself can see about a degree against the person's own
 * résumé, their name, the job, and every other file on the record. Each
 * finding is a sentence to HR beside the paper (the words are
 * `lib/notify/degree-and-start`'s); none is a verdict and none blocks a
 * start, because education is proof, not compliance. A provider's
 * verification of the degree clears every finding on it. Pure, except
 * `fileHash`, which reads nothing and only hashes bytes.
 */
import { createHash } from 'node:crypto'
import {
  degreeNameDiffers,
  degreeNotWhatTheJobAsks,
  degreeSchoolDiffers,
  degreeVerifiedBy,
  degreeYearAhead,
  degreeYearDiffers,
  sameFileFiledBefore,
} from '@/lib/notify/degree-and-start'

/** SHA-256 of a file's bytes, hex: the one way both upload doors name a file. */
export function fileHash(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** What a degree certificate says, as confirmed by a person. */
export interface DegreeOnPaper {
  institution: string | null
  qualification: string | null
  fieldOfStudy?: string | null
  nameOnDocument: string | null
  /** The year of graduation printed on it. */
  year: number | null
}

/** One education line from the person's own résumé. */
export interface ResumeEducation {
  school: string | null
  qualification: string | null
  year: number | null
}

export type DegreeFindingCode = 'YEAR_AHEAD' | 'YEAR_DIFFERS' | 'NAME_DIFFERS' | 'SCHOOL_DIFFERS' | 'NOT_WHAT_THE_JOB_ASKS' | 'SAME_FILE'

export interface DegreeReading {
  /** Where a provider verified the degree: the sentence, and nothing warns. */
  verified: string | null
  findings: { code: DegreeFindingCode; says: string }[]
}

const plain = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Words that do not tell one degree or one school from another. */
const FILLER = new Set(['of', 'in', 'the', 'and', 'at', 'degree', 'university', 'college', 'institute', 'school'])
const words = (s: string | null | undefined) => plain(s).split(' ').filter((w) => w && !FILLER.has(w))

/** Two names are one where every word of the shorter is in the longer (a middle name left off is the same person). */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = plain(a).split(' ').filter(Boolean)
  const y = plain(b).split(' ').filter(Boolean)
  if (!x.length || !y.length) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.every((w) => long.includes(w))
}

/** Two schools are one where the words that name them agree, either way round. */
export function sameSchool(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = words(a)
  const y = words(b)
  if (!x.length || !y.length) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.every((w) => long.includes(w))
}

/** The résumé line for the same degree: the one whose qualification shares a word, else the only line. */
function sameDegreeOn(resume: ResumeEducation[], paper: DegreeOnPaper): ResumeEducation | null {
  const q = new Set(words(paper.qualification))
  const match = resume.find((r) => words(r.qualification).some((w) => q.has(w)))
  return match ?? (resume.length === 1 ? resume[0] : null)
}

export function degreeReading(input: {
  paper: DegreeOnPaper
  personName: string
  resume: ResumeEducation[]
  /** The job's required qualification, where the job names one. */
  job?: { title: string; requires: string | null } | null
  /** The people another copy of this same file was filed for. */
  sameFileFor?: string[]
  /** A provider's verification of this degree, recorded verbatim. */
  verifiedBy?: { provider: string; reference: string | null; on: Date } | null
  on: Date
}): DegreeReading {
  if (input.verifiedBy) return { verified: degreeVerifiedBy(input.verifiedBy), findings: [] }
  const { paper, on } = input
  const findings: DegreeReading['findings'] = []
  if (paper.year != null && paper.year > on.getUTCFullYear()) {
    findings.push({ code: 'YEAR_AHEAD', says: degreeYearAhead({ certificateYear: paper.year, on }) })
  }
  const line = sameDegreeOn(input.resume, paper)
  if (line && paper.year != null && line.year != null && line.year !== paper.year) {
    findings.push({ code: 'YEAR_DIFFERS', says: degreeYearDiffers({ certificateYear: paper.year, resumeYear: line.year }) })
  }
  if (paper.nameOnDocument && !sameName(paper.nameOnDocument, input.personName)) {
    findings.push({ code: 'NAME_DIFFERS', says: degreeNameDiffers({ printedName: paper.nameOnDocument, personName: input.personName }) })
  }
  if (line && paper.institution && line.school && !sameSchool(paper.institution, line.school)) {
    findings.push({ code: 'SCHOOL_DIFFERS', says: degreeSchoolDiffers({ certificateSchool: paper.institution, resumeSchool: line.school }) })
  }
  const asks = input.job?.requires
  if (asks) {
    const onPaper = [paper.qualification, paper.fieldOfStudy].filter(Boolean).join(' in ')
    const need = words(asks)
    const have = new Set(words(onPaper))
    if (!onPaper || !need.every((w) => have.has(w))) {
      findings.push({ code: 'NOT_WHAT_THE_JOB_ASKS', says: degreeNotWhatTheJobAsks({ jobTitle: input.job!.title, required: asks, onPaper: onPaper || 'no qualification printed' }) })
    }
  }
  for (const other of input.sameFileFor ?? []) {
    findings.push({ code: 'SAME_FILE', says: sameFileFiledBefore({ otherPersonName: other }) })
  }
  return { verified: null, findings }
}
