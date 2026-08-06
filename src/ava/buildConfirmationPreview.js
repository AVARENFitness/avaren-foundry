export function buildConfirmationPreview(response) {
  if (response?.data?.interpretation?.preview) {
    return response.data.interpretation.preview
  }

  if (response?.data?.preview) {
    return response.data.preview
  }

  return null
}
