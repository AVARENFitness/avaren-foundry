/**
 * End coaching preserves business client, appointments, passes, ledger,
 * training history, reviews, and notes. It must never hard-delete records.
 */
export const END_COACHING_COPY = {
  title: 'End coaching',
  message:
    'Archive this client relationship? History, passes, appointments, and reviews stay on file. The athlete will no longer appear in your active roster.',
  confirmLabel: 'End coaching',
}

export const isArchivedBusinessClient = (client = {}) =>
  String(client.status ?? client.business_client_status ?? 'active') ===
  'archived'
