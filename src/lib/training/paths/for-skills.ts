import type { Track } from '../courses/types'
import { lessonsOf } from '../courses/index'

/**
 * Paths made from skills by rules (record 133, door): a job's requirement
 * skills, or what a team's role needs. A skill is matched to a lesson that
 * introduces it or carries it in its title; nothing is guessed. A skill no
 * lesson teaches is said to be uncovered. Pure.
 */
export interface MadePath { steps: string[]; sourceKind: 'JOB' | 'POD'; sourceRefId: string; sourceLabel: string; why: string; uncovered: string[] }

const norm = (s: string) => s.trim().toLowerCase()

/** Lessons whose introduced terms or title contain the skill, or the other way round. */
const taught = (track: Track, skill: string) => {
  const s = norm(skill)
  if (!s) return []
  return lessonsOf(track).filter(({ lesson }) => [lesson.title, ...lesson.introduces].some((t) => { const x = norm(t); return x.includes(s) || (x.length >= 4 && s.includes(x)) })).map((l) => l.lesson.key)
}

export function skillsMatching(track: Track, skills: string[]): { matched: string[]; uncovered: string[] } {
  const matched = new Set<string>()
  const uncovered: string[] = []
  for (const sk of skills) { const k = taught(track, sk); if (k.length) k.forEach((x) => matched.add(x)); else if (norm(sk)) uncovered.push(sk) }
  return { matched: [...matched], uncovered }
}

/** The matched lessons, the earlier lessons that build the terms they use, less what she finished, in reading order. */
function stepsFor(track: Track, matched: string[], done: string[]): string[] {
  const flat = lessonsOf(track).map((l) => l.lesson)
  const need = new Set(matched)
  let grew = true
  while (grew) {
    grew = false
    for (const l of flat) if (need.has(l.key)) for (const u of l.uses) for (const b of flat) if (b.introduces.includes(u) && !need.has(b.key)) { need.add(b.key); grew = true }
  }
  const finished = new Set(done)
  return flat.filter((l) => need.has(l.key) && !finished.has(l.key)).map((l) => l.key)
}

export function jobReadyPath(track: Track, o: { jobId: string; jobTitle: string; skills: string[]; priorCompletions: string[] }): MadePath | null {
  const { matched, uncovered } = skillsMatching(track, o.skills)
  if (matched.length === 0) return null
  const steps = stepsFor(track, matched, o.priorCompletions)
  if (steps.length === 0) return null
  return {
    steps, sourceKind: 'JOB', sourceRefId: o.jobId, sourceLabel: `Made from the job: ${o.jobTitle}`, uncovered,
    why: `Made from the job’s listed skills against the lessons that teach them; ${steps.length} lessons, less what she finished before.${uncovered.length ? ` Nothing here teaches ${uncovered.join(', ')}.` : ''}`,
  }
}

/** The skills a role needs that nothing she finished here teaches. */
export function gapsAgainst(track: Track, roleSkills: string[], done: string[]): string[] {
  const finished = new Set(done)
  return roleSkills.filter((sk) => norm(sk) && !taught(track, sk).some((k) => finished.has(k)))
}

export function teamPath(track: Track, o: { podId: string; podName: string; roleSkills: string[]; done: string[] }): MadePath | null {
  if (o.roleSkills.length === 0) return null
  const gaps = gapsAgainst(track, o.roleSkills, o.done)
  if (gaps.length === 0) return null
  const { matched, uncovered } = skillsMatching(track, gaps)
  if (matched.length === 0) return null
  const steps = stepsFor(track, matched, o.done)
  if (steps.length === 0) return null
  return { steps, sourceKind: 'POD', sourceRefId: o.podId, sourceLabel: `Made from the team: ${o.podName}`, uncovered, why: `Made from what her role on the team needs against what she finished here; ${steps.length} lessons.${uncovered.length ? ` Nothing here teaches ${uncovered.join(', ')}.` : ''}` }
}
