import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrandMark } from './Icon'

const COLORS = [
  ['#b6defa', '#8cc8ef'], ['#86c3ee', '#5aa9e0'], ['#58a5e0', '#3a8acb'],
  ['#3b8bcb', '#2870ae'], ['#2b74b2', '#1c5a93'], ['#1d5c95', '#123f69'],
]
const LAYERS = COLORS.length
const STAGGER = 0.09
const RISE = 1
const HOLD = 1
const DRAIN_START = (LAYERS - 1) * STAGGER + RISE + HOLD
const DRAIN = 1.2
const COMPLETE = DRAIN_START + (LAYERS - 1) * STAGGER + DRAIN

export default function RisingFloodTransition({ enabled, onReveal, onComplete }) {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('')
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      onReveal?.()
      onComplete?.()
      setComplete(true)
      return undefined
    }

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frameId = 0
    let start = 0
    let previous = 0
    let revealed = false
    let stopped = false
    const width = () => window.innerWidth
    const height = () => window.innerHeight
    const step = 6
    let columns = 0
    let edgeLines = []
    let lowerLines = []
    let particles = []
    let bubbles = []

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width() * ratio)
      canvas.height = Math.round(height() * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      columns = Math.ceil(width() / step) + 2
      edgeLines = Array.from({ length: LAYERS }, () => new Float32Array(columns))
      lowerLines = Array.from({ length: LAYERS }, () => new Float32Array(columns))
    }

    const ease = (value) => {
      const t = Math.max(0, Math.min(1, value))
      return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
    }
    const wave = (x, time, layer) => Math.sin(x * 0.011 + time * 1.6 + layer * 1.7)
      + 0.55 * Math.sin(x * 0.027 - time * 2.1 + layer * 1.45)
      + 0.25 * Math.sin(x * 0.061 + time * 3 + layer * 2.3)
    const position = (layer, time, layerHeight) => {
      const from = height() + 80
      const covered = -40
      const gone = -layerHeight - 80
      const riseAt = layer * STAGGER
      const drainAt = DRAIN_START + (LAYERS - 1 - layer) * STAGGER
      if (time < riseAt + RISE) {
        const progress = (time - riseAt) / RISE
        if (progress <= 0) return { top: from, motion: 0 }
        return { top: from + (covered - from) * ease(progress), motion: Math.sin(Math.PI * progress) }
      }
      if (time < drainAt) {
        const holdProgress = (time - riseAt - RISE) / (drainAt - riseAt - RISE)
        return { top: covered - 6 * Math.sin(Math.PI * holdProgress), motion: 0.1 }
      }
      const progress = (time - drainAt) / DRAIN
      if (progress >= 1) return { top: gone, motion: 0 }
      return { top: covered + (gone - covered) * ease(progress), motion: Math.sin(Math.PI * progress) }
    }
    const stroke = (points, alpha, lineWidth, offset = 0) => {
      context.beginPath()
      for (let index = 0; index < columns; index += 1) {
        const y = points[index] + offset
        if (index === 0) context.moveTo(0, y)
        else context.lineTo(index * step, y)
      }
      context.strokeStyle = `rgba(255,255,255,${alpha})`
      context.lineWidth = lineWidth
      context.lineJoin = 'round'
      context.stroke()
    }

    const paint = (time, delta) => {
      context.clearRect(0, 0, width(), height())
      const layerHeight = height() * 1.1 + 100
      const positions = Array.from({ length: LAYERS }, (_, index) => position(index, time, layerHeight))

      positions.forEach(({ top, motion }, layer) => {
        if (top > height() + 120 || top + layerHeight < -120) return
        const amplitude = (12 + layer * 2.5) * (0.6 + 0.7 * motion)
        const upper = edgeLines[layer]
        const lower = lowerLines[layer]
        for (let column = 0; column < columns; column += 1) {
          const x = column * step
          upper[column] = top + amplitude * wave(x, time, layer)
          lower[column] = top + layerHeight + amplitude * wave(x, time, layer + 0.4)
        }
        context.beginPath()
        context.moveTo(0, upper[0])
        for (let column = 1; column < columns; column += 1) context.lineTo(column * step, upper[column])
        for (let column = columns - 1; column >= 0; column -= 1) context.lineTo(column * step, lower[column])
        context.closePath()
        const gradient = context.createLinearGradient(0, top, 0, top + layerHeight)
        gradient.addColorStop(0, COLORS[layer][0])
        gradient.addColorStop(1, COLORS[layer][1])
        context.fillStyle = gradient
        context.fill()
        if (top > -90 && top < height() + 90) {
          stroke(upper, layer === 0 ? 0.85 : 0.45, layer === 0 ? 4 : 2.5)
          stroke(upper, 0.16, 9, 7)
        }
        const lowerY = top + layerHeight
        if (lowerY > -90 && lowerY < height() + 90) {
          stroke(lower, layer === 0 ? 0.85 : 0.5, layer === 0 ? 4 : 2.5)
          stroke(lower, 0.14, 9, -7)
        }
      })

      if (time > 0.7 && time < 3) {
        const count = Math.floor(34 * (width() * height()) / (420 * 800) * delta)
        for (let index = 0; index < count; index += 1) {
          bubbles.push({ x: Math.random() * width(), y: height() * (0.3 + Math.random() * 0.65), speed: 55 + Math.random() * 95, radius: 2 + Math.random() * 5, life: 1.2 + Math.random() * 1.2 })
        }
      }
      bubbles = bubbles.filter((bubble) => {
        bubble.y -= bubble.speed * delta
        bubble.life -= delta
        if (bubble.life <= 0 || bubble.y < -10) return false
        context.beginPath()
        context.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2)
        context.strokeStyle = `rgba(235,248,255,${Math.min(0.6, bubble.life / 2)})`
        context.lineWidth = 1.4
        context.stroke()
        return true
      })
      particles = particles.filter((particle) => {
        particle.life -= delta
        particle.vy += 750 * delta
        particle.x += particle.vx * delta
        particle.y += particle.vy * delta
        if (particle.life <= 0 || particle.y > height() + 20) return false
        context.beginPath()
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        context.fillStyle = `rgba(255,255,255,${Math.min(0.85, particle.life)})`
        context.fill()
        return true
      })
      if (time > 1.2 && time < 2.9) {
        const alpha = 0.075 * Math.sin(Math.PI * (time - 1.2) / 1.7)
        for (let index = 0; index < 3; index += 1) {
          const x = width() * (0.2 + index * 0.32) + Math.sin(time * 0.7 + index * 2) * 46
          context.beginPath()
          context.moveTo(x, 0)
          context.lineTo(x + 70 + index * 18, 0)
          context.lineTo(x + 70 + index * 18 - height() * 0.35, height())
          context.lineTo(x - height() * 0.35, height())
          context.closePath()
          context.fillStyle = `rgba(255,255,255,${alpha})`
          context.fill()
        }
      }
    }

    const animate = (now) => {
      if (stopped) return
      const time = (now - start) / 1000
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      if (time < COMPLETE + 0.1) paint(time, delta)
      else context.clearRect(0, 0, width(), height())
      if (!revealed && time >= 3.25) {
        revealed = true
        onReveal?.()
      }
      if (time < COMPLETE + 0.2) frameId = window.requestAnimationFrame(animate)
      else {
        onComplete?.()
        setComplete(true)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    if (reduced) {
      onReveal?.()
      onComplete?.()
      setComplete(true)
      return () => window.removeEventListener('resize', resize)
    }
    start = performance.now()
    previous = start
    frameId = window.requestAnimationFrame(animate)
    return () => {
      stopped = true
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, onReveal, onComplete])

  useEffect(() => {
    if (!enabled) return undefined
    const messages = [
      window.setTimeout(() => setStatus('Checking flood updates'), 1250),
      window.setTimeout(() => setStatus('Preparing your local alerts'), 1750),
      window.setTimeout(() => setStatus('Ready'), 2200),
      window.setTimeout(() => setStatus(''), 2900),
    ]
    return () => messages.forEach(window.clearTimeout)
  }, [enabled])

  if (!enabled || complete) return null
  return createPortal((
    <div className="rising-flood-overlay" aria-hidden="true">
      <canvas className="rising-flood-canvas" ref={canvasRef} />
      <div className="rising-flood-hud">
        <BrandMark className="rising-flood-logo" />
        <strong>BANTALA</strong>
        <span>{status || '\u00a0'}</span>
        <i><b /></i>
      </div>
    </div>
  ), document.body)
}
