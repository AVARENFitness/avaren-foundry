import { useEffect, useRef, useState } from 'react'

const drawLine = (context, from, to) => {
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()
}

export default function SignaturePad({
  disabled = false,
  onChange,
  clearSignal = 0,
}) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const previousPointRef = useRef(null)
  const [hasInk, setHasInk] = useState(false)

  const resizeCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const snapshot = hasInk ? canvas.toDataURL('image/png') : null

    canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    canvas.height = Math.max(1, Math.floor(rect.height * ratio))

    const context = canvas.getContext('2d')
    context.scale(ratio, ratio)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2
    context.strokeStyle = '#f3eee5'

    if (snapshot) {
      const image = new Image()
      image.onload = () => {
        context.drawImage(image, 0, 0, rect.width, rect.height)
      }
      image.src = snapshot
    }
  }

  useEffect(() => {
    resizeCanvas()
    const handleResize = () => resizeCanvas()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    previousPointRef.current = null
    onChange?.(null)
  }, [clearSignal])

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const handlePointerDown = (event) => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drawingRef.current = true
    previousPointRef.current = pointFromEvent(event)
  }

  const handlePointerMove = (event) => {
    if (disabled || !drawingRef.current) return
    event.preventDefault()

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    const nextPoint = pointFromEvent(event)
    const previousPoint = previousPointRef.current ?? nextPoint

    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2
    context.strokeStyle = '#f3eee5'
    drawLine(context, previousPoint, nextPoint)

    previousPointRef.current = nextPoint
    if (!hasInk) setHasInk(true)
  }

  const finishDrawing = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    previousPointRef.current = null

    const canvas = canvasRef.current
    canvas.toBlob((blob) => {
      if (blob) onChange?.(blob)
    }, 'image/png')
  }

  return (
    <div className={`signature-pad-shell${disabled ? ' is-disabled' : ''}`}>
      <canvas
        ref={canvasRef}
        className="signature-pad-canvas"
        aria-label="Signature pad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        onPointerLeave={finishDrawing}
      />
      {!hasInk ? (
        <span className="signature-pad-placeholder">Sign here</span>
      ) : null}
      <div className="signature-pad-line" aria-hidden="true" />
    </div>
  )
}
