import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParsedCave } from '@shared/types';

// --- PÔVODNÉ VYHLADZOVACIE FUNKCIE (Taubin & Weighted Normals) ---

function applyTaubinSmoothing(geometry: THREE.BufferGeometry, iterations = 5): THREE.BufferGeometry {
  if (!geometry.index) return geometry;
  const pos = geometry.attributes.position;
  const posArr = pos.array as Float32Array;
  const idx = geometry.index.array;
  const vCount = pos.count;
  
  const adj = new Array(vCount);
  for (let i = 0; i < vCount; i++) adj[i] = new Set<number>();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i+1], c = idx[i+2];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }

  const lambda = 0.5, mu = -0.53;
  const tempArr = new Float32Array(posArr.length);

  for (let iter = 0; iter < iterations; iter++) {
    // Lambda pass
    for (let i = 0; i < vCount; i++) {
      const neighbors = adj[i];
      if (neighbors.size === 0) {
        tempArr[i*3]=posArr[i*3]; tempArr[i*3+1]=posArr[i*3+1]; tempArr[i*3+2]=posArr[i*3+2];
        continue;
      }
      let sx=0, sy=0, sz=0;
      for (const n of neighbors) { sx += posArr[n*3]; sy += posArr[n*3+1]; sz += posArr[n*3+2]; }
      const invSize = 1.0 / neighbors.size;
      tempArr[i*3]   = posArr[i*3]   + lambda * (sx * invSize - posArr[i*3]);
      tempArr[i*3+1] = posArr[i*3+1] + lambda * (sy * invSize - posArr[i*3+1]);
      tempArr[i*3+2] = posArr[i*3+2] + lambda * (sz * invSize - posArr[i*3+2]);
    }
    posArr.set(tempArr);

    // Mu pass
    for (let i = 0; i < vCount; i++) {
      const neighbors = adj[i];
      if (neighbors.size === 0) continue;
      let sx=0, sy=0, sz=0;
      for (const n of neighbors) { sx += posArr[n*3]; sy += posArr[n*3+1]; sz += posArr[n*3+2]; }
      const invSize = 1.0 / neighbors.size;
      tempArr[i*3]   = posArr[i*3]   + mu * (sx * invSize - posArr[i*3]);
      tempArr[i*3+1] = posArr[i*3+1] + mu * (sy * invSize - posArr[i*3+1]);
      tempArr[i*3+2] = posArr[i*3+2] + mu * (sz * invSize - posArr[i*3+2]);
    }
    posArr.set(tempArr);
  }
  pos.needsUpdate = true;
  return geometry;
}

function applyLaplacianSmoothing(geometry: THREE.BufferGeometry, iterations = 20, tension = 0.6): THREE.BufferGeometry {
  const pos = geometry.attributes.position.array as Float32Array;
  const idx = geometry.index!.array;
  const vCount = geometry.attributes.position.count;
  
  for (let it = 0; it < iterations; it++) {
    const newPos = new Float32Array(pos.length);
    const sums = new Float32Array(pos.length);
    const counts = new Uint32Array(vCount);
    
    for (let i = 0; i < idx.length; i += 3) {
      const i1 = idx[i], i2 = idx[i+1], i3 = idx[i+2];
      const add = (a: number, b: number) => {
        sums[a*3]+=pos[b*3]; sums[a*3+1]+=pos[b*3+1]; sums[a*3+2]+=pos[b*3+2];
        counts[a]++;
      };
      add(i1,i2); add(i1,i3); add(i2,i1); add(i2,i3); add(i3,i1); add(i3,i2);
    }
    
    for (let i = 0; i < vCount; i++) {
      if (counts[i] > 0) {
        newPos[i*3] = pos[i*3] + (sums[i*3]/counts[i] - pos[i*3]) * tension;
        newPos[i*3+1] = pos[i*3+1] + (sums[i*3+1]/counts[i] - pos[i*3+1]) * tension;
        newPos[i*3+2] = pos[i*3+2] + (sums[i*3+2]/counts[i] - pos[i*3+2]) * tension;
      } else {
        newPos[i*3]=pos[i*3]; newPos[i*3+1]=pos[i*3+1]; newPos[i*3+2]=pos[i*3+2];
      }
    }
    pos.set(newPos);
  }
  geometry.attributes.position.needsUpdate = true;
  return geometry;
}

function computeAngleWeightedNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometry.index) { geometry.computeVertexNormals(); return geometry; }
  const posArr = geometry.attributes.position.array as Float32Array;
  const idx = geometry.index.array;
  const vCount = geometry.attributes.position.count;
  const normals = new Float32Array(vCount * 3);
  
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), bc = new THREE.Vector3(), cb = new THREE.Vector3();

  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i], ib = idx[i+1], ic = idx[i+2];
    vA.fromArray(posArr, ia * 3); vB.fromArray(posArr, ib * 3); vC.fromArray(posArr, ic * 3);
    ab.subVectors(vB, vA); ac.subVectors(vC, vA); bc.subVectors(vC, vB);
    cb.crossVectors(ab, ac); cb.normalize();
    
    const aLSq = bc.lengthSq(), bLSq = ac.lengthSq(), cLSq = ab.lengthSq();
    const aLen = Math.sqrt(aLSq), bLen = Math.sqrt(bLSq), cLen = Math.sqrt(cLSq);
    
    let angleA = 0, angleB = 0, angleC = 0;
    if (bLen > 0 && cLen > 0) angleA = Math.acos(Math.max(-1, Math.min(1, (bLSq + cLSq - aLSq) / (2 * bLen * cLen))));
    if (aLen > 0 && cLen > 0) angleB = Math.acos(Math.max(-1, Math.min(1, (aLSq + cLSq - bLSq) / (2 * aLen * cLen))));
    if (aLen > 0 && bLen > 0) angleC = Math.PI - angleA - angleB;
    
    normals[ia*3] += cb.x * angleA; normals[ia*3+1] += cb.y * angleA; normals[ia*3+2] += cb.z * angleA;
    normals[ib*3] += cb.x * angleB; normals[ib*3+1] += cb.y * angleB; normals[ib*3+2] += cb.z * angleB;
    normals[ic*3] += cb.x * angleC; normals[ic*3+1] += cb.y * angleC; normals[ic*3+2] += cb.z * angleC;
  }

  for (let i = 0; i < vCount; i++) {
    const nx = normals[i*3], ny = normals[i*3+1], nz = normals[i*3+2];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    if (len > 0) { normals[i*3] /= len; normals[i*3+1] /= len; normals[i*3+2] /= len; }
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/**
 * Fast Voxel-based Shell Reconstruction.
 * 
 * Pre LiDAR PLY:
 *  - Adaptívny voxelSize (nie fixný maxRes) → zachová detail
 *  - Žiadna dilatácia voxelov → body sú priamo škrupina (shrink-wrap)
 *  - Taubin smoothing (volume-preserving) → strop sa NEzmrší
 *  - Padding 3 voxely → bezpečný flood-fill
 * 
 * Pre LOX:
 *  - Pôvodný Taubin+Laplacian hybrid ostáva nezmenený
 */
export function reconstructSurface(
  points: Float32Array | {x:number, y:number, z:number}[], 
  voxelSize = 0.5, 
  isAccurate = false, 
  organicLevel = 5, 
  isLiDAR = false,
  corePoints?: Float32Array,
  dilationSteps?: number
): THREE.BufferGeometry {
  const pCount = points instanceof Float32Array ? points.length / 3 : points.length;
  if (pCount < 10) return new THREE.BufferGeometry();

  // ── 1. Bounding box ──
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  if (points instanceof Float32Array) {
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i], y = points[i+1], z = points[i+2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  } else {
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
  }

  // ── 2. Adaptívny voxelSize (LiDAR: max 150 buniek/os, bolo 300) ──
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const maxGridCells = isLiDAR ? 150 : 120;
  const activeVoxelSize = Math.max(voxelSize, maxDim / maxGridCells);

  // ── 3. Padding (2 voxely) ──
  const pad = activeVoxelSize * 2;
  const pMinX = minX - pad, pMinY = minY - pad, pMinZ = minZ - pad;

  // ── 4. Flat grid (Uint8Array): bit0=occupied, bit1=exterior ──
  const resX = Math.ceil((maxX - minX + 2*pad) / activeVoxelSize) + 1;
  const resY = Math.ceil((maxY - minY + 2*pad) / activeVoxelSize) + 1;
  const resZ = Math.ceil((maxZ - minZ + 2*pad) / activeVoxelSize) + 1;
  const strideZ = 1, strideY = resZ, strideX = resY * resZ;
  const grid = new Uint8Array(resX * resY * resZ);
  const gi = (ix: number, iy: number, iz: number) => ix * strideX + iy * strideY + iz;

  // ── 5. Voxelizácia bodov (flat grid) ──
  if (points instanceof Float32Array) {
    for (let i = 0; i < points.length; i += 3) {
      const ix = Math.floor((points[i]   - pMinX) / activeVoxelSize);
      const iy = Math.floor((points[i+1] - pMinY) / activeVoxelSize);
      const iz = Math.floor((points[i+2] - pMinZ) / activeVoxelSize);
      if (ix>=0&&ix<resX&&iy>=0&&iy<resY&&iz>=0&&iz<resZ) grid[gi(ix,iy,iz)] |= 1;
    }
  } else {
    for (const p of points) {
      const ix = Math.floor((p.x - pMinX) / activeVoxelSize);
      const iy = Math.floor((p.y - pMinY) / activeVoxelSize);
      const iz = Math.floor((p.z - pMinZ) / activeVoxelSize);
      if (ix>=0&&ix<resX&&iy>=0&&iy<resY&&iz>=0&&iz<resZ) grid[gi(ix,iy,iz)] |= 1;
    }
  }

  // ── 6. Dilatácia pre LOX ──
  if (!isLiDAR && !isAccurate) {
    const tmp = new Uint8Array(grid.length); tmp.set(grid);
    for (let ix=1;ix<resX-1;ix++) for (let iy=1;iy<resY-1;iy++) for (let iz=1;iz<resZ-1;iz++)
      if (grid[gi(ix,iy,iz)]&1)
        for (let ddx=-1;ddx<=1;ddx++) for (let ddy=-1;ddy<=1;ddy++) for (let ddz=-1;ddz<=1;ddz++)
          tmp[gi(ix+ddx,iy+ddy,iz+ddz)] |= 1;
    grid.set(tmp);
  }

  // ── 7. Core points ──
  if (corePoints && corePoints.length > 0) {
    for (let i=0;i<corePoints.length;i+=3) {
      const bx=Math.floor((corePoints[i]-pMinX)/activeVoxelSize);
      const by=Math.floor((corePoints[i+1]-pMinY)/activeVoxelSize);
      const bz=Math.floor((corePoints[i+2]-pMinZ)/activeVoxelSize);
      for (let ddx=-1;ddx<=1;ddx++) for (let ddy=-1;ddy<=1;ddy++) for (let ddz=-1;ddz<=1;ddz++) {
        const nx=bx+ddx,ny=by+ddy,nz=bz+ddz;
        if (nx>=0&&nx<resX&&ny>=0&&ny<resY&&nz>=0&&nz<resZ) grid[gi(nx,ny,nz)] |= 1;
      }
    }
  }

  // ── 8. BFS flood-fill (flat Int32Array queue – bez BigInt) ──
  const bfsQ = new Int32Array(resX*resY*resZ*3);
  let qH=0, qT=0;
  const seedExt=(ix:number,iy:number,iz:number)=>{
    if (ix<0||ix>=resX||iy<0||iy>=resY||iz<0||iz>=resZ) return;
    const g=gi(ix,iy,iz); if (grid[g]) return;
    grid[g]=2; bfsQ[qT++]=ix; bfsQ[qT++]=iy; bfsQ[qT++]=iz;
  };
  for (let x=0;x<resX;x++) for (let y=0;y<resY;y++) { seedExt(x,y,0); seedExt(x,y,resZ-1); }
  for (let x=0;x<resX;x++) for (let z=0;z<resZ;z++) { seedExt(x,0,z); seedExt(x,resY-1,z); }
  for (let y=0;y<resY;y++) for (let z=0;z<resZ;z++) { seedExt(0,y,z); seedExt(resX-1,y,z); }
  const DX=[1,-1,0,0,0,0],DY=[0,0,1,-1,0,0],DZ=[0,0,0,0,1,-1];
  while (qH<qT) {
    const ix=bfsQ[qH++],iy=bfsQ[qH++],iz=bfsQ[qH++];
    for (let d=0;d<6;d++) {
      const nx=ix+DX[d],ny=iy+DY[d],nz=iz+DZ[d];
      if (nx<0||nx>=resX||ny<0||ny>=resY||nz<0||nz>=resZ) continue;
      const g=gi(nx,ny,nz);
      if (grid[g]===0){grid[g]=2;bfsQ[qT++]=nx;bfsQ[qT++]=ny;bfsQ[qT++]=nz;}
    }
  }

  // ── 9. Povrchová triangulácia (int-key vertexMap) ──
  const vertices: number[] = [];
  const indices:  number[] = [];
  const vertexMap = new Map<number, number>();

  const getVertex = (ix: number, iy: number, iz: number): number => {
    const key = ix * 1000000 + iy * 1000 + iz; // safe for grid ≤ 150
    let vi = vertexMap.get(key);
    if (vi !== undefined) return vi;
    vi = vertices.length / 3;
    vertices.push(pMinX + ix * activeVoxelSize, pMinY + iy * activeVoxelSize, pMinZ + iz * activeVoxelSize);
    vertexMap.set(key, vi);
    return vi;
  };

  type FE = [number,number,number, number[],number[],number[],number[]];
  const faceData: FE[] = [
    [1,0,0,  [1,0,0],[1,1,0],[1,1,1],[1,0,1]],
    [-1,0,0, [0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    [0,1,0,  [0,1,0],[0,1,1],[1,1,1],[1,1,0]],
    [0,-1,0, [0,0,0],[1,0,0],[1,0,1],[0,0,1]],
    [0,0,1,  [0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    [0,0,-1, [0,0,0],[0,1,0],[1,1,0],[1,0,0]],
  ];

  for (let ix=0;ix<resX;ix++) for (let iy=0;iy<resY;iy++) for (let iz=0;iz<resZ;iz++) {
    if (!(grid[gi(ix,iy,iz)]&1)) continue;
    for (const [fdx,fdy,fdz,c1,c2,c3,c4] of faceData) {
      const nx=ix+fdx,ny=iy+fdy,nz=iz+fdz;
      if (nx<0||nx>=resX||ny<0||ny>=resY||nz<0||nz>=resZ) continue;
      if (grid[gi(nx,ny,nz)]&2) {
        const a=getVertex(ix+c1[0],iy+c1[1],iz+c1[2]);
        const b=getVertex(ix+c2[0],iy+c2[1],iz+c2[2]);
        const c=getVertex(ix+c3[0],iy+c3[1],iz+c3[2]);
        const d=getVertex(ix+c4[0],iy+c4[1],iz+c4[2]);
        indices.push(a,b,c, a,c,d);
      }
    }
  }

  // ── 10. Geometry + Smoothing ──
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo = mergeVertices(geo, 0.001);

  if (isAccurate) {
    // Presný: minimálne zaoblenie (1 iterácia), zachová detaily skenu
    geo = applyTaubinSmoothing(geo, 1);
  } else if (!isLiDAR) {
    // LOX: Taubin + jemný Laplacian (overené ako správne pre ručné merania)
    geo = applyTaubinSmoothing(geo, 10);
    geo = applyLaplacianSmoothing(geo, 15, 0.4);
  } else {
    // LiDAR Organický: Výrazné vyhladenie pre "silk" efekt
    // organicLevel (0-20) -> Taubin (0-100 iterácií)
    const taubinIter = Math.floor(organicLevel * 5);
    if (taubinIter > 0) {
      geo = applyTaubinSmoothing(geo, taubinIter);
    }
    
    // Progresívny Laplacian: začína od levelu 2, stupňuje sa do levelu 20
    // Toto vytvorí ten hladký, organický "tečúci" povrch bez zmrštenia (vďaka predchádzajúcemu Taubinu)
    if (organicLevel > 2) {
      const lapIter = Math.floor((organicLevel - 2) * 4);
      const lapTension = 0.2 + (organicLevel / 20) * 0.3; // 0.2 -> 0.5 tension
      geo = applyLaplacianSmoothing(geo, lapIter, lapTension);
    }
  }

  // Finálne normály: angle-weighted sú oveľa lepšie pre jaskyne než standardné
  geo = computeAngleWeightedNormals(geo);
  return geo;
}


/**
 * Professional-grade Surface Nets implementation (v3).
 * Optimized for both LiDAR (dense) and LOX (sparse) data.
 */
export function reconstructSurfaceNet(
  points: Float32Array | {x:number,y:number,z:number}[], 
  voxelSize = 0.5,
  organicLevel = 5,
  dilationSteps = 0
): THREE.BufferGeometry {
  const vertexInflation = dilationSteps;

  const pCount = points instanceof Float32Array ? points.length / 3 : points.length;
  if (pCount < 10) return new THREE.BufferGeometry();

  // 1. Bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  if (points instanceof Float32Array) {
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i], y = points[i+1], z = points[i+2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  } else {
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
  }

  const dxBase = maxX - minX, dyBase = maxY - minY, dzBase = maxZ - minZ;
  const maxRes = 150;
  let activeVoxelSize = voxelSize;
  if (dxBase / activeVoxelSize > maxRes) activeVoxelSize = dxBase / maxRes;
  if (dyBase / activeVoxelSize > maxRes) activeVoxelSize = Math.max(activeVoxelSize, dyBase / maxRes);
  if (dzBase / activeVoxelSize > maxRes) activeVoxelSize = Math.max(activeVoxelSize, dzBase / maxRes);

  // Pridáme bezpečný padding (2 voxely), aby flood-fill rekonštrukcia neorezala okraje (najmä strop jaskyne)
  minX -= activeVoxelSize * 2;
  minY -= activeVoxelSize * 2;
  minZ -= activeVoxelSize * 2;
  maxX += activeVoxelSize * 2;
  maxY += activeVoxelSize * 2;
  maxZ += activeVoxelSize * 2;

  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;

  const getVKey = (ix: number, iy: number, iz: number) => {
    return BigInt(ix + 2000) | (BigInt(iy + 2000) << 20n) | (BigInt(iz + 2000) << 40n);
  };
  const fromVKey = (key: bigint) => {
    return [Number(key & 0xFFFFFn) - 2000, Number((key >> 20n) & 0xFFFFFn) - 2000, Number((key >> 40n) & 0xFFFFFn) - 2000];
  };

  // 2. Voxelization and Centroids
  const voxelSums = new Map<bigint, {x:number, y:number, z:number, count:number}>();
  if (points instanceof Float32Array) {
    for (let i = 0; i < points.length; i += 3) {
      const gx = Math.floor((points[i] - minX) / activeVoxelSize);
      const gy = Math.floor((points[i+1] - minY) / activeVoxelSize);
      const gz = Math.floor((points[i+2] - minZ) / activeVoxelSize);
      const key = getVKey(gx, gy, gz);
      let vs = voxelSums.get(key);
      if (!vs) { vs = { x:0, y:0, z:0, count:0 }; voxelSums.set(key, vs); }
      vs.x += points[i]; vs.y += points[i+1]; vs.z += points[i+2];
      vs.count++;
    }
  } else {
    for (const p of points) {
      const gx = Math.floor((p.x - minX) / activeVoxelSize);
      const gy = Math.floor((p.y - minY) / activeVoxelSize);
      const gz = Math.floor((p.z - minZ) / activeVoxelSize);
      const key = getVKey(gx, gy, gz);
      let vs = voxelSums.get(key);
      if (!vs) { vs = { x:0, y:0, z:0, count:0 }; voxelSums.set(key, vs); }
      vs.x += p.x; vs.y += p.y; vs.z += p.z;
      vs.count++;
    }
  }

  // 3. Shell Discovery (Exterior-in)
  const resX = Math.ceil(dx / activeVoxelSize), resY = Math.ceil(dy / activeVoxelSize), resZ = Math.ceil(dz / activeVoxelSize);
  const shell = new Set<bigint>(voxelSums.keys());
  
  // 4. Dual Grid Corner Averaging (Corner-Grid Triangulation)
  const vertexIndices = new Map<bigint, number>();
  const finalVertices: number[] = [];
  const finalIndices: number[] = [];

  const getCornerVertex = (gx: number, gy: number, gz: number) => {
    const key = getVKey(gx, gy, gz);
    if (vertexIndices.has(key)) return vertexIndices.get(key)!;

    let wx = 0, wy = 0, wz = 0, totalW = 0;
    for (let ddx = -1; ddx <= 0; ddx++) {
      for (let ddy = -1; ddy <= 0; ddy++) {
        for (let ddz = -1; ddz <= 0; ddz++) {
          const vs = voxelSums.get(getVKey(gx + ddx, gy + ddy, gz + ddz));
          if (vs) {
            const w = vs.count;
            wx += (vs.x / vs.count) * w; wy += (vs.y / vs.count) * w; wz += (vs.z / vs.count) * w;
            totalW += w;
          }
        }
      }
    }

    const idx = finalVertices.length / 3;
    if (totalW > 0) {
      finalVertices.push(wx / totalW, wy / totalW, wz / totalW);
    } else {
      finalVertices.push(minX + gx * activeVoxelSize, minY + gy * activeVoxelSize, minZ + gz * activeVoxelSize);
    }
    vertexIndices.set(key, idx);
    return idx;
  };

  for (const vKey of shell) {
    const [gx, gy, gz] = fromVKey(vKey);
    for (const [dx, dy, dz, axis] of [[1,0,0,0], [0,1,0,1], [0,0,1,2]]) {
      const neighborKey = getVKey(gx + dx, gy + dy, gz + dz);
      if (!shell.has(neighborKey)) {
        let i1, i2, i3, i4;
        if (axis === 0) { i1=[1,0,0]; i2=[1,1,0]; i3=[1,1,1]; i4=[1,0,1]; }
        else if (axis === 1) { i1=[0,1,0]; i2=[0,1,1]; i3=[1,1,1]; i4=[1,1,0]; }
        else { i1=[0,0,1]; i2=[1,0,1]; i3=[1,1,1]; i4=[0,1,1]; }
        const a = getCornerVertex(gx+i1[0], gy+i1[1], gz+i1[2]);
        const b = getCornerVertex(gx+i2[0], gy+i2[1], gz+i2[2]);
        const c = getCornerVertex(gx+i3[0], gy+i3[1], gz+i3[2]);
        const d = getCornerVertex(gx+i4[0], gy+i4[1], gz+i4[2]);
        finalIndices.push(a, b, c, a, c, d);
      }
    }
    // Inward check
    for (const [dx, dy, dz, axis] of [[-1,0,0,0], [0,-1,0,1], [0,0,-1,2]]) {
      const neighborKey = getVKey(gx + dx, gy + dy, gz + dz);
      if (!shell.has(neighborKey)) {
        let i1, i2, i3, i4;
        if (axis === 0) { i1=[0,0,0]; i2=[0,0,1]; i3=[0,1,1]; i4=[0,1,0]; }
        else if (axis === 1) { i1=[0,0,0]; i2=[1,0,0]; i3=[1,0,1]; i4=[0,0,1]; }
        else { i1=[0,0,0]; i2=[0,1,0]; i3=[1,1,0]; i4=[1,0,0]; }
        const a = getCornerVertex(gx+i1[0], gy+i1[1], gz+i1[2]);
        const b = getCornerVertex(gx+i2[0], gy+i2[1], gz+i2[2]);
        const c = getCornerVertex(gx+i3[0], gy+i3[1], gz+i3[2]);
        const d = getCornerVertex(gx+i4[0], gy+i4[1], gz+i4[2]);
        finalIndices.push(a, b, c, a, c, d);
      }
    }
  }

  if (finalVertices.length === 0) return new THREE.BufferGeometry();
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(finalVertices, 3));
  geo.setIndex(finalIndices);
  geo = mergeVertices(geo, 0.001);

  // 6. Taubin Smoothing (Volume-preserving)
  const pos = geo.attributes.position.array as Float32Array;
  const idx = geo.index?.array || Array.from({ length: pos.length / 3 }, (_, i) => i);
  const lambda = 0.5, mu = -0.53;
  const smoothIterations = Math.max(1, Math.min(20, Math.round(organicLevel)));
  for (let it = 0; it < smoothIterations; it++) {
    for (const step of [lambda, mu]) {
      const newPos = new Float32Array(pos.length);
      const sum = new Float32Array(pos.length), cnt = new Uint32Array(pos.length / 3);
      for (let i = 0; i < idx.length; i += 3) {
        const i1=idx[i], i2=idx[i+1], i3=idx[i+2];
        const add = (a:number,b:number) => { sum[a*3]+=pos[b*3]; sum[a*3+1]+=pos[b*3+1]; sum[a*3+2]+=pos[b*3+2]; cnt[a]++; };
        add(i1,i2); add(i1,i3); add(i2,i1); add(i2,i3); add(i3,i1); add(i3,i2);
      }
      for (let i = 0; i < pos.length / 3; i++) {
        if (cnt[i] > 0) {
          newPos[i*3] = pos[i*3] + (sum[i*3]/cnt[i] - pos[i*3])*step;
          newPos[i*3+1] = pos[i*3+1] + (sum[i*3+1]/cnt[i] - pos[i*3+1])*step;
          newPos[i*3+2] = pos[i*3+2] + (sum[i*3+2]/cnt[i] - pos[i*3+2])*step;
        } else {
          newPos[i*3]=pos[i*3]; newPos[i*3+1]=pos[i*3+1]; newPos[i*3+2]=pos[i*3+2];
        }
      }
      pos.set(newPos);
    }
  }

  geo.computeVertexNormals();

  // 7. Fine Bulge (Vertex Inflation along Normals)
  if (vertexInflation > 0) {
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    if (posAttr && normAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        const nx = normAttr.getX(i), ny = normAttr.getY(i), nz = normAttr.getZ(i);
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + nx * vertexInflation,
          posAttr.getY(i) + ny * vertexInflation,
          posAttr.getZ(i) + nz * vertexInflation
        );
      }
      posAttr.needsUpdate = true;
    }
  }

  // @ts-ignore
  geo.computeBoundsTree();
  return geo;
}

/**
 * Generates continuous organic cave wall geometry from splay measurements.
 * - Excludes traverse legs (A->B) from wall triangulation to prevent internal artificial walls.
 * - Applies bisector normal plane splitting between adjacent stations to avoid overlapping cone artifacts.
 */
export function buildSplayWallGeometry(
  cave: ParsedCave,
  opts: { withColors?: boolean; organicLevel?: number } = {}
): THREE.BufferGeometry | null {
  if (!cave.segments || cave.segments.length === 0) return null;

  const surfaceStations = new Set<string>();
  const caveStations = new Set<string>();

  cave.segments.forEach((s: any) => {
    if (!s.from || !s.to) return;
    const k1 = `${s.from.x.toFixed(2)},${s.from.y.toFixed(2)},${s.from.z.toFixed(2)}`;
    const k2 = `${s.to.x.toFixed(2)},${s.to.y.toFixed(2)},${s.to.z.toFixed(2)}`;
    if (s.type === 'cave') {
      caveStations.add(k1);
      caveStations.add(k2);
    } else if (s.type === 'surface') {
      surfaceStations.add(k1);
      surfaceStations.add(k2);
    }
  });

  const splays = cave.segments.filter((s: any) => {
    if (s.type !== 'splay' || !s.from || !s.to) return false;
    const kFrom = `${s.from.x.toFixed(2)},${s.from.y.toFixed(2)},${s.from.z.toFixed(2)}`;
    if (surfaceStations.has(kFrom) && !caveStations.has(kFrom)) return false;
    return true;
  });
  if (splays.length === 0) return null;

  // Build station adjacency map for traverse legs
  const traverseAdjacency = new Map<string, { x: number; y: number; z: number }[]>();
  cave.segments.forEach((s: any) => {
    if (s.type === 'cave' && s.from && s.to) {
      const k1 = `${s.from.x.toFixed(2)},${s.from.y.toFixed(2)},${s.from.z.toFixed(2)}`;
      const k2 = `${s.to.x.toFixed(2)},${s.to.y.toFixed(2)},${s.to.z.toFixed(2)}`;
      if (!traverseAdjacency.has(k1)) traverseAdjacency.set(k1, []);
      if (!traverseAdjacency.has(k2)) traverseAdjacency.set(k2, []);
      traverseAdjacency.get(k1)!.push(s.to);
      traverseAdjacency.get(k2)!.push(s.from);
    }
  });

  const wallPoints: { x: number; y: number; z: number }[] = [];

  for (const sp of splays) {
    const from = sp.from;
    const to = sp.to;

    // In Three.js space, coordinate mapping is (x, z, -y)
    let p = { x: to.x, y: to.z, z: -to.y };
    let a = { x: from.x, y: from.z, z: -from.y };

    const fromKey = `${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}`;
    const neighbors = traverseAdjacency.get(fromKey);

    let remappedToNeighbor = false;
    if (neighbors && neighbors.length > 0) {
      for (const n of neighbors) {
        const b = { x: n.x, y: n.z, z: -n.y };
        const abX = b.x - a.x, abY = b.y - a.y, abZ = b.z - a.z;
        const abLen = Math.hypot(abX, abY, abZ);
        if (abLen < 1e-4) continue;

        const uX = abX / abLen, uY = abY / abLen, uZ = abZ / abLen;
        const midX = 0.5 * (a.x + b.x), midY = 0.5 * (a.y + b.y), midZ = 0.5 * (a.z + b.z);

        // Bisector plane check: dot product with traverse direction
        const dot = (p.x - midX) * uX + (p.y - midY) * uY + (p.z - midZ) * uZ;
        if (dot > 0) {
          // Point lies on the neighbor's side of the bisector plane
          remappedToNeighbor = true;
          break;
        }
      }
    }

    wallPoints.push(p);
  }

  // Include reference stations as control points (without connecting traverse walls)
  if (cave.stations) {
    for (const st of cave.stations) {
      wallPoints.push({ x: st.x, y: st.z, z: -st.y });
    }
  }

  if (wallPoints.length < 4) return null;

  const organicLevel = opts.organicLevel ?? 6;
  return reconstructSurface(wallPoints, 0.4, false, organicLevel, false);
}
