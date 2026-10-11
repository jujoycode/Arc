import { useEffect, useSyncExternalStore, type RefObject } from 'react'

const neutralPointer = {
  '--arcat-pointer-x': '0px',
  '--arcat-pointer-y': '0px',
  '--arcat-pointer-tilt': '0deg',
  '--arcat-pupil-x': '0px',
  '--arcat-pupil-y': '0px',
}

const inactiveSnapshot = () => false
const noopCleanup = () => {}
const noopSubscribe = () => noopCleanup

function pointerAvailabilitySnapshot() {
  return typeof window !== 'undefined'
    && window.matchMedia('(pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function subscribeToPointerAvailability(onChange: () => void) {
  const finePointer = window.matchMedia('(pointer: fine)')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  finePointer.addEventListener('change', onChange)
  reducedMotion.addEventListener('change', onChange)
  return () => {
    finePointer.removeEventListener('change', onChange)
    reducedMotion.removeEventListener('change', onChange)
  }
}

/** Decorative tracking only: no pointer-driven React renders or idle animation loop. */
export function useMascotPointer(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const tracking = useSyncExternalStore(
    enabled ? subscribeToPointerAvailability : noopSubscribe,
    enabled ? pointerAvailabilitySnapshot : inactiveSnapshot,
    inactiveSnapshot,
  )

  useEffect(() => {
    const picture = ref.current
    if (!picture) return
    if (!tracking) {
      for (const [property, value] of Object.entries(neutralPointer)) picture.style.setProperty(property, value)
      return
    }
    let frame = 0
    let point: { x: number; y: number } | undefined

    function recenter() {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      point = undefined
      for (const [property, value] of Object.entries(neutralPointer)) picture!.style.setProperty(property, value)
    }

    function renderPointer() {
      frame = 0
      if (!point) return
      const rect = picture!.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = Math.max(-1, Math.min(1, (point.x - rect.left - rect.width / 2) / Math.max(rect.width, window.innerWidth * .25)))
      const y = Math.max(-1, Math.min(1, (point.y - rect.top - rect.height / 2) / Math.max(rect.height, window.innerHeight * .25)))
      const scale = rect.width / 360
      picture!.style.setProperty('--arcat-pointer-x', `${(x * 5).toFixed(2)}px`)
      picture!.style.setProperty('--arcat-pointer-y', `${(y * 3).toFixed(2)}px`)
      picture!.style.setProperty('--arcat-pointer-tilt', `${(x * 1.4).toFixed(2)}deg`)
      picture!.style.setProperty('--arcat-pupil-x', `${(x * 4 * scale).toFixed(2)}px`)
      picture!.style.setProperty('--arcat-pupil-y', `${(y * 3 * scale).toFixed(2)}px`)
    }

    function followPointer(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      point = { x: event.clientX, y: event.clientY }
      if (!frame) frame = window.requestAnimationFrame(renderPointer)
    }

    function leaveWindow(event: PointerEvent) {
      if (event.relatedTarget === null) recenter()
    }

    function detach() {
      window.removeEventListener('pointermove', followPointer)
      window.removeEventListener('pointerout', leaveWindow)
      window.removeEventListener('pointerleave', recenter)
      window.removeEventListener('blur', recenter)
      recenter()
    }

    window.addEventListener('pointermove', followPointer, { passive: true })
    window.addEventListener('pointerout', leaveWindow, { passive: true })
    window.addEventListener('pointerleave', recenter, { passive: true })
    window.addEventListener('blur', recenter)
    return detach
  }, [tracking, ref])

  return tracking
}
