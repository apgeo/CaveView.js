import type {
  SplayWorkerInputMessage,
  SplayWorkerOutputMessage,
  SplayMeshGeometryData,
  SplaySdfGridData,
  SplayPoint,
} from '../types/splayTypes';

import {
  smin,
  buildSplayTetrahedrons,
  computeSplayBoundingBox,
  precomputeTetrahedrons,
  sdfPrecomputedTetrahedron,
  precomputeCapsules,
  type PrecomputedTetrahedron,
  type PrecomputedCapsule,
} from '../utils/splayMath';

/**
 * Surface Nets / Dual Isosurface Extractor inside Web Worker.
 * Extracts a watertight, smooth 2-manifold triangular mesh from the SDF volume.
 * Optimized with Narrow-Band Bounding-Box Splatting, Separating-Plane Tetrahedron Culling,
 * and Trilinear Sub-Voxel Gradient Normals.
 */

export interface SpatialGridConfig {
  readonly origin: SplayPoint;
  readonly voxelSize: number;
  readonly dimX: number;
  readonly dimY: number;
  readonly dimZ: number;
  readonly activeMinX: number;
  readonly activeMaxX: number;
  readonly activeMinY: number;
  readonly activeMaxY: number;
  readonly activeMinZ: number;
  readonly activeMaxZ: number;
}

const FAR_SDF = 1e6;

/**
 * Splats precomputed tetrahedrons and capsules into the 3D SDF grid within their
 * narrow-band bounding boxes, reducing complexity from O(V * (T + C)) to O(V_active).
 */
export function populateSdfGridNarrowBand(
  gridBuffer: Float32Array,
  origin: SplayPoint,
  voxelSize: number,
  dimX: number,
  dimY: number,
  dimZ: number,
  preTets: readonly PrecomputedTetrahedron[],
  preCaps: readonly PrecomputedCapsule[],
  smoothK: number,
  bandPad: number,
  onProgress?: (percent: number) => void
): {
  activeMinX: number; activeMaxX: number;
  activeMinY: number; activeMaxY: number;
  activeMinZ: number; activeMaxZ: number;
} {
  gridBuffer.fill(FAR_SDF);

  const invVoxel = 1.0 / voxelSize;
  const sliceSize = dimX * dimY;
  const originX = origin.x;
  const originY = origin.y;
  const originZ = origin.z;

  let activeMinX = dimX - 1, activeMaxX = 0;
  let activeMinY = dimY - 1, activeMaxY = 0;
  let activeMinZ = dimZ - 1, activeMaxZ = 0;

  const tetCount = preTets.length;
  const capCount = preCaps.length;
  const totalPrimitives = tetCount + capCount;
  const progressStep = Math.max(1, Math.floor(totalPrimitives / 12));

  // 1. Splat Tetrahedrons into their narrow-band voxel bounding boxes
  for (let i = 0; i < tetCount; i++) {
    const t = preTets[i];
    const ix0 = Math.max(0, Math.floor((t.minX - bandPad - originX) * invVoxel));
    const ix1 = Math.min(dimX - 1, Math.ceil((t.maxX + bandPad - originX) * invVoxel));
    const iy0 = Math.max(0, Math.floor((t.minY - bandPad - originY) * invVoxel));
    const iy1 = Math.min(dimY - 1, Math.ceil((t.maxY + bandPad - originY) * invVoxel));
    const iz0 = Math.max(0, Math.floor((t.minZ - bandPad - originZ) * invVoxel));
    const iz1 = Math.min(dimZ - 1, Math.ceil((t.maxZ + bandPad - originZ) * invVoxel));

    if (ix0 > ix1 || iy0 > iy1 || iz0 > iz1) continue;

    if (ix0 < activeMinX) activeMinX = ix0;
    if (ix1 > activeMaxX) activeMaxX = ix1;
    if (iy0 < activeMinY) activeMinY = iy0;
    if (iy1 > activeMaxY) activeMaxY = iy1;
    if (iz0 < activeMinZ) activeMinZ = iz0;
    if (iz1 > activeMaxZ) activeMaxZ = iz1;

    const m0 = t.n0x * voxelSize;
    const m1 = t.n1x * voxelSize;
    const m2 = t.n2x * voxelSize;
    const m3 = t.n3x * voxelSize;

    for (let z = iz0; z <= iz1; z++) {
      const pz = originZ + z * voxelSize;
      const zOff = z * sliceSize;
      for (let y = iy0; y <= iy1; y++) {
        const py = originY + y * voxelSize;
        const yzOff = zOff + y * dimX;

        if (t.isNonDegenerate) {
          const b0 = t.n0x * originX + t.n0y * py + t.n0z * pz - t.d0;
          const b1 = t.n1x * originX + t.n1y * py + t.n1z * pz - t.d1;
          const b2 = t.n2x * originX + t.n2y * py + t.n2z * pz - t.d2;
          const b3 = t.n3x * originX + t.n3y * py + t.n3z * pz - t.d3;

          let xStart = ix0;
          let xEnd = ix1;

          // Clip scanline [xStart, xEnd] against all 4 half-spaces expanded by bandPad
          if (m0 > 1e-8) {
            const lim = Math.floor((bandPad - b0) / m0);
            if (lim < xEnd) xEnd = lim;
          } else if (m0 < -1e-8) {
            const lim = Math.ceil((bandPad - b0) / m0);
            if (lim > xStart) xStart = lim;
          } else if (b0 > bandPad) continue;

          if (xStart > xEnd) continue;

          if (m1 > 1e-8) {
            const lim = Math.floor((bandPad - b1) / m1);
            if (lim < xEnd) xEnd = lim;
          } else if (m1 < -1e-8) {
            const lim = Math.ceil((bandPad - b1) / m1);
            if (lim > xStart) xStart = lim;
          } else if (b1 > bandPad) continue;

          if (xStart > xEnd) continue;

          if (m2 > 1e-8) {
            const lim = Math.floor((bandPad - b2) / m2);
            if (lim < xEnd) xEnd = lim;
          } else if (m2 < -1e-8) {
            const lim = Math.ceil((bandPad - b2) / m2);
            if (lim > xStart) xStart = lim;
          } else if (b2 > bandPad) continue;

          if (xStart > xEnd) continue;

          if (m3 > 1e-8) {
            const lim = Math.floor((bandPad - b3) / m3);
            if (lim < xEnd) xEnd = lim;
          } else if (m3 < -1e-8) {
            const lim = Math.ceil((bandPad - b3) / m3);
            if (lim > xStart) xStart = lim;
          } else if (b3 > bandPad) continue;

          if (xStart > xEnd) continue;

          let s0 = b0 + xStart * m0;
          let s1 = b1 + xStart * m1;
          let s2 = b2 + xStart * m2;
          let s3 = b3 + xStart * m3;

          for (let x = xStart; x <= xEnd; x++, s0 += m0, s1 += m1, s2 += m2, s3 += m3) {
            const idx = yzOff + x;
            const cur = gridBuffer[idx];
            const curPlusK = cur + smoothK;
            const cullDist = curPlusK < bandPad ? curPlusK : bandPad;

            const maxPlane = Math.max(s0, s1, s2, s3);
            if (maxPlane >= cullDist) continue;

            if (maxPlane <= 0) {
              gridBuffer[idx] = cur >= FAR_SDF * 0.5 ? maxPlane : smin(cur, maxPlane, smoothK);
              continue;
            }
            if (cullDist <= 0) continue;

            const px = originX + x * voxelSize;
            const d = sdfPrecomputedTetrahedron(px, py, pz, t, cullDist);
            if (d < cullDist) {
              gridBuffer[idx] = cur >= FAR_SDF * 0.5 ? d : smin(cur, d, smoothK);
            }
          }
        } else {
          for (let x = ix0; x <= ix1; x++) {
            const idx = yzOff + x;
            const cur = gridBuffer[idx];
            const curPlusK = cur + smoothK;
            const cullDist = curPlusK < bandPad ? curPlusK : bandPad;
            const px = originX + x * voxelSize;
            const d = sdfPrecomputedTetrahedron(px, py, pz, t, cullDist);
            if (d < cullDist) {
              gridBuffer[idx] = cur >= FAR_SDF * 0.5 ? d : smin(cur, d, smoothK);
            }
          }
        }
      }
    }

    if (onProgress && i % progressStep === 0) {
      onProgress(Math.min(88, Math.round((i / totalPrimitives) * 80) + 5));
    }
  }

  // 2. Splat Capsules into their narrow-band voxel bounding boxes (scanline vectorized)
  for (let i = 0; i < capCount; i++) {
    const c = preCaps[i];
    const ix0 = Math.max(0, Math.floor((c.minX - bandPad - originX) * invVoxel));
    const ix1 = Math.min(dimX - 1, Math.ceil((c.maxX + bandPad - originX) * invVoxel));
    const iy0 = Math.max(0, Math.floor((c.minY - bandPad - originY) * invVoxel));
    const iy1 = Math.min(dimY - 1, Math.ceil((c.maxY + bandPad - originY) * invVoxel));
    const iz0 = Math.max(0, Math.floor((c.minZ - bandPad - originZ) * invVoxel));
    const iz1 = Math.min(dimZ - 1, Math.ceil((c.maxZ + bandPad - originZ) * invVoxel));

    if (ix0 > ix1 || iy0 > iy1 || iz0 > iz1) continue;

    if (ix0 < activeMinX) activeMinX = ix0;
    if (ix1 > activeMaxX) activeMaxX = ix1;
    if (iy0 < activeMinY) activeMinY = iy0;
    if (iy1 > activeMaxY) activeMaxY = iy1;
    if (iz0 < activeMinZ) activeMinZ = iz0;
    if (iz1 > activeMaxZ) activeMaxZ = iz1;

    const ax = c.ax, ay = c.ay, az = c.az;
    const abx = c.abx, aby = c.aby, abz = c.abz;
    const invLenSq = c.invLenSq;
    const radius = c.radius;

    for (let z = iz0; z <= iz1; z++) {
      const pz = originZ + z * voxelSize;
      const apz = pz - az;
      const zOff = z * sliceSize;
      for (let y = iy0; y <= iy1; y++) {
        const py = originY + y * voxelSize;
        const apy = py - ay;
        const dotYZ = apy * aby + apz * abz;
        const yzOff = zOff + y * dimX;

        for (let x = ix0; x <= ix1; x++) {
          const idx = yzOff + x;
          const cur = gridBuffer[idx];
          const curPlusK = cur + smoothK;
          const cullDist = curPlusK < bandPad ? curPlusK : bandPad;
          const maxR = cullDist + radius;
          if (maxR <= 0) continue;

          const apx = originX + x * voxelSize - ax;

          let t = (apx * abx + dotYZ) * invLenSq;
          if (t < 0.0) t = 0.0;
          else if (t > 1.0) t = 1.0;

          const dx = apx - abx * t;
          const dy = apy - aby * t;
          const dz = apz - abz * t;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < maxR * maxR) {
            const d = Math.sqrt(distSq) - radius;
            gridBuffer[idx] = cur >= FAR_SDF * 0.5 ? d : smin(cur, d, smoothK);
          }
        }
      }
    }

    if (onProgress && (tetCount + i) % progressStep === 0) {
      onProgress(Math.min(88, Math.round(((tetCount + i) / totalPrimitives) * 80) + 5));
    }
  }

  if (activeMinX > activeMaxX) {
    activeMinX = 0; activeMaxX = dimX - 1;
    activeMinY = 0; activeMaxY = dimY - 1;
    activeMinZ = 0; activeMaxZ = dimZ - 1;
  }

  return { activeMinX, activeMaxX, activeMinY, activeMaxY, activeMinZ, activeMaxZ };
}

/**
 * Surface Nets dual contouring algorithm.
 * Generates smooth vertices inside boundary cells and dual quads/triangles on crossing edges.
 * Uses active-cell indexing and O(1) trilinear SDF gradients for vertex normals.
 */
export function extractSurfaceNets(
  grid: Float32Array,
  gridConfig: SpatialGridConfig,
  isovalue: number
): SplayMeshGeometryData {
  const {
    origin, voxelSize, dimX, dimY, dimZ,
    activeMinX, activeMaxX, activeMinY, activeMaxY, activeMinZ, activeMaxZ,
  } = gridConfig;
  const sliceSize = dimX * dimY;

  const getIndex = (x: number, y: number, z: number): number => x + y * dimX + z * sliceSize;

  // Track vertex IDs generated per active cell
  const cellVertexMap = new Int32Array(dimX * dimY * dimZ).fill(-1);
  const activeCellCoords: number[] = [];

  const positionsList: number[] = [];
  const normalsList: number[] = [];
  const indicesList: number[] = [];

  const startX = Math.max(0, activeMinX);
  const endX = Math.min(dimX - 2, activeMaxX);
  const startY = Math.max(0, activeMinY);
  const endY = Math.min(dimY - 2, activeMaxY);
  const startZ = Math.max(0, activeMinZ);
  const endZ = Math.min(dimZ - 2, activeMaxZ);

  const farSkipThreshold = voxelSize * 2.2;

  // 1. Dual Vertex Generation for active cells within narrow-band bounds
  for (let z = startZ; z <= endZ; z++) {
    const zOff0 = z * sliceSize;
    const zOff1 = (z + 1) * sliceSize;
    for (let y = startY; y <= endY; y++) {
      const y0z0 = zOff0 + y * dimX;
      const y1z0 = zOff0 + (y + 1) * dimX;
      const y0z1 = zOff1 + y * dimX;
      const y1z1 = zOff1 + (y + 1) * dimX;

      for (let x = startX; x <= endX; x++) {
        const v0 = grid[y0z0 + x] - isovalue;
        const v1 = grid[y0z0 + x + 1] - isovalue;
        // Fast skip for cells deep in solid rock
        if (v0 > farSkipThreshold && v1 > farSkipThreshold) {
          continue;
        }

        const v2 = grid[y1z0 + x] - isovalue;
        const v3 = grid[y1z0 + x + 1] - isovalue;
        const v4 = grid[y0z1 + x] - isovalue;
        const v5 = grid[y0z1 + x + 1] - isovalue;
        const v6 = grid[y1z1 + x] - isovalue;
        const v7 = grid[y1z1 + x + 1] - isovalue;

        const mask =
          ((v0 > 0 ? 1 : 0) << 0) |
          ((v1 > 0 ? 1 : 0) << 1) |
          ((v2 > 0 ? 1 : 0) << 2) |
          ((v3 > 0 ? 1 : 0) << 3) |
          ((v4 > 0 ? 1 : 0) << 4) |
          ((v5 > 0 ? 1 : 0) << 5) |
          ((v6 > 0 ? 1 : 0) << 6) |
          ((v7 > 0 ? 1 : 0) << 7);

        // Entirely inside or entirely outside: no surface in this cell
        if (mask === 0 || mask === 0xff) {
          continue;
        }

        // Calculate average intersection point along crossing edges
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        let edgeCount = 0;

        // 4 X-aligned edges
        if ((v0 > 0) !== (v1 > 0)) { sumX += x + (-v0) / (v1 - v0); sumY += y; sumZ += z; edgeCount++; }
        if ((v2 > 0) !== (v3 > 0)) { sumX += x + (-v2) / (v3 - v2); sumY += y + 1; sumZ += z; edgeCount++; }
        if ((v4 > 0) !== (v5 > 0)) { sumX += x + (-v4) / (v5 - v4); sumY += y; sumZ += z + 1; edgeCount++; }
        if ((v6 > 0) !== (v7 > 0)) { sumX += x + (-v6) / (v7 - v6); sumY += y + 1; sumZ += z + 1; edgeCount++; }

        // 4 Y-aligned edges
        if ((v0 > 0) !== (v2 > 0)) { sumX += x; sumY += y + (-v0) / (v2 - v0); sumZ += z; edgeCount++; }
        if ((v1 > 0) !== (v3 > 0)) { sumX += x + 1; sumY += y + (-v1) / (v3 - v1); sumZ += z; edgeCount++; }
        if ((v4 > 0) !== (v6 > 0)) { sumX += x; sumY += y + (-v4) / (v6 - v4); sumZ += z + 1; edgeCount++; }
        if ((v5 > 0) !== (v7 > 0)) { sumX += x + 1; sumY += y + (-v5) / (v7 - v5); sumZ += z + 1; edgeCount++; }

        // 4 Z-aligned edges
        if ((v0 > 0) !== (v4 > 0)) { sumX += x; sumY += y; sumZ += z + (-v0) / (v4 - v0); edgeCount++; }
        if ((v1 > 0) !== (v5 > 0)) { sumX += x + 1; sumY += y; sumZ += z + (-v1) / (v5 - v1); edgeCount++; }
        if ((v2 > 0) !== (v6 > 0)) { sumX += x; sumY += y + 1; sumZ += z + (-v2) / (v6 - v2); edgeCount++; }
        if ((v3 > 0) !== (v7 > 0)) { sumX += x + 1; sumY += y + 1; sumZ += z + (-v3) / (v7 - v3); edgeCount++; }

        if (edgeCount > 0) {
          const inv = 1.0 / edgeCount;
          const gx = sumX * inv;
          const gy = sumY * inv;
          const gz = sumZ * inv;

          const worldX = origin.x + gx * voxelSize;
          const worldY = origin.y + gy * voxelSize;
          const worldZ = origin.z + gz * voxelSize;

          // Trilinear sub-voxel SDF gradient normal (zero extra SDF evaluations)
          const ux = gx - x;
          const uy = gy - y;
          const uz = gz - z;
          const wx0 = 1.0 - ux, wx1 = ux;
          const wy0 = 1.0 - uy, wy1 = uy;
          const wz0 = 1.0 - uz, wz1 = uz;

          let nx = wy0 * (wz0 * (v1 - v0) + wz1 * (v5 - v4)) + wy1 * (wz0 * (v3 - v2) + wz1 * (v7 - v6));
          let ny = wx0 * (wz0 * (v2 - v0) + wz1 * (v6 - v4)) + wx1 * (wz0 * (v3 - v1) + wz1 * (v7 - v5));
          let nz = wx0 * (wy0 * (v4 - v0) + wy1 * (v6 - v2)) + wx1 * (wy0 * (v5 - v1) + wy1 * (v7 - v3));
          const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (nLen > 1e-8) {
            const invN = 1.0 / nLen;
            nx *= invN; ny *= invN; nz *= invN;
          }

          const vertexIdx = positionsList.length / 3;
          cellVertexMap[y0z0 + x] = vertexIdx;
          activeCellCoords.push(x, y, z);

          positionsList.push(worldX, worldY, worldZ);
          normalsList.push(nx, ny, nz);
        }
      }
    }
  }

  // 2. Dual Quad / Triangle Polygonization ONLY across active cells
  const activeCount = activeCellCoords.length;
  for (let i = 0; i < activeCount; i += 3) {
    const x = activeCellCoords[i];
    const y = activeCellCoords[i + 1];
    const z = activeCellCoords[i + 2];
    if (x < 1 || y < 1 || z < 1) continue;

    const baseIdx = getIndex(x, y, z);
    const c11 = cellVertexMap[baseIdx];
    const val = grid[baseIdx] - isovalue;

    // X-axis edge check
    const valX = grid[baseIdx + 1] - isovalue;
    if ((val > 0) !== (valX > 0)) {
      const c00 = cellVertexMap[baseIdx - dimX - sliceSize];
      const c10 = cellVertexMap[baseIdx - sliceSize];
      const c01 = cellVertexMap[baseIdx - dimX];

      if (c00 >= 0 && c10 >= 0 && c01 >= 0) {
        if (val > 0) {
          indicesList.push(c00, c10, c11, c00, c11, c01);
        } else {
          indicesList.push(c00, c11, c10, c00, c01, c11);
        }
      }
    }

    // Y-axis edge check
    const valY = grid[baseIdx + dimX] - isovalue;
    if ((val > 0) !== (valY > 0)) {
      const c00 = cellVertexMap[baseIdx - 1 - sliceSize];
      const c10 = cellVertexMap[baseIdx - sliceSize];
      const c01 = cellVertexMap[baseIdx - 1];

      if (c00 >= 0 && c10 >= 0 && c01 >= 0) {
        if (val > 0) {
          indicesList.push(c00, c11, c10, c00, c01, c11);
        } else {
          indicesList.push(c00, c10, c11, c00, c11, c01);
        }
      }
    }

    // Z-axis edge check
    const valZ = grid[baseIdx + sliceSize] - isovalue;
    if ((val > 0) !== (valZ > 0)) {
      const c00 = cellVertexMap[baseIdx - 1 - dimX];
      const c10 = cellVertexMap[baseIdx - dimX];
      const c01 = cellVertexMap[baseIdx - 1];

      if (c00 >= 0 && c10 >= 0 && c01 >= 0) {
        if (val > 0) {
          indicesList.push(c00, c10, c11, c00, c11, c01);
        } else {
          indicesList.push(c00, c11, c10, c00, c01, c11);
        }
      }
    }
  }

  const positions = new Float32Array(positionsList);
  const normals = new Float32Array(normalsList);
  const indices = new Uint32Array(indicesList);

  return {
    positions,
    normals,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

/**
 * Worker message dispatcher.
 */
if (typeof self !== 'undefined') {
  self.onmessage = (e: MessageEvent<SplayWorkerInputMessage>) => {
    const startTime = performance.now();
    const { type, stations, config } = e.data;

    try {
      if (!stations || stations.length === 0) {
        const errorResponse: SplayWorkerOutputMessage = {
          status: 'error',
          error: 'No stations provided for splay wall generation.',
        };
        self.postMessage(errorResponse);
        return;
      }

      // 1. Build & Precompute Tetrahedrons (with outward half-space planes)
      const tetrahedrons = buildSplayTetrahedrons(stations);
      const preTets = precomputeTetrahedrons(tetrahedrons);

      // 2. Build & Precompute Traverse Connector Capsules & Splay Rays
      const traverseCapsules: { a: SplayPoint; b: SplayPoint; radius: number }[] = [];
      for (const st of stations) {
        if (config.includeTraverseCapsules && st.connectedTo) {
          for (const conn of st.connectedTo) {
            traverseCapsules.push({
              a: st.position,
              b: conn,
              radius: config.capsuleRadius,
            });
          }
        }
        if (st.splays && st.splays.length > 0) {
          for (const sp of st.splays) {
            traverseCapsules.push({
              a: st.position,
              b: sp,
              radius: config.capsuleRadius * 0.75,
            });
          }
        }
      }
      const preCaps = precomputeCapsules(traverseCapsules);

      // 3. Compute Global Bounding Box & Grid Resolution
      const bbox = computeSplayBoundingBox(stations, config.padding);
      let voxelSize = Math.max(0.08, config.voxelSize || 0.22);

      const spanX = bbox.max.x - bbox.min.x;
      const spanY = bbox.max.y - bbox.min.y;
      const spanZ = bbox.max.z - bbox.min.z;

      // Desktop & Web guard: clamp max grid dimensions to avoid OOM
      const maxDim = 260;
      if (spanX / voxelSize > maxDim || spanY / voxelSize > maxDim || spanZ / voxelSize > maxDim) {
        const largestSpan = Math.max(spanX, spanY, spanZ);
        voxelSize = largestSpan / maxDim;
      }

      const dimX = Math.max(3, Math.ceil(spanX / voxelSize) + 1);
      const dimY = Math.max(3, Math.ceil(spanY / voxelSize) + 1);
      const dimZ = Math.max(3, Math.ceil(spanZ / voxelSize) + 1);

      const totalVoxels = dimX * dimY * dimZ;
      const gridBuffer = new Float32Array(totalVoxels);

      // 4. Fill SDF Grid via Narrow-Band Bounding-Box Splatting
      const bandPad = type === 'GENERATE_SDF_GRID'
        ? FAR_SDF
        : (Math.max(0, config.isovalue) + config.smoothK + voxelSize * 1.85);

      const activeBounds = populateSdfGridNarrowBand(
        gridBuffer,
        bbox.min,
        voxelSize,
        dimX,
        dimY,
        dimZ,
        preTets,
        preCaps,
        config.smoothK,
        bandPad,
        (percent) => {
          const progressMsg: SplayWorkerOutputMessage = {
            status: 'progress',
            progress: percent,
            message: `Generujem Splay SDF steny (${percent}%)...`,
          };
          self.postMessage(progressMsg);
        }
      );

      const durationMs = performance.now() - startTime;

      if (type === 'GENERATE_SDF_GRID') {
        const sdfGridPayload: SplaySdfGridData = {
          buffer: gridBuffer,
          dims: [dimX, dimY, dimZ],
          origin: [bbox.min.x, bbox.min.y, bbox.min.z],
          voxelSize,
        };

        const response: SplayWorkerOutputMessage = {
          status: 'success',
          sdfGrid: sdfGridPayload,
          durationMs,
        };

        // Zero-copy transfer of the grid buffer
        self.postMessage(response, { transfer: [gridBuffer.buffer] });
        return;
      }

      // 5. Extract Surface Mesh (Surface Nets)
      const extractProgressMsg: SplayWorkerOutputMessage = {
        status: 'progress',
        progress: 92,
        message: 'Extrahuje sa 3D povrch (Surface Nets)...',
      };
      self.postMessage(extractProgressMsg);

      const gridConfig: SpatialGridConfig = {
        origin: bbox.min,
        voxelSize,
        dimX,
        dimY,
        dimZ,
        ...activeBounds,
      };

      const geometry = extractSurfaceNets(
        gridBuffer,
        gridConfig,
        config.isovalue
      );

      const totalDuration = performance.now() - startTime;

      const successResponse: SplayWorkerOutputMessage = {
        status: 'success',
        geometry,
        durationMs: totalDuration,
      };

      // Zero-copy transfer of typed array buffers (positions, normals, indices)
      self.postMessage(successResponse, {
        transfer: [
          geometry.positions.buffer,
          geometry.normals.buffer,
          geometry.indices.buffer,
        ],
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorResponse: SplayWorkerOutputMessage = {
        status: 'error',
        error: errorMsg,
      };
      self.postMessage(errorResponse);
    }
  };
}
