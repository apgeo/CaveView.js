import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { ParsedCave, Vec3, ViewerOptions } from '@shared/types'

export type StationClick = (idx: number, x: number, y: number, ctrl: boolean, point?: Vec3) => void

export function SurveyPointPicker({ cave, options, onStationClick }: {
  cave: ParsedCave
  options: ViewerOptions
  onStationClick?: StationClick
}) {
  const { gl, camera } = useThree()
  const targets = useMemo(() => [
    ...cave.stations.flatMap((pos, idx) => {
      const label = cave.stationLabels[idx]
      const visible = label?.name
        ? options.showStations || (options.showFixedStations && label.isFixed)
        : options.showSplay
      return visible ? [{ pos, idx }] : []
    }),
    ...(options.showSplay ? cave.segments.flatMap((seg, i) => seg.type === 'splay'
      ? [{ pos: seg.to, idx: cave.stations.length + i }] : []) : []),
  ], [cave, options.showStations, options.showFixedStations, options.showSplay])

  useEffect(() => {
    const canvas = gl.domElement
    let down: { x: number; y: number } | null = null
    let dragged = false
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; dragged = false }
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) dragged = true
    }
    const onClick = (e: MouseEvent) => {
      if (!down || dragged || e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      const offset = options.caveCalibrationOffset
      const projected = new Vector3()
      let best: (typeof targets)[number] | undefined
      let distance = 10 * 10
      let depth = Infinity
      camera.updateMatrixWorld()
      for (const target of targets) {
        projected.set(target.pos.x + offset.x, target.pos.z + offset.z, -target.pos.y - offset.y).project(camera)
        if (projected.z < -1 || projected.z > 1) continue
        if (options.showClipping && !options.excludeModelFromClipping && target.pos.z + cave.centerOffset.z + offset.z > options.clippingHeight) continue
        const x = rect.left + (projected.x + 1) * rect.width / 2
        const y = rect.top + (1 - projected.y) * rect.height / 2
        const d = (x - e.clientX) ** 2 + (y - e.clientY) ** 2
        if (d < distance - 0.01 || (Math.abs(d - distance) < 0.01 && projected.z < depth)) {
          best = target
          distance = d
          depth = projected.z
        }
      }
      if (best) {
        e.stopImmediatePropagation()
        e.preventDefault()
        onStationClick?.(best.idx, e.clientX, e.clientY, e.ctrlKey || e.metaKey, best.pos)
      }
    }
    canvas.addEventListener('pointerdown', onDown, true)
    canvas.addEventListener('pointermove', onMove, true)
    canvas.addEventListener('click', onClick, true)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('pointermove', onMove, true)
      canvas.removeEventListener('click', onClick, true)
    }
  }, [gl, camera, targets, cave.centerOffset.z, options.caveCalibrationOffset, options.showClipping, options.excludeModelFromClipping, options.clippingHeight, onStationClick])
  return null
}
