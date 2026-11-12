import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const coachSource = readFileSync(resolve(process.cwd(), 'src/screens/CoachScreen.jsx'), 'utf8')
const hubSource = readFileSync(resolve(process.cwd(), 'src/components/coach/CoachCommandCenter.jsx'), 'utf8')

describe('Coach Hub complete-roster safety', () => {
  it('loads the canonical roster independently of optional dashboard data', () => {
    expect(coachSource).toContain('const supportingRequests = Promise.allSettled([')
    expect(coachSource).toContain('const optional = (request) => Promise.resolve().then(request)')
    expect(coachSource).toContain('optional(() => coachBackend.listCoachLeads())')
    expect(coachSource).toContain('const c = await coachBackend.listCoachRoster({ includeArchived: true })')
    expect(coachSource).toContain('setClients(c)')
    expect(coachSource).toContain('const results = await supportingRequests')
  })

  it('prevents late focus refreshes from replacing a newer roster', () => {
    expect(coachSource).toContain('rosterRequestVersionRef.current')
    expect(coachSource).toContain('if (!isCurrent()) return c')
    expect(coachSource).toContain('if (isCurrent()) setLoading(false)')
  })

  it('keeps previously loaded clients after errors and provides a retry path', () => {
    expect(coachSource).toContain('setRosterLoadError(error?.message')
    expect(coachSource).not.toContain('setClients([])')
    expect(hubSource).toContain('onClick={onRefreshClients}')
    expect(hubSource).toContain('Client roster could not refresh.')
  })

  it('keeps roster visible while optional intelligence is loading', () => {
    expect(hubSource).toContain('{loading ? (')
    expect(hubSource).not.toContain('{loading || portfolioLoading ? (')
  })

  it('defaults the full Clients directory to All and clears search on View all', () => {
    expect(hubSource).toContain('rosterOnly ? ROSTER_HUB_FILTER.ALL : ROSTER_HUB_FILTER.ACTIVE')
    expect(hubSource).toContain("onQueryChange?.('')")
    expect(hubSource).toContain("onNavigateCoachScreen?.('clients')")
    expect(hubSource).toContain('View all clients ({clients.length})')
  })
})
