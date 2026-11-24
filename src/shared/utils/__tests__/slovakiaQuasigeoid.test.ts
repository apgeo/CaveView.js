import { describe, it, expect } from 'vitest';
import {
  getSlovakiaQuasigeoidUndulation,
  ellipsoidalToBpv,
  bpvToEllipsoidal,
} from '../slovakiaQuasigeoid';

describe('slovakiaQuasigeoid', () => {
  it('computes accurate quasigeoid undulation for Jasov / Volovské vrchy', () => {
    // Coordinates from user prompt: 48.665318° N, 20.817056° E
    const zeta = getSlovakiaQuasigeoidUndulation(48.665318, 20.817056);
    // Should be ~41.58 m
    expect(zeta).toBeGreaterThan(41.5);
    expect(zeta).toBeLessThan(41.65);
  });

  it('accurately converts DMR 5.0 ellipsoidal height to Baltic Bpv sea-level altitude', () => {
    // 854.18 m ellipsoidal -> 812.60 m Bpv
    const hEllips = 854.18;
    const hBpv = ellipsoidalToBpv(hEllips, 48.665318, 20.817056);
    expect(hBpv).toBeCloseTo(812.60, 1);
  });

  it('performs exact roundtrip conversion between Bpv and ellipsoidal heights', () => {
    const originalBpv = 812.6;
    const ellips = bpvToEllipsoidal(originalBpv, 48.665318, 20.817056);
    const recoveredBpv = ellipsoidalToBpv(ellips, 48.665318, 20.817056);
    expect(recoveredBpv).toBeCloseTo(originalBpv, 3);
  });

  it('stays within realistic Slovakia bounds (34m - 46m) across corners', () => {
    // Bratislava: ~48.15, 17.10
    const zetaBa = getSlovakiaQuasigeoidUndulation(48.15, 17.10);
    expect(zetaBa).toBeGreaterThan(40.0);
    expect(zetaBa).toBeLessThan(45.0);

    // High Tatras: ~49.16, 20.10
    const zetaTatry = getSlovakiaQuasigeoidUndulation(49.16, 20.10);
    expect(zetaTatry).toBeGreaterThan(39.0);
    expect(zetaTatry).toBeLessThan(45.0);

    // Košice: ~48.72, 21.25
    const zetaKe = getSlovakiaQuasigeoidUndulation(48.72, 21.25);
    expect(zetaKe).toBeGreaterThan(40.0);
    expect(zetaKe).toBeLessThan(44.0);
  });
});
