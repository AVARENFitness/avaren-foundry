import { supabase } from './supabase'
import { isValidUuid } from './coachBusinessClient'

export const CLIENT_DOCUMENT_TYPE = {
  LIABILITY_WAIVER: 'liability_waiver',
}

export const CLIENT_DOCUMENT_STATUS = {
  PENDING: 'pending',
  SIGNED: 'signed',
  SUPERSEDED: 'superseded',
}

const WAIVER_BUCKET = 'client-waivers'
const MAX_WAIVER_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_WAIVER_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Sign in to continue.')
  return data.user
}

const safeFileName = (name = 'waiver') =>
  String(name)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'waiver'

export const normalizeClientDocument = (row = {}) => ({
  ...row,
  businessClientId: row.business_client_id ?? row.businessClientId ?? null,
  documentType: row.document_type ?? row.documentType ?? null,
  documentVersion: row.document_version ?? row.documentVersion ?? '',
  storagePath: row.storage_path ?? row.storagePath ?? null,
  originalFilename: row.original_filename ?? row.originalFilename ?? '',
  mimeType: row.mime_type ?? row.mimeType ?? '',
  signedAt: row.signed_at ?? row.signedAt ?? null,
  uploadedAt: row.uploaded_at ?? row.uploadedAt ?? null,
  signingMethod: row.signing_method ?? row.signingMethod ?? 'upload',
  signerName: row.signer_name ?? row.signerName ?? '',
  waiverTextSnapshot: row.waiver_text_snapshot ?? row.waiverTextSnapshot ?? '',
  acknowledgementText:
    row.acknowledgement_text ?? row.acknowledgementText ?? '',
  deviceUserAgent: row.device_user_agent ?? row.deviceUserAgent ?? '',
})

export const validateWaiverFile = (file) => {
  if (!file) return 'Choose a signed waiver file.'
  if (!ALLOWED_WAIVER_TYPES.has(file.type)) {
    return 'Upload a PDF, JPG, PNG, or WebP file.'
  }
  if (file.size > MAX_WAIVER_FILE_BYTES) {
    return 'Waiver files must be 10 MB or smaller.'
  }
  return ''
}

export const coachClientDocumentsBackend = {
  async listClientDocuments(businessClientId) {
    if (!isValidUuid(businessClientId)) return []
    const user = await currentUser()
    const { data, error } = await supabase
      .from('coach_client_documents')
      .select('*')
      .eq('coach_id', user.id)
      .eq('business_client_id', businessClientId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map(normalizeClientDocument)
  },

  async uploadSignedLiabilityWaiver({
    businessClientId,
    file,
    signedAt,
    documentVersion = '1',
  } = {}) {
    if (!isValidUuid(businessClientId)) {
      throw new Error('Client record not found.')
    }

    const fileError = validateWaiverFile(file)
    if (fileError) throw new Error(fileError)
    if (!signedAt) throw new Error('Signed date is required.')

    const user = await currentUser()
    const documentId = crypto.randomUUID()
    const storagePath = [
      user.id,
      businessClientId,
      documentId,
      safeFileName(file.name),
    ].join('/')

    const upload = await supabase.storage
      .from(WAIVER_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (upload.error) throw upload.error

    try {
      const { data: inserted, error: insertError } = await supabase
        .from('coach_client_documents')
        .insert({
          id: documentId,
          coach_id: user.id,
          business_client_id: businessClientId,
          document_type: CLIENT_DOCUMENT_TYPE.LIABILITY_WAIVER,
          title: 'AVAREN Liability Waiver',
          status: CLIENT_DOCUMENT_STATUS.SIGNED,
          document_version: String(documentVersion || '1').trim() || '1',
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type,
          signed_at: new Date(`${signedAt}T12:00:00`).toISOString(),
          uploaded_at: new Date().toISOString(),
          signing_method: 'upload',
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (insertError) throw insertError

      const { error: supersedeError } = await supabase
        .from('coach_client_documents')
        .update({
          status: CLIENT_DOCUMENT_STATUS.SUPERSEDED,
          updated_at: new Date().toISOString(),
        })
        .eq('coach_id', user.id)
        .eq('business_client_id', businessClientId)
        .eq('document_type', CLIENT_DOCUMENT_TYPE.LIABILITY_WAIVER)
        .eq('status', CLIENT_DOCUMENT_STATUS.SIGNED)
        .neq('id', documentId)

      if (supersedeError) {
        console.warn('[client-waivers] Could not supersede prior waiver:', supersedeError)
      }

      return normalizeClientDocument(inserted)
    } catch (error) {
      await supabase.storage.from(WAIVER_BUCKET).remove([storagePath])
      throw error
    }
  },

,

  async signLiabilityWaiverOnCoachDevice({
    businessClientId,
    signatureBlob,
    signerName,
    waiverText,
    acknowledgementText,
    documentVersion = '1',
  } = {}) {
    if (!isValidUuid(businessClientId)) {
      throw new Error('Client record not found.')
    }
    if (!(signatureBlob instanceof Blob) || !signatureBlob.size) {
      throw new Error('Signature is required.')
    }

    const normalizedSignerName = String(signerName ?? '').trim()
    const normalizedWaiverText = String(waiverText ?? '').trim()
    const normalizedAcknowledgement = String(acknowledgementText ?? '').trim()

    if (!normalizedSignerName) throw new Error('Signer name is required.')
    if (!normalizedWaiverText) throw new Error('Waiver text is not configured.')
    if (!normalizedAcknowledgement) {
      throw new Error('Waiver acknowledgement is required.')
    }

    const user = await currentUser()
    const documentId = crypto.randomUUID()
    const storagePath = [
      user.id,
      businessClientId,
      documentId,
      'signature.png',
    ].join('/')

    const upload = await supabase.storage
      .from(WAIVER_BUCKET)
      .upload(storagePath, signatureBlob, {
        contentType: 'image/png',
        upsert: false,
      })

    if (upload.error) throw upload.error

    const signedAt = new Date().toISOString()

    try {
      const { data: inserted, error: insertError } = await supabase
        .from('coach_client_documents')
        .insert({
          id: documentId,
          coach_id: user.id,
          business_client_id: businessClientId,
          document_type: CLIENT_DOCUMENT_TYPE.LIABILITY_WAIVER,
          title: 'AVAREN Liability Waiver',
          status: CLIENT_DOCUMENT_STATUS.SIGNED,
          document_version: String(documentVersion || '1').trim() || '1',
          storage_path: storagePath,
          original_filename: 'signature.png',
          mime_type: 'image/png',
          signed_at: signedAt,
          uploaded_at: signedAt,
          signing_method: 'coach_device',
          signer_name: normalizedSignerName,
          waiver_text_snapshot: normalizedWaiverText,
          acknowledgement_text: normalizedAcknowledgement,
          device_user_agent: navigator.userAgent || null,
          updated_at: signedAt,
        })
        .select('*')
        .single()

      if (insertError) throw insertError

      const { error: supersedeError } = await supabase
        .from('coach_client_documents')
        .update({
          status: CLIENT_DOCUMENT_STATUS.SUPERSEDED,
          updated_at: new Date().toISOString(),
        })
        .eq('coach_id', user.id)
        .eq('business_client_id', businessClientId)
        .eq('document_type', CLIENT_DOCUMENT_TYPE.LIABILITY_WAIVER)
        .eq('status', CLIENT_DOCUMENT_STATUS.SIGNED)
        .neq('id', documentId)

      if (supersedeError) {
        console.warn('[client-waivers] Could not supersede prior waiver:', supersedeError)
      }

      return normalizeClientDocument(inserted)
    } catch (error) {
      await supabase.storage.from(WAIVER_BUCKET).remove([storagePath])
      throw error
    }
  }

  async createSignedDocumentUrl(storagePath, expiresIn = 120) {
    if (!storagePath) throw new Error('Signed copy is unavailable.')
    const { data, error } = await supabase.storage
      .from(WAIVER_BUCKET)
      .createSignedUrl(storagePath, expiresIn)

    if (error) throw error
    if (!data?.signedUrl) throw new Error('Could not open signed copy.')
    return data.signedUrl
  },
}
