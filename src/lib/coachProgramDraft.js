export const emptyProgram = () => ({
  name: '',
  description: '',
  durationWeeks: 4,
  days: [{ weekday: 1, kind: 'workout', title: '', templateId: '' }],
})

export const programFromRecord = (item = {}) => ({
  id: item.id,
  name: item.name ?? '',
  description: item.description ?? '',
  durationWeeks: item.duration_weeks ?? 4,
  days: item.program_payload?.days ?? [],
})

export const normalizeProgramDraft = (draft = {}) => ({
  name: String(draft.name ?? '').trim(),
  description: String(draft.description ?? '').trim(),
  durationWeeks: Number(draft.durationWeeks) || 4,
  days: (draft.days ?? []).map((day) => ({
    weekday: Number(day.weekday) || 0,
    kind: day.kind ?? 'workout',
    title: String(day.title ?? '').trim(),
    templateId: String(day.templateId ?? '').trim(),
  })),
})

export const isProgramDraftDirty = (baseline, draft) =>
  JSON.stringify(normalizeProgramDraft(baseline)) !==
  JSON.stringify(normalizeProgramDraft(draft))

export const scrollCoachShellToTop = () => {
  const main = document.querySelector('.coach-shell-main')
  if (!main) return
  main.scrollTop = 0
  main.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
}
