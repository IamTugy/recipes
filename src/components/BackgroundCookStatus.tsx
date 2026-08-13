import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { TimerState } from '../types'
import { formatSeconds } from '../utils/format'

export interface BackgroundCookStatusHandle {
  enterFloatingView: () => void
  exitFloatingView: () => void
}

interface BackgroundCookStatusProps {
  /** Guided step-by-step wizard is open - this is the only time we broadcast anything. */
  active: boolean
  recipeTitle: string
  stepLabel: string
  stepText: string
  nearestTimer: TimerState | null
  lang: 'he' | 'en'
  canGoPrev: boolean
  canGoNext: boolean
  onToggleNearestTimer: () => void
  onPrevStep: () => void
  onNextStep: () => void
}

const CANVAS_W = 480
const CANVAS_H = 270

// Renders the live "now cooking" frame that feeds the Picture-in-Picture video - this is what
// the user sees floating on screen while the app is minimized during guide mode.
function drawFrame(ctx: CanvasRenderingContext2D, props: BackgroundCookStatusProps) {
  const { recipeTitle, stepLabel, stepText, nearestTimer, lang } = props
  const rtl = lang === 'he'
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  const x = rtl ? CANVAS_W - 20 : 20

  ctx.fillStyle = '#1c1815'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(245, 238, 227, 0.55)'
  ctx.font = '600 17px system-ui, sans-serif'
  ctx.fillText(`${recipeTitle} · ${stepLabel}`, x, 18, CANVAS_W - 40)

  ctx.fillStyle = '#f5eee3'
  ctx.font = '700 27px system-ui, sans-serif'
  wrapText(ctx, stepText, x, 58, CANVAS_W - 40, 36, 4)

  if (nearestTimer) {
    ctx.fillStyle = 'rgba(216, 155, 78, 0.15)'
    ctx.fillRect(20, CANVAS_H - 76, CANVAS_W - 40, 56)
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillStyle = '#d89b4e'
    ctx.font = '700 30px system-ui, sans-serif'
    ctx.fillText(`${nearestTimer.running ? '⏱' : '⏸'} ${formatSeconds(nearestTimer.remainingSeconds)}`, x, CANVAS_H - 64, 170)
    ctx.font = '400 15px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(245, 238, 227, 0.65)'
    const labelX = rtl ? CANVAS_W - 200 : 200
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillText(nearestTimer.label, labelX, CANVAS_H - 60, CANVAS_W - 220)
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, x: number, startY: number,
  maxWidth: number, lineHeight: number, maxLines: number,
) {
  const words = text.split(' ')
  let line = ''
  let y = startY
  let linesDrawn = 0
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      linesDrawn++
      if (linesDrawn === maxLines) {
        ctx.fillText(`${line}…`, x, y, maxWidth)
        return
      }
      ctx.fillText(line, x, y, maxWidth)
      line = words[i]
      y += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y, maxWidth)
}

// Drives three ambient "guide mode is running in the background" surfaces on Android/Chrome:
//  1. A tag-updated OS notification with the current step + nearest timer, shown while the tab
//     is hidden (minimized/backgrounded) so the user doesn't have to reopen the app to check.
//  2. A canvas-fed video that can enter Picture-in-Picture, giving a small floating widget with
//     the same live info on screen while the user does something else.
//  3. Media Session action handlers, which Chrome renders as real clickable icons overlaying an
//     active PiP video window - the only way to make a canvas-fed PiP widget interactive at all,
//     since the pixels themselves can't receive clicks. play/pause toggles the nearest timer,
//     previous/next track move a step back/forward.
// There's no in-app map/navigation feature to mirror into a notification, so that part of the
// original request doesn't apply here - PiP + notification is the closest equivalent this web
// app can offer without a native Android wrapper.
const BackgroundCookStatus = forwardRef<BackgroundCookStatusHandle, BackgroundCookStatusProps>(
  function BackgroundCookStatus(props, ref) {
    const { active, recipeTitle, stepLabel, stepText, nearestTimer, lang, canGoPrev, canGoNext, onToggleNearestTimer, onPrevStep, onNextStep } = props
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const notificationRef = useRef<Notification | null>(null)

    useImperativeHandle(ref, () => ({
      enterFloatingView: () => {
        if (typeof videoRef.current?.requestPictureInPicture === 'function') {
          videoRef.current.requestPictureInPicture().catch(() => { /* PiP unsupported/blocked - nothing to fall back to */ })
        }
      },
      exitFloatingView: () => {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => { /* already gone */ })
        }
      },
    }), [])

    // Redraw whenever the step, timer countdown, or language changes.
    useEffect(() => {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawFrame(ctx, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on any prop that affects the frame
    }, [recipeTitle, stepLabel, stepText, nearestTimer, lang])

    // Feed the canvas into the video element so it can enter Picture-in-Picture as a live widget.
    useEffect(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      if (active) {
        const stream = canvas.captureStream(1)
        streamRef.current = stream
        video.srcObject = stream
        video.play().catch(() => { /* will play once PiP/user-gesture unblocks it */ })
      } else {
        if (document.pictureInPictureElement === video) {
          document.exitPictureInPicture().catch(() => { /* ignore */ })
        }
        video.pause()
        video.srcObject = null
        streamRef.current?.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }, [active])

    // Wire the PiP window's native control icons - play/pause is the only way to make the
    // "click the timer to pause/resume" ask work, since the canvas pixels themselves are inert.
    useEffect(() => {
      if (!active || typeof navigator === 'undefined' || !navigator.mediaSession) return
      const mediaSession = navigator.mediaSession
      mediaSession.metadata = new MediaMetadata({ title: stepText || recipeTitle, artist: `${recipeTitle} · ${stepLabel}` })
      mediaSession.playbackState = nearestTimer?.running ? 'playing' : 'paused'
      mediaSession.setActionHandler('play', onToggleNearestTimer)
      mediaSession.setActionHandler('pause', onToggleNearestTimer)
      mediaSession.setActionHandler('previoustrack', canGoPrev ? onPrevStep : null)
      mediaSession.setActionHandler('nexttrack', onNextStep)
      return () => {
        mediaSession.setActionHandler('play', null)
        mediaSession.setActionHandler('pause', null)
        mediaSession.setActionHandler('previoustrack', null)
        mediaSession.setActionHandler('nexttrack', null)
      }
    }, [active, recipeTitle, stepLabel, stepText, nearestTimer, canGoPrev, canGoNext, onToggleNearestTimer, onPrevStep, onNextStep])

    // Mirror the current step/timer into a real OS notification while guide mode runs backgrounded.
    useEffect(() => {
      function sync() {
        if (!active || !document.hidden) {
          notificationRef.current?.close()
          notificationRef.current = null
          return
        }
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const body = nearestTimer
          ? `${stepText}\n⏱ ${nearestTimer.label}: ${formatSeconds(nearestTimer.remainingSeconds)}`
          : stepText
        notificationRef.current?.close()
        notificationRef.current = new Notification(`${recipeTitle} · ${stepLabel}`, {
          body, tag: 'cook-mode-guide', silent: true,
        })
      }
      sync()
      document.addEventListener('visibilitychange', sync)
      // Countdown keeps ticking while hidden - refresh the notification body periodically to match.
      const heartbeat = window.setInterval(sync, 15000)
      return () => {
        document.removeEventListener('visibilitychange', sync)
        window.clearInterval(heartbeat)
      }
    }, [active, recipeTitle, stepLabel, stepText, nearestTimer])

    useEffect(() => () => {
      notificationRef.current?.close()
      streamRef.current?.getTracks().forEach(track => track.stop())
    }, [])

    return (
      <div
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: 0, width: 2, height: 2, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
      >
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
        {/* autopictureinpicture (all-lowercase, no React typing yet) lets Chromium auto-enter PiP
            when the tab is hidden; the enterFloatingView() handle covers browsers that need a
            user-gesture-triggered call instead. */}
        <video ref={videoRef} muted playsInline {...{ autopictureinpicture: 'true' }} />
      </div>
    )
  },
)

export default BackgroundCookStatus
