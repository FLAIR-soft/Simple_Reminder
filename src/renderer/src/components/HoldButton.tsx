import { useEffect, useRef, useState, type ReactNode } from 'react'

const HOLD_MS = 1200

interface Props {
  onConfirm(): void
  className?: string
  children: ReactNode
  label?: string
}

/** Destructive action without a dialog: hold for 1.2 s (mouse, Space or Enter). Releasing early cancels. */
export function HoldButton({ onConfirm, className = '', children, label }: Props): React.JSX.Element {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)
  const done = useRef(onConfirm)
  done.current = onConfirm

  const stop = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  const start = (): void => {
    if (timer.current !== null) return
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setHolding(false)
      done.current()
    }, HOLD_MS)
  }
  useEffect(() => stop, [])

  return (
    <button
      type="button"
      className={`${className} ${holding ? 'holding' : ''}`}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button === 0) start()
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop()
      }}
      onBlur={stop}
      onClick={(e) => e.preventDefault()}
    >
      <span className="fill" />
      {children}
    </button>
  )
}
