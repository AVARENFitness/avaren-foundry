import {
  ExternalLink,
  FileCheck2,
  FileText,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CLIENT_DOCUMENT_STATUS,
  coachClientDocumentsBackend,
  validateWaiverFile,
} from '../../lib/coachClientDocuments'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'
import { appUi } from '../../lib/appUi'

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

export default function CoachClientDocumentsPanel({ client }) {
  const businessClientId = resolveRecordBusinessClientId(client)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [signedAt, setSignedAt] = useState(() => toDateInputValue())
  const [documentVersion, setDocumentVersion] = useState('1')

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

  const openDocument = async (document) => {
    try {
      const url =
        await coachClientDocumentsBackend.createSignedDocumentUrl(
          document.storagePath,
        )
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      appUi.toast(
        openError?.message ?? 'Could not open signed waiver.',
        'error',
      )
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
              : 'Upload the signed copy to keep this client record complete.'}
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

      <section className="coach-client-document-upload">
        <div className="coach-client-document-upload-heading">
          <Upload {...ICON} />
          <div>
            <strong>
              {signedWaiver ? 'Upload a newer signed waiver' : 'Add signed waiver'}
            </strong>
            <span>
              PDF, JPG, PNG, or WebP · up to 10 MB. Older signed copies stay in
              the client history.
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
    </section>
  )
}
