import { describe, expect, it } from 'vitest'
import { resolveStationPosition, sceneToSurvey, measureDistance, measurePolygon } from '../stationInteraction'
import { parseLox } from '@v1/parsers/caveParser'
import { readFileSync } from 'node:fs'

describe('station click coordinate contract', () => {
  it('preserves the survey XYZ sent by the survey station/splay picker', () => {
    const bytes = readFileSync('public/test_model2.lox')
    const cave = parseLox(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const point = cave.stations[0]
    const result = resolveStationPosition(cave, 0, point)
    expect(result?.position).toEqual(point)
    expect(result?.station).toBe(true)
    expect(result?.name).toBe(cave.stationLabels[0].qualifiedName || cave.stationLabels[0].name)
  })
  it('preserves splay endpoints without swapping height or negating northing', () => {
    const cave = parseLox(new ArrayBuffer(0))
    const point = { x: 4, y: -20, z: 8 }
    expect(resolveStationPosition(cave, 100, point)?.position).toEqual(point)
  })
  it('undoes scene axis conversion and calibration exactly once for LiDAR hits', () => {
    expect(sceneToSurvey({ x: 14, y: 38, z: -23 }, { x: 10, y: 3, z: 30 }))
      .toEqual({ x: 4, y: 20, z: 8 })
  })
  it('measures survey distances, including vertical and coincident endpoints', () => {
    expect(measureDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 }))
      .toMatchObject({ dist3d: 13, dist2d: 5, dz: 12 })
    expect(measureDistance({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }).slopeDeg).toBe(0)
    expect(measureDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -4 }).slopeDeg).toBe(-90)
  })
  it('measures every vertex of a polygon instead of just its first triangle', () => {
    const points = [{ x: 0, y: 0, z: 5 }, { x: 4, y: 0, z: 5 }, { x: 4, y: 3, z: 5 }, { x: 0, y: 3, z: 5 }]
    expect(measurePolygon(points)).toEqual({ area: 12, perimeter: 14 })
    expect(measurePolygon([...points].reverse())).toEqual({ area: 12, perimeter: 14 })
  })
})
