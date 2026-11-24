import type { StationLabel } from '@shared/types'

export function createStationLabelMap(stations: readonly StationLabel[]): Map<string, StationLabel> {
  const byName = new Map<string, StationLabel>()
  for (const station of stations) {
    if (!byName.has(station.name)) byName.set(station.name, station)
  }
  return byName
}
