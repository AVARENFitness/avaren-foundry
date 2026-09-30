import { describe, expect, it } from 'vitest'
import {
  availableBusinessClientsForConnection,
  findSuggestedBusinessClient,
  normalizeConnectionEmail,
} from './coachConnectionRequests'

describe('coachConnectionRequests', () => {
  it('normalizes connection emails', () => {
    expect(normalizeConnectionEmail('  Athlete@Example.COM ')).toBe(
      'athlete@example.com',
    )
  })

  it('only offers active unlinked business clients', () => {
    const clients = [
      { id: 'one', status: 'active', linked_user_id: null },
      { id: 'two', status: 'active', linked_user_id: 'athlete-2' },
      { id: 'three', status: 'archived', linked_user_id: null },
    ]

    expect(
      availableBusinessClientsForConnection(clients).map((client) => client.id),
    ).toEqual(['one'])
  })

  it('suggests an exact email match but never selects a linked client', () => {
    const clients = [
      {
        id: 'available',
        status: 'active',
        linked_user_id: null,
        email: 'athlete@example.com',
      },
      {
        id: 'linked',
        status: 'active',
        linked_user_id: 'another-user',
        email: 'athlete@example.com',
      },
    ]

    expect(
      findSuggestedBusinessClient(clients, {
        athlete_email: 'ATHLETE@example.com',
      })?.id,
    ).toBe('available')
  })
})
