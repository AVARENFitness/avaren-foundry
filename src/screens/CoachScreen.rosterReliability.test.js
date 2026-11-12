import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const coachSource = readFileSync(resolve(process.cwd(), 'src/screens/CoachScreen.jsx'), 'utf8')
const hubSource = readFileSync(resolve(process.cwd(), 'src/components/coach/CoachCommandCenter.jsx'), 'utf8')
const backendSource = readFileSync(resolve(process.cwd(), 'src/lib/coachBackend.js'), 'utf8')

describe('Coach Hub complete-roster safety', () => {
  it('loads the canonical roster independently of optional dashboard data', () => {
    expect(coachSource).toContain('const supportingRequests = Promise.allSettled([')
    expect(coachSource).toContain('const optional = (request) => Promise.resolve().then(request)')
    expect(coachSource).toContain('optional(() => coachBackend.listCoachLeads())')
    expect(coachSource).toContain('let c = await coachBackend.listCoachRoster({ includeArchived: true })')
    expect(coachSource).toContain('setClients(c)')
    expect(coachSource).toContain('const results = await supportingRequests')
  })

  it('does not let optional bridge, profile or label failures erase business clients', () => {
    const start = backendSource.indexOf('async listCoachRoster(')
    const end = backendSource.indexOf('async createBusinessClient(', start)
    const roster = backendSource.slice(start, end)

    expect(roster).toContain('const [businessResult, bridgeResult] = await Promise.allSettled([')
    expect(roster).toContain("if (businessResult.status === 'rejected') throw businessResult.reason")
    expect(roster).toContain("bridgeResult.status === 'fulfilled' ? bridgeResult.value : []")
    expect(roster).toContain('const [profilesResult, labelsResult] = await Promise.allSettled([')
    expect(roster).toContain("profilesResult.status === 'fulfilled' ? profilesResult.value : {}")
    expect(roster).toContain("labelsResult.status === 'fulfilled' ? labelsResult.value : {}")
  })

  it('prevents late focus refreshes from replacing a newer roster', () => {
    expect(coachSource).toContain('rosterRequestVersionRef.current')
    expect(coachSource).toContain('if (!isCurrent()) return c')
    expect(coachSource).toContain('if (isCurrent()) setLoading(false)')
  })

  it('keeps known active clients when repeated refreshes omit their rows', () => {
    expect(coachSource).toContain('const lastVerifiedRosterRef = useRef([])')
    expect(coachSource).toContain('missingActiveRosterClientIds(lastVerifiedRosterRef.current, c)')
    expect(coachSource).toContain('if (missingIds.length) {')
    expect(coachSource).toContain('c = await coachBackend.listCoachRoster({ includeArchived: true })')
    expect(coachSource).toContain('setRosterLoadError(')
    expect(coachSource).toContain('return lastVerifiedRosterRef.current')
    expect(coachSource).toContain('lastVerifiedRosterRef.current = c')
  })

  it('keeps previously loaded clients after errors and provides a retry path', () => {
    expect(coachSource).toContain('setRosterLoadError(error?.message')
    expect(coachSource).not.toContain('setClients([])')
    expect(hubSource).toContain('onClick={onRefreshClients}')
    expect(hubSource).toContain('Client roster could not refresh.')
  })

  it('keeps roster visible while optional intelligence is loading', () => {
    expect(hubSource).toContain('{loading && clients.length === 0 ? (')
    expect(hubSource).not.toContain('{loading || portfolioLoading ? (')
  })

  it('defaults the full Clients directory to All and clears search on View all', () => {
    expect(hubSource).toContain('const [rosterFilter, setRosterFilter] = useState(\n    ROSTER_HUB_FILTER.ACTIVE,\n  )')
    expect(hubSource).toContain("onQueryChange?.('')")
    expect(hubSource).toContain("onNavigateCoachScreen?.('clients')")
    expect(hubSource).toContain('View all clients ({clients.length})')
    expect(hubSource).toContain('Showing {rosterPreview.length} of {filteredRoster.length} active clients')
    expect(hubSource).toContain('{rosterOnly ? (')
    expect(hubSource).toContain('aria-pressed={rosterFilter === option.id}')
  })
})
