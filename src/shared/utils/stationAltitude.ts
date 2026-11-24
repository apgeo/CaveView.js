import type { ParsedCave, StationLabel, CaveSurface, Vec3 } from '@shared/types'

export interface ReferenceStationInfo {
  station: StationLabel | null
  idx: number
  name: string
  altitude: number
  type: 'entrance_gps' | 'entrance' | 'lowest_station' | 'none'
  gps: { lat: number; lon: number; zone?: number; epsg?: string } | null
}

const ENTRANCE_REGEX = /(vchod|vstup|entrance|eingang|trou|boca|zavrt|závrt)/i
const SURFACE_REGEX = /(surface|povrch|ter[eé]n|gps|fix|sjtsk|utm)/i

/** Overí, či je stanica označená alebo pomenovaná ako vchod */
export function isEntranceStation(station: { name?: string; fullLabel?: string; isEntrance?: boolean }): boolean {
  if (station.isEntrance) return true
  if (station.name && ENTRANCE_REGEX.test(station.name)) return true
  if (station.fullLabel && ENTRANCE_REGEX.test(station.fullLabel)) return true
  return false
}

/** Overí, či ide o povrchovú stanicu (napr. povrchový polygon, GPS bod na povrchu) */
export function isSurfaceStation(
  station: { name?: string; fullLabel?: string; pos?: Vec3 },
  idx?: number,
  cave?: ParsedCave
): boolean {
  const name = station.name || ''
  const full = station.fullLabel || ''
  if (SURFACE_REGEX.test(name) || SURFACE_REGEX.test(full)) return true

  // Ak máme segmenty, skontrolujeme, či sú všetky pripojené ťahy typu 'surface'
  if (cave && station.pos && cave.segments?.length > 0) {
    const p = station.pos
    let hasSegments = false
    let allSurface = true

    for (let i = 0; i < cave.segments.length; i++) {
      const seg = cave.segments[i]
      const matchesFrom = Math.abs(seg.from.x - p.x) < 0.001 && Math.abs(seg.from.y - p.y) < 0.001 && Math.abs(seg.from.z - p.z) < 0.001
      const matchesTo = Math.abs(seg.to.x - p.x) < 0.001 && Math.abs(seg.to.y - p.y) < 0.001 && Math.abs(seg.to.z - p.z) < 0.001

      if (matchesFrom || matchesTo) {
        hasSegments = true
        if (seg.type !== 'surface') {
          allSurface = false
          break
        }
      }
    }

    if (hasSegments && allSurface) return true
  }

  return false
}

/** Nájde referenčný vchod alebo bod s najnižším číslom (mimo povrchu) */
export function findReferenceStation(cave: ParsedCave): ReferenceStationInfo {
  if (!cave.stationLabels || cave.stationLabels.length === 0) {
    if (cave.stations && cave.stations.length > 0) {
      const p = cave.stations[0]
      const alt = p.z + (cave.centerOffset?.z || 0)
      return {
        station: null,
        idx: 0,
        name: '0',
        altitude: alt,
        type: 'none',
        gps: null,
      }
    }
    return {
      station: null,
      idx: -1,
      name: '',
      altitude: 0,
      type: 'none',
      gps: null,
    }
  }

  // 1. Priorita: Hľadáme vchody (podľa flagu isEntrance alebo názvu)
  const entrances: { sl: StationLabel; idx: number }[] = []
  cave.stationLabels.forEach((sl, idx) => {
    if (isEntranceStation(sl)) {
      entrances.push({ sl, idx })
    }
  })

  if (entrances.length > 0) {
    // Ak máme viac vchodov, vezmeme prvý označený vchod (primárny)
    const primary = entrances[0]
    const hasGps = Boolean(primary.sl.gps)
    return {
      station: primary.sl,
      idx: primary.idx,
      name: primary.sl.name || `Vchod ${primary.idx}`,
      altitude: primary.sl.altitude,
      type: hasGps ? 'entrance_gps' : 'entrance',
      gps: primary.sl.gps || null,
    }
  }

  // 2. Ak jaskyňa nemá vchod ani GPS:
  // Hľadáme nepovrchové stanice a vyberieme stanicu s najnižším číslom (často 0, 1, 2...)
  const nonSurface: { sl: StationLabel; idx: number; num: number | null }[] = []
  
  cave.stationLabels.forEach((sl, idx) => {
    if (!isSurfaceStation(sl, idx, cave)) {
      // Extrakcia čísla z názvu (napr. "0", "1", "0.0", "P1")
      const match = sl.name.match(/\d+(\.\d+)?/)
      const num = match ? parseFloat(match[0]) : null
      nonSurface.push({ sl, idx, num })
    }
  })

  const pool = nonSurface.length > 0 ? nonSurface : cave.stationLabels.map((sl, idx) => {
    const match = sl.name.match(/\d+(\.\d+)?/)
    return { sl, idx, num: match ? parseFloat(match[0]) : null }
  })

  // Zoradíme: najprv stanice s číslom (vzostupne), pri zhode čísla preferujeme presné "0", potom podľa idx
  let best = pool[0]
  for (let i = 1; i < pool.length; i++) {
    const item = pool[i]
    if (item.num !== null) {
      if (best.num === null || item.num < best.num) {
        best = item
      } else if (item.num === best.num) {
        if (item.sl.name === '0' && best.sl.name !== '0') {
          best = item
        }
      }
    }
  }

  return {
    station: best.sl,
    idx: best.idx,
    name: best.sl.name || `S${best.idx}`,
    altitude: best.sl.altitude,
    type: 'lowest_station',
    gps: best.sl.gps || null,
  }
}

/** Interpoluje výšku povrchu DTM pre danú world-space pozíciu (x, y) */
export function sampleDtmAt(surface: CaveSurface, worldX: number, worldY: number): number | null {
  const { dtm } = surface
  if (!dtm || !dtm.calib) return null
  const { data, samples, lines, calib } = dtm
  const det = calib.xx * calib.yy - calib.xy * calib.yx
  if (Math.abs(det) < 1e-12) return null

  const dx  = worldX - calib.xOrigin
  const dy  = worldY - calib.yOrigin
  const col = (dx * calib.yy - dy * calib.xy) / det
  const row = (dy * calib.xx - dx * calib.yx) / det

  if (col < 0 || col >= samples - 1 || row < 0 || row >= lines - 1) return null

  const c0 = Math.floor(col), r0 = Math.floor(row)
  const fc = col - c0, fr = row - r0
  const z00 = data[r0 * samples + c0]
  const z10 = data[r0 * samples + c0 + 1]
  const z01 = data[(r0 + 1) * samples + c0]
  const z11 = data[(r0 + 1) * samples + c0 + 1]
  return z00 * (1 - fc) * (1 - fr) + z10 * fc * (1 - fr) + z01 * (1 - fc) * fr + z11 * fc * fr
}

/** Pomocná funkcia: nájde najbližší 3D bod na trojuholníku ABC (Christer Ericson algorithm) */
function closestPointOnTriangle(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  out: { x: number; y: number; z: number }
): void {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az

  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) {
    out.x = ax; out.y = ay; out.z = az
    return
  }

  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) {
    out.x = bx; out.y = by; out.z = bz
    return
  }

  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    out.x = ax + v * abx
    out.y = ay + v * aby
    out.z = az + v * abz
    return
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) {
    out.x = cx; out.y = cy; out.z = cz
    return
  }

  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    out.x = ax + w * acx
    out.y = ay + w * acy
    out.z = az + w * acz
    return
  }

  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    out.x = bx + w * (cx - bx)
    out.y = by + w * (cy - by)
    out.z = bz + w * (cz - bz)
    return
  }

  const denom = 1 / (va + vb + vc)
  const v = vb * denom
  const w = vc * denom
  out.x = ax + abx * v + acx * w
  out.y = ay + aby * v + acy * w
  out.z = az + abz * v + acz * w
}

export interface ClosestSurfacePointResult {
  closestWorld: Vec3
  distance3d: number
  horizontalDist: number
  verticalDiff: number
  surfaceZ: number
}

/** Nájde skutočný geometricky najbližší 3D bod na povrchu DTM (minimálna hrúbka nadložia) */
export function findClosestSurfacePoint(
  surfaces: CaveSurface[] | undefined,
  worldX: number,
  worldY: number,
  worldZ: number,
  caveCalibrationOffset: Vec3 = { x: 0, y: 0, z: 0 },
  surfaceOffset: Vec3 = { x: 0, y: 0, z: 0 }
): ClosestSurfacePointResult | null {
  if (!surfaces || surfaces.length === 0) return null

  let overallBestDistSq = Infinity
  let overallBestPt: Vec3 | null = null
  let overallSurfOffset = surfaceOffset

  const tempTriPt = { x: 0, y: 0, z: 0 }

  for (let s = 0; s < surfaces.length; s++) {
    const surf = surfaces[s]
    const { dtm } = surf
    if (!dtm || !dtm.calib) continue
    const { data, samples, lines, calib } = dtm
    const det = calib.xx * calib.yy - calib.xy * calib.yx
    if (Math.abs(det) < 1e-12) continue

    const qx = worldX + caveCalibrationOffset.x - surfaceOffset.x
    const qy = worldY + caveCalibrationOffset.y - surfaceOffset.y
    const qz = worldZ + caveCalibrationOffset.z - surfaceOffset.z

    // 1. Zvislý odhad ako horná hranica vzdialenosti
    const vertZ = sampleDtmAt(surf, qx, qy)
    let bestDistSq = vertZ !== null ? (vertZ - qz) * (vertZ - qz) : Infinity
    let bestPt: Vec3 = vertZ !== null ? { x: qx, y: qy, z: vertZ } : { x: qx, y: qy, z: qz }

    // Ak máme zvislú vzdialenosť, polomer hľadania v horizontálnej rovine nemôže presiahnuť d_vert!
    const searchRadius = vertZ !== null
      ? Math.max(2.0, Math.min(Math.abs(vertZ - qz) * 1.15, 2000.0))
      : 100.0

    // Výpočet hraničných mriežkových indexov v DTM
    const corners = [
      { x: qx - searchRadius, y: qy - searchRadius },
      { x: qx + searchRadius, y: qy - searchRadius },
      { x: qx - searchRadius, y: qy + searchRadius },
      { x: qx + searchRadius, y: qy + searchRadius },
    ]

    let minCol = Infinity, maxCol = -Infinity
    let minRow = Infinity, maxRow = -Infinity

    for (let c = 0; c < 4; c++) {
      const dx = corners[c].x - calib.xOrigin
      const dy = corners[c].y - calib.yOrigin
      const col = (dx * calib.yy - dy * calib.xy) / det
      const row = (dy * calib.xx - dx * calib.yx) / det
      if (col < minCol) minCol = col
      if (col > maxCol) maxCol = col
      if (row < minRow) minRow = row
      if (row > maxRow) maxRow = row
    }

    const cMin = Math.max(0, Math.floor(minCol) - 1)
    const cMax = Math.min(samples - 2, Math.ceil(maxCol) + 1)
    const rMin = Math.max(0, Math.floor(minRow) - 1)
    const rMax = Math.min(lines - 2, Math.ceil(maxRow) + 1)

    if (cMin > cMax || rMin > rMax) continue

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const v00x = calib.xOrigin + c * calib.xx + r * calib.xy
        const v00y = calib.yOrigin + c * calib.yx + r * calib.yy
        const v00z = data[r * samples + c]

        const v10x = calib.xOrigin + (c + 1) * calib.xx + r * calib.xy
        const v10y = calib.yOrigin + (c + 1) * calib.yx + r * calib.yy
        const v10z = data[r * samples + c + 1]

        const v01x = calib.xOrigin + c * calib.xx + (r + 1) * calib.xy
        const v01y = calib.yOrigin + c * calib.yx + (r + 1) * calib.yy
        const v01z = data[(r + 1) * samples + c]

        const v11x = calib.xOrigin + (c + 1) * calib.xx + (r + 1) * calib.xy
        const v11y = calib.yOrigin + (c + 1) * calib.yx + (r + 1) * calib.yy
        const v11z = data[(r + 1) * samples + c + 1]

        // Trojuholník 1: (v00, v10, v01)
        closestPointOnTriangle(
          qx, qy, qz,
          v00x, v00y, v00z,
          v10x, v10y, v10z,
          v01x, v01y, v01z,
          tempTriPt
        )
        let dx = tempTriPt.x - qx
        let dy = tempTriPt.y - qy
        let dz = tempTriPt.z - qz
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 < bestDistSq) {
          bestDistSq = d2
          bestPt = { x: tempTriPt.x, y: tempTriPt.y, z: tempTriPt.z }
        }

        // Trojuholník 2: (v10, v11, v01)
        closestPointOnTriangle(
          qx, qy, qz,
          v10x, v10y, v10z,
          v11x, v11y, v11z,
          v01x, v01y, v01z,
          tempTriPt
        )
        dx = tempTriPt.x - qx
        dy = tempTriPt.y - qy
        dz = tempTriPt.z - qz
        d2 = dx * dx + dy * dy + dz * dz
        if (d2 < bestDistSq) {
          bestDistSq = d2
          bestPt = { x: tempTriPt.x, y: tempTriPt.y, z: tempTriPt.z }
        }
      }
    }

    if (bestDistSq < overallBestDistSq && Number.isFinite(bestDistSq)) {
      overallBestDistSq = bestDistSq
      overallBestPt = bestPt
      overallSurfOffset = surfaceOffset
    }
  }

  if (overallBestPt === null || !Number.isFinite(overallBestDistSq)) {
    return null
  }

  const closestWorld: Vec3 = {
    x: overallBestPt.x - caveCalibrationOffset.x + overallSurfOffset.x,
    y: overallBestPt.y - caveCalibrationOffset.y + overallSurfOffset.y,
    z: overallBestPt.z - caveCalibrationOffset.z + overallSurfOffset.z,
  }

  const dx = closestWorld.x - worldX
  const dy = closestWorld.y - worldY
  const horizontalDist = Math.sqrt(dx * dx + dy * dy)
  const verticalDiff = closestWorld.z - worldZ
  const surfaceZ = overallBestPt.z + overallSurfOffset.z

  return {
    closestWorld,
    distance3d: Math.sqrt(overallBestDistSq),
    horizontalDist,
    verticalDiff,
    surfaceZ,
  }
}

/** Nájde nadmorskú výšku terénu priamo kolmo nad danými world súradnicami */
export function sampleSurfaceElevationAt(
  surfaces: CaveSurface[] | undefined,
  worldX: number,
  worldY: number,
  worldZ?: number,
  caveCalibrationOffset: Vec3 = { x: 0, y: 0, z: 0 },
  surfaceOffset: Vec3 = { x: 0, y: 0, z: 0 }
): { surfaceZ: number; distToSurf: number | null } | null {
  if (!surfaces || surfaces.length === 0) return null

  for (let i = 0; i < surfaces.length; i++) {
    const surf = surfaces[i]
    const sx = worldX + caveCalibrationOffset.x - surfaceOffset.x
    const sy = worldY + caveCalibrationOffset.y - surfaceOffset.y
    const rawZ = sampleDtmAt(surf, sx, sy)
    if (rawZ !== null && Number.isFinite(rawZ)) {
      const surfaceZ = rawZ + surfaceOffset.z
      const distToSurf = worldZ !== undefined ? surfaceZ - (worldZ + caveCalibrationOffset.z) : null
      return { surfaceZ, distToSurf }
    }
  }

  return null
}

export interface StationDepthsResult {
  distToSurf: number | null       // m, kladné = pod povrchom, záporné = nad povrchom (kolmo hore)
  surfaceZ: number | null         // m n.m. nadmorská výška povrchu kolmo nad bodom
  closestSurfDist: number | null  // m, skutočná najkratšia 3D vzdialenosť k povrchu
  closestSurfWorld: Vec3 | null   // World súradnice najbližšieho bodu povrchu
  closestSurfAltitude: number | null // m n.m. nadmorská výška v najbližšom bode
  closestHorizontalDist: number | null // m, horizontálny posun od kolmice
  denivEntrance: number | null    // m, denivelácia od vchodu / ref bodu (alt - refAlt)
  refStationName: string | null   // meno referenčného vchodu / bodu
  refStationType: 'entrance_gps' | 'entrance' | 'lowest_station' | 'none'
  entranceAlt: number | null      // m n.m. výška referenčného bodu
  refStationIdx: number
}

/** Kompletný výpočet hĺbky pod povrchom, najkratšej 3D vzdialenosti k povrchu a denivelácie od vchodu */
export function calculateStationDepths(
  cave: ParsedCave,
  pointCoords: { x: number; y: number; z: number },
  opts?: {
    caveCalibrationOffset?: Vec3
    surfaceOffset?: Vec3
  }
): StationDepthsResult {
  const caveOffset = opts?.caveCalibrationOffset || { x: 0, y: 0, z: 0 }
  const surfOffset = opts?.surfaceOffset || { x: 0, y: 0, z: 0 }

  const ref = findReferenceStation(cave)
  const denivEntrance = ref.type !== 'none' ? pointCoords.z - ref.altitude : null

  const surf = sampleSurfaceElevationAt(
    cave.surfaces,
    pointCoords.x,
    pointCoords.y,
    pointCoords.z,
    caveOffset,
    surfOffset
  )

  const closest = findClosestSurfacePoint(
    cave.surfaces,
    pointCoords.x,
    pointCoords.y,
    pointCoords.z,
    caveOffset,
    surfOffset
  )

  return {
    distToSurf: surf?.distToSurf ?? null,
    surfaceZ: surf?.surfaceZ ?? null,
    closestSurfDist: closest?.distance3d ?? null,
    closestSurfWorld: closest?.closestWorld ?? null,
    closestSurfAltitude: closest?.surfaceZ ?? null,
    closestHorizontalDist: closest?.horizontalDist ?? null,
    denivEntrance,
    refStationName: ref.name || null,
    refStationType: ref.type,
    entranceAlt: ref.type !== 'none' ? ref.altitude : null,
    refStationIdx: ref.idx,
  }
}
