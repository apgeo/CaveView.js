import { describe, it, expect } from 'vitest';
import { detectCaveCoordinateSystem } from '../caveCoordinateSystem';
import type { ParsedCave } from '@shared/types';

describe('caveCoordinateSystem', () => {
  it('detects S-JTSK coordinate system from negative Krovak coordinates (Hačava style)', () => {
    const mockCave = {
      segments: [],
      stations: [{ x: 0, y: 0, z: 0 }],
      stationLabels: [
        {
          pos: { x: 0, y: 0, z: 0 },
          name: '0',
          altitude: 799.4,
          isEntrance: true,
          isFixed: true,
          fullLabel: 'Hacavska j.',
        },
      ],
      centerOffset: { x: -294574.33, y: -1244275.36, z: 799.4 },
      scraps: [],
      surfaces: [],
    } as unknown as ParsedCave;

    const det = detectCaveCoordinateSystem(mockCave);
    expect(det.type).toBe('sjtsk');
    expect(det.georeferenced).toBe(true);
    expect(det.hasEntrance).toBe(true);
    expect(det.hasFixedStation).toBe(true);
    expect(det.meridianConvergenceDeg).toBeDefined();
    expect(Math.abs(det.meridianConvergenceDeg!)).toBeGreaterThan(0.5);
  });

  it('detects UTM 34N coordinate system from positive UTM coordinates (model2 style)', () => {
    const mockCave = {
      segments: [],
      stations: [{ x: 0, y: 0, z: 0 }],
      stationLabels: [
        {
          pos: { x: 0, y: 0, z: 0 },
          name: '1',
          altitude: 812.0,
          isEntrance: true,
          isFixed: true,
          fullLabel: 'Dvojzavrt',
        },
      ],
      centerOffset: { x: 486532.3, y: 5390265.36, z: 812.0 },
      scraps: [],
      surfaces: [],
    } as unknown as ParsedCave;

    const det = detectCaveCoordinateSystem(mockCave);
    expect(det.type).toBe('utm');
    expect(det.georeferenced).toBe(true);
    expect(det.hasEntrance).toBe(true);
    expect(det.hasFixedStation).toBe(true);
  });

  it('identifies unreferenced local surveys (0, 0, 0)', () => {
    const mockCave = {
      segments: [],
      stations: [{ x: 0, y: 0, z: 0 }],
      stationLabels: [
        {
          pos: { x: 0, y: 0, z: 0 },
          name: '1',
          altitude: 100.0,
          isEntrance: true,
        },
      ],
      centerOffset: { x: 0, y: 0, z: 100 },
      scraps: [],
      surfaces: [],
    } as unknown as ParsedCave;

    const det = detectCaveCoordinateSystem(mockCave);
    expect(det.type).toBe('local');
    expect(det.georeferenced).toBe(false);
    expect(det.hasEntrance).toBe(true);
    expect(det.hasFixedStation).toBe(false);
  });
});
