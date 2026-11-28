import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CONFIRM_CHANNELS, confirmationBody } from '@/app/dashboard/submissions/confirmation-words'
import { CHANNELS } from '@/lib/agents/confirmation-rules'

describe('the Record confirmation screen', () => {
  it('offers exactly the ways the route accepts a confirmation', () => {
    expect(CONFIRM_CHANNELS.map((c) => c.key).sort()).toEqual([...CHANNELS].sort())
  })
  it('a firm with one legal entity posts no entity, and a firm with several posts the one chosen', () => {
    expect(confirmationBody({ submissionId: 's1', channel: 'PHONE', note: ' Cara said so ', entity: '' })).toEqual({ submissionId: 's1', channel: 'PHONE', note: 'Cara said so' })
    expect(confirmationBody({ submissionId: 's1', channel: 'EMAIL', note: '', entity: 'e2' })).toEqual({ submissionId: 's1', channel: 'EMAIL', actingEntityId: 'e2' })
  })
  it('the submissions list draws one Record confirmation button, only where the route says it is open', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/submissions/page.tsx'), 'utf8')
    expect(page).toContain('row.confirm?.open')
    expect(page).toContain('Record confirmation')
    expect(readFileSync(join(process.cwd(), 'src/app/dashboard/submissions/confirmation-dialog.tsx'), 'utf8')).toContain('/api/bench/submission-confirmations')
  })
})
