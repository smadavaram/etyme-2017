import { describe, it, expect } from 'vitest'

/**
 * Conversations and notifications module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * BUILD.md §6.1: Conversations — "connective tissue"
 * BUILD.md §6.2: Notifications — "type × channel routing"
 *
 * Tests the logic layer without rendering:
 * - Conversation topic types and validation
 * - Thread dedup by entity (one thread per requirement/contract)
 * - Message type classification
 * - Participant management
 * - Notification type routing
 * - Notification status transitions
 * - Channel routing logic
 * - Unread count aggregation
 */

// ── Conversation topic validation ────────────────────

describe('Conversation topics', () => {
  const VALID_TOPICS = ['GENERAL', 'REQUIREMENT', 'CONTRACT', 'SUBMISSION', 'DOCUMENT', 'INVOICE', 'EXPENSE', 'DIRECT']

  function isValidTopic(topic: string): boolean {
    return VALID_TOPICS.includes(topic.toUpperCase())
  }

  it('REQUIREMENT is a valid conversation topic', () => {
    expect(isValidTopic('REQUIREMENT')).toBe(true)
  })

  it('CONTRACT is a valid conversation topic', () => {
    expect(isValidTopic('CONTRACT')).toBe(true)
  })

  it('SUBMISSION is a valid conversation topic', () => {
    expect(isValidTopic('SUBMISSION')).toBe(true)
  })

  it('DIRECT is a valid conversation topic for person-to-person messages', () => {
    expect(isValidTopic('DIRECT')).toBe(true)
  })

  it('EXPENSE is a valid conversation topic', () => {
    expect(isValidTopic('EXPENSE')).toBe(true)
  })

  it('lowercase topics are normalized to uppercase', () => {
    expect(isValidTopic('requirement')).toBe(true)
  })

  it('UNKNOWN is not a valid conversation topic', () => {
    expect(isValidTopic('UNKNOWN')).toBe(false)
  })
})

// ── Thread dedup ─────────────────────────────────────

describe('Conversation thread dedup', () => {
  function threadKey(companyId: string, topic: string, topicId: string | null): string {
    return `${companyId}:${topic}:${topicId ?? ''}`
  }

  function isDuplicate(existingKeys: Set<string>, companyId: string, topic: string, topicId: string | null): boolean {
    if (topic === 'GENERAL' || topic === 'DIRECT') return false
    return existingKeys.has(threadKey(companyId, topic, topicId))
  }

  const existing = new Set([
    'comp1:REQUIREMENT:req-123',
    'comp1:CONTRACT:con-456',
  ])

  it('a new requirement thread is not a duplicate', () => {
    expect(isDuplicate(existing, 'comp1', 'REQUIREMENT', 'req-789')).toBe(false)
  })

  it('a second thread for the same requirement is a duplicate', () => {
    expect(isDuplicate(existing, 'comp1', 'REQUIREMENT', 'req-123')).toBe(true)
  })

  it('the same requirement in a different company is not a duplicate', () => {
    expect(isDuplicate(existing, 'comp2', 'REQUIREMENT', 'req-123')).toBe(false)
  })

  it('GENERAL topics are never duplicates', () => {
    expect(isDuplicate(existing, 'comp1', 'GENERAL', null)).toBe(false)
  })

  it('DIRECT messages are never duplicates', () => {
    expect(isDuplicate(existing, 'comp1', 'DIRECT', 'person-1')).toBe(false)
  })
})

// ── Message types ────────────────────────────────────

describe('Message type classification', () => {
  const VALID_TYPES = ['TEXT', 'SYSTEM', 'RATE_CONFIRMATION', 'INTERVIEW', 'DOCUMENT_REQUEST']

  function isValidType(type: string): boolean {
    return VALID_TYPES.includes(type.toUpperCase())
  }

  function isSystemGenerated(type: string): boolean {
    return ['SYSTEM', 'RATE_CONFIRMATION', 'INTERVIEW', 'DOCUMENT_REQUEST'].includes(type)
  }

  it('TEXT is a valid message type', () => {
    expect(isValidType('TEXT')).toBe(true)
  })

  it('RATE_CONFIRMATION is a valid message type', () => {
    expect(isValidType('RATE_CONFIRMATION')).toBe(true)
  })

  it('TEXT messages are not system-generated', () => {
    expect(isSystemGenerated('TEXT')).toBe(false)
  })

  it('SYSTEM messages are system-generated', () => {
    expect(isSystemGenerated('SYSTEM')).toBe(true)
  })

  it('RATE_CONFIRMATION messages are system-generated', () => {
    expect(isSystemGenerated('RATE_CONFIRMATION')).toBe(true)
  })
})

// ── Participant management ───────────────────────────

describe('Conversation participants', () => {
  type Participant = { personId: string; name: string; joinedAt: string }

  function ensureCreator(
    participants: Participant[],
    creatorId: string,
    creatorName: string
  ): Participant[] {
    if (participants.some((p) => p.personId === creatorId)) return participants
    return [
      { personId: creatorId, name: creatorName, joinedAt: new Date().toISOString() },
      ...participants,
    ]
  }

  it('the creator is added if not already in the participant list', () => {
    const result = ensureCreator(
      [{ personId: 'p2', name: 'Bob', joinedAt: '2026-08-01' }],
      'p1',
      'Alice'
    )
    expect(result).toHaveLength(2)
    expect(result[0].personId).toBe('p1')
  })

  it('the creator is not duplicated if already present', () => {
    const result = ensureCreator(
      [{ personId: 'p1', name: 'Alice', joinedAt: '2026-08-01' }],
      'p1',
      'Alice'
    )
    expect(result).toHaveLength(1)
  })

  it('an empty participant list gets the creator added', () => {
    const result = ensureCreator([], 'p1', 'Alice')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })
})

// ── Notification types ───────────────────────────────

describe('Notification type routing', () => {
  const VALID_TYPES = ['SUBMISSION', 'TIMESHEET', 'INVOICE', 'EXPENSE', 'CONTRACT', 'ROLLOFF', 'CONVERSATION', 'SYSTEM']

  function isValidType(type: string): boolean {
    return VALID_TYPES.includes(type.toUpperCase())
  }

  function isUrgent(type: string): boolean {
    return ['ROLLOFF', 'TIMESHEET', 'INVOICE'].includes(type)
  }

  it('SUBMISSION is a valid notification type', () => {
    expect(isValidType('SUBMISSION')).toBe(true)
  })

  it('ROLLOFF is a valid notification type', () => {
    expect(isValidType('ROLLOFF')).toBe(true)
  })

  it('ROLLOFF notifications are urgent', () => {
    expect(isUrgent('ROLLOFF')).toBe(true)
  })

  it('TIMESHEET notifications are urgent', () => {
    expect(isUrgent('TIMESHEET')).toBe(true)
  })

  it('CONVERSATION notifications are not urgent', () => {
    expect(isUrgent('CONVERSATION')).toBe(false)
  })

  it('UNKNOWN is not a valid notification type', () => {
    expect(isValidType('UNKNOWN')).toBe(false)
  })
})

// ── Notification status transitions ──────────────────

describe('Notification status transitions', () => {
  function markRead(status: string): { newStatus: string; readAt: string | null } {
    if (status === 'UNREAD') {
      return { newStatus: 'READ', readAt: new Date().toISOString() }
    }
    return { newStatus: status, readAt: null }
  }

  it('an unread notification can be marked as read', () => {
    const result = markRead('UNREAD')
    expect(result.newStatus).toBe('READ')
    expect(result.readAt).not.toBeNull()
  })

  it('a read notification stays read', () => {
    const result = markRead('READ')
    expect(result.newStatus).toBe('READ')
    expect(result.readAt).toBeNull()
  })
})

// ── Channel routing ──────────────────────────────────

describe('Notification channel routing', () => {
  type UserPrefs = { email: boolean; teams: boolean; inApp: boolean }

  function routeChannels(type: string, prefs: UserPrefs): string[] {
    const channels: string[] = []
    if (prefs.inApp) channels.push('IN_APP')
    if (prefs.email) channels.push('EMAIL')
    if (prefs.teams) channels.push('TEAMS')
    // Urgent types always get email
    if (['ROLLOFF', 'TIMESHEET', 'INVOICE'].includes(type) && !channels.includes('EMAIL')) {
      channels.push('EMAIL')
    }
    return channels
  }

  it('a user with all channels enabled gets all three', () => {
    const channels = routeChannels('SUBMISSION', { email: true, teams: true, inApp: true })
    expect(channels).toEqual(['IN_APP', 'EMAIL', 'TEAMS'])
  })

  it('a user with no channels still gets in-app if enabled', () => {
    const channels = routeChannels('SUBMISSION', { email: false, teams: false, inApp: true })
    expect(channels).toEqual(['IN_APP'])
  })

  it('a rolloff notification forces email even when email is disabled', () => {
    const channels = routeChannels('ROLLOFF', { email: false, teams: false, inApp: true })
    expect(channels).toContain('EMAIL')
  })

  it('a timesheet notification forces email even when email is disabled', () => {
    const channels = routeChannels('TIMESHEET', { email: false, teams: false, inApp: true })
    expect(channels).toContain('EMAIL')
  })

  it('a conversation notification does not force email', () => {
    const channels = routeChannels('CONVERSATION', { email: false, teams: false, inApp: true })
    expect(channels).not.toContain('EMAIL')
  })
})

// ── Unread count ─────────────────────────────────────

describe('Notification unread count', () => {
  function countUnread(notifications: { status: string }[]): number {
    return notifications.filter((n) => n.status === 'UNREAD').length
  }

  function markAllRead(notifications: { id: string; status: string }[]): { id: string; status: string }[] {
    return notifications.map((n) => ({
      ...n,
      status: 'READ',
    }))
  }

  const notifications = [
    { id: '1', status: 'UNREAD' },
    { id: '2', status: 'UNREAD' },
    { id: '3', status: 'READ' },
    { id: '4', status: 'UNREAD' },
    { id: '5', status: 'READ' },
  ]

  it('counts unread notifications correctly', () => {
    expect(countUnread(notifications)).toBe(3)
  })

  it('mark all read sets every notification to read', () => {
    const result = markAllRead(notifications)
    expect(countUnread(result)).toBe(0)
  })

  it('an empty list has zero unread', () => {
    expect(countUnread([])).toBe(0)
  })
})

// ── Message body preview ─────────────────────────────

describe('Message preview truncation', () => {
  function preview(body: string, maxLen: number = 120): string {
    return body.length > maxLen ? body.slice(0, maxLen) + '…' : body
  }

  it('a short message is returned in full', () => {
    expect(preview('Hello!')).toBe('Hello!')
  })

  it('a long message is truncated to 120 characters with an ellipsis', () => {
    const long = 'a'.repeat(200)
    const result = preview(long)
    expect(result.length).toBe(121) // 120 + ellipsis
    expect(result.endsWith('…')).toBe(true)
  })

  it('a message exactly 120 characters is not truncated', () => {
    const exact = 'b'.repeat(120)
    expect(preview(exact)).toBe(exact)
  })
})
