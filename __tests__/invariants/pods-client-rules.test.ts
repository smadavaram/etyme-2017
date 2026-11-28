import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { acceptorRefusal } from '@/app/api/program/milestones/pod-acceptor'
import { partiesRead } from '@/app/api/program/milestones/acceptance'

const imogen = { personId: 'p-imogen', name: 'Imogen Daleford' }

describe('who decides a sold deliverable', () => {
  it('a milestone with no named acceptor is decided by any seat at the client, as before', () => {
    expect(acceptorRefusal('p-anyone', null)).toBeNull()
  })
  it('the named acceptor may decide her deliverable', () => {
    expect(acceptorRefusal('p-imogen', imogen)).toBeNull()
  })
  it('a colleague is refused in a sentence that names who decides', () => {
    expect(acceptorRefusal('p-other', imogen)).toBe('Imogen Daleford was named on this deal as the one who accepts or rejects its deliverables. Ask Imogen Daleford to decide.')
  })
  it('a caller with no person, such as a machine key, is refused', () => {
    expect(acceptorRefusal(null, imogen)).not.toBeNull()
  })
})

describe('the firms a milestone reader may name', () => {
  const o = { issuedToId: 'seller', issuedById: 'client', issuedTo: { id: 'seller', name: 'Seller Co' }, issuedBy: { id: 'client', name: 'Client Co' } }
  it('the seller and the client who issued the order each read both firms', () => {
    expect(partiesRead('seller', o)).toEqual({ seller: o.issuedTo, client: o.issuedBy })
    expect(partiesRead('client', o)).toEqual({ seller: o.issuedTo, client: o.issuedBy })
  })
  it('a payer that is neither reads no firm’s name or id', () => {
    const r = partiesRead('payer', o)
    expect(JSON.stringify(r)).not.toMatch(/Seller Co|Client Co/)
    expect([r.seller.id, r.client.id]).toEqual(['', ''])
  })
})

describe('the client’s screen of sold work', () => {
  const src = readFileSync('src/app/dashboard/program/sold-work.tsx', 'utf8')
  it('says project, deliverable and team, and never pod, plugin, margin or a member', () => {
    const text = src.split('\n').filter((l) => /[>'`]\s*[A-Z][a-z]/.test(l)).join('\n')
    expect(text).not.toMatch(/\bpod\b|plugin|margin|member/i)
  })
})
