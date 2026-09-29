import type { ResizeEdge } from '../shared/api'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * New window bounds while dragging an edge by (dx, dy) from `start`.
 * Clamped to the minimum size and to the work area size; the opposite edge stays in place.
 */
export function resizeBounds(start: Rect, edge: ResizeEdge, dx: number, dy: number, min: { width: number; height: number }, area: { width: number; height: number }): Rect {
  let { x, y, width, height } = start
  if (edge.includes('e')) width = start.width + dx
  if (edge.includes('s')) height = start.height + dy
  if (edge.includes('w')) {
    width = start.width - dx
    x = start.x + dx
  }
  if (edge.includes('n')) {
    height = start.height - dy
    y = start.y + dy
  }
  const clampW = Math.min(Math.max(width, min.width), area.width)
  const clampH = Math.min(Math.max(height, min.height), area.height)
  if (edge.includes('w')) x += width - clampW
  if (edge.includes('n')) y += height - clampH
  return { x, y, width: clampW, height: clampH }
}
