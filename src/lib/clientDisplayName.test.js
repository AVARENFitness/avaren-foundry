import { describe, expect, it } from 'vitest'
import {
  getAthleteDisplayName,
  getClientDisplayName,
  getClientDisambiguationLabel,
  getClientFullName,
  getClientMatchStrings,
} from './clientDisplayName'
import {
  buildCoachClientChoices,
  matchCoachClientsByName,
  resolveCoachClientByName,
} from '../ava/coach/avaCoachClientResolver'
import {
  mergeProfileWithoutBlankOverwrite,
  profileSeedFromAuthUser,
  sanitizeOwnProfileDraft,
} from './userProfileBackend'
import { isMissingIdentityTable } from './identityCapabilities'

describe('clientDisplayName', () => {
  it('prefers canonical profile name over non-name email local part', () => {
    const client = {
      athlete_email: 'bigdawgfitness88@gmail.com',
      profile: {
        first_name: 'Sarah',
        last_name: 'Johnson',
      },
    }

    expect(getClientDisplayName(client)).toBe('Sarah Johnson')
    expect(getClientDisplayName(client)).not.toBe('Bigdawgfitness88')
  })

  it('uses coach label before athlete profile for coach-facing display', () => {
    const client = {
      coach_label: 'Jake',
      profile: {
        preferred_name: 'Jacob',
        display_name: 'Jacob Corell',
      },
      athlete_email: 'jacobcorell2218@gmail.com',
    }

    expect(getClientDisplayName(client)).toBe('Jake')
    expect(getAthleteDisplayName(client)).toBe('Jacob')
  })

  it('uses preferred name for athlete display and AVA matching', () => {
    const client = {
      athlete_email: 'will.thompson@example.com',
      profile: {
        first_name: 'William',
        last_name: 'Thompson',
        preferred_name: 'Will',
      },
    }

    expect(getClientDisplayName(client)).toBe('Will')
    expect(getAthleteDisplayName(client)).toBe('Will')
    expect(getClientFullName(client)).toBe('William Thompson')
    expect(getClientMatchStrings(client)).toContain('will')
  })

  it('falls back to email prefix only when no identity exists', () => {
    const client = {
      athlete_email: 'jacobcorell2218@gmail.com',
    }

    expect(getClientDisplayName(client)).toBe('Jacobcorell2218')
  })

  it('uses legacy profile name before email prefix', () => {
    const client = {
      athlete_email: 'jacobcorell2218@gmail.com',
      legacyName: 'Jacob Corell',
    }

    expect(getClientDisplayName(client)).toBe('Jacob Corell')
  })
})

describe('avaCoachClientResolver identity', () => {
  const jacobCorell = {
    athlete_id: 'j1',
    athlete_email: 'jacobcorell2218@gmail.com',
    profile: {
      first_name: 'Jacob',
      last_name: 'Corell',
    },
  }

  const jacobSmith = {
    athlete_id: 'j2',
    athlete_email: 'jacob.smith@example.com',
    profile: {
      first_name: 'Jacob',
      last_name: 'Smith',
    },
  }

  it('resolves Jacob Corell without requiring email prefix', () => {
    const resolution = resolveCoachClientByName('Jacob Corell', [jacobCorell])

    expect(resolution.status).toBe('resolved')
    expect(resolution.clientName).toBe('Jacob Corell')
    expect(resolution.athleteId).toBe('j1')
  })

  it('resolves preferred name Will to William Thompson', () => {
    const william = {
      athlete_id: 'w1',
      athlete_email: 'will.thompson@example.com',
      profile: {
        first_name: 'William',
        last_name: 'Thompson',
        preferred_name: 'Will',
      },
    }

    const resolution = resolveCoachClientByName('Will', [william])
    expect(resolution.status).toBe('resolved')
    expect(resolution.clientName).toBe('Will')
  })

  it('resolves coach label Jake before athlete preferred name', () => {
    const client = {
      athlete_id: 'j1',
      coach_label: 'Jake',
      profile: {
        preferred_name: 'Jacob',
        first_name: 'Jacob',
        last_name: 'Corell',
      },
      athlete_email: 'jacobcorell2218@gmail.com',
    }

    const resolution = resolveCoachClientByName('Jake', [client])
    expect(resolution.status).toBe('resolved')
    expect(resolution.clientName).toBe('Jake')
  })

  it('disambiguates duplicate first names with full-name labels', () => {
    const resolution = resolveCoachClientByName('Jacob', [jacobCorell, jacobSmith])

    expect(resolution.status).toBe('ambiguous')
    expect(resolution.matches).toHaveLength(2)

    const choices = buildCoachClientChoices(resolution.matches)
    expect(choices.map((item) => item.label)).toEqual([
      'Jacob Corell',
      'Jacob Smith',
    ])
    expect(choices.every((item) => !String(item.subtitle ?? '').includes('@'))).toBe(
      true,
    )
  })

  it('only matches authorized roster clients', () => {
    const authorized = matchCoachClientsByName('Sarah', [
      {
        athlete_id: 's1',
        athlete_email: 'bigdawgfitness88@gmail.com',
        profile: {
          first_name: 'Sarah',
          last_name: 'Johnson',
        },
      },
    ])

    expect(authorized).toHaveLength(1)
    expect(getClientDisambiguationLabel(authorized[0])).toBe('Sarah Johnson')
  })
})

describe('userProfileBackend helpers', () => {
  it('seeds profile fields from auth metadata without coach label', () => {
    const seed = profileSeedFromAuthUser({
      user_metadata: {
        display_name: 'Jacob Corell',
        first_name: 'Jacob',
        last_name: 'Corell',
      },
    })

    expect(sanitizeOwnProfileDraft(seed)).toMatchObject({
      first_name: 'Jacob',
      last_name: 'Corell',
      preferred_name: '',
      display_name: 'Jacob Corell',
    })
  })

  it('does not overwrite existing profile values with blank patches', () => {
    const merged = mergeProfileWithoutBlankOverwrite(
      {
        first_name: 'Jacob',
        last_name: 'Corell',
        preferred_name: 'Jacob',
        display_name: '',
      },
      {
        first_name: '',
        last_name: '',
        preferred_name: '',
        display_name: '',
      },
    )

    expect(merged).toEqual({
      first_name: 'Jacob',
      last_name: 'Corell',
      preferred_name: 'Jacob',
      display_name: '',
    })
  })

  it('accepts athlete profile save draft for Jacob Corell', () => {
    const draft = sanitizeOwnProfileDraft({
      first_name: 'Jacob',
      last_name: 'Corell',
      preferred_name: 'Jacob',
    })

    expect(draft.first_name).toBe('Jacob')
    expect(draft.last_name).toBe('Corell')
    expect(draft.preferred_name).toBe('Jacob')
    expect(draft).not.toHaveProperty('coach_label')
  })
})

describe('identityCapabilities', () => {
  it('detects missing identity tables without throwing', () => {
    expect(
      isMissingIdentityTable({ code: '42P01', message: 'relation does not exist' }),
    ).toBe(true)
    expect(isMissingIdentityTable({ message: 'permission denied for table user_profiles' })).toBe(
      false,
    )
  })
})
