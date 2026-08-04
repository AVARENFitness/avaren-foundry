const MANIFEST_URL = '/motion/manifest.json'

let manifestPromise = null

export const loadMotionManifest = async () => {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, {
      cache: 'no-cache',
    }).then((response) => {
      if (!response.ok) {
        throw new Error(
          `Unable to load Motion Library manifest (${response.status})`,
        )
      }

      return response.json()
    })
  }

  return manifestPromise
}

export const getMotionEntry = async (movementId) => {
  const manifest = await loadMotionManifest()
  return manifest.movements?.[movementId] ?? null
}

export const motionFramePath = (
  entry,
  index,
) =>
  `/motion/${entry.folder}/frame-${String(
    index + 1,
  ).padStart(2, '0')}.webp`

const preloadImage = (src) =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () =>
      resolve({ src, status: 'ready' })
    image.onerror = () =>
      resolve({ src, status: 'missing' })
    image.src = src
  })

export const preloadMotionEntry = async (
  entry,
) => {
  if (
    !entry ||
    entry.status !== 'ready' ||
    !entry.frames
  ) {
    return {
      status: entry?.status ?? 'missing',
      loaded: 0,
      total: entry?.frames ?? 0,
    }
  }

  const results = await Promise.all(
    Array.from(
      { length: entry.frames },
      (_, index) =>
        preloadImage(
          motionFramePath(entry, index),
        ),
    ),
  )

  const loaded = results.filter(
    (result) => result.status === 'ready',
  ).length

  return {
    status:
      loaded === entry.frames
        ? 'ready'
        : 'incomplete',
    loaded,
    total: entry.frames,
  }
}

export const preloadMotionFlow = async (
  movements = [],
  onProgress,
) => {
  const manifest = await loadMotionManifest()
  const entries = movements
    .map(
      (movement) =>
        manifest.movements?.[movement.id],
    )
    .filter(Boolean)

  let completed = 0
  const results = []

  for (const entry of entries) {
    const result = await preloadMotionEntry(entry)

    completed += 1
    results.push({
      id: entry.folder,
      ...result,
    })

    onProgress?.({
      completed,
      total: entries.length,
      current: entry.title,
      result,
    })
  }

  return results
}
