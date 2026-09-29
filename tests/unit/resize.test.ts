import { describe, expect, it } from 'vitest'
import { resizeBounds } from '../../src/main/resize-math'

const start = { x: 1536, y: 24, width: 360, height: 600 }
const min = { width: 300, height: 360 }
const area = { width: 1920, height: 1032 }

describe('edge resize', () => {
  it('window-cannot-shrink-vertically: bottom edge makes the window shorter below its start height', () => {
    expect(resizeBounds(start, 's', 0, -150, min, area)).toEqual({ ...start, height: 450 })
  })
  it('bottom edge makes it taller', () => {
    expect(resizeBounds(start, 's', 0, 200, min, area)).toEqual({ ...start, height: 800 })
  })
  it('top edge moves the top and keeps the bottom in place', () => {
    const r = resizeBounds(start, 'n', 0, 100, min, area)
    expect(r).toEqual({ ...start, y: 124, height: 500 })
    expect(r.y + r.height).toBe(start.y + start.height)
  })
  it('left and right edges change the width', () => {
    expect(resizeBounds(start, 'e', 80, 0, min, area)).toEqual({ ...start, width: 440 })
    expect(resizeBounds(start, 'w', 40, 0, min, area)).toEqual({ ...start, x: 1576, width: 320 })
  })
  it('corner changes both', () => {
    expect(resizeBounds(start, 'se', 40, -100, min, area)).toEqual({ ...start, width: 400, height: 500 })
  })
  it('never smaller than the minimum; the opposite edge stays put', () => {
    expect(resizeBounds(start, 's', 0, -1000, min, area).height).toBe(360)
    const r = resizeBounds(start, 'nw', 1000, 1000, min, area)
    expect(r).toEqual({ x: 1536 + 60, y: 24 + 240, width: 300, height: 360 })
  })
  it('never taller than the work area', () => {
    expect(resizeBounds(start, 's', 0, 5000, min, area).height).toBe(1032)
  })
})
