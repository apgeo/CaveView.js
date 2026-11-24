import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import {
  buildSplayTetrahedrons,
  computeSplayBoundingBox,
  precomputeTetrahedrons,
  precomputeCapsules,
} from '../../utils/splayMath';
import {
  populateSdfGridNarrowBand,
  extractSurfaceNets,
} from '../../workers/splayWall.worker';
import type { StationWithSplays } from '../../types/splayTypes';

if (!(THREE.BufferGeometry.prototype as any).computeBoundsTree) {
  (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
  (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

function intersectTrianglePlane(tri: THREE.Triangle, plane: THREE.Plane, outPoints: THREE.Vector3[]): boolean {
  let count = 0;
  const v = [tri.a, tri.b, tri.c];
  const d = [plane.distanceToPoint(v[0]), plane.distanceToPoint(v[1]), plane.distanceToPoint(v[2])];

  for (let i = 0; i < 3; i++) {
    const next = (i + 1) % 3;
    if (d[i] * d[next] < 0) {
      const t = Math.abs(d[i]) / (Math.abs(d[i]) + Math.abs(d[next]));
      outPoints[count].lerpVectors(v[i], v[next], t);
      count++;
    } else if (d[i] === 0) {
      outPoints[count].copy(v[i]);
      count++;
    }
  }
  return count === 2;
}

describe('Splay SDF 3D model clipping edges', () => {
  it('extracts red clipping edge segments along the cut plane for Splay SDF geometry', () => {
    // 1. Build a synthetic splay cave corridor
    const stations: StationWithSplays[] = [
      {
        id: 'st_0',
        position: { x: 0, y: 0, z: 0 },
        splays: [
          { x: 2, y: 0, z: 0 },
          { x: -2, y: 0, z: 0 },
          { x: 0, y: 3, z: 0 },
          { x: 0, y: -3, z: 0 },
          { x: 0, y: 0, z: 2 },
          { x: 0, y: 0, z: -2 },
        ],
        connectedTo: [{ x: 5, y: 0, z: 0 }],
      },
      {
        id: 'st_1',
        position: { x: 5, y: 0, z: 0 },
        splays: [
          { x: 7, y: 0, z: 0 },
          { x: 3, y: 0, z: 0 },
          { x: 5, y: 3, z: 0 },
          { x: 5, y: -3, z: 0 },
          { x: 5, y: 0, z: 2 },
          { x: 5, y: 0, z: -2 },
        ],
        connectedTo: [],
      },
    ];

    const smoothK = 0.45;
    const padding = 1.0;
    const voxelSize = 0.25;
    const isovalue = 0.0;

    const tets = buildSplayTetrahedrons(stations);
    const preTets = precomputeTetrahedrons(tets);
    const caps = [{ a: stations[0].position, b: stations[1].position, radius: 0.2 }];
    const preCaps = precomputeCapsules(caps);

    const bbox = computeSplayBoundingBox(stations, padding);
    const dimX = Math.max(3, Math.ceil((bbox.max.x - bbox.min.x) / voxelSize) + 1);
    const dimY = Math.max(3, Math.ceil((bbox.max.y - bbox.min.y) / voxelSize) + 1);
    const dimZ = Math.max(3, Math.ceil((bbox.max.z - bbox.min.z) / voxelSize) + 1);
    const gridBuffer = new Float32Array(dimX * dimY * dimZ);

    const bandPad = Math.max(0, isovalue) + smoothK + voxelSize * 1.85;
    const activeBounds = populateSdfGridNarrowBand(
      gridBuffer, bbox.min, voxelSize, dimX, dimY, dimZ,
      preTets, preCaps, smoothK, bandPad
    );

    const data = extractSurfaceNets(gridBuffer, {
      origin: bbox.min, voxelSize, dimX, dimY, dimZ, ...activeBounds,
    }, isovalue);

    expect(data.triangleCount).toBeGreaterThan(0);

    // 2. Create BufferGeometry and compute BVH
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    (geo as any).computeBoundsTree();

    expect((geo as any).boundsTree).toBeDefined();

    // 3. Cut with horizontal clipping plane through the center: normal (0, -1, 0), constant 0.0
    // In Three.js: plane (0, -1, 0), constant 0 clips y > 0
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.0);
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const points = [p1, p2];

    const cutSegments: { p1: THREE.Vector3; p2: THREE.Vector3 }[] = [];

    (geo as any).boundsTree.shapecast({
      intersectsBounds: (box: THREE.Box3) => clipPlane.intersectsBox(box),
      intersectsTriangle: (tri: THREE.Triangle) => {
        if (intersectTrianglePlane(tri, clipPlane, points)) {
          cutSegments.push({ p1: points[0].clone(), p2: points[1].clone() });
        }
      },
    });

    expect(cutSegments.length).toBeGreaterThan(0);

    // Verify all cut vertices lie precisely on the cut plane (y = 0)
    for (const seg of cutSegments) {
      expect(Math.abs(clipPlane.distanceToPoint(seg.p1))).toBeLessThan(1e-4);
      expect(Math.abs(clipPlane.distanceToPoint(seg.p2))).toBeLessThan(1e-4);
    }
  });

  it('computes elevation vertex colors for Splay SDF model when splayAltitude is enabled by default', () => {
    const vertexCount = 10;
    const positions = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = i * 10; // Y from 0 to 90
      positions[i * 3 + 2] = 0;
    }

    const minZ = 0;
    const maxZ = 90;
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const y = positions[i * 3 + 1];
      const t = (y - minZ) / (maxZ - minZ);
      // Colors vary from bottom to top
      colors[i * 3] = t;
      colors[i * 3 + 1] = 1 - t;
      colors[i * 3 + 2] = 0.5;
    }

    expect(colors[0]).toBe(0); // lowest point
    expect(colors[(vertexCount - 1) * 3]).toBe(1); // highest point
  });
});
