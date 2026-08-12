import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CoachCreatePassSheet from './coach/CoachCreatePassSheet'
import CoachScheduleSessionSheet from './CoachScheduleSessionSheet'
import CoachSessionDetailSheet from './coach/CoachSessionDetailSheet'
import ConfirmationDialog from './ui/ConfirmationDialog'
import AvaWhySheet from './AvaWhySheet'
import TodaysFocusWhySheet from './TodaysFocusWhySheet'
import { summarizeClientPasses } from '../lib/coachPass'

const session = {
  id: 'session-1',
  athleteId: 'athlete-jake',
  sessionDate: '2026-08-13',
  startTime: '17:30',
  durationMinutes: 60,
  status: 'scheduled',
  locationType: 'avaren_gym',
  rsvpStatus: 'confirmed',
}

describe('canonical app-ui backdrop surfaces', () => {
  it.each([
    {
      name: 'Add Pass',
      renderOpen: () =>
        render(
          <CoachCreatePassSheet open onClose={vi.fn()} onSubmit={vi.fn()} />,
        ),
      renderClosed: () =>
        render(
          <CoachCreatePassSheet open={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
        ),
    },
    {
      name: 'Schedule Session',
      renderOpen: () =>
        render(
          <CoachScheduleSessionSheet
            open
            clients={[]}
            draft={{
              athleteId: '',
              sessionDate: '2026-08-13',
              startTime: '09:00',
              durationMinutes: '60',
              coachNote: '',
              assignmentId: null,
              locationType: 'default',
              locationName: '',
              assignments: [],
            }}
            onDraftChange={vi.fn()}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />,
        ),
      renderClosed: () =>
        render(
          <CoachScheduleSessionSheet
            open={false}
            clients={[]}
            draft={{
              athleteId: '',
              sessionDate: '2026-08-13',
              startTime: '09:00',
              durationMinutes: '60',
              coachNote: '',
              assignmentId: null,
              locationType: 'default',
              locationName: '',
              assignments: [],
            }}
            onDraftChange={vi.fn()}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />,
        ),
    },
    {
      name: 'Appointment detail',
      renderOpen: () =>
        render(
          <CoachSessionDetailSheet
            open
            session={session}
            client={{ coach_label: 'Jake' }}
            passSummary={summarizeClientPasses([])}
            onClose={vi.fn()}
            rescheduleDraft={{
              sessionDate: session.sessionDate,
              startTime: session.startTime,
              durationMinutes: '60',
              assignmentId: null,
              locationType: 'default',
              locationName: '',
            }}
          />,
        ),
      renderClosed: () =>
        render(
          <CoachSessionDetailSheet
            open={false}
            session={session}
            client={{ coach_label: 'Jake' }}
            passSummary={summarizeClientPasses([])}
            onClose={vi.fn()}
            rescheduleDraft={{
              sessionDate: session.sessionDate,
              startTime: session.startTime,
              durationMinutes: '60',
              assignmentId: null,
              locationType: 'default',
              locationName: '',
            }}
          />,
        ),
    },
    {
      name: 'ConfirmationDialog',
      renderOpen: () =>
        render(
          <ConfirmationDialog
            open
            message="Confirm action"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />,
        ),
      renderClosed: () =>
        render(
          <ConfirmationDialog
            open={false}
            message="Confirm action"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />,
        ),
    },
    {
      name: 'AvaWhySheet',
      renderOpen: () =>
        render(
          <AvaWhySheet
            open
            briefing={{
              headline: 'Recovery first',
              summary: 'Sleep was low last night.',
              evidence: [],
            }}
            onClose={vi.fn()}
          />,
        ),
      renderClosed: () =>
        render(
          <AvaWhySheet
            open={false}
            briefing={{
              headline: 'Recovery first',
              summary: 'Sleep was low last night.',
              evidence: [],
            }}
            onClose={vi.fn()}
          />,
        ),
    },
    {
      name: 'TodaysFocusWhySheet',
      renderOpen: () =>
        render(
          <TodaysFocusWhySheet
            open
            focus={{
              title: 'Move with control',
              explanation: 'You logged heavy volume yesterday.',
              reasons: ['Lower-body fatigue'],
            }}
            onClose={vi.fn()}
          />,
        ),
      renderClosed: () =>
        render(
          <TodaysFocusWhySheet
            open={false}
            focus={{
              title: 'Move with control',
              explanation: 'You logged heavy volume yesterday.',
              reasons: ['Lower-body fatigue'],
            }}
            onClose={vi.fn()}
          />,
        ),
    },
  ])('$name exposes canonical open marker when open and removes it when closed', ({
    renderOpen,
    renderClosed,
  }) => {
    const openResult = renderOpen()
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    openResult.unmount()

    renderClosed()
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
  })

  it('appointment detail renders coach session detail test id when open', () => {
    render(
      <CoachSessionDetailSheet
        open
        session={session}
        client={{ coach_label: 'Jake' }}
        passSummary={summarizeClientPasses([])}
        onClose={vi.fn()}
        rescheduleDraft={{
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          durationMinutes: '60',
          assignmentId: null,
          locationType: 'default',
          locationName: '',
        }}
      />,
    )

    expect(screen.getByTestId('coach-session-detail-sheet')).toBeInTheDocument()
  })
})
