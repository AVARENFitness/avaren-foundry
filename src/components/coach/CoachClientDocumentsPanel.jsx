import {
  ExternalLink,
  FileCheck2,
  FileText,
  PenLine,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'
import SignaturePad from '../ui/SignaturePad'
import {
  CLIENT_DOCUMENT_STATUS,
  coachClientDocumentsBackend,
  validateWaiverFile,
} from '../../lib/coachClientDocuments'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'
import { appUi } from '../../lib/appUi'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import {
  AVAREN_LIABILITY_WAIVER_ACKNOWLEDGEMENT,
  AVAREN_LIABILITY_WAIVER_TEXT,
  AVAREN_LIABILITY_WAIVER_TITLE,
  AVAREN_LIABILITY_WAIVER_VERSION,
  isAvarenLiabilityWaiverConfigured,
} from '../../content/avarenLiabilityWaiver'

const ICON = { size: 18, strokeWidth: 1.75 }

const toDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatSignedDate = (value) =>
  value
    ? new Date(value).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date not recorded'

const renderWaiverText = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line, index) => {
      const value = line.trim()
      if (!value) return <div key={index} className="coach-waiver-spacer" aria-hidden="true" />
      if (/^\d+\./.test(value)) {
        return (
          <h3 key={index} className="coach-waiver-section-title">
            {value}
          </h3>
        )
      }
      if (value === value.toUpperCase() && value.length < 90) {
        return (
          <p key={index} className="coach-waiver-document-heading">
            {value}
          </p>
        )
      }
      return <p key={index}>{value}</p>
    })

export default function CoachClientDocumentsPanel({ client }) {
  const businessClientId = resolveRecordBusinessClientId(client)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [signedAt, setSignedAt] = useState(() => toDateInputValue())
  const [documentVersion, setDocumentVersion] = useState('1')
  const [showSigning, setShowSigning] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signatureBlob, setSignatureBlob] = useState(null)
  const [acceptedWaiver, setAcceptedWaiver] = useState(false)
  const [signatureClearSignal, setSignatureClearSignal] = useState(0)
  const [signingSaving, setSigningSaving] = useState(false)
  const [signingError, setSigningError] = useState('')
  const [recordDocument, setRecordDocument] = useState(null)
  const [recordSignatureUrl, setRecordSignatureUrl] = useState('')
  const waiverConfigured = isAvarenLiabilityWaiverConfigured()
  const clientName = getClientDisplayName(client)

  const loadDocuments = async () => {
    if (!businessClientId) {
      setDocuments([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const rows = await coachClientDocumentsBackend.listClientDocuments(
        businessClientId,
      )
      setDocuments(rows)
    } catch (loadError) {
      setError(loadError?.message ?? 'Could not load client documents.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [businessClientId])

  const signedWaiver = useMemo(
    () =>
      documents.find(
        (document) =>
          document.documentType === 'liability_waiver' &&
          document.status === CLIENT_DOCUMENT_STATUS.SIGNED,
      ) ?? null,
    [documents],
  )

  const waiverHistory = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.documentType === 'liability_waiver' &&
          document.status === CLIENT_DOCUMENT_STATUS.SUPERSEDED,
      ),
    [documents],
  )

  const openDocument = async (documentRecord) => {
    try {
      const url =
        await coachClientDocumentsBackend.createSignedDocumentUrl(
          documentRecord.storagePath,
        )

      if (documentRecord.signingMethod === 'coach_device') {
        setRecordDocument(documentRecord)
        setRecordSignatureUrl(url)
        return
      }

      const link = window.document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.click()
    } catch (openError) {
      appUi.toast(
        openError?.message ?? 'Could not open signed waiver.',
        'error',
      )
    }
  }

  const startCoachDeviceSigning = () => {
    setSignerName(clientName)
    setSignatureBlob(null)
    setAcceptedWaiver(false)
    setSigningError('')
    setSignatureClearSignal((value) => value + 1)
    setShowSigning(true)
  }

  const submitCoachDeviceSignature = async () => {
    if (!waiverConfigured || signingSaving) return

    if (!signerName.trim()) {
      setSigningError('Enter the signer’s full name.')
      return
    }
    if (!acceptedWaiver) {
      setSigningError('The client must acknowledge the waiver before signing.')
      return
    }
    if (!signatureBlob) {
      setSigningError('The client must sign before saving.')
      return
    }

    setSigningSaving(true)
    setSigningError('')
    try {
      await coachClientDocumentsBackend.signLiabilityWaiverOnCoachDevice({
        businessClientId,
        signatureBlob,
        signerName,
        waiverText: AVAREN_LIABILITY_WAIVER_TEXT,
        acknowledgementText: AVAREN_LIABILITY_WAIVER_ACKNOWLEDGEMENT,
        documentVersion: AVAREN_LIABILITY_WAIVER_VERSION,
      })
      setShowSigning(false)
      appUi.toast('Liability waiver signed and saved to this client.', 'success')
      await loadDocuments()
    } catch (signError) {
      setSigningError(signError?.message ?? 'Could not save signed waiver.')
    } finally {
      setSigningSaving(false)
    }
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setSelectedFile(null)
      return
    }

    const validation = validateWaiverFile(file)
    if (validation) {
      setSelectedFile(null)
      event.target.value = ''
      appUi.toast(validation, 'error')
      return
    }

    setSelectedFile(file)
  }

  const uploadWaiver = async () => {
    if (!businessClientId || uploading) return

    const validation = validateWaiverFile(selectedFile)
    if (validation) {
      appUi.toast(validation, 'error')
      return
    }

    setUploading(true)
    setError('')
    try {
      await coachClientDocumentsBackend.uploadSignedLiabilityWaiver({
        businessClientId,
        file: selectedFile,
        signedAt,
        documentVersion,
      })
      setSelectedFile(null)
      setSignedAt(toDateInputValue())
      appUi.toast('Signed liability waiver saved to this client.', 'success')
      await loadDocuments()
    } catch (uploadError) {
      setError(uploadError?.message ?? 'Could not upload signed waiver.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="coach-client-documents">
      <header className="coach-client-documents-header">
        <div>
          <span className="eyebrow">DOCUMENTS & WAIVERS</span>
          <h2>Client documents</h2>
          <p>
            Keep signed business records with the client profile, including past
            clients and clients who do not use the AVAREN app.
          </p>
        </div>
      </header>

      <article
        className={
          signedWaiver
            ? 'coach-client-waiver-card is-signed'
            : 'coach-client-waiver-card is-missing'
        }
      >
        <div className="coach-client-waiver-icon" aria-hidden="true">
          {signedWaiver ? <ShieldCheck {...ICON} /> : <FileText {...ICON} />}
        </div>
        <div className="coach-client-waiver-copy">
          <small>AVAREN LIABILITY WAIVER</small>
          <strong>{signedWaiver ? 'Signed copy on file' : 'Signed waiver missing'}</strong>
          <span>
            {signedWaiver
              ? `Signed ${formatSignedDate(signedWaiver.signedAt)} · Version ${signedWaiver.documentVersion || '1'}`
              : 'Have the client sign on this device or add an existing signed copy.'}
          </span>
        </div>
        {signedWaiver ? (
          <button
            type="button"
            className="coach-secondary-button coach-client-waiver-open"
            onClick={() => openDocument(signedWaiver)}
          >
            <ExternalLink size={16} strokeWidth={1.75} />
            View signed copy
          </button>
        ) : null}
      </article>

      <section className="coach-client-device-signing">
        <div className="coach-client-device-signing-copy">
          <span className="coach-client-device-signing-icon" aria-hidden="true">
            <PenLine {...ICON} />
          </span>
          <div>
            <small>PRIMARY SIGNING FLOW</small>
            <strong>Sign on this device</strong>
            <span>
              Hand your phone or tablet to the client. No AVAREN account is
              required.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="gold-button machined coach-client-device-signing-button"
          onClick={startCoachDeviceSigning}
        >
          Start signing
        </button>
        {!waiverConfigured ? (
          <p className="coach-client-waiver-config-warning">
            Waiver text not configured yet. The signing screen is built, but a
            production signature cannot be saved until the approved AVAREN
            waiver wording is added.
          </p>
        ) : null}
      </section>

      <section className="coach-client-document-upload">
        <div className="coach-client-document-upload-heading">
          <Upload {...ICON} />
          <div>
            <strong>
              {signedWaiver ? 'Import another signed copy' : 'Import existing signed copy'}
            </strong>
            <span>
              For legacy paper/PDF waivers. PDF, JPG, PNG, or WebP · up to
              10 MB. Older signed copies stay in the client history.
            </span>
          </div>
        </div>

        <div className="coach-client-document-fields">
          <label className="coach-field coach-field--wide">
            <span>Signed file</span>
            <input
              className="coach-field-input coach-client-document-file"
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>

          <label className="coach-field">
            <span>Signed date</span>
            <input
              className="coach-field-input"
              type="date"
              value={signedAt}
              onChange={(event) => setSignedAt(event.target.value)}
              disabled={uploading}
            />
          </label>

          <label className="coach-field">
            <span>Waiver version</span>
            <input
              className="coach-field-input"
              type="text"
              value={documentVersion}
              onChange={(event) => setDocumentVersion(event.target.value)}
              placeholder="1"
              maxLength={30}
              disabled={uploading}
            />
          </label>
        </div>

        {selectedFile ? (
          <div className="coach-client-document-selected">
            <FileCheck2 size={16} strokeWidth={1.75} />
            <span>{selectedFile.name}</span>
          </div>
        ) : null}

        {error ? <p className="coach-create-client-error">{error}</p> : null}

        <button
          type="button"
          className="gold-button machined coach-client-document-save"
          onClick={uploadWaiver}
          disabled={uploading || !selectedFile || !signedAt}
        >
          {uploading ? 'Saving signed waiver…' : 'Save signed waiver'}
        </button>
      </section>

      {loading ? (
        <p className="coach-client-document-loading">Loading documents…</p>
      ) : waiverHistory.length > 0 ? (
        <details className="coach-client-document-history">
          <summary>
            Previous waiver versions
            <span>{waiverHistory.length}</span>
          </summary>
          <div>
            {waiverHistory.map((document) => (
              <article key={document.id} className="coach-client-document-history-row">
                <div>
                  <strong>
                    AVAREN Liability Waiver · Version {document.documentVersion || '1'}
                  </strong>
                  <span>
                    Signed {formatSignedDate(document.signedAt)}
                    {document.originalFilename
                      ? ` · ${document.originalFilename}`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="coach-secondary-button"
                  onClick={() => openDocument(document)}
                >
                  Open
                </button>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      <AppUiBackdrop
        open={showSigning}
        onClose={signingSaving ? undefined : () => setShowSigning(false)}
        className="coach-waiver-signing-backdrop"
      >
        <section
          className="coach-waiver-signing-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-waiver-signing-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="coach-waiver-signing-header">
            <div>
              <span className="eyebrow">CLIENT SIGNING</span>
              <h2 id="coach-waiver-signing-title">{AVAREN_LIABILITY_WAIVER_TITLE}</h2>
              <p>Hand this device to {clientName}. Coach Hub stays behind this screen.</p>
            </div>
            <AppUiCloseButton
              onClick={() => setShowSigning(false)}
              disabled={signingSaving}
            />
          </header>

          {!waiverConfigured ? (
            <div className="coach-waiver-unconfigured">
              <ShieldCheck size={28} strokeWidth={1.6} />
              <strong>Waiver text not configured</strong>
              <p>
                The signing flow is ready, but AVAREN will not create a signed
                legal record until the exact approved liability-waiver wording
                and version are added.
              </p>
            </div>
          ) : (
            <>
              <div className="coach-waiver-terms" tabIndex="0">
                {renderWaiverText(AVAREN_LIABILITY_WAIVER_TEXT)}
              </div>

              <label className="coach-field coach-field--wide">
                <span>Client full legal name</span>
                <input
                  className="coach-field-input"
                  type="text"
                  value={signerName}
                  onChange={(event) => setSignerName(event.target.value)}
                  autoComplete="name"
                  disabled={signingSaving}
                />
              </label>

              <label className="coach-waiver-acknowledgement">
                <input
                  type="checkbox"
                  checked={acceptedWaiver}
                  onChange={(event) => setAcceptedWaiver(event.target.checked)}
                  disabled={signingSaving}
                />
                <span>{AVAREN_LIABILITY_WAIVER_ACKNOWLEDGEMENT}</span>
              </label>

              <div className="coach-waiver-signature-section">
                <div className="coach-waiver-signature-heading">
                  <div>
                    <small>SIGNATURE</small>
                    <strong>Sign below</strong>
                  </div>
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => {
                      setSignatureBlob(null)
                      setSignatureClearSignal((value) => value + 1)
                    }}
                    disabled={signingSaving}
                  >
                    Clear
                  </button>
                </div>
                <SignaturePad
                  disabled={signingSaving}
                  clearSignal={signatureClearSignal}
                  onChange={setSignatureBlob}
                />
              </div>

              {signingError ? (
                <p className="coach-create-client-error">{signingError}</p>
              ) : null}

              <footer className="coach-waiver-signing-footer">
                <small>
                  Version {AVAREN_LIABILITY_WAIVER_VERSION} · Signed date and
                  exact waiver text are stored with this record.
                </small>
                <button
                  type="button"
                  className="gold-button machined"
                  onClick={submitCoachDeviceSignature}
                  disabled={
                    signingSaving ||
                    !acceptedWaiver ||
                    !signatureBlob ||
                    !signerName.trim()
                  }
                >
                  {signingSaving ? 'Saving signed waiver…' : 'Agree & sign waiver'}
                </button>
              </footer>
            </>
          )}
        </section>
      </AppUiBackdrop>

      <AppUiBackdrop
        open={Boolean(recordDocument)}
        onClose={() => {
          setRecordDocument(null)
          setRecordSignatureUrl('')
        }}
        className="coach-waiver-record-backdrop"
      >
        {recordDocument ? (
          <section
            className="coach-waiver-record-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-waiver-record-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="coach-waiver-signing-header">
              <div>
                <span className="eyebrow">SIGNED RECORD</span>
                <h2 id="coach-waiver-record-title">AVAREN Liability Waiver</h2>
                <p>
                  {recordDocument.signerName} · Signed{' '}
                  {formatSignedDate(recordDocument.signedAt)} · Version{' '}
                  {recordDocument.documentVersion || '1'}
                </p>
              </div>
              <AppUiCloseButton
                onClick={() => {
                  setRecordDocument(null)
                  setRecordSignatureUrl('')
                }}
              />
            </header>

            <div className="coach-waiver-terms coach-waiver-terms--record">
              {renderWaiverText(recordDocument.waiverTextSnapshot)}
            </div>

            <div className="coach-waiver-record-acknowledgement">
              <small>ACKNOWLEDGEMENT</small>
              <p>{recordDocument.acknowledgementText}</p>
            </div>

            <div className="coach-waiver-record-signature">
              <small>SIGNATURE</small>
              {recordSignatureUrl ? (
                <img src={recordSignatureUrl} alt={`${recordDocument.signerName} signature`} />
              ) : null}
              <strong>{recordDocument.signerName}</strong>
            </div>
          </section>
        ) : null}
      </AppUiBackdrop>
    </section>
  )
}
