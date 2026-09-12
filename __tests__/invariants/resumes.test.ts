import { describe, it, expect } from 'vitest'
import {
  checkUpload, labelFor, mayUpload, mayRead, visibleTo, toSend,
  missingNote, lastOne, MAX_BYTES,
  type Version,
} from '@/lib/resumes'

/**
 * There was no resume anywhere in this build. A submission reached a
 * client with a name, a rate and no document, which is not a submission
 * anybody can act on — the client reads the CV, not the row.
 *
 * It belongs to the person. A version is never edited. Deleting hides it
 * and does not unsend it.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

function version(over: Partial<Version> = {}): Version {
  return {
    id: 'v1',
    label: 'SAP FICO 2026',
    fileName: 'anita-desai.pdf',
    sizeBytes: 220_000,
    isCurrent: true,
    createdAt: NOW,
    deletedAt: null,
    sentTo: [],
    ...over,
  }
}

describe('what may be uploaded', () => {
  it('takes a PDF', () => {
    expect(checkUpload({ name: 'cv.pdf', type: 'application/pdf', size: 200_000 }).ok).toBe(true)
  })

  it('takes Word, because half this industry still sends .doc', () => {
    expect(checkUpload({ name: 'cv.doc', type: 'application/msword', size: 90_000 }).ok).toBe(true)
    expect(checkUpload({
      name: 'cv.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 90_000,
    }).ok).toBe(true)
  })

  it('falls back to the extension when the browser sends a useless type', () => {
    // Uploads from a phone routinely arrive as application/octet-stream.
    expect(checkUpload({ name: 'cv.pdf', type: 'application/octet-stream', size: 100 }).ok).toBe(true)
  })

  it('refuses an image, because nobody can search a photo of a CV', () => {
    const v = checkUpload({ name: 'cv.png', type: 'image/png', size: 100_000 })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/PDF, Word or plain text/)
  })

  it('refuses an empty file rather than storing nothing', () => {
    expect(checkUpload({ name: 'cv.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false)
  })

  it('stops at five megabytes and says why', () => {
    const v = checkUpload({ name: 'cv.pdf', type: 'application/pdf', size: MAX_BYTES + 1 })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/usually a scan/)
  })

  it('says what it took, so somebody knows it worked', () => {
    expect(checkUpload({ name: 'cv.pdf', type: 'application/pdf', size: 204_800 }).reason)
      .toMatch(/PDF, 200KB/)
  })
})

describe('naming it', () => {
  it('uses the file name, tidied', () => {
    expect(labelFor('anita_desai-SAP_FICO.pdf', NOW)).toBe('anita desai SAP FICO')
  })

  it('falls back to a date when the file name says nothing', () => {
    expect(labelFor('cv.pdf', NOW)).toBe('CV, 2026-08-21')
  })
})

describe('who may put a CV on somebody’s file', () => {
  const owner = { personId: 'anita', listedTo: ['cloudepa'] }

  it('lets the person', () => {
    expect(mayUpload({ personId: 'anita', companyId: null }, owner).ok).toBe(true)
  })

  it('lets an agency they are on the bench of', () => {
    // A recruiter holding the CV before the person has an account is the
    // ordinary way this starts. Refusing it means the document lives in an
    // inbox instead.
    expect(mayUpload({ personId: 'recruiter', companyId: 'cloudepa' }, owner).ok).toBe(true)
  })

  it('refuses an agency they never joined', () => {
    const v = mayUpload({ personId: 'rival-rec', companyId: 'northwind' }, owner)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/on the bench of/)
  })
})

describe('who may open one', () => {
  const owner = { personId: 'anita', listedTo: ['cloudepa'] }

  it('lets the person, always', () => {
    expect(mayRead({ personId: 'anita', companyId: null }, owner, []).ok).toBe(true)
  })

  it('lets the agency representing them', () => {
    expect(mayRead({ personId: 'rec', companyId: 'cloudepa' }, owner, []).ok).toBe(true)
  })

  it('lets a client who was actually sent it', () => {
    // The point of a version: a client keeps what they were given.
    expect(mayRead({ personId: 'mgr', companyId: 'terumo' }, owner, ['terumo']).ok).toBe(true)
  })

  it('refuses a company it was never sent to', () => {
    const v = mayRead({ personId: 'x', companyId: 'northwind' }, owner, ['terumo'])
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/never sent to you/)
  })

  it('refuses an agency after the listing is gone, unless it was sent to them', () => {
    const gone = { personId: 'anita', listedTo: [] }
    expect(mayRead({ personId: 'rec', companyId: 'cloudepa' }, gone, []).ok).toBe(false)
    expect(mayRead({ personId: 'rec', companyId: 'cloudepa' }, gone, ['cloudepa']).ok).toBe(true)
  })
})

describe('versions', () => {
  it('shows the newest first', () => {
    const list = visibleTo([
      version({ id: 'old', createdAt: new Date('2026-01-01') }),
      version({ id: 'new', createdAt: new Date('2026-08-01') }),
    ])
    expect(list[0].id).toBe('new')
  })

  it('hides a deleted one that never went anywhere', () => {
    expect(visibleTo([version({ deletedAt: NOW })])).toHaveLength(0)
  })

  it('still shows a deleted one that was sent somewhere', () => {
    // It is out there. Hiding that from the person it belongs to helps
    // nobody — they are the one who might be asked about it.
    expect(visibleTo([version({ deletedAt: NOW, sentTo: ['terumo'] })])).toHaveLength(1)
  })

  it('sends the current one', () => {
    const list = [version({ id: 'a', isCurrent: false }), version({ id: 'b', isCurrent: true })]
    expect(toSend(list)!.id).toBe('b')
  })

  it('never sends a deleted one, whatever a stale flag says', () => {
    expect(toSend([version({ isCurrent: true, deletedAt: NOW })])).toBeNull()
  })

  it('returns nothing when there is nothing', () => {
    expect(toSend([])).toBeNull()
  })

  it('warns before somebody deletes their only one', () => {
    expect(lastOne([version({ id: 'only' })], 'only')).toBe(true)
    expect(lastOne([version({ id: 'a' }), version({ id: 'b' })], 'a')).toBe(false)
  })
})

describe('a submission with no CV', () => {
  it('says so plainly instead of refusing', () => {
    // A recruiter working a role at eight at night should not be stopped by
    // a missing file — but the client will ask, so it is said loudly.
    const said = missingNote('Anita Desai')
    expect(said).toMatch(/no CV on file/)
    expect(said).toMatch(/the client will ask/)
  })
})
