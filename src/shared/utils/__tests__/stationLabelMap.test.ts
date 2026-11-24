import { describe, expect, it } from 'vitest'
import type { StationLabel } from '@shared/types'
import { createStationLabelMap } from '../stationLabelMap'

const station = (name: string, x: number): StationLabel => ({
  name,
  pos: { x, y: 0, z: 0 },
  altitude: 0,
})

describe('createStationLabelMap', () => {
  it('keeps the first station when names are duplicated', () => {
    const first = station('A1', 10)
    const duplicate = station('A1', 20)
    const map = createStationLabelMap([first, duplicate, station('B1', 30)])

    expect(map.get('A1')).toBe(first)
    expect(map.get('B1')?.pos.x).toBe(30)
  })
})
