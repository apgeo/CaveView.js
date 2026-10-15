import React, { useMemo, useEffect, useState, useRef } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { elevColor, normZ } from '@shared/utils/colorUtils'
import type { ParsedCave, ViewerOptions, StationLabel, Vec3 } from '@shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CaveTexturePreset = ViewerOptions['caveTexture']

interface CaveMaterialPreset {
  texturePath: string | null
  color: string
  roughness: number
  metalness: number
  bumpScale: number
  cavityStrength: number
  edgeStrength: number
  heightShadeStrength: number
  edgeColor: string
}

const CAVE_MATERIAL_PRESETS: Record<CaveTexturePreset, CaveMaterialPreset> = {
  limestone: {
    texturePath: `${import.meta.env.BASE_URL}assets/cave_limestone.png`,
    color: '#ffffff',
    roughness: 0.68,
    metalness: 0.0,
    bumpScale: 0.72,
    cavityStrength: 0.36,
    edgeStrength: 0.11,
    heightShadeStrength: 0.2,
    edgeColor: '#dbeafe',
  },
  dolomite: {
    texturePath: null,
    color: '#f5efe4',
    roughness: 0.8,
    metalness: 0.0,
    bumpScale: 0.48,
    cavityStrength: 0.46,
    edgeStrength: 0.18,
    heightShadeStrength: 0.26,
    edgeColor: '#fdebd3',
  },
  grey_limestone: {
    texturePath: null,
    color: '#eef6ff',
    roughness: 0.82,
    metalness: 0.0,
    bumpScale: 0.44,
    cavityStrength: 0.5,
    edgeStrength: 0.2,
    heightShadeStrength: 0.28,
    edgeColor: '#bae6fd',
  },
  technical: {
    texturePath: null,
    color: '#dbeafe',
    roughness: 0.82,
    metalness: 0.0,
    bumpScale: 0.42,
    cavityStrength: 0.56,
    edgeStrength: 0.22,
    heightShadeStrength: 0.3,
    edgeColor: '#7dd3fc',
  },
}

function solveAffine(matches: { src: {x:number, y:number}, dst: {x:number, y:number} }[]) {
  const n = matches.length
  let sx=0, sy=0, sxx=0, syy=0, sxy=0, dx=0, dy=0, dxx=0, dxy=0, dyx=0, dyy=0
  for (const m of matches) {
    const x = m.src.x, y = m.src.y, u = m.dst.x, v = m.dst.y
    sx += x; sy += y; sxx += x*x; syy += y*y; sxy += x*y
    dx += u; dy += v; dxx += u*x; dxy += u*y; dyx += v*x; dyy += v*y
  }
  const det = n * (sxx * syy - sxy * sxy) - sx * (sx * syy - sy * sxy) + sy * (sx * sxy - sy * sxx)
  if (Math.abs(det) < 1e-10) return null
  const a = (dx * (sxx * syy - sxy * sxy) - sx * (dxx * syy - dxy * sxy) + sy * (dxx * sxy - dxy * sxx)) / det
  const b = (n * (dxx * syy - dxy * sxy) - dx * (sx * syy - sy * sxy) + sy * (sx * dxy - sy * dxx)) / det
  const c = (n * (sxx * dxy - sxy * dxx) - sx * (sx * dxy - sy * dxx) + dx * (sx * sxy - sy * sxx)) / det
  const d = (dy * (sxx * syy - sxy * sxy) - sx * (dyx * syy - dyy * sxy) + sy * (dyx * sxy - dyy * sxx)) / det
  const e = (n * (dyx * syy - dyy * sxy) - dy * (sx * syy - sy * sxy) + sy * (sx * dyy - sy * dyx)) / det
  const f = (n * (sxx * dyy - sxy * dyx) - sx * (sx * dyy - sy * dyx) + dy * (sx * sxy - sy * sxx)) / det
  return { a, b, c, d, e, f }
}

function parseSVGStations(svgText: string): { name: string, x: number, y: number }[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const stations: any[] = []
  doc.querySelectorAll('circle,ellipse,rect').forEach(el => {
    const id = el.getAttribute('id')
    if (id && (id.startsWith('st-') || id.includes('-st'))) {
      const name = id.replace('st-', '').replace('-st', '')
      const x = parseFloat(el.getAttribute('cx') || el.getAttribute('x') || '0')
      const y = parseFloat(el.getAttribute('cy') || el.getAttribute('y') || '0')
      stations.push({ name, x, y })
    }
  })
  return stations
}

function intersectTrianglePlane(tri: THREE.Triangle, plane: THREE.Plane, outPoints: THREE.Vector3[]) {
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
    for (let i = 0; i < vCount; i++) {
      const neighbors = adj[i];
      if (neighbors.size <= 3) {
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
    for (let i = 0; i < vCount; i++) {
      const neighbors = adj[i];
      if (neighbors.size <= 3) {
        tempArr[i*3]=posArr[i*3]; tempArr[i*3+1]=posArr[i*3+1]; tempArr[i*3+2]=posArr[i*3+2];
        continue;
      }
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
    
    if (bLen > 0 && cLen > 0) {
      const angleA = Math.acos(Math.max(-1, Math.min(1, (bLSq + cLSq - aLSq) / (2 * bLen * cLen))));
      normals[ia*3] += cb.x*angleA; normals[ia*3+1] += cb.y*angleA; normals[ia*3+2] += cb.z*angleA;
    }
    if (aLen > 0 && cLen > 0) {
      const angleB = Math.acos(Math.max(-1, Math.min(1, (aLSq + cLSq - bLSq) / (2 * aLen * cLen))));
      normals[ib*3] += cb.x*angleB; normals[ib*3+1] += cb.y*angleB; normals[ib*3+2] += cb.z*angleB;
    }
    if (aLen > 0 && bLen > 0) {
      const angleC = Math.acos(Math.max(-1, Math.min(1, (aLSq + bLSq - cLSq) / (2 * aLen * bLen))));
      normals[ic*3] += cb.x*angleC; normals[ic*3+1] += cb.y*angleC; normals[ic*3+2] += cb.z*angleC;
    }
  }
  for (let i = 0; i < vCount; i++) {
    const n = new THREE.Vector3(normals[i*3], normals[i*3+1], normals[i*3+2]);
    n.normalize();
    normals[i*3] = n.x; normals[i*3+1] = n.y; normals[i*3+2] = n.z;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

function fract(n: number): number {
  return n - Math.floor(n);
}

function hashNoise(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = fade(x - xi);
  const ty = fade(y - yi);

  const a = hashNoise(xi, yi);
  const b = hashNoise(xi + 1, yi);
  const c = hashNoise(xi, yi + 1);
  const d = hashNoise(xi + 1, yi + 1);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function createCaveReliefTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const base = valueNoise(nx * 7.0, ny * 7.0);
        const mid = valueNoise(nx * 19.0 + 13.1, ny * 19.0 + 7.7);
        const fine = valueNoise(nx * 54.0 + 3.3, ny * 54.0 + 29.4);
        const ridges = 1 - Math.abs(valueNoise(nx * 12.0 + 41.0, ny * 12.0 + 17.0) * 2 - 1);
        const height = Math.max(0, Math.min(1, base * 0.46 + mid * 0.28 + fine * 0.16 + ridges * 0.22));
        const v = Math.round(52 + height * 190);
        const i = (y * size + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function scrapViewModeToInt(mode?: ViewerOptions['scrapsViewMode']): number {
  if (mode === 'floor') return 1;
  if (mode === 'ceiling') return 2;
  if (mode === 'section') return 3;
  return 0;
}

function applyScrapSelectiveViewShader(
  shader: any,
  viewMode: number,
  heightThreshold: number,
  angleThreshold: number,
  sectionWidth: number
) {
  shader.uniforms.uScrapViewMode = { value: viewMode };
  shader.uniforms.uScrapHeightThreshold = { value: heightThreshold };
  shader.uniforms.uScrapAngleThreshold = { value: angleThreshold };
  shader.uniforms.uScrapSectionWidth = { value: sectionWidth };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float relHeight;
varying float vScrapRelHeight;
varying vec3 vScrapModelNormal;`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vScrapRelHeight = relHeight;
vScrapModelNormal = length(normal) > 0.0001 ? normalize(normal) : vec3(0.0, 1.0, 0.0);`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying float vScrapRelHeight;
varying vec3 vScrapModelNormal;
uniform int uScrapViewMode;
uniform float uScrapHeightThreshold;
uniform float uScrapAngleThreshold;
uniform float uScrapSectionWidth;`
    )
    .replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
float scrapNormalY = abs(normalize(vScrapModelNormal).y);
bool scrapFlatEnough = uScrapAngleThreshold <= 0.001 || scrapNormalY >= uScrapAngleThreshold;
bool scrapIsFloor = vScrapRelHeight < uScrapHeightThreshold && scrapFlatEnough;
bool scrapIsCeiling = vScrapRelHeight > uScrapHeightThreshold && scrapFlatEnough;
bool scrapIsSection = abs(vScrapRelHeight - uScrapHeightThreshold) <= max(uScrapSectionWidth, 0.005);

if (uScrapViewMode == 1 && !scrapIsFloor) discard;
if (uScrapViewMode == 2 && !scrapIsCeiling) discard;
if (uScrapViewMode == 3 && !scrapIsSection) discard;`
    );
}

function applyScrapWallDepthShader(
  shader: any,
  visual: {
    cavityStrength: number
    edgeStrength: number
    heightShadeStrength: number
    edgeColor: string
  }
) {
  shader.uniforms.uScrapCavityStrength = { value: visual.cavityStrength };
  shader.uniforms.uScrapEdgeStrength = { value: visual.edgeStrength };
  shader.uniforms.uScrapHeightShadeStrength = { value: visual.heightShadeStrength };
  shader.uniforms.uScrapEdgeColor = { value: new THREE.Color(visual.edgeColor) };

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform float uScrapCavityStrength;
uniform float uScrapEdgeStrength;
uniform float uScrapHeightShadeStrength;
uniform vec3 uScrapEdgeColor;`
    )
    .replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
vec3 scrapModelNormal = normalize(vScrapModelNormal);
float scrapWallFactor = smoothstep(0.18, 0.95, 1.0 - abs(scrapModelNormal.y));
float scrapCeilingFactor = smoothstep(0.58, 1.0, vScrapRelHeight);
float scrapFloorFactor = smoothstep(0.58, 1.0, 1.0 - vScrapRelHeight);
float scrapCavity = clamp(scrapWallFactor * 0.58 + scrapCeilingFactor * 0.2 + scrapFloorFactor * 0.1, 0.0, 1.0);
float scrapRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.25);
float scrapHeightShade = mix(0.86, 1.08, clamp(vScrapRelHeight, 0.0, 1.0));
outgoingLight *= max(0.18, 1.0 - scrapCavity * uScrapCavityStrength);
outgoingLight *= mix(1.0, scrapHeightShade, uScrapHeightShadeStrength);
outgoingLight += uScrapEdgeColor * scrapRim * uScrapEdgeStrength;`
    );
}

function applyScrapCombinedShader(
  shader: any,
  viewMode: number,
  heightThreshold: number,
  angleThreshold: number,
  sectionWidth: number,
  visual: {
    cavityStrength: number
    edgeStrength: number
    heightShadeStrength: number
    edgeColor: string
  }
) {
  applyScrapSelectiveViewShader(shader, viewMode, heightThreshold, angleThreshold, sectionWidth);
  applyScrapWallDepthShader(shader, visual);
}

export function buildScrapsGeo(cave: ParsedCave, withColors: boolean, smooth: boolean, organicLevel: number): THREE.BufferGeometry | null {
  if (!cave.scraps?.length) return null

  let minZ = Infinity, maxZ = -Infinity
  let numVertices = 0
  let numFaces = 0

  for (const sc of cave.scraps) {
    numVertices += sc.vertices.length
    numFaces += sc.faces.length
    if (withColors) {
      for (const v of sc.vertices) {
        if (v.z < minZ) minZ = v.z
        if (v.z > maxZ) maxZ = v.z
      }
    }
  }

  if (numVertices === 0 || numFaces === 0) return null
  const positions = new Float32Array(numVertices * 3)
  const uvs = new Float32Array(numVertices * 2)
  const colors = withColors ? new Float32Array(numVertices * 3) : null
  const relHeights = new Float32Array(numVertices)
  const indices = new Uint32Array(numFaces * 3)

  const isHuge = numVertices > 1000000
  if (isHuge) console.warn('Model is huge, disabling advanced smoothing to prevent crash');

  let base = 0
  let vIdx = 0
  let uvIdx = 0
  let cIdx = 0
  let rIdx = 0
  let iIdx = 0

  for (const sc of cave.scraps) {
    for (const v of sc.vertices) {
      positions[vIdx++] = v.x
      positions[vIdx++] = v.z
      positions[vIdx++] = -v.y

      uvs[uvIdx++] = v.x * 0.2
      uvs[uvIdx++] = (v.z + v.y) * 0.2

      relHeights[rIdx++] = v.relHeight || 0.0

      if (withColors && colors) {
        const c = elevColor(normZ(v.z, minZ, maxZ))
        colors[cIdx++] = c.r
        colors[cIdx++] = c.g
        colors[cIdx++] = c.b
      }
    }

    for (const [a, b, c] of sc.faces) {
      if (a < sc.vertices.length && b < sc.vertices.length && c < sc.vertices.length) {
        indices[iIdx++] = base + a
        indices[iIdx++] = base + b
        indices[iIdx++] = base + c
      }
    }
    base += sc.vertices.length
  }

  let g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2))
  g.setAttribute('relHeight', new THREE.BufferAttribute(relHeights, 1))
  if (withColors && colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  
  if (iIdx < indices.length) {
    g.setIndex(new THREE.BufferAttribute(indices.subarray(0, iIdx), 1))
  } else {
    g.setIndex(new THREE.BufferAttribute(indices, 1))
  }
  
  if (smooth && !isHuge) {
    g = mergeVertices(g, 1e-3)
    g = applyTaubinSmoothing(g, Math.max(1, Math.min(20, Math.round(organicLevel))))
    g = computeAngleWeightedNormals(g)
  } else {
    g.computeVertexNormals()
  }
  
  if (!isHuge) {
    // @ts-ignore
    g.computeBoundsTree?.()
  }
  
  return g
}

// ─── Components ───────────────────────────────────────────────────────────────

export const ClippingEdges = React.memo(({ geo, planes, active, color = "#ff4444" }: { geo: THREE.BufferGeometry | null, planes: THREE.Plane[], active: boolean, color?: string }) => {
  const lineRef = useRef<THREE.LineSegments>(null!);
  const [lineGeo] = useState(() => new THREE.BufferGeometry());
  const [posAttr] = useState(() => new THREE.BufferAttribute(new Float32Array(30000), 3));
  const p1 = useMemo(() => new THREE.Vector3(), []);
  const p2 = useMemo(() => new THREE.Vector3(), []);
  const points = useMemo(() => [p1, p2], [p1, p2]);

  useEffect(() => {
    lineGeo.setAttribute('position', posAttr);
  }, [lineGeo, posAttr]);

  useEffect(() => {
    // @ts-ignore
    if (!active || planes.length === 0 || !geo || !geo.boundsTree || !lineRef.current) {
      if (lineRef.current) lineRef.current.visible = false;
      return;
    }

    lineRef.current.visible = true;
    let segmentCount = 0;
    const array = posAttr.array as Float32Array;

    planes.forEach(plane => {
      // @ts-ignore
      geo.boundsTree.shapecast({
        intersectsBounds: box => plane.intersectsBox(box),
        intersectsTriangle: (tri) => {
          if (intersectTrianglePlane(tri, plane, points)) {
            const idx = segmentCount * 6;
            if (idx + 5 < array.length) {
              array[idx]   = points[0].x; array[idx+1] = points[0].y; array[idx+2] = points[0].z;
              array[idx+3] = points[1].x; array[idx+4] = points[1].y; array[idx+5] = points[1].z;
              segmentCount++;
            }
          }
        }
      });
    });

    lineGeo.setDrawRange(0, segmentCount * 2);
    posAttr.needsUpdate = true;
  }, [geo, planes, active]);

  return (
    <lineSegments ref={lineRef} geometry={lineGeo} renderOrder={1000} frustumCulled={false}>
      <lineBasicMaterial color={color} linewidth={3} depthTest={false} transparent opacity={1.0} />
    </lineSegments>
  );
});

export const Scraps = React.memo(({ cave, opacity, showSolid, showWire, showAltitude, smooth, showRender, caveTexture, renderOpacity, isMoving, options, ...props }: {
  cave: ParsedCave; opacity: number
  showSolid: boolean; showWire: boolean; showAltitude: boolean; smooth: boolean; showRender: boolean
  caveTexture: CaveTexturePreset
  renderOpacity: number
  isMoving: boolean
  options: ViewerOptions
  clippingPlanes?: THREE.Plane[]
  onSurfaceClick?: (origX: number, origY: number, altitude: number, screenX: number, screenY: number) => void
  onProcessingStart?: (i: string) => void
  onProcessingEnd?: () => void
}) => {
  const { onProcessingStart, onProcessingEnd, onSurfaceClick } = props as any;
  const [geos, setGeos] = useState<{ solid: THREE.BufferGeometry | null, alt: THREE.BufferGeometry | null }>({ solid: null, alt: null })
  const [floorTex, setFloorTex] = useState<THREE.Texture | null>(null)
  const [floorAffine, setFloorAffine] = useState<{a:number,b:number,c:number,d:number,e:number,f:number} | null>(null)

  useEffect(() => {
    if (geos.solid) {
      // @ts-ignore
      geos.solid.computeBoundsTree?.();
    }
    if (geos.alt) {
      // @ts-ignore
      geos.alt.computeBoundsTree?.();
    }
  }, [geos]);

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    if (!options.floorMapSvg && !options.floorMapTh2) { setFloorTex(null); return }
    
    if (options.floorMapSvg) {
      const isDataUrl = options.floorMapSvg.startsWith('data:image')
      let processedSvg = options.floorMapSvg
      
      if (!isDataUrl) {
        processedSvg = processedSvg.replace(/fill=["']#?ffffff["']/gi, 'fill="none" fill-opacity="0"')
        processedSvg = processedSvg.replace(/fill=["']white["']/gi, 'fill="none" fill-opacity="0"')
        processedSvg = processedSvg.replace(/fill=["']#?f2f4ea["']/gi, 'fill="none" fill-opacity="0"')
        processedSvg = processedSvg.replace(/fill=["']#?f9f9f7["']/gi, 'fill="none" fill-opacity="0"')
        processedSvg = processedSvg.replace(/stroke=["']#?ffffff["']/gi, 'stroke="none" stroke-opacity="0"')
        const styleInjection = `<style>svg { background: transparent !important; } rect[fill="#f2f4ea"], path[fill="#f2f4ea"], rect[fill="#f9f9f7"] { display: none !important; } [fill="white"], [fill="#ffffff"] { fill: none !important; fill-opacity: 0 !important; }</style>`
        processedSvg = processedSvg.replace(/(<svg[^>]*>)/i, `$1${styleInjection}`)
      }

      const img = new Image()
      const url = isDataUrl ? options.floorMapSvg : URL.createObjectURL(new Blob([processedSvg], { type: 'image/svg+xml;charset=utf-8' }))
      if (!isDataUrl) objectUrl = url
      img.onload = () => {
        const tex = new THREE.Texture(img); tex.needsUpdate = true
        if (active) setFloorTex(tex)
        else tex.dispose()
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
        }
      }
      img.src = url

      if (options.manualMatches && options.manualMatches.length >= 2) {
        setFloorAffine(solveAffine(options.manualMatches))
      } else {
        const svgStations = parseSVGStations(options.floorMapSvg)
        const matches: any[] = []
        svgStations.forEach(ss => {
          const caveS = cave.stationLabels.find((l: StationLabel) => l.name === ss.name)
          if (caveS) matches.push({ src: { x: caveS.pos.x, y: -caveS.pos.z }, dst: { x: ss.x, y: ss.y } })
        })
        if (matches.length >= 2) setFloorAffine(solveAffine(matches))
      }
    } else if (options.floorMapTh2) {
      const scraps = options.floorMapTh2 as any[]
      const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 2048
      const ctx = canvas.getContext('2d')
      if (ctx) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        scraps.forEach(s => {
          s.lines.forEach((l: any) => l.points.forEach((p: any) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }))
          s.points.forEach((p: any) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) })
        })
        const w = maxX - minX, h = maxY - minY, pad = 20
        const scale = Math.min((canvas.width-pad*2)/w, (canvas.height-pad*2)/h)
        const ox = (canvas.width - w*scale)/2 - minX*scale, oy = (canvas.height - h*scale)/2 - minY*scale
        ctx.clearRect(0,0,2048,2048); ctx.strokeStyle = 'white'; ctx.lineWidth = 2
        scraps.forEach(s => s.lines.forEach((l: any) => { ctx.beginPath(); l.points.forEach((p: any, i: number) => { if (i===0) ctx.moveTo(p.x*scale+ox, p.y*scale+oy); else ctx.lineTo(p.x*scale+ox, p.y*scale+oy) }); ctx.stroke() }))
        const tex = new THREE.CanvasTexture(canvas); setFloorTex(tex)
        const matches: any[] = []
        scraps.forEach(s => s.points.forEach((p: any) => { const caveS = cave.stationLabels.find(l => l.name === p.name); if (caveS) matches.push({ src: { x: caveS.pos.x, y: -caveS.pos.z }, dst: { x: p.x, y: p.y } }) }))
        if (matches.length >= 2) setFloorAffine(solveAffine(matches))
      }
    }

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [options.floorMapSvg, options.floorMapTh2, options.manualMatches, cave])

  useEffect(() => {
    return () => floorTex?.dispose()
  }, [floorTex])

  useEffect(() => {
    if (onProcessingStart) onProcessingStart('Generujem steny jaskyne...')
    
    let currentSolid: THREE.BufferGeometry | null = null
    let currentAlt: THREE.BufferGeometry | null = null

    const timer = setTimeout(() => {
      currentSolid = buildScrapsGeo(cave, false, smooth, options.organicLevel)
      currentAlt = buildScrapsGeo(cave, true, smooth, options.organicLevel)
      setGeos({ solid: currentSolid, alt: currentAlt })
      if (onProcessingEnd) onProcessingEnd()
    }, 50)

    return () => {
      clearTimeout(timer)
      if (currentSolid) currentSolid.dispose()
      if (currentAlt) currentAlt.dispose()
    }
  }, [cave, smooth, options.organicLevel])

  const solidGeo = geos.solid
  const altGeo = geos.alt
 
  const materialPreset = CAVE_MATERIAL_PRESETS[caveTexture] || CAVE_MATERIAL_PRESETS.limestone
  const reliefTex = useMemo(() => createCaveReliefTexture(), [])
  const reliefStrength = Math.max(0, Math.min(1, options.scrapsRelief ?? 0.35))
  const reliefMap = reliefStrength > 0 ? reliefTex : null
  const scrapViewMode = options.scrapsViewMode ?? 'all'
  const scrapFilterMode = scrapViewModeToInt(scrapViewMode)
  const scrapHeightThreshold = Math.max(-1, Math.min(1, options.scrapsHeightThreshold ?? 0.1))
  const scrapAngleThreshold = Math.max(0, Math.min(0.95, options.scrapsAngleThreshold ?? 0))
  const scrapSectionWidth = Math.max(0.005, Math.min(0.5, options.scrapsSectionWidth ?? 0.08))
  const scrapFilterKey = `${scrapFilterMode}-${scrapHeightThreshold.toFixed(2)}-${scrapAngleThreshold.toFixed(2)}-${scrapSectionWidth.toFixed(2)}`
  const scrapVisualKey = `${caveTexture}-${reliefStrength.toFixed(2)}-${materialPreset.cavityStrength.toFixed(2)}-${materialPreset.edgeStrength.toFixed(2)}`
  const applyScrapFilter = (shader: any) => {
    applyScrapCombinedShader(shader, scrapFilterMode, scrapHeightThreshold, scrapAngleThreshold, scrapSectionWidth, {
      cavityStrength: materialPreset.cavityStrength,
      edgeStrength: materialPreset.edgeStrength,
      heightShadeStrength: materialPreset.heightShadeStrength,
      edgeColor: materialPreset.edgeColor,
    })
  }

  useEffect(() => {
    return () => reliefTex.dispose()
  }, [reliefTex])

  const [rockTex, setRockTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!materialPreset.texturePath) {
      setRockTex(null)
      return
    }
    
    const tex = new THREE.TextureLoader().load(materialPreset.texturePath)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(10, 10)
    tex.colorSpace = THREE.SRGBColorSpace
    setRockTex(tex)
    
    return () => tex.dispose()
  }, [materialPreset.texturePath])

  const handlePointerDown = (e: any) => {
    if (!onSurfaceClick) return
    e.stopPropagation()
    const p = e.point
    if (!p) return
    const ox = cave.centerOffset?.x || 0
    const oy = cave.centerOffset?.y || 0
    const oz = cave.centerOffset?.z || 0
    const realX = p.x + ox
    const realY = -p.z + oy
    const realZ = p.y + oz
    onSurfaceClick(realX, realY, realZ, e.clientX, e.clientY)
  }

  return (
    <>
      {/* ── Tieňovaný solid mesh ── */}
      {showSolid && !showRender && solidGeo && (
        <mesh geometry={solidGeo} renderOrder={5} onPointerDown={handlePointerDown}>
          <meshStandardMaterial
            key={`solid-${scrapFilterKey}-${scrapVisualKey}`}
            color={options.colorScraps}
            side={THREE.DoubleSide}
            transparent={opacity < 1}
            opacity={opacity}
            roughness={materialPreset.roughness}
            metalness={materialPreset.metalness}
            bumpMap={reliefMap}
            bumpScale={reliefStrength * materialPreset.bumpScale * (smooth ? 0.46 : 0.78)}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
            clippingPlanes={props.clippingPlanes}
            onBeforeCompile={applyScrapFilter}
          />
        </mesh>
      )}

      {/* ── Realistický render mode s textúrou ── */}
      {showRender && solidGeo && (
        <mesh geometry={solidGeo} renderOrder={4} onPointerDown={handlePointerDown}>
          <meshStandardMaterial
            key={`render-${scrapFilterKey}-${scrapVisualKey}`}
            map={rockTex || null}
            color={materialPreset.color}
            side={THREE.DoubleSide}
            transparent={renderOpacity < 1}
            opacity={renderOpacity}
            roughness={materialPreset.roughness}
            metalness={materialPreset.metalness}
            emissive={caveTexture === 'technical' ? '#07111f' : '#000000'}
            emissiveIntensity={caveTexture === 'technical' ? 0.08 : 0}
            bumpMap={reliefMap}
            bumpScale={reliefStrength * materialPreset.bumpScale * (smooth ? 0.58 : 1.0)}
            polygonOffset
            polygonOffsetFactor={0.5}
            polygonOffsetUnits={0.5}
            clippingPlanes={props.clippingPlanes}
            onBeforeCompile={applyScrapFilter}
          />
        </mesh>
      )}

      {/* ── Farebné podľa výšky ── */}
      {showAltitude && altGeo && (
        <mesh geometry={altGeo} renderOrder={3} onPointerDown={handlePointerDown}>
          <meshStandardMaterial
            key={`altitude-${scrapFilterKey}-${scrapVisualKey}`}
            vertexColors
            side={THREE.DoubleSide}
            transparent={opacity < 1}
            opacity={opacity}
            roughness={materialPreset.roughness}
            metalness={materialPreset.metalness}
            bumpMap={reliefMap}
            bumpScale={reliefStrength * materialPreset.bumpScale * (smooth ? 0.38 : 0.68)}
            clippingPlanes={props.clippingPlanes}
            onBeforeCompile={applyScrapFilter}
          />
        </mesh>
      )}

      {/* ── Pôdorysná Mapa (Projektovaná) ── */}
      {floorTex && floorAffine && solidGeo && (
        <mesh geometry={solidGeo} renderOrder={6} onPointerDown={handlePointerDown}>
          <meshBasicMaterial 
            map={floorTex} 
            transparent 
            opacity={options.floorMapOpacity} 
            side={THREE.DoubleSide}
            depthWrite={false}
            polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
            clippingPlanes={props.clippingPlanes}
            onBeforeCompile={(shader) => {
              shader.uniforms.uAffine = { value: [
                floorAffine.a, floorAffine.b, floorAffine.c,
                floorAffine.d, floorAffine.e, floorAffine.f
              ] };
              shader.vertexShader = `
                uniform float uAffine[6];
                varying vec2 vFloorUv;
                ${shader.vertexShader}
              `.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 float vx = position.x + ${cave.centerOffset?.x || 0.0};
                 float vy = -position.z + ${cave.centerOffset?.y || 0.0};
                 float svgX = uAffine[0] * vx + uAffine[1] * vy + uAffine[2];
                 float svgY = uAffine[3] * vx + uAffine[4] * vy + uAffine[5];
                 vFloorUv = vec2(svgX, svgY);
                `
              );
              shader.fragmentShader = `
                varying vec2 vFloorUv;
                ${shader.fragmentShader}
              `.replace(
                '#include <map_fragment>',
                `
                #ifdef USE_MAP
                  vec2 texSize = vec2(textureSize(map, 0));
                  vec2 normUv = vFloorUv / texSize;
                  if (normUv.x < 0.0 || normUv.x > 1.0 || normUv.y < 0.0 || normUv.y > 1.0) {
                    diffuseColor.a = 0.0;
                  } else {
                    diffuseColor *= texture2D(map, normUv);
                  }
                #endif
                `
              );
            }}
          />
        </mesh>
      )}

      {/* ── Drôtený model ── */}
      {(showWire || isMoving) && solidGeo && (
        <mesh geometry={solidGeo} renderOrder={10}>
          <meshBasicMaterial color={options.colorScrapsWire} wireframe depthWrite={false} transparent={true}
            opacity={isMoving ? 0.3 : (showSolid || showAltitude ? 0.28 : 0.65)} 
            clippingPlanes={props.clippingPlanes} />
        </mesh>
      )}

      <ClippingEdges
        geo={showAltitude ? altGeo : solidGeo}
        planes={props.clippingPlanes || []}
        active={options.showClippingEdges}
        color={options.colorClippingEdges}
      />
    </>
  )
});
