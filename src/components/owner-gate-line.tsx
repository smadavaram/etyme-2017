import Link from 'next/link'
import type { OwnerLine } from '@/lib/owner-gate'

/**
 * The sentence beside an act only the Owner does, with its link where
 * there is a step to take (lib/owner-gate `ownerOnlyLine`, `refusalLine`).
 * One component, so the three screens that say it say it alike.
 */
export function OwnerGateLine({ line, className = '' }: { line: OwnerLine | null | undefined; className?: string }) {
  if (!line) return null
  return (
    <p className={`text-[13px] text-etyme-muted ${className}`}>
      {line.says}
      {line.href && line.linkSays && (
        <>
          {' '}
          <Link href={line.href as any} className="text-etyme-action underline-offset-2 hover:underline">{line.linkSays}</Link>
        </>
      )}
    </p>
  )
}
