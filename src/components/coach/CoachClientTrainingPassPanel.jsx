import { useCallback, useEffect, useMemo, useState } from 'react'
import { appUi } from '../../lib/appUi'
import { coachBackend } from '../../lib/coachBackend'
import { formatPackageDate } from '../../lib/sessionPackages'
import {
  buildCoachPassAvaContext,
  lowPassLabel,
  normalizePassBalanceViewRow,
  normalizePassLedgerEntry,
  summarizeClientPasses,
} from '../../lib/coachPass'
import {
  PASS_CREDIT_REASON,
  formatPassLedgerHistoryHeadline,
  formatPassLedgerQuantityLabel,
  resolveManualCreditLedgerReason,
  resolveManualDebitLedgerReason,
  mapPassAdjustmentError,
} from '../../lib/coachPassAdjustment'
import CoachCreatePassSheet from './CoachCreatePassSheet'
import CoachAdjustPassSheet from './CoachAdjustPassSheet'

export default function CoachClientTrainingPassPanel({
  client = null,
  onPassContextChange,
}) {
  const [resolvedBusinessClientId, setResolvedBusinessClientId] = useState(
    () => client?.business_client_id ?? client?.businessClientId ?? null,
  )
  const [passes, setPasses] = useState([])
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [linkageLoading, setLinkageLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [creating, setCreating] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [createError, setCreateError] = useState('')
  const [adjustError, setAdjustError] = useState('')
  const [legacyRemaining, setLegacyRemaining] = useState(null)

  useEffect(() => {
    const fromClient = client?.business_client_id ?? client?.businessClientId ?? null
    if (fromClient) {
      setResolvedBusinessClientId(fromClient)
      return
    }

    if (!client?.athlete_id) {
      setResolvedBusinessClientId(null)
      return
    }

    let active = true
    setLinkageLoading(true)
    coachBackend
      .resolveBusinessClientId(client.athlete_id)
      .then((id) => {
        if (active) setResolvedBusinessClientId(id)
      })
      .catch(() => {
        if (active) setResolvedBusinessClientId(null)
      })
      .finally(() => {
        if (active) setLinkageLoading(false)
      })

    return () => {
      active = false
    }
  }, [client?.athlete_id, client?.business_client_id, client?.businessClientId])

  const businessClientIdPresent = Boolean(resolvedBusinessClientId)

  const loadPassData = useCallback(async () => {
    if (!resolvedBusinessClientId) {
      setPasses([])
      setLedger([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [balanceRows, ledgerRows, legacyPackage] = await Promise.all([
        coachBackend.listClientPassBalances(resolvedBusinessClientId),
        coachBackend.listClientPassLedger(resolvedBusinessClientId, 100),
        client?.athlete_id
          ? coachBackend.getSessionPackage(client.athlete_id).catch(() => null)
          : Promise.resolve(null),
      ])

      const normalizedPasses = (balanceRows ?? [])
        .map(normalizePassBalanceViewRow)
        .filter(Boolean)
      setPasses(normalizedPasses)
      setLedger(
        (ledgerRows ?? []).map(normalizePassLedgerEntry).filter(Boolean),
      )
      setLegacyRemaining(
        legacyPackage?.sessions_remaining != null
          ? Number(legacyPackage.sessions_remaining)
          : null,
      )
    } catch {
      setPasses([])
      setLedger([])
    } finally {
      setLoading(false)
    }
  }, [resolvedBusinessClientId, client?.athlete_id])

  useEffect(() => {
    loadPassData()
  }, [loadPassData])

  const summary = useMemo(() => summarizeClientPasses(passes), [passes])
  const primaryPass = summary.primaryPass
  const hasActivePass = summary.totalBalance > 0
  const lowPassNotice =
    hasActivePass && summary.totalBalance <= 2
      ? lowPassLabel(summary.totalBalance)
      : null

  const usedOnPrimaryPass = primaryPass
    ? Math.max(
        0,
        Number(primaryPass.sessionsPurchased ?? 0) -
          Number(primaryPass.balance ?? 0),
      )
    : 0

  useEffect(() => {
    onPassContextChange?.(
      buildCoachPassAvaContext({
        client: {
          ...client,
          business_client_id: resolvedBusinessClientId,
          businessClientId: resolvedBusinessClientId,
        },
        passes,
        ledger,
        appointments: [],
      }),
    )
  }, [passes, ledger, client, resolvedBusinessClientId, onPassContextChange])

  const handleCreatePass = async (payload) => {
    if (!resolvedBusinessClientId || creating) return

    setCreating(true)
    setCreateError('')

    try {
      await coachBackend.createCoachClientPass({
        businessClientId: resolvedBusinessClientId,
        name: payload.name,
        sessionsPurchased: payload.sessionsPurchased,
        startsAt: payload.startsAt,
        expiresAt: payload.expiresAt,
        notes: payload.notes,
      })

      setShowCreate(false)
      await loadPassData()
      appUi.toast('Training pass created.', 'success')
    } catch {
      setCreateError("We couldn't create this pass. Try again.")
      appUi.toast("We couldn't create this pass. Try again.", 'error')
    } finally {
      setCreating(false)
    }
  }

  const openCreateSheet = () => {
    setCreateError('')
    setShowCreate(true)
  }

  const openAdjustSheet = () => {
    setAdjustError('')
    setShowAdjust(true)
    setShowHistory(true)
  }

  const handleRemoveSession = async ({
    passId,
    quantity,
    reasonCode,
    note,
    balanceBefore,
  }) => {
    if (!resolvedBusinessClientId || adjusting) return

    setAdjusting(true)
    setAdjustError('')

    try {
      const reason = resolveManualDebitLedgerReason(reasonCode, note)
      const result = await coachBackend.applyCoachClientPassManualDebit({
        passId,
        quantity,
        reason,
        balanceBefore,
      })

      if (!result.ok) {
        throw new Error(result.message)
      }

      setShowAdjust(false)
      await loadPassData()
      appUi.toast(
        `${quantity} session${quantity === 1 ? '' : 's'} removed · ${result.balanceBefore} → ${result.balanceAfter} remaining`,
        'success',
      )
    } catch (error) {
      const message = mapPassAdjustmentError(error)
      setAdjustError(message)
      appUi.toast(message, 'error')
    } finally {
      setAdjusting(false)
    }
  }

  const handleAddSession = async ({
    passId,
    quantity,
    reasonCode,
    note,
    balanceBefore,
  }) => {
    if (!resolvedBusinessClientId || adjusting) return

    setAdjusting(true)
    setAdjustError('')

    try {
      const useCreditRestored = reasonCode === PASS_CREDIT_REASON.CHARGE_REVERSED
      const reason = resolveManualCreditLedgerReason(reasonCode, note, {
        useCreditRestored,
      })
      const apply = useCreditRestored
        ? coachBackend.applyCoachClientPassCreditRestored.bind(coachBackend)
        : coachBackend.applyCoachClientPassManualCredit.bind(coachBackend)
      const result = await apply({
        passId,
        quantity,
        reason,
        balanceBefore,
      })

      if (!result.ok) {
        throw new Error(result.message)
      }

      setShowAdjust(false)
      await loadPassData()
      appUi.toast(
        `${quantity} session${quantity === 1 ? '' : 's'} added · ${result.balanceBefore} → ${result.balanceAfter} remaining`,
        'success',
      )
    } catch (error) {
      const message = mapPassAdjustmentError(error)
      setAdjustError(message)
      appUi.toast(message, 'error')
    } finally {
      setAdjusting(false)
    }
  }

  const createPassSheet = (
    <CoachCreatePassSheet
      open={showCreate}
      submitting={creating}
      onClose={() => {
        if (creating) return
        setShowCreate(false)
        setCreateError('')
      }}
      onSubmit={handleCreatePass}
    />
  )

  const adjustPassSheet = (
    <CoachAdjustPassSheet
      open={showAdjust}
      submitting={adjusting}
      passes={passes}
      totalBalance={summary.totalBalance}
      onClose={() => {
        if (adjusting) return
        setShowAdjust(false)
        setAdjustError('')
      }}
      onRemoveSession={handleRemoveSession}
      onAddSession={handleAddSession}
    />
  )

  if (linkageLoading || (loading && !businessClientIdPresent)) {
    return (
      <section
        className="coach-client-training-pass-panel"
        data-testid="coach-training-pass-panel"
        data-business-client-id-present={businessClientIdPresent}
      >
        <p className="coach-client-in-person-loading">Loading training pass…</p>
        {createPassSheet}
        {adjustPassSheet}
      </section>
    )
  }

  if (!businessClientIdPresent) {
    return (
      <section
        className="coach-client-training-pass-panel"
        data-testid="coach-training-pass-panel"
        data-business-client-id-present="false"
      >
        <p className="coach-client-in-person-empty">
          Client linkage is still syncing. Refresh shortly.
        </p>
      </section>
    )
  }

  return (
    <section
      className="coach-client-training-pass-panel"
      data-testid="coach-training-pass-panel"
      data-business-client-id-present="true"
    >
      <header className="coach-client-training-pass-header">
        <span className="eyebrow">TRAINING PASS</span>
        {lowPassNotice ? (
          <p className="coach-client-training-pass-alert">{lowPassNotice}</p>
        ) : null}
      </header>

      {loading ? (
        <p className="coach-client-in-person-loading">Loading training pass…</p>
      ) : hasActivePass && primaryPass ? (
        <article className="coach-client-training-pass-summary">
          <strong>{summary.totalBalance} remaining</strong>
          <p>
            {usedOnPrimaryPass} of {primaryPass.sessionsPurchased} used
          </p>
          <p className="coach-client-training-pass-name">{primaryPass.name}</p>
          {primaryPass.startsAt ? (
            <small>Started {formatPackageDate(primaryPass.startsAt)}</small>
          ) : null}
          {legacyRemaining != null &&
          legacyRemaining !== summary.totalBalance ? (
            <small className="coach-client-training-pass-legacy-note">
              Legacy package shows {legacyRemaining} remaining — pass ledger is
              canonical.
            </small>
          ) : null}
          <div className="coach-client-training-pass-actions">
            <button
              type="button"
              className="coach-secondary-button"
              onClick={() => setShowHistory((current) => !current)}
            >
              {showHistory ? 'Hide usage' : 'View usage'}
            </button>
            <button
              type="button"
              className="coach-secondary-button"
              data-testid="coach-adjust-pass-button"
              onClick={openAdjustSheet}
            >
              Adjust
            </button>
            <button
              type="button"
              className="coach-secondary-button"
              data-testid="coach-add-pass-button"
              onClick={openCreateSheet}
            >
              Add pass
            </button>
          </div>
        </article>
      ) : (
        <article className="coach-client-training-pass-empty">
          <strong>No active training pass</strong>
          <p>Add a pass to track this client&apos;s in-person sessions.</p>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            data-testid="coach-add-pass-button"
            onClick={openCreateSheet}
          >
            Add pass
          </button>
        </article>
      )}

      {createError ? (
        <p className="coach-client-training-pass-error" role="alert">
          {createError}
        </p>
      ) : null}

      {adjustError ? (
        <p className="coach-client-training-pass-error" role="alert">
          {adjustError}
        </p>
      ) : null}

      {showHistory && ledger.length > 0 ? (
        <ul className="coach-client-training-pass-ledger">
          {ledger.map((entry) => (
            <li key={entry.id} className="coach-client-training-pass-ledger-row">
              <div>
                <strong>{formatPassLedgerHistoryHeadline(entry)}</strong>
                <span>{formatPassLedgerQuantityLabel(entry.quantity)}</span>
                {entry.passName ? <small>{entry.passName}</small> : null}
              </div>
              <time dateTime={entry.createdAt}>
                {entry.createdAt
                  ? new Date(entry.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })
                  : ''}
              </time>
            </li>
          ))}
        </ul>
      ) : null}

      {createPassSheet}
      {adjustPassSheet}
    </section>
  )
}
