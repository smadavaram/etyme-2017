'use client'

import { proofLines, type Proof } from '@/lib/training/proof'

/**
 * The small Training block on a bench row and on a consultant's page
 * (record 120): where she was trained at this firm, her scores, what she
 * holds and, only once she has said yes, when and how. It draws nothing
 * where the route sent no proof, which is where the plugin is off.
 */
export function TrainingBlock({ proof }: { proof: Proof | null | undefined }) {
  if (!proof) return null
  const lines = proofLines(proof)
  if (lines.length === 0) return null
  return (
    <div className="mt-2 border border-etyme-rule rounded px-2 py-1.5 bg-etyme-surface">
      <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-0.5">Training</p>
      <ul className="text-xs text-etyme-muted space-y-0.5">
        {lines.map((l) => <li key={l} className={l.startsWith('Certified') ? 'text-etyme-verified' : undefined}>{l}</li>)}
      </ul>
    </div>
  )
}
