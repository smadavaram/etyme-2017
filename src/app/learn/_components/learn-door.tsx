import { learnOpen } from '@/lib/training/learn-gate'

/**
 * The door on a firm's public page into its learning site (record 133).
 * Drawn only where the firm's plugin is on; otherwise nothing. The public
 * page mounts it in its own section list; this file owns the words.
 * Free to take, no sign-in, and it says nothing about price.
 */
export function LearnDoor({ slug, company }: { slug: string; company: { pluginsOn?: readonly string[] | null } }) {
  if (!learnOpen(company)) return null
  return (
    <p className="text-[15px] mt-1.5">
      <a className="underline" href={`/learn/${slug}`}>Learn about working with AI. Free, no sign-in.</a>
    </p>
  )
}
