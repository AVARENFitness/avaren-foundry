import { describe, expect, it } from 'vitest'
import { buildCoachActivityFeed } from './clientIntelligence'
import { normalizeBusinessClientRecord } from './coachBusinessClient'

describe('buildCoachActivityFeed offline roster safety', () => {
  it('skips entries without athlete intelligence', () => {
    const offline = normalizeBusinessClientRecord({
      id: 'bc-sarah',
      business_client_id: 'bc-sarah',
      linked_user_id: null,
      first_name: 'Sarah',
      status: 'active',
    })

    expect(() =>
      buildCoachActivityFeed({
        rosterEntries: [
          {
            client: offline,
            clientName: 'Sarah',
            intelligence: null,
          },
        ],
        assignments: [],
      }),
    ).not.toThrow()
  })
})
