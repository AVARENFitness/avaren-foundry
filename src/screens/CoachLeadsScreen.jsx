import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, UserPlus } from 'lucide-react'
import { coachBackend } from '../lib/coachBackend'
import {
  formatLeadFollowUpDate,
  isLeadFollowUpDue,
  leadDisplayName,
  leadFollowUpDateToIso,
  leadFollowUpDateValue,
  LEAD_STAGE,
  LEAD_STAGE_LABEL,
} from '../lib/coachLead'
import EmptyState from '../components/ui/EmptyState'

const STAGE_OPTIONS = Object.values(LEAD_STAGE)

export default function CoachLeadsScreen({
  onBack,
  onConverted,
  notice = '',
  setNotice,
}) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [editor, setEditor] = useState({
    stage: LEAD_STAGE.NEW,
    followUpDate: '',
  })
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    goal: '',
    source: '',
    notes: '',
  })

  const loadLeads = async () => {
    setLoading(true)
    try {
      const rows = await coachBackend.listCoachLeads()
      setLeads(rows)
    } catch (error) {
      setNotice?.(error.message)
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [])

  const dueCount = useMemo(
    () => leads.filter((lead) => isLeadFollowUpDue(lead)).length,
    [leads],
  )

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null

  useEffect(() => {
    if (!selectedLead) {
      setEditor({ stage: LEAD_STAGE.NEW, followUpDate: '' })
      return
    }

    setEditor({
      stage: selectedLead.stage,
      followUpDate: leadFollowUpDateValue(selectedLead.nextFollowUpAt),
    })
  }, [selectedLead?.id, selectedLead?.stage, selectedLead?.nextFollowUpAt])

  const editorDirty = Boolean(
    selectedLead &&
      (editor.stage !== selectedLead.stage ||
        editor.followUpDate !== leadFollowUpDateValue(selectedLead.nextFollowUpAt)),
  )

  const resetForm = () => {
    setForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      goal: '',
      source: '',
      notes: '',
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!form.firstName.trim()) {
      setNotice?.('First name is required.')
      return
    }

    setSubmitting(true)
    try {
      await coachBackend.createCoachLead(form)
      resetForm()
      setShowAdd(false)
      setNotice?.('Lead saved.')
      await loadLeads()
    } catch (error) {
      setNotice?.(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveLead = async () => {
    if (!selectedLead || !editorDirty) return

    setSubmitting(true)
    try {
      await coachBackend.updateCoachLead(selectedLead.id, {
        stage: editor.stage,
        nextFollowUpAt: editor.followUpDate
          ? leadFollowUpDateToIso(editor.followUpDate)
          : null,
      })
      setNotice?.('Lead saved.')
      await loadLeads()
    } catch (error) {
      setNotice?.(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleConvert = async (lead) => {
    if (editorDirty) {
      setNotice?.('Save your lead changes before converting.')
      return
    }

    if (lead.stage !== LEAD_STAGE.WON) {
      setNotice?.('Mark the lead WON before converting.')
      return
    }

    setSubmitting(true)
    try {
      const result = await coachBackend.convertCoachLeadToClient(lead.id)
      setNotice?.('Lead converted to client.')
      await loadLeads()
      onConverted?.(result.businessClient)
    } catch (error) {
      setNotice?.(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="coach-hub-screen coach-leads-screen">
      <header className="coach-hub-page-header">
        <button type="button" className="coach-secondary-button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back
        </button>
        <div>
          <span className="eyebrow">COACH</span>
          <h1>Leads</h1>
          <p className="coach-build-subcopy">
            {dueCount > 0
              ? `${dueCount} follow-up${dueCount === 1 ? '' : 's'} due`
              : 'Prospects and inquiries'}
          </p>
        </div>
        <button
          type="button"
          className="gold-button machined"
          onClick={() => setShowAdd(true)}
        >
          <Plus size={16} />
          Add lead
        </button>
      </header>

      {notice ? <p className="coach-hub-notice">{notice}</p> : null}

      {loading ? (
        <div className="coach-leads-list">
          {[1, 2, 3].map((item) => (
            <article key={item} className="coach-leads-row skeleton" />
          ))}
        </div>
      ) : leads.length ? (
        <div className="coach-leads-list">
          {leads.map((lead) => {
            const due = isLeadFollowUpDue(lead)
            return (
              <button
                key={lead.id}
                type="button"
                className={`coach-leads-row${due ? ' coach-leads-row--due' : ''}`}
                onClick={() =>
                  setSelectedLeadId((current) =>
                    current === lead.id ? null : lead.id,
                  )
                }
              >
                <div>
                  <strong>{leadDisplayName(lead)}</strong>
                  <span>{LEAD_STAGE_LABEL[lead.stage] ?? lead.stage}</span>
                  {lead.nextFollowUpAt ? (
                    <small>Follow up {formatLeadFollowUpDate(lead.nextFollowUpAt)}</small>
                  ) : null}
                </div>
                {due ? <span className="coach-leads-due-pill">Due</span> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={UserPlus}
          title="No leads yet"
          description="Add prospects you are talking to outside AVAREN."
          actionLabel="Add lead"
          onAction={() => setShowAdd(true)}
        />
      )}

      {selectedLead ? (
        <section className="coach-leads-detail">
          <span className="eyebrow">LEAD</span>
          <h2>{leadDisplayName(selectedLead)}</h2>
          <div className="coach-leads-detail-summary">
            {selectedLead.goal ? <p>{selectedLead.goal}</p> : null}
            {selectedLead.phone ? <p>{selectedLead.phone}</p> : null}
            {selectedLead.email ? <p>{selectedLead.email}</p> : null}
          </div>

          <label>
            <span>Stage</span>
            <select
              value={editor.stage}
              disabled={submitting}
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  stage: event.target.value,
                }))
              }
            >
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {LEAD_STAGE_LABEL[stage]}
                </option>
              ))}
            </select>
          </label>

          <div className="coach-leads-follow-up-block">
            <label>
              <span>Follow-up date</span>
              <input
                type="date"
                disabled={submitting}
                value={editor.followUpDate}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    followUpDate: event.target.value,
                  }))
                }
              />
            </label>
            {editor.followUpDate ? (
              <button
                type="button"
                className="coach-leads-clear-follow-up"
                disabled={submitting}
                onClick={() =>
                  setEditor((current) => ({ ...current, followUpDate: '' }))
                }
              >
                Clear follow-up
              </button>
            ) : null}
          </div>

          <div className="coach-leads-save-row">
            <button
              type="button"
              className="gold-button machined"
              disabled={submitting || !editorDirty}
              onClick={handleSaveLead}
            >
              {submitting ? 'Saving…' : editorDirty ? 'Save changes' : 'Saved'}
            </button>
          </div>

          {editor.stage === LEAD_STAGE.WON ? (
            <button
              type="button"
              className="coach-secondary-button coach-leads-convert-button"
              disabled={
                submitting || editorDirty || Boolean(selectedLead.businessClientId)
              }
              onClick={() => handleConvert(selectedLead)}
            >
              {selectedLead.businessClientId
                ? 'Already converted'
                : editorDirty
                  ? 'Save changes to convert'
                  : 'Convert to client'}
            </button>
          ) : null}
        </section>
      ) : null}

      {showAdd ? (
        <section className="coach-leads-add-sheet">
          <header>
            <h2>Add lead</h2>
            <button type="button" onClick={() => setShowAdd(false)}>
              Close
            </button>
          </header>
          <form onSubmit={handleCreate}>
            <label>
              <span>Name</span>
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                placeholder="First name"
                required
              />
            </label>
            <label>
              <span>Phone or email</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="Phone"
              />
              <input
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="Email"
              />
            </label>
            <label>
              <span>Goal</span>
              <input
                value={form.goal}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goal: event.target.value,
                  }))
                }
                placeholder="Why they reached out"
              />
            </label>
            <label>
              <span>Source</span>
              <input
                value={form.source}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    source: event.target.value,
                  }))
                }
                placeholder="Referral, Instagram, walk-in"
              />
            </label>
            <label>
              <span>Note</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Anything worth remembering"
              />
            </label>
            <button
              type="submit"
              className="gold-button machined"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save lead'}
            </button>
          </form>
        </section>
      ) : null}
    </section>
  )
}
