// Detect strongly coloured event blocks directly from screenshot pixels.
// Coordinates are measured, never inferred from an AI-generated calendar list.
const classify = (r, g, b) => {
  const high = Math.max(r, g, b), low = Math.min(r, g, b)
  if (high < 65 || high - low < 45 || low > 210) return 0
  if (b > r * 1.22 && b > g * 1.12 && b > 110) return 1
  if (g > r * 1.24 && g > b * 1.08 && g > 105) return 2
  return 0
}

export function detectCalendarEventBlocks(imageData) {
  const { width, height, data } = imageData
  if (!width || !height || !data) return []
  const step = 3
  const w = Math.ceil(width / step), h = Math.ceil(height / step)
  const pixels = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = Math.min(width - 1, x * step + 1)
      const py = Math.min(height - 1, y * step + 1)
      const i = (py * width + px) * 4
      pixels[y * w + x] = classify(data[i], data[i + 1], data[i + 2])
    }
  }
  // Horizontal row spans of the same colour are connected vertically.
  // White event text and tiny gaps must not split a single rectangle.
  const active = []
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const kind = pixels[y * w + x]
      if (!kind) { x++; continue }
      const start = x
      while (x < w && pixels[y * w + x] === kind) x++
      if (x - start >= 6) active.push({ x1:start, x2:x, y1:y, y2:y + 1, kind })
    }
  }
  const groups = []
  active.forEach(line => {
    let group = groups.find(g => g.kind === line.kind && line.y1 <= g.y2 + 2 &&
      Math.min(g.x2,line.x2) - Math.max(g.x1,line.x1) >= 5)
    if (!group) { group = { ...line }; groups.push(group) }
    else { group.x1 = Math.min(group.x1,line.x1); group.x2 = Math.max(group.x2,line.x2); group.y2 = Math.max(group.y2,line.y2) }
  })
  const rectangles = groups
    .map(g => ({ x: g.x1 * step, y: g.y1 * step, width: (g.x2-g.x1)*step, height: (g.y2-g.y1)*step, kind:g.kind }))
    .filter(g => g.width >= 25 && g.height >= 18 && g.y > height * .12 && g.y < height * .95)
  // Merge pieces of the same event separated by the white title glyphs.
  const output = []
  rectangles.forEach(r => {
    const other = output.find(o => o.kind === r.kind && Math.abs(o.x - r.x) < 12 &&
      Math.abs(o.width-r.width) < 16 && r.y <= o.y + o.height + 9 && r.y + r.height >= o.y - 9)
    if (!other) output.push({ ...r })
    else {
      const bottom = Math.max(other.y + other.height, r.y + r.height)
      other.y = Math.min(other.y,r.y)
      other.height = bottom - other.y
    }
  })
  return output.sort((a,b) => a.x - b.x || a.y - b.y).slice(0, 50).map((r,i) => ({ id:i, x:r.x, y:r.y, width:r.width, height:r.height, color:r.kind }))
}
export async function getCalendarScreenshotGeometry(file) {
  const url = URL.createObjectURL(file)
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1300 / bitmap.width)
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d', { willReadFrequently:true })
    context.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const blocks = detectCalendarEventBlocks(context.getImageData(0,0,canvas.width,canvas.height))
    bitmap.close?.()
    return { width:canvas.width, height:canvas.height, blocks }
  } finally { URL.revokeObjectURL(url) }
}
