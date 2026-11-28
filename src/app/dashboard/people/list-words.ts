import type { ListReader } from '@/lib/network-filters'

/**
 * What the people page says, by who reads it.
 *
 * At a client this is its Candidates (founder, 2026-11-03: "People =
 * candidates"; a client's Candidates is its memory of people it would
 * like to reach out to): everybody a supplier put in front of it, the
 * ones it starred, the people who worked here, each with "Ask for them".
 * The people placed today are its Contracts, a link of their own, so the
 * word Contractors is not this page's heading at a client.
 *
 * A firm that opens the same page keeps the words it had, because the
 * firm's own Candidates are its bench (`/dashboard/consultants`), and
 * this list at a firm is the people other firms put forward to it.
 */
export interface PeopleListWords {
  title: string
  subtitle: string
  loading: string
  refused: string
}

export function peopleListWords(reader: ListReader): PeopleListWords {
  if (reader === 'CLIENT') {
    return {
      title: 'Candidates',
      subtitle:
        'The people you have met: everybody a supplier put in front of you, the ones you starred, ' +
        'and the people who worked here, one entry each across every supplier. Ask for any of them again.',
      loading: 'Opening your candidates…',
      refused: 'Candidates are not part of your seat. Ask your company’s owner if you need them.',
    }
  }
  return {
    title: 'Contractors',
    subtitle:
      'Everyone who has been put in front of you, one entry each, merged across suppliers. ' +
      'Every fact here sits in a different firm’s system and none of them can see the others.',
    loading: 'Opening your contractors…',
    refused: 'Contractors are not part of your seat. Ask your company’s owner if you need them.',
  }
}

/**
 * The word under a person's name on their page: a contractor while they
 * are on site here, a candidate otherwise, because somebody put forward
 * and never placed has not contracted with anybody.
 */
export function personWord(onSite: boolean): 'Contractor' | 'Candidate' {
  return onSite ? 'Contractor' : 'Candidate'
}
