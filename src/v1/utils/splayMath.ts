import type { SplayPoint, SplayTetrahedron, StationWithSplays, BoundingBox3D } from '../types/splayTypes';

/**
 * 3D vector math utility functions for splay processing and SDF calculations.
 */

export function vec3Add(a: SplayPoint, b: SplayPoint): SplayPoint {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: SplayPoint, b: SplayPoint): SplayPoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: SplayPoint, s: number): SplayPoint {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Dot(a: SplayPoint, b: SplayPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a: SplayPoint, b: SplayPoint): SplayPoint {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vec3LengthSq(v: SplayPoint): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vec3Length(v: SplayPoint): number {
  return Math.sqrt(vec3LengthSq(v));
}

export function vec3Normalize(v: SplayPoint): SplayPoint {
  const len = vec3Length(v);
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  const inv = 1.0 / len;
  return { x: v.x * inv, y: v.y * inv, z: v.z * inv };
}

export function vec3DistSq(a: SplayPoint, b: SplayPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function vec3Dist(a: SplayPoint, b: SplayPoint): number {
  return Math.sqrt(vec3DistSq(a, b));
}

/**
 * Polynomial smooth-minimum function (Inigo Quilez smin).
 * Smoothly blends two signed distance values with a blending radius k.
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 1e-6) {
    return Math.min(a, b);
  }
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Calculates the squared distance from point P to a 3D line segment (A, B).
 * Uses zero-allocation scalar arithmetic for hot-loop performance.
 */
export function pointToSegmentDistSq(p: SplayPoint, a: SplayPoint, b: SplayPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-8) {
    return apx * apx + apy * apy + apz * apz;
  }
  let t = (apx * abx + apy * aby + apz * abz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Zero-allocation scalar implementation of point-to-triangle squared distance.
 * Standard Voronoi region classification (Ericson, Real-Time Collision Detection).
 */
export function pointToTriangleDistSqScalar(
  px: number, py: number, pz: number,
  v0x: number, v0y: number, v0z: number,
  v1x: number, v1y: number, v1z: number,
  v2x: number, v2y: number, v2z: number
): number {
  const abx = v1x - v0x;
  const aby = v1y - v0y;
  const abz = v1z - v0z;
  const acx = v2x - v0x;
  const acy = v2y - v0y;
  const acz = v2z - v0z;
  const apx = px - v0x;
  const apy = py - v0y;
  const apz = pz - v0z;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return apx * apx + apy * apy + apz * apz; // Vertex region V0
  }

  const bpx = px - v1x;
  const bpy = py - v1y;
  const bpz = pz - v1z;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return bpx * bpx + bpy * bpy + bpz * bpz; // Vertex region V1
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const dx = apx - abx * v;
    const dy = apy - aby * v;
    const dz = apz - abz * v;
    return dx * dx + dy * dy + dz * dz; // Edge region AB
  }

  const cpx = px - v2x;
  const cpy = py - v2y;
  const cpz = pz - v2z;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return cpx * cpx + cpy * cpy + cpz * cpz; // Vertex region V2
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const dx = apx - acx * w;
    const dy = apy - acy * w;
    const dz = apz - acz * w;
    return dx * dx + dy * dy + dz * dz; // Edge region AC
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const dx = bpx - (v2x - v1x) * w;
    const dy = bpy - (v2y - v1y) * w;
    const dz = bpz - (v2z - v1z) * w;
    return dx * dx + dy * dy + dz * dz; // Edge region BC
  }

  // Inside triangle face region
  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const dx = apx - (abx * v + acx * w);
  const dy = apy - (aby * v + acy * w);
  const dz = apz - (abz * v + acz * w);
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Computes the minimum squared distance from point P to a 3D triangle (V0, V1, V2).
 * Standard Voronoi region classification.
 */
export function pointToTriangleDistSq(
  p: SplayPoint,
  v0: SplayPoint,
  v1: SplayPoint,
  v2: SplayPoint
): number {
  return pointToTriangleDistSqScalar(
    p.x, p.y, p.z,
    v0.x, v0.y, v0.z,
    v1.x, v1.y, v1.z,
    v2.x, v2.y, v2.z
  );
}

/**
 * Calculates the Signed Distance from point P to a 3D line segment (Capsule SDF core).
 */
export function pointToSegmentDist(p: SplayPoint, a: SplayPoint, b: SplayPoint): number {
  return Math.sqrt(pointToSegmentDistSq(p, a, b));
}

/**
 * Capsule SDF: negative inside (air), positive outside (rock).
 */
export function sdfCapsule(p: SplayPoint, a: SplayPoint, b: SplayPoint, radius: number): number {
  const dist = pointToSegmentDist(p, a, b);
  return dist - radius;
}

/**
 * Tests if point P is inside a 3D tetrahedron (A, B, C, D) using scalar triple products.
 */
function isPointInsideTetrahedron(
  p: SplayPoint,
  a: SplayPoint,
  b: SplayPoint,
  c: SplayPoint,
  d: SplayPoint
): boolean {
  const vol = (
    p1x: number, p1y: number, p1z: number,
    p2x: number, p2y: number, p2z: number,
    p3x: number, p3y: number, p3z: number,
    p4x: number, p4y: number, p4z: number
  ): number => {
    const v12x = p2x - p1x, v12y = p2y - p1y, v12z = p2z - p1z;
    const v13x = p3x - p1x, v13y = p3y - p1y, v13z = p3z - p1z;
    const v14x = p4x - p1x, v14y = p4y - p1y, v14z = p4z - p1z;
    return (v12y * v13z - v12z * v13y) * v14x +
           (v12z * v13x - v12x * v13z) * v14y +
           (v12x * v13y - v12y * v13x) * v14z;
  };

  const v0 = vol(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  if (Math.abs(v0) < 1e-9) return false;

  const sign0 = v0 > 0;
  const v1 = vol(p.x, p.y, p.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  if ((v1 > 0) !== sign0) return false;
  const v2 = vol(a.x, a.y, a.z, p.x, p.y, p.z, c.x, c.y, c.z, d.x, d.y, d.z);
  if ((v2 > 0) !== sign0) return false;
  const v3 = vol(a.x, a.y, a.z, b.x, b.y, b.z, p.x, p.y, p.z, d.x, d.y, d.z);
  if ((v3 > 0) !== sign0) return false;
  const v4 = vol(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, p.x, p.y, p.z);
  return (v4 > 0) === sign0;
}

/**
 * Computes exact Signed Distance Function (SDF) of a point to a 3D Tetrahedron.
 * Returns negative if inside empty air, positive if outside rock.
 */
export function sdfTetrahedron(p: SplayPoint, tet: SplayTetrahedron): number {
  const { a, b, c, d } = tet;
  const d0Sq = pointToTriangleDistSqScalar(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const d1Sq = pointToTriangleDistSqScalar(p.x, p.y, p.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  const d2Sq = pointToTriangleDistSqScalar(p.x, p.y, p.z, a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z);
  const d3Sq = pointToTriangleDistSqScalar(p.x, p.y, p.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);

  const minDist = Math.sqrt(Math.min(d0Sq, d1Sq, d2Sq, d3Sq));
  const inside = isPointInsideTetrahedron(p, a, b, c, d);

  return inside ? -minDist : minDist;
}

/**
 * Precomputed Tetrahedron structure with outward half-space plane equations
 * and bounding box for O(1) interior SDF evaluation and separating-plane rejection.
 */
export interface PrecomputedTetrahedron {
  readonly ax: number; readonly ay: number; readonly az: number;
  readonly bx: number; readonly by: number; readonly bz: number;
  readonly cx: number; readonly cy: number; readonly cz: number;
  readonly dx: number; readonly dy: number; readonly dz: number;
  readonly minX: number; readonly minY: number; readonly minZ: number;
  readonly maxX: number; readonly maxY: number; readonly maxZ: number;
  // Face 0: (a, b, c), opposite d
  readonly n0x: number; readonly n0y: number; readonly n0z: number; readonly d0: number;
  // Face 1: (a, c, d), opposite b
  readonly n1x: number; readonly n1y: number; readonly n1z: number; readonly d1: number;
  // Face 2: (a, d, b), opposite c
  readonly n2x: number; readonly n2y: number; readonly n2z: number; readonly d2: number;
  // Face 3: (b, c, d), opposite a
  readonly n3x: number; readonly n3y: number; readonly n3z: number; readonly d3: number;
  readonly isNonDegenerate: boolean;
}

function computeOutwardPlane(
  v0x: number, v0y: number, v0z: number,
  v1x: number, v1y: number, v1z: number,
  v2x: number, v2y: number, v2z: number,
  oppx: number, oppy: number, oppz: number
): { nx: number; ny: number; nz: number; d: number; valid: boolean } {
  const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
  const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-8) {
    return { nx: 0, ny: 0, nz: 0, d: 0, valid: false };
  }
  const inv = 1.0 / len;
  nx *= inv; ny *= inv; nz *= inv;
  // Ensure normal points strictly away from the opposite vertex
  const toOpp = nx * (oppx - v0x) + ny * (oppy - v0y) + nz * (oppz - v0z);
  if (toOpp > 0) {
    nx = -nx; ny = -ny; nz = -nz;
  }
  const d = nx * v0x + ny * v0y + nz * v0z;
  return { nx, ny, nz, d, valid: Math.abs(toOpp) > 1e-7 };
}

export function precomputeTetrahedrons(tetrahedrons: readonly SplayTetrahedron[]): PrecomputedTetrahedron[] {
  const result: PrecomputedTetrahedron[] = new Array(tetrahedrons.length);
  for (let i = 0; i < tetrahedrons.length; i++) {
    const { a, b, c, d } = tetrahedrons[i];
    const p0 = computeOutwardPlane(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    const p1 = computeOutwardPlane(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, b.x, b.y, b.z);
    const p2 = computeOutwardPlane(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const p3 = computeOutwardPlane(b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z, a.x, a.y, a.z);

    result[i] = {
      ax: a.x, ay: a.y, az: a.z,
      bx: b.x, by: b.y, bz: b.z,
      cx: c.x, cy: c.y, cz: c.z,
      dx: d.x, dy: d.y, dz: d.z,
      minX: Math.min(a.x, b.x, c.x, d.x),
      minY: Math.min(a.y, b.y, c.y, d.y),
      minZ: Math.min(a.z, b.z, c.z, d.z),
      maxX: Math.max(a.x, b.x, c.x, d.x),
      maxY: Math.max(a.y, b.y, c.y, d.y),
      maxZ: Math.max(a.z, b.z, c.z, d.z),
      n0x: p0.nx, n0y: p0.ny, n0z: p0.nz, d0: p0.d,
      n1x: p1.nx, n1y: p1.ny, n1z: p1.nz, d1: p1.d,
      n2x: p2.nx, n2y: p2.ny, n2z: p2.nz, d2: p2.d,
      n3x: p3.nx, n3y: p3.ny, n3z: p3.nz, d3: p3.d,
      isNonDegenerate: p0.valid && p1.valid && p2.valid && p3.valid,
    };
  }
  return result;
}

/**
 * Evaluates signed distance to a precomputed tetrahedron with separating-plane early rejection
 * and O(1) exact interior distance for convex tetrahedrons.
 */
export function sdfPrecomputedTetrahedron(
  px: number, py: number, pz: number,
  t: PrecomputedTetrahedron,
  cullDist: number
): number {
  if (t.isNonDegenerate) {
    const s0 = t.n0x * px + t.n0y * py + t.n0z * pz - t.d0;
    if (s0 > cullDist) return s0;
    const s1 = t.n1x * px + t.n1y * py + t.n1z * pz - t.d1;
    if (s1 > cullDist) return s1;
    const s2 = t.n2x * px + t.n2y * py + t.n2z * pz - t.d2;
    if (s2 > cullDist) return s2;
    const s3 = t.n3x * px + t.n3y * py + t.n3z * pz - t.d3;
    if (s3 > cullDist) return s3;

    const maxPlane = Math.max(s0, s1, s2, s3);
    // Point is inside all 4 half-spaces: exact distance to convex tetrahedron boundary is maxPlane (<= 0)
    if (maxPlane <= 0) {
      return maxPlane;
    }
    // If cullDist <= 0, no exterior point (d > 0) can be < cullDist
    if (cullDist <= 0) {
      return maxPlane;
    }

    // Point is outside: closest point must lie on at least one visible face (s_i > 0)
    const cullDistSq = cullDist * cullDist;
    let minDistSq = cullDistSq;
    if (s0 > -1e-6) {
      const d0Sq = pointToTriangleDistSqScalar(px, py, pz, t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz);
      if (d0Sq < minDistSq) minDistSq = d0Sq;
    }
    if (s1 > -1e-6) {
      const d1Sq = pointToTriangleDistSqScalar(px, py, pz, t.ax, t.ay, t.az, t.cx, t.cy, t.cz, t.dx, t.dy, t.dz);
      if (d1Sq < minDistSq) minDistSq = d1Sq;
    }
    if (s2 > -1e-6) {
      const d2Sq = pointToTriangleDistSqScalar(px, py, pz, t.ax, t.ay, t.az, t.dx, t.dy, t.dz, t.bx, t.by, t.bz);
      if (d2Sq < minDistSq) minDistSq = d2Sq;
    }
    if (s3 > -1e-6) {
      const d3Sq = pointToTriangleDistSqScalar(px, py, pz, t.bx, t.by, t.bz, t.cx, t.cy, t.cz, t.dx, t.dy, t.dz);
      if (d3Sq < minDistSq) minDistSq = d3Sq;
    }
    return minDistSq < cullDistSq ? Math.sqrt(minDistSq) : cullDist;
  }

  // Fallback for degenerate / sliver tetrahedron
  const d0Sq = pointToTriangleDistSqScalar(px, py, pz, t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz);
  const d1Sq = pointToTriangleDistSqScalar(px, py, pz, t.ax, t.ay, t.az, t.cx, t.cy, t.cz, t.dx, t.dy, t.dz);
  const d2Sq = pointToTriangleDistSqScalar(px, py, pz, t.ax, t.ay, t.az, t.dx, t.dy, t.dz, t.bx, t.by, t.bz);
  const d3Sq = pointToTriangleDistSqScalar(px, py, pz, t.bx, t.by, t.bz, t.cx, t.cy, t.cz, t.dx, t.dy, t.dz);
  return Math.sqrt(Math.min(d0Sq, d1Sq, d2Sq, d3Sq));
}

export interface PrecomputedCapsule {
  readonly ax: number; readonly ay: number; readonly az: number;
  readonly abx: number; readonly aby: number; readonly abz: number;
  readonly invLenSq: number;
  readonly radius: number;
  readonly minX: number; readonly minY: number; readonly minZ: number;
  readonly maxX: number; readonly maxY: number; readonly maxZ: number;
}

export function precomputeCapsules(
  capsules: readonly { a: SplayPoint; b: SplayPoint; radius: number }[]
): PrecomputedCapsule[] {
  const result: PrecomputedCapsule[] = new Array(capsules.length);
  for (let i = 0; i < capsules.length; i++) {
    const { a, b, radius } = capsules[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const lenSq = abx * abx + aby * aby + abz * abz;
    result[i] = {
      ax: a.x, ay: a.y, az: a.z,
      abx, aby, abz,
      invLenSq: lenSq > 1e-8 ? 1.0 / lenSq : 0.0,
      radius,
      minX: Math.min(a.x, b.x) - radius,
      minY: Math.min(a.y, b.y) - radius,
      minZ: Math.min(a.z, b.z) - radius,
      maxX: Math.max(a.x, b.x) + radius,
      maxY: Math.max(a.y, b.y) + radius,
      maxZ: Math.max(a.z, b.z) + radius,
    };
  }
  return result;
}

/**
 * Spherical Delaunay Triangulation for splay endpoints originating from a station.
 * 
 * Projects splay directions onto the unit sphere and computes the 3D Convex Hull
 * of the spherical points using zero-allocation typed arrays.
 */
export function triangulateSplaysOnSphere(
  station: SplayPoint,
  splays: readonly SplayPoint[]
): readonly [number, number, number][] {
  const n = splays.length;
  if (n < 3) return [];

  // Compute unit directions on the unit sphere in flat Float64Array
  const ux = new Float64Array(n);
  const uy = new Float64Array(n);
  const uz = new Float64Array(n);
  const validIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    const dx = splays[i].x - station.x;
    const dy = splays[i].y - station.y;
    const dz = splays[i].z - station.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-4) {
      const idx = validIndices.length;
      const inv = 1.0 / len;
      ux[idx] = dx * inv;
      uy[idx] = dy * inv;
      uz[idx] = dz * inv;
      validIndices.push(i);
    }
  }

  const pointCount = validIndices.length;
  if (pointCount < 3) return [];

  if (pointCount === 3) {
    return [[validIndices[0], validIndices[1], validIndices[2]]];
  }

  // 3D convex hull for points on the unit sphere (scalar inner loop)
  const triangles: [number, number, number][] = [];

  for (let i = 0; i < pointCount - 2; i++) {
    const p1x = ux[i], p1y = uy[i], p1z = uz[i];
    for (let j = i + 1; j < pointCount - 1; j++) {
      const e1x = ux[j] - p1x, e1y = uy[j] - p1y, e1z = uz[j] - p1z;
      for (let k = j + 1; k < pointCount; k++) {
        const e2x = ux[k] - p1x, e2y = uy[k] - p1y, e2z = uz[k] - p1z;

        // Cross product normal of the triangle plane
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        const normLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (normLen < 1e-6) continue;

        const invLen = 1.0 / normLen;
        let unx = nx * invLen, uny = ny * invLen, unz = nz * invLen;
        let orientedD = unx * p1x + uny * p1y + unz * p1z;

        if (orientedD < 0) {
          unx = -unx; uny = -uny; unz = -unz;
          orientedD = -orientedD;
        }

        const threshold = orientedD + 1e-4;
        let isHullFace = true;
        for (let m = 0; m < pointCount; m++) {
          if (m === i || m === j || m === k) continue;
          if (unx * ux[m] + uny * uy[m] + unz * uz[m] > threshold) {
            isHullFace = false;
            break;
          }
        }

        if (isHullFace) {
          triangles.push([validIndices[i], validIndices[j], validIndices[k]]);
        }
      }
    }
  }

  return triangles;
}

/**
 * Builds all empty-space tetrahedrons for a set of stations and their radial splays.
 */
export function buildSplayTetrahedrons(stations: readonly StationWithSplays[]): SplayTetrahedron[] {
  const tetrahedrons: SplayTetrahedron[] = [];

  for (const st of stations) {
    if (!st.splays || st.splays.length < 3) continue;

    const triIndices = triangulateSplaysOnSphere(st.position, st.splays);
    for (const [i1, i2, i3] of triIndices) {
      tetrahedrons.push({
        a: st.position,
        b: st.splays[i1],
        c: st.splays[i2],
        d: st.splays[i3],
      });
    }
  }

  return tetrahedrons;
}

/**
 * Computes 3D Bounding Box around all stations, splay endpoints, and padding.
 */
export function computeSplayBoundingBox(
  stations: readonly StationWithSplays[],
  padding: number = 1.0
): BoundingBox3D {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const update = (p: SplayPoint): void => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  };

  for (const st of stations) {
    update(st.position);
    for (const sp of st.splays) {
      update(sp);
    }
    if (st.connectedTo) {
      for (const ct of st.connectedTo) {
        update(ct);
      }
    }
  }

  if (!isFinite(minX)) {
    return {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    };
  }

  return {
    min: { x: minX - padding, y: minY - padding, z: minZ - padding },
    max: { x: maxX + padding, y: maxY + padding, z: maxZ + padding },
  };
}
