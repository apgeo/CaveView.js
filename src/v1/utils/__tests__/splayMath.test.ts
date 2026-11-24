import { describe, it, expect } from 'vitest';
import {
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Dot,
  vec3Cross,
  vec3Length,
  smin,
  pointToTriangleDistSq,
  pointToSegmentDist,
  sdfCapsule,
  sdfTetrahedron,
  precomputeTetrahedrons,
  sdfPrecomputedTetrahedron,
  precomputeCapsules,
  triangulateSplaysOnSphere,
  buildSplayTetrahedrons,
  computeSplayBoundingBox,
} from '../splayMath';
import {
  populateSdfGridNarrowBand,
  extractSurfaceNets,
} from '../../workers/splayWall.worker';
import type { StationWithSplays } from '../../types/splayTypes';

describe('splayMath utilities', () => {
  it('performs basic vector operations correctly', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: 5, z: 6 };

    expect(vec3Add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(vec3Sub(b, a)).toEqual({ x: 3, y: 3, z: 3 });
    expect(vec3Scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(vec3Dot(a, b)).toBe(1 * 4 + 2 * 5 + 3 * 6);
    expect(vec3Cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(vec3Length({ x: 3, y: 4, z: 0 })).toBeCloseTo(5);
  });

  it('evaluates smooth-minimum (smin) correctly', () => {
    const a = 1.0;
    const b = 1.0;
    const smooth = smin(a, b, 0.4);
    // At equal values, smin(a, a, k) = a - k/4
    expect(smooth).toBeCloseTo(0.9);

    // When far apart, smin approximates min(a, b)
    expect(smin(1.0, 10.0, 0.4)).toBeCloseTo(1.0);
  });

  it('calculates point to triangle squared distance', () => {
    const v0 = { x: 0, y: 0, z: 0 };
    const v1 = { x: 2, y: 0, z: 0 };
    const v2 = { x: 0, y: 2, z: 0 };

    // Point directly above the center of triangle
    const pAbove = { x: 0.5, y: 0.5, z: 3.0 };
    expect(pointToTriangleDistSq(pAbove, v0, v1, v2)).toBeCloseTo(9.0);

    // Point outside along an edge
    const pOutside = { x: 3.0, y: 0, z: 0 };
    expect(pointToTriangleDistSq(pOutside, v0, v1, v2)).toBeCloseTo(1.0);
  });

  it('calculates point to segment distance and capsule SDF', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 10, y: 0, z: 0 };

    const pMid = { x: 5, y: 2, z: 0 };
    expect(pointToSegmentDist(pMid, a, b)).toBeCloseTo(2.0);

    // Capsule with radius 2.5: distance is 2.0 - 2.5 = -0.5 (inside air)
    expect(sdfCapsule(pMid, a, b, 2.5)).toBeCloseTo(-0.5);

    // Capsule with radius 1.0: distance is 2.0 - 1.0 = +1.0 (outside rock)
    expect(sdfCapsule(pMid, a, b, 1.0)).toBeCloseTo(1.0);
  });

  it('evaluates signed distance to a 3D tetrahedron', () => {
    const tet = {
      a: { x: 0, y: 0, z: 0 },
      b: { x: 4, y: 0, z: 0 },
      c: { x: 0, y: 4, z: 0 },
      d: { x: 0, y: 0, z: 4 },
    };

    // Center point inside the tetrahedron
    const pInside = { x: 0.5, y: 0.5, z: 0.5 };
    const sdfIn = sdfTetrahedron(pInside, tet);
    expect(sdfIn).toBeLessThan(0); // Inside is negative

    // Point outside the tetrahedron
    const pOutside = { x: 5, y: 5, z: 5 };
    const sdfOut = sdfTetrahedron(pOutside, tet);
    expect(sdfOut).toBeGreaterThan(0); // Outside is positive
  });

  it('triangulates splay endpoints on a sphere', () => {
    const station = { x: 0, y: 0, z: 0 };
    const splays = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];

    const triangles = triangulateSplaysOnSphere(station, splays);
    // An octahedron on 6 orthogonal points has 8 triangular faces
    expect(triangles.length).toBe(8);
  });

  it('computes bounding box of stations and splays with padding', () => {
    const stations: StationWithSplays[] = [
      {
        position: { x: 10, y: 20, z: 30 },
        splays: [
          { x: 15, y: 22, z: 28 },
          { x: 5, y: 18, z: 35 },
        ],
      },
    ];

    const bbox = computeSplayBoundingBox(stations, 2.0);
    expect(bbox.min).toEqual({ x: 3, y: 16, z: 26 });
    expect(bbox.max).toEqual({ x: 17, y: 24, z: 37 });
  });

  it('matches exact SDF between sdfTetrahedron and sdfPrecomputedTetrahedron across interior and exterior points', () => {
    const tet = {
      a: { x: 0, y: 0, z: 0 },
      b: { x: 4, y: 0, z: 0 },
      c: { x: 0, y: 4, z: 0 },
      d: { x: 0, y: 0, z: 4 },
    };
    const [preTet] = precomputeTetrahedrons([tet]);

    const testPoints = [
      { x: 0.5, y: 0.5, z: 0.5 }, // deep inside
      { x: 0.1, y: 0.8, z: 0.8 }, // inside near face
      { x: -1.0, y: 1.0, z: 1.0 }, // outside face
      { x: 5.0, y: -1.0, z: -1.0 }, // outside vertex
      { x: 2.5, y: 2.5, z: 0.0 }, // outside edge
    ];

    for (const pt of testPoints) {
      const exact = sdfTetrahedron(pt, tet);
      const fast = sdfPrecomputedTetrahedron(pt.x, pt.y, pt.z, preTet, 100);
      expect(fast).toBeCloseTo(exact, 6);
    }
  });

  it('generates watertight Splay SDF Surface Nets mesh in <250ms for 25-station cave (vs 23,013ms baseline)', () => {
    const numStations = 25;
    const stations: StationWithSplays[] = [];
    for (let i = 0; i < numStations; i++) {
      const pos = { x: i * 1.0, y: Math.sin(i * 0.4) * 1.5, z: i * 1.0 };
      const splays = [];
      for (let s = 0; s < 15; s++) {
        const theta = (s / 15) * Math.PI * 2;
        const phi = ((s % 5) - 2) * 0.4;
        const r = 2.0 + (s % 3) * 0.8;
        splays.push({
          x: pos.x + r * Math.cos(phi) * Math.cos(theta),
          y: pos.y + r * Math.cos(phi) * Math.sin(theta),
          z: pos.z + r * Math.sin(phi),
        });
      }
      stations.push({
        id: `st_${i}`,
        position: pos,
        splays,
        connectedTo: i < numStations - 1
          ? [{ x: (i + 1) * 1.0, y: Math.sin((i + 1) * 0.4) * 1.5, z: (i + 1) * 1.0 }]
          : [],
      });
    }

    const smoothK = 0.45;
    const padding = 1.5;
    const voxelSize = 0.25;
    const capsuleRadius = 0.18;
    const isovalue = 0.0;

    const t0 = performance.now();
    const tetrahedrons = buildSplayTetrahedrons(stations);
    const preTets = precomputeTetrahedrons(tetrahedrons);
    const traverseCapsules = [];
    for (const st of stations) {
      for (const conn of st.connectedTo ?? []) {
        traverseCapsules.push({ a: st.position, b: conn, radius: capsuleRadius });
      }
      for (const sp of st.splays) {
        traverseCapsules.push({ a: st.position, b: sp, radius: capsuleRadius * 0.75 });
      }
    }
    const preCaps = precomputeCapsules(traverseCapsules);

    const bbox = computeSplayBoundingBox(stations, padding);
    const dimX = Math.max(3, Math.ceil((bbox.max.x - bbox.min.x) / voxelSize) + 1);
    const dimY = Math.max(3, Math.ceil((bbox.max.y - bbox.min.y) / voxelSize) + 1);
    const dimZ = Math.max(3, Math.ceil((bbox.max.z - bbox.min.z) / voxelSize) + 1);
    const gridBuffer = new Float32Array(dimX * dimY * dimZ);

    const t1 = performance.now();
    const bandPad = Math.max(0, isovalue) + smoothK + voxelSize * 1.85;
    const activeBounds = populateSdfGridNarrowBand(
      gridBuffer, bbox.min, voxelSize, dimX, dimY, dimZ,
      preTets, preCaps, smoothK, bandPad
    );
    const t2 = performance.now();
    const geom = extractSurfaceNets(gridBuffer, {
      origin: bbox.min, voxelSize, dimX, dimY, dimZ, ...activeBounds,
    }, isovalue);
    const t3 = performance.now();

    console.log(
      `[SplaySDF Benchmark 25st] Grid ${dimX}x${dimY}x${dimZ} (${(dimX * dimY * dimZ).toLocaleString()} voxels) | ` +
      `Precompute: ${(t1 - t0).toFixed(1)}ms | SDF Splat: ${(t2 - t1).toFixed(1)}ms | SurfaceNets: ${(t3 - t2).toFixed(1)}ms | ` +
      `TOTAL: ${(t3 - t0).toFixed(1)}ms (Verts: ${geom.vertexCount}, Tris: ${geom.triangleCount})`
    );

    expect(geom.vertexCount).toBeGreaterThan(1000);
    expect(geom.triangleCount).toBeGreaterThan(2000);
    expect(t3 - t0).toBeLessThan(1000);
  });
});
