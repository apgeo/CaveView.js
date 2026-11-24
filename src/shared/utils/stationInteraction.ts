import type { ParsedCave, Vec3 } from '@shared/types'

export function resolveStationPosition(cave: ParsedCave, idx: number, point?: Vec3) {
  const label = cave.stationLabels[idx]
  const position = label?.pos ?? point
  if (!position) return null
  return {
    position,
    name: label?.name ? label.qualifiedName || label.name : (idx >= 0 ? `Splay ${idx + 1}` : 'P'),
    station: Boolean(label?.name),
  }
}

/** Scene Y-up -> centered survey Z-up. Calibration is applied only by the scene. */
export function sceneToSurvey(point: Vec3, offset: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  return { x: point.x - offset.x, y: -point.z - offset.y, z: point.y - offset.z }
}

export function measureDistance(a: Vec3, b: Vec3) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const dist2d = Math.hypot(dx, dy)
  return {
    dist3d: Math.hypot(dx, dy, dz), dist2d, dz,
    slopeDeg: Math.atan2(dz, dist2d) * 180 / Math.PI,
    azimuthDeg: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360,
  }
}

/** Vector area: exact for ordered planar polygons, projected area otherwise. */
export function measurePolygon(points: Vec3[]) {
  let x = 0, y = 0, z = 0, perimeter = 0
  const origin = points[0]
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    perimeter += measureDistance(a, b).dist3d
    const ax = a.x - origin.x, ay = a.y - origin.y, az = a.z - origin.z
    const bx = b.x - origin.x, by = b.y - origin.y, bz = b.z - origin.z
    x += ay * bz - az * by
    y += az * bx - ax * bz
    z += ax * by - ay * bx
  }
  return { area: Math.hypot(x, y, z) / 2, perimeter }
}
