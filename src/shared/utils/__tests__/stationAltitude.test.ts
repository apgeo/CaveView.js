import { describe, expect, it } from 'vitest'
import {
  isEntranceStation,
  isSurfaceStation,
  findReferenceStation,
  sampleDtmAt,
  findClosestSurfacePoint,
  sampleSurfaceElevationAt,
  calculateStationDepths,
} from '../stationAltitude'
import { worldToWgs84, getZbgisPointUrl } from '../coords'
import type { ParsedCave, CaveSurface } from '@shared/types'

describe('stationAltitude', () => {
  describe('isEntranceStation', () => {
    it('detects entrance from flag or name keywords', () => {
      expect(isEntranceStation({ isEntrance: true })).toBe(true)
      expect(isEntranceStation({ name: 'Vchod do jaskyne' })).toBe(true)
      expect(isEntranceStation({ name: 'hlavny_vstup' })).toBe(true)
      expect(isEntranceStation({ name: 'Cave Entrance' })).toBe(true)
      expect(isEntranceStation({ fullLabel: 'Zavrt 1' })).toBe(true)
      expect(isEntranceStation({ name: 'S1' })).toBe(false)
      expect(isEntranceStation({ name: '10' })).toBe(false)
    })
  })

  describe('isSurfaceStation', () => {
    it('detects surface station by name', () => {
      expect(isSurfaceStation({ name: 'surface_1' })).toBe(true)
      expect(isSurfaceStation({ name: 'povrch 0' })).toBe(true)
      expect(isSurfaceStation({ name: 'GPS_teren' })).toBe(true)
      expect(isSurfaceStation({ name: 'S1' })).toBe(false)
    })
  })

  describe('findReferenceStation', () => {
    it('prioritizes entrance with GPS over regular stations', () => {
      const mockCave = {
        stationLabels: [
          { name: '0', altitude: 450, pos: { x: 0, y: 0, z: 0 }, gps: null },
          { name: 'Vchod', altitude: 500, pos: { x: 10, y: 10, z: 50 }, isEntrance: true, gps: { lat: 48.5, lon: 20.5 } },
          { name: '1', altitude: 430, pos: { x: 20, y: 20, z: -20 }, gps: null },
        ],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      const ref = findReferenceStation(mockCave)
      expect(ref.type).toBe('entrance_gps')
      expect(ref.name).toBe('Vchod')
      expect(ref.altitude).toBe(500)
    })

    it('finds entrance without GPS when present', () => {
      const mockCave = {
        stationLabels: [
          { name: '0', altitude: 450, pos: { x: 0, y: 0, z: 0 }, gps: null },
          { name: 'Vchod', altitude: 500, pos: { x: 10, y: 10, z: 50 }, isEntrance: true, gps: null },
        ],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      const ref = findReferenceStation(mockCave)
      expect(ref.type).toBe('entrance')
      expect(ref.name).toBe('Vchod')
      expect(ref.altitude).toBe(500)
    })

    it('falls back to lowest numbered non-surface station if no entrance is defined', () => {
      const mockCave = {
        stationLabels: [
          { name: 'surface_gps', altitude: 600, pos: { x: 0, y: 0, z: 100 }, gps: null },
          { name: '2', altitude: 420, pos: { x: 20, y: 20, z: -80 }, gps: null },
          { name: '0', altitude: 500, pos: { x: 10, y: 10, z: 0 }, gps: null },
          { name: '1', altitude: 460, pos: { x: 15, y: 15, z: -40 }, gps: null },
        ],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      const ref = findReferenceStation(mockCave)
      expect(ref.type).toBe('lowest_station')
      expect(ref.name).toBe('0')
      expect(ref.altitude).toBe(500)
    })
  })

  describe('sampleDtmAt and calculateStationDepths', () => {
    const mockSurface: CaveSurface = {
      dtm: {
        samples: 3,
        lines: 3,
        calib: {
          xOrigin: 0,
          yOrigin: 0,
          xx: 10,
          xy: 0,
          yx: 0,
          yy: 10,
        },
        data: new Float64Array([
          100, 100, 100,
          100, 120, 100,
          100, 100, 100,
        ]),
      },
      bitmapUrl: null,
      centerOffset: { x: 0, y: 0, z: 0 },
    }

    it('samples interpolated DTM elevation correctly', () => {
      // Exactly at center (col=1, row=1): 120m
      expect(sampleDtmAt(mockSurface, 10, 10)).toBeCloseTo(120, 3)
      // Halfway between (0,0) and (10,10): (100 + 100 + 100 + 120) / 4 = 105
      expect(sampleDtmAt(mockSurface, 5, 5)).toBeCloseTo(105, 3)
      // Outside bounds
      expect(sampleDtmAt(mockSurface, 35, 10)).toBeNull()
    })

    it('calculates depth under surface and denivelation from entrance', () => {
      const mockCave = {
        stationLabels: [
          { name: 'Vchod', altitude: 100, pos: { x: 0, y: 0, z: 0 }, isEntrance: true, gps: null },
          { name: 'Dno', altitude: 70, pos: { x: 10, y: 10, z: -30 }, gps: null },
        ],
        surfaces: [mockSurface],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      // Station 'Dno': Z = 70m, directly above at (10,10) surface is 120m
      const result = calculateStationDepths(mockCave, { x: 10, y: 10, z: 70 })

      expect(result.surfaceZ).toBeCloseTo(120, 3)
      expect(result.distToSurf).toBeCloseTo(50, 3) // 120 - 70 = 50m below surface
      expect(result.denivEntrance).toBeCloseTo(-30, 3) // 70 - 100 = -30m from entrance
      expect(result.refStationName).toBe('Vchod')
      expect(result.refStationType).toBe('entrance')
    })

    it('handles point above surface (negative depth under surface)', () => {
      const mockCave = {
        stationLabels: [
          { name: '0', altitude: 100, pos: { x: 0, y: 0, z: 0 }, gps: null },
        ],
        surfaces: [mockSurface],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      // Point above surface: Z = 130m, surface is 120m
      const result = calculateStationDepths(mockCave, { x: 10, y: 10, z: 130 })

      expect(result.surfaceZ).toBeCloseTo(120, 3)
      expect(result.distToSurf).toBeCloseTo(-10, 3) // 120 - 130 = -10m (10m above surface)
      expect(result.denivEntrance).toBeCloseTo(30, 3) // 130 - 100 = +30m
    })

    it('handles cave with no surface DTM (unavailable surface depth)', () => {
      const mockCave = {
        stationLabels: [
          { name: 'Vchod', altitude: 600, pos: { x: 0, y: 0, z: 0 }, isEntrance: true, gps: null },
          { name: 'Komin', altitude: 625, pos: { x: 5, y: 5, z: 25 }, gps: null },
        ],
        surfaces: [],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      const result = calculateStationDepths(mockCave, { x: 5, y: 5, z: 625 })

      expect(result.surfaceZ).toBeNull()
      expect(result.distToSurf).toBeNull()
      expect(result.closestSurfDist).toBeNull()
      expect(result.closestSurfWorld).toBeNull()
      expect(result.denivEntrance).toBeCloseTo(25, 3) // +25m above entrance
      expect(result.refStationName).toBe('Vchod')
    })

    it('finds closest 3D surface point on a sloped terrain (shorter than straight up)', () => {
      // Sloped hill where Z = 100 - x. (each 10m step in X drops Z by 10m)
      const slopeSurface: CaveSurface = {
        dtm: {
          samples: 5,
          lines: 5,
          calib: {
            xOrigin: 0,
            yOrigin: 0,
            xx: 10,
            xy: 0,
            yx: 0,
            yy: 10,
          },
          // x values: 0, 10, 20, 30, 40
          // z values: 100, 90, 80, 70, 60
          data: new Float64Array([
            100, 90, 80, 70, 60,
            100, 90, 80, 70, 60,
            100, 90, 80, 70, 60,
            100, 90, 80, 70, 60,
            100, 90, 80, 70, 60,
          ]),
        },
        bitmapUrl: null,
        centerOffset: { x: 0, y: 0, z: 0 },
      }

      // Station at x=10, y=20, z=60.
      // Vertical overhead: x=10, y=20 -> surfaceZ = 90m -> vertical depth = 90 - 60 = 30m.
      // Plane equation: x + z - 100 = 0.
      // Distance from (10, 20, 60) to plane is |10 + 60 - 100| / sqrt(2) = 30 / sqrt(2) ≈ 21.213m.
      const closest = findClosestSurfacePoint([slopeSurface], 10, 20, 60)
      expect(closest).not.toBeNull()
      if (closest) {
        expect(closest.distance3d).toBeCloseTo(30 / Math.SQRT2, 2) // ≈ 21.21m
        expect(closest.distance3d).toBeLessThan(30) // strictly shorter than straight vertical
        expect(closest.closestWorld.x).toBeCloseTo(25, 1)
        expect(closest.closestWorld.y).toBeCloseTo(20, 1)
        expect(closest.closestWorld.z).toBeCloseTo(75, 1)
        expect(closest.horizontalDist).toBeCloseTo(15, 1) // 15m horizontal offset towards hillside
      }

      // calculateStationDepths must return both vertical depth (30m) and 3D closest distance (~21.21m)
      const mockSlopeCave = {
        stationLabels: [
          { name: '0', altitude: 60, pos: { x: 10, y: 20, z: 0 }, gps: null },
        ],
        surfaces: [slopeSurface],
        centerOffset: { x: 0, y: 0, z: 0 },
      } as unknown as ParsedCave

      const depths = calculateStationDepths(mockSlopeCave, { x: 10, y: 20, z: 60 })
      expect(depths.distToSurf).toBeCloseTo(30, 2)
      expect(depths.surfaceZ).toBeCloseTo(90, 2)
      expect(depths.closestSurfDist).toBeCloseTo(30 / Math.SQRT2, 2)
      expect(depths.closestHorizontalDist).toBeCloseTo(15, 1)
      expect(depths.closestSurfAltitude).toBeCloseTo(75, 1)
    })
  })

  describe('worldToWgs84', () => {
    it('calculates GPS coordinates for an offset surface point given a reference station GPS', () => {
      const refPoint = {
        x: 100,
        y: 200,
        gps: { lat: 49.007470, lon: 19.679950 }
      }

      // Exact match at reference point
      const same = worldToWgs84(100, 200, refPoint)
      expect(same).not.toBeNull()
      expect(same?.lat).toBeCloseTo(49.007470, 6)
      expect(same?.lon).toBeCloseTo(19.679950, 6)

      // Point offset 10m north, 20m east
      const offsetPoint = worldToWgs84(120, 210, refPoint)
      expect(offsetPoint).not.toBeNull()
      expect(offsetPoint!.lat).toBeGreaterThan(49.007470)
      expect(offsetPoint!.lon).toBeGreaterThan(19.679950)
      // Roughly 10m north is ~0.00009 degrees lat
      expect(offsetPoint!.lat - 49.007470).toBeCloseTo(10 / 111200, 5)
    })
  })

  describe('getZbgisPointUrl', () => {
    it('constructs correct ZBGIS URL with identification point marker and pos query params', () => {
      const url = getZbgisPointUrl(48.663962, 20.829461, 18)
      expect(url).toBe('https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/48.663962,20.829461?pos=48.663962,20.829461,18')
    })
  })
})
