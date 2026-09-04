import { useEffect, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { RAIL_WIDTH, clampPaneWidth, type PaneBounds } from '../lib/pane-layout'
import { Icon } from './Icon'
import './ResizablePane.css'

interface ResizablePaneProps {
  /** Which edge carries the drag handle: `right` for a left pane, `left` for a right pane. */
  side: 'left' | 'right'
  /** Current expanded width in px (persisted value, resolved upstream). */
  width: number
  collapsed: boolean
  bounds: PaneBounds
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
  /** aria-label/title for the collapsed rail's expand button. */
  railLabel: string
  children: ReactNode
}

interface DragSession {
  handle: HTMLDivElement
  pointerId: number
  startX: number
  startWidth: number
}

/**
 * Pane wrapper with a draggable edge handle (clamped to `bounds`), a header
 * collapse toggle wired by the owner via `onToggleCollapsed`, and a 36px
 * collapsed rail that restores the previous width on expand (PANE-02..08).
 */
export function ResizablePane({
  side,
  width,
  collapsed,
  bounds,
  onWidthChange,
  onToggleCollapsed,
  railLabel,
  children
}: ResizablePaneProps): JSX.Element {
  const [drag, setDrag] = useState<DragSession | null>(null)

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDrag({
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width
    })
  }

  useEffect(() => {
    if (!drag) return
    const { handle, pointerId, startX, startWidth } = drag
    const onMove = (event: PointerEvent): void => {
      if (!handle.hasPointerCapture(event.pointerId)) return
      const delta = side === 'right' ? event.clientX - startX : startX - event.clientX
      onWidthChange(clampPaneWidth(startWidth + delta, bounds))
    }
    const onEnd = (): void => {
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
      setDrag(null)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
    handle.addEventListener('pointercancel', onEnd)
    return () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
      handle.removeEventListener('pointercancel', onEnd)
    }
  }, [drag, side, bounds, onWidthChange])

  return (
    <div
      className={`resizable-pane pane-${side}${collapsed ? ' collapsed' : ''}${drag ? ' dragging' : ''}`}
      style={{
        flexBasis: collapsed ? RAIL_WIDTH : width,
        minWidth: collapsed ? RAIL_WIDTH : bounds.min,
        maxWidth: collapsed ? RAIL_WIDTH : width
      }}
    >
      {collapsed ? (
        <button
          type="button"
          className="pane-rail"
          aria-label={railLabel}
          title={railLabel}
          onClick={onToggleCollapsed}
        >
          <Icon name="chevron-down" size={16} />
        </button>
      ) : (
        <>
          {children}
          <div
            className="pane-handle"
            aria-hidden="true"
            onPointerDown={startDrag}
            onDoubleClick={onToggleCollapsed}
          />
        </>
      )}
    </div>
  )
}
