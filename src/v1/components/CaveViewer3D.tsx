import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Html, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { reconstructSurface } from '@shared/utils/surfaceReconstruction'

import { downloadTiledXyz, downloadWmsImage, selectBestXyzZoom, type DownloadResult, type Progress, type TextureDownloadInspector, type WmsCrs } from '@shared/utils/XyzTileDownloader'
import { buildMapProxyUrlCandidates } from '@shared/utils/mapProxyUrls'
import { getTextureBboxInDtmCrs } from '@shared/utils/surfaceBounds'
import { 
  Stations, 
  StationLabels, 
  CaveLegs, 
  EntranceMarkers, 
  Character3D, 
  ManualConnection 
} from '@shared/components/CaveSharedElements'
import { SurfaceDepthVisual } from '@shared/components/SurfaceDepthVisual'
import { TectonicPlaneVisual } from '@shared/components/TectonicPlaneVisual'
import { SurveyPointPicker } from '@shared/components/SurveyPointPicker'
import { MeasurementOverlay } from '@shared/components/MeasurementOverlay'
import { Scraps, ClippingEdges } from '@shared/components/Scraps'
import { SplayCaveWalls } from './SplayCaveWalls'
import { EDLPass } from '../../v2/components/EDLPass'
import { ProjectionController, calculateFitParams } from '@shared/components/ProjectionController'
import { elevColor, normZ } from '@shared/utils/colorUtils'
import type { ParsedCave, StationLabel, CaveSurface, Segment, ViewerCameraSnapshot, Vec3 } from '@shared/types'
import type { SelStation } from '../../App'
import type { ViewerOptions } from '@shared/types'


// ─── BVH Initialization ───────────────────────────────────────────────────────
// @ts-ignore
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// @ts-ignore
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// @ts-ignore
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const _tri = new THREE.Triangle();
const _line = new THREE.Line3();

/**
 * Robust intersection between a triangle and a plane.
 * Returns 2 points if they intersect, forming a line segment.
 */

// ─── Clipping Edges Highlight Component ───────────────────────────────────────

// ─── LiDAR Classification Colors ──────────────────────────────────────────────
const CLASSIFICATION_COLORS: Record<number, THREE.Color> = {
  1:  new THREE.Color(0x888888), // Unclassified
  2:  new THREE.Color(0xd2b48c), // Ground (Tan)
  3:  new THREE.Color(0x228b22), // Low Veg
  4:  new THREE.Color(0x006400), // Medium Veg
  5:  new THREE.Color(0x004d00), // High Veg
  6:  new THREE.Color(0xff0000), // Building
  10: new THREE.Color(0x4169e1), // Custom: Cave (Royal Blue)
};

// ─── Point Cloud (LiDAR) ──────────────────────────────────────────────────────
const PointCloud = React.memo(({ cave, options, clippingPlanes, onSurfaceClick, isMoving }: { cave: ParsedCave, options: ViewerOptions, clippingPlanes: any[], onSurfaceClick?: any, isMoving?: boolean }) => {
  // Ak je zapnuté vyhladenie (Organic), presný mesh (Accurate), drôtený model alebo Surface Nets, mračno bodov skryjeme
  if (options.smoothScraps || options.accurateScraps || options.scrapsWireframe || options.useSurfaceNet) return null;

  const pointsRef = useRef<THREE.Points>(null!);

  // ── Zostavenie geometrie + stride-based LOD indexov ──────────────────────
  // Stride = každý K-tý bod → ROVNOMERNÉ pokrytie celého modelu
  const { geo, lods } = useMemo(() => {
    const empty = { geo: null as THREE.BufferGeometry|null, lods: [] as Uint32Array[] };
    if (!cave.points || cave.pointCount === 0) return empty;
    
    const count  = cave.pointCount;
    const pos    = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const minZ   = cave.bounds.min.z;
    const maxZ   = cave.bounds.max.z;
    const hasClr = cave.pointColors && cave.pointColors.length >= count * 3;

    let visibleCount = 0;

    for (let i = 0; i < count; i++) {
      const p = i * 3;
      const x = cave.points[p], y = cave.points[p+1], z = cave.points[p+2];

      if (cave.pointClassification && cave.pointClassification.length > i) {
        const cls = cave.pointClassification[i];
        if (cls >= 3 && cls <= 5 && !options.showVegetation) continue;
        if (cls === 2  && !options.showGround)    continue;
        if (cls === 10 && !options.showCaveLiDAR) continue;
      }

      const out = visibleCount * 3;
      pos[out] = x; pos[out+1] = z; pos[out+2] = -y;

      if (options.scrapsAltitude) {
        const c = elevColor(normZ(z, minZ, maxZ));
        colors[out] = c.r; colors[out+1] = c.g; colors[out+2] = c.b;
      } else if (hasClr) {
        colors[out] = cave.pointColors![p]; colors[out+1] = cave.pointColors![p+1]; colors[out+2] = cave.pointColors![p+2];
      } else {
        colors[out] = 1; colors[out+1] = 1; colors[out+2] = 1;
      }
      visibleCount++;
    }

    if (visibleCount === 0) return empty;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, visibleCount * 3), 3));
    g.setAttribute('color',    new THREE.BufferAttribute(colors.slice(0, visibleCount * 3), 3));

    const buildIdx = (stride: number) => {
      const n = Math.ceil(visibleCount / stride);
      const idx = new Uint32Array(n);
      for (let j = 0; j < n; j++) idx[j] = Math.min(j * stride, visibleCount - 1);
      return idx;
    };

    // 5 úrovní kvality: [0]=16x, [1]=8x, [2]=4x, [3]=2x, [4]=1x (plná)
    return {
      geo:  g,
      lods: [buildIdx(16), buildIdx(8), buildIdx(4), buildIdx(2), buildIdx(1)]
    };
  }, [cave.points, cave.pointCount, cave.pointColors, cave.pointClassification, cave.bounds, options.scrapsAltitude, options.showVegetation, options.showGround, options.showCaveLiDAR]);

  useEffect(() => {
    return () => {
      if (geo) {
        // @ts-ignore
        if (geo.boundsTree) geo.disposeBoundsTree();
        geo.dispose();
      }
    };
  }, [geo]);

  // ── Progresívne zjemňovanie (Refinement) v useFrame ───────────────────────
  const lodState = useRef({ index: 0, lastUpdate: 0 });

  useFrame((state) => {
    if (!pointsRef.current || !geo || lods.length === 0) return;

    const now = state.clock.getElapsedTime() * 1000;
    const targetIdx = isMoving ? 0 : 4; // pri pohybe 16x, v kľude 1x (plná)

    // Ak sa pohybujeme, okamžite skočíme na najnižšiu kvalitu
    if (isMoving) {
      if (lodState.current.index !== 0) {
        lodState.current.index = 0;
        geo.setIndex(new THREE.BufferAttribute(lods[0], 1));
        geo.index!.needsUpdate = true;
      }
      return;
    }

    // Ak stojíme a ešte nie sme na plnej kvalite, postupne pridávame body
    if (lodState.current.index < 4 && now - lodState.current.lastUpdate > 150) {
      lodState.current.index++;
      lodState.current.lastUpdate = now;
      geo.setIndex(new THREE.BufferAttribute(lods[lodState.current.index], 1));
      geo.index!.needsUpdate = true;
    }
  });

  if (!geo) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geo}
      renderOrder={15}
      onClick={onSurfaceClick ? (e) => {
        if (e.delta > 5) return
        e.stopPropagation();
        const p = e.index !== undefined
          ? new THREE.Vector3().fromBufferAttribute(geo.getAttribute('position'), e.index).applyMatrix4(e.object.matrixWorld)
          : e.point;
        onSurfaceClick(p.x + cave.centerOffset.x, -p.z + cave.centerOffset.y, p.y + cave.centerOffset.z, e.clientX, e.clientY);
      } : undefined}
    >
      <pointsMaterial
        vertexColors
        size={0.15}
        sizeAttenuation={true}
        transparent={options.scrapsOpacity < 1}
        opacity={options.scrapsOpacity}
        clippingPlanes={clippingPlanes}
      />
    </points>
  );
});


const OrganicShell = React.memo(({ cave, options, clippingPlanes, onSurfaceClick, isMoving }: { cave: ParsedCave, options: ViewerOptions, clippingPlanes: any[], onSurfaceClick?: any, isMoving?: boolean }) => {
  // Organický voxelový model používame LEN pre LiDAR mračná bodov.
  // Pre LOX (bežné jaskyne) používame vyhladenie pôvodných stien (CaveScraps).
  if (!cave.isLiDAR) return null;
  if (!options.smoothScraps && !options.accurateScraps && !options.scrapsWireframe) return null;

  const geo = useMemo(() => {
    if (!cave.points || cave.points.length === 0) return null;
    
    const vSize = 0.3; 
    const dilation = 0.2; 

    // ── Filtrovanie bodov pre rekonštrukciu ──
    let reconstructionPoints = cave.points;
    const hasNativeClasses = cave.pointClassification && 
      Array.from(cave.pointClassification).some((c: number) => c > 1);
    
    if (hasNativeClasses && cave.pointClassification) {
      // Natívna klasifikácia: vylúč len jednoznačný vonkajší terén
      const filtered: number[] = [];
      for (let i = 0; i < cave.pointCount; i++) {
        const cls = cave.pointClassification[i];
        if (cls !== 2 && cls !== 4) { 
          filtered.push(cave.points![i*3], cave.points![i*3+1], cave.points![i*3+2]);
        }
      }
      reconstructionPoints = new Float32Array(filtered);
    }

    if (reconstructionPoints.length === 0) return null;

    const g = reconstructSurface(
      reconstructionPoints, 
      vSize, 
      options.accurateScraps, 
      options.organicLevel, 
      true, 
      undefined,
      dilation
    );
    
    if (!g.getAttribute('position')) return null;
    
    // @ts-ignore
    g.computeBoundsTree();
    
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const minZ = cave.bounds.min.z;
    const maxZ = cave.bounds.max.z;
    
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      pos.setXYZ(i, px, pz, -py);

      if (options.scrapsAltitude) {
        const alt = pos.getY(i); 
        const c = elevColor(normZ(alt, minZ, maxZ));
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      } else {
        colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
      }
    }
    
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [cave.points, cave.pointClassification, cave.pointCount, cave.bounds, options.scrapsAltitude, options.smoothScraps, options.accurateScraps, options.organicLevel, options.colorScraps]);

  useEffect(() => {
    return () => {
      if (geo) {
        // @ts-ignore
        if (geo.boundsTree) geo.disposeBoundsTree();
        geo.dispose();
      }
    };
  }, [geo]);

  if (!geo) return null;
  const showSolid = options.smoothScraps || options.accurateScraps;

  return (
    <>
      {showSolid && (
        <mesh 
          geometry={geo} 
          renderOrder={10}
          onClick={onSurfaceClick ? (e) => {
            if (e.delta > 5) return
            e.stopPropagation();
            const p = e.point;
            onSurfaceClick(p.x + cave.centerOffset.x, -p.z + cave.centerOffset.y, p.y + cave.centerOffset.z, e.clientX, e.clientY);
          } : undefined}
        >
          <meshStandardMaterial 
            vertexColors={true}
            color={options.scrapsAltitude ? '#ffffff' : options.colorScraps} 
            side={THREE.DoubleSide}
            roughness={0.6}
            metalness={0.1}
            transparent={options.scrapsOpacity < 1}
            opacity={options.scrapsOpacity}
            clippingPlanes={clippingPlanes}
          />
        </mesh>
      )}
      
      {(options.scrapsWireframe || options.accurateScraps) && (
        <mesh geometry={geo} renderOrder={11}>
          <meshBasicMaterial 
            vertexColors={true}
            color={options.scrapsAltitude ? '#ffffff' : options.colorScraps} 
            wireframe={true} 
            transparent={true} 
            opacity={showSolid ? 0.4 : 0.8} 
            clippingPlanes={clippingPlanes} 
          />
        </mesh>
      )}
      
      <ClippingEdges geo={geo} planes={clippingPlanes} active={options.showClippingEdges} color={options.colorClippingEdges} />
    </>
  );
})

// ─── Modern Gizmo (Full circles, thin lines) ───
// ─── Modern Gizmo (Full circles, thin lines) ───
const ModernGizmo = ({ visible, modelScale }: { visible: boolean, modelScale: number }) => {
  if (!visible) return null;
  
  // Hrúbka čiar musí byť konzistentná vizuálne.
  // Použijeme vzorec, ktorý zabezpečí, že na veľkých modeloch nebudú čiary obrovské,
  // ale na malých ostanú dostatočne hrubé.
  const tubeWidth = 0.001 + 0.015 / Math.max(1, modelScale); 

  return (
    <group scale={modelScale} renderOrder={999}>
      {/* X Axis & Ring (Red) */}
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1, tubeWidth, 16, 100]} />
        <meshBasicMaterial color="#ff4d4d" transparent opacity={0.7} depthTest={false} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[tubeWidth, tubeWidth, 2.4, 8]} />
        <meshBasicMaterial color="#ff4d4d" transparent opacity={0.4} depthTest={false} />
      </mesh>

      {/* Y Axis & Ring (Green) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, tubeWidth, 16, 100]} />
        <meshBasicMaterial color="#4dff88" transparent opacity={0.7} depthTest={false} />
      </mesh>
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[tubeWidth, tubeWidth, 2.4, 8]} />
        <meshBasicMaterial color="#4dff88" transparent opacity={0.4} depthTest={false} />
      </mesh>

      {/* Z Axis & Ring (Blue) */}
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[1, tubeWidth, 16, 100]} />
        <meshBasicMaterial color="#4d88ff" transparent opacity={0.7} depthTest={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[tubeWidth, tubeWidth, 2.4, 8]} />
        <meshBasicMaterial color="#4d88ff" transparent opacity={0.4} depthTest={false} />
      </mesh>

      {/* Outer White Ring */}
      <mesh>
        <torusGeometry args={[1.2, tubeWidth * 0.5, 16, 100]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.15} depthTest={false} />
      </mesh>
    </group>
  );
};

// Survey selection uses a fixed screen-space tolerance in both engines.

// ─── Elevation colormap ───────────────────────────────────────────────────────
// Hladký prechod: tmavá modrá → azúrová → zelená → žltá → oranžová → červená


// ─── Dynamic Grid ─────────────────────────────────────────────────────────────
function DynamicGrid({ options, cameraData }: { options: ViewerOptions, cameraData: { dist: number, fov: number, height: number } | null }) {
  if (!options.showGrid) return null

  // Výpočet "peknej" veľkosti mriežky podobne ako ScaleBar
  const targetPx = 80 // chceme mriežku zhruba 80px veľkú
  const dist = cameraData?.dist || 100
  const height = cameraData?.height || 600
  const fov = cameraData?.fov || 45
  
  const vFov = (fov * Math.PI) / 180
  const visibleHeight = 2 * Math.tan(vFov / 2) * dist
  const pixelsPerUnit = height / visibleHeight
  
  const targetUnits = targetPx / pixelsPerUnit
  const niceUnits = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  let best = niceUnits[0]
  for (const u of niceUnits) if (Math.abs(u - targetUnits) < Math.abs(best - targetUnits)) best = u

  return (
    <Grid 
      infiniteGrid 
      fadeDistance={best * 25} 
      fadeStrength={5} 
      sectionSize={best * 10} 
      sectionColor={options.colorGrid} 
      sectionThickness={1.2}
      cellSize={best} 
      cellColor={options.colorGrid} 
      cellThickness={0.5}
      position={[0, -0.05, 0]} 
    />
  )
}

// ─── Bounding Box ─────────────────────────────────────────────────────────────
function BoundingBox({ cave, show, options: o }: { cave: ParsedCave, show: boolean, options: ViewerOptions }) {
  if (!show) return null

  // Výpočet kombinovaných hraníc
  const box = useMemo(() => {
    const b = new THREE.Box3()
    // Základ: jaskynné merania
    b.min.set(cave.bounds.min.x, cave.bounds.min.z, -cave.bounds.max.y)
    b.max.set(cave.bounds.max.x, cave.bounds.max.z, -cave.bounds.min.y)

    const surfaceVisible = o.showSurfaceMesh || o.showSurfaceMeshWire || o.showSurfaceTexture || o.showSurfaceNetwork
    if (surfaceVisible && cave.surfaces) {
      cave.surfaces.forEach((s: CaveSurface) => {
        const { dtm, centerOffset: cx } = s
        const { calib, data } = dtm
        
        // Rozsah v rovine XZ (Three.js coords)
        const corners = [
          { c: 0, r: 0 },
          { c: dtm.samples - 1, r: 0 },
          { c: 0, r: dtm.lines - 1 },
          { c: dtm.samples - 1, r: dtm.lines - 1 }
        ]
        corners.forEach(p => {
          const wx = calib.xOrigin + p.c * calib.xx + p.r * calib.xy - (cx?.x || 0)
          const wy = calib.yOrigin + p.c * calib.yx + p.r * calib.yy - (cx?.y || 0)
          // Pridáme len rovinné súradnice (Y v Three.js je výška, tú nastavíme nižšie)
          b.expandByPoint(new THREE.Vector3(wx, b.min.y, -wy))
          b.expandByPoint(new THREE.Vector3(wx, b.max.y, -wy))
        })
        
        // Reálny výškový rozsah terénu
        let sMinZ = Infinity, sMaxZ = -Infinity
        for (let i = 0; i < data.length; i++) {
          if (data[i] < sMinZ) sMinZ = data[i]
          if (data[i] > sMaxZ) sMaxZ = data[i]
        }
        b.min.y = Math.min(b.min.y, sMinZ - (cx?.z || 0))
        b.max.y = Math.max(b.max.y, sMaxZ - (cx?.z || 0))
      })
    }

    // Pridáme 10% rezervu na výšku (Y os)
    const h = b.max.y - b.min.y
    const padding = h * 0.05 // 5% hore, 5% dole
    b.min.y -= padding
    b.max.y += padding

    return b
  }, [cave, o.showSurfaceMesh, o.showSurfaceMeshWire, o.showSurfaceTexture, o.showSurfaceNetwork])

  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)

  return (
    <mesh position={center}>
      <boxGeometry args={[size.x, size.y, size.z]} onUpdate={(g) => {
        // @ts-ignore
        g._needsCleanup = true
      }} />
      <meshBasicMaterial color={o.colorBoundingBox || "#990000"} wireframe transparent opacity={0.4} />
    </mesh>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function segsToGeo(segs: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } }[]) {
  const p = new Float32Array(segs.length * 6)
  let i = 0
  for (const s of segs) {
    p[i++] = s.from.x; p[i++] = s.from.z; p[i++] = -s.from.y;
    p[i++] = s.to.x;   p[i++] = s.to.z;   p[i++] = -s.to.y;
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  return g
}

function segsToGeoWithColors(segs: Segment[], mnZ: number, mxZ: number) {
  const p = new Float32Array(segs.length * 6)
  const colors = new Float32Array(segs.length * 6)
  let i = 0
  for (const s of segs) {
    p[i] = s.from.x; p[i+1] = s.from.z; p[i+2] = -s.from.y;
    p[i+3] = s.to.x; p[i+4] = s.to.z;   p[i+5] = -s.to.y;
    
    const c1 = elevColor(normZ(s.from.z, mnZ, mxZ))
    const c2 = elevColor(normZ(s.to.z,   mnZ, mxZ))
    
    colors[i] = c1.r; colors[i+1] = c1.g; colors[i+2] = c1.b;
    colors[i+3] = c2.r; colors[i+4] = c2.g; colors[i+5] = c2.b;
    i += 6
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

// ─── Cave survey legs ─────────────────────────────────────────────────────────
const CYL_UP = new THREE.Vector3(0, 1, 0)

// ─── CaveLegs moved to shared ───

// ─── Cave traverse — polygonový ťah (InstancedMesh rúrky s altitude farbami) ──
const CaveTraverse = React.memo(({ cave, radius, showAltitude, isMoving, ...props }: { cave: ParsedCave; radius: number; showAltitude: boolean, isMoving: boolean, clippingPlanes: any[] }) => {
  if (isMoving) return null 
  const caveLegs = useMemo(() => cave.segments.filter((s: Segment) => s.type === 'cave'), [cave])

  const zRange = useMemo(() => {
    let mn = Infinity, mx = -Infinity
    for (const s of caveLegs) {
      if (s.from.z < mn) mn = s.from.z; if (s.from.z > mx) mx = s.from.z
      if (s.to.z   < mn) mn = s.to.z;   if (s.to.z   > mx) mx = s.to.z
    }
    return [mn, mx] as [number, number]
  }, [caveLegs])

  const cylGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8, 1, false), [])
  const [mesh, setMesh] = useState<THREE.InstancedMesh | null>(null)

  useEffect(() => {
    const count = caveLegs.length
    if (count === 0) return

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.15 })
    const im  = new THREE.InstancedMesh(cylGeo, mat, count)
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)

    const dummy = new THREE.Object3D()
    const [mnZ, mxZ] = zRange

    caveLegs.forEach((seg: Segment, i: number) => {
      const from = new THREE.Vector3(seg.from.x, seg.from.z, -seg.from.y)
      const to   = new THREE.Vector3(seg.to.x,   seg.to.z,  -seg.to.y)
      const len  = from.distanceTo(to)
      if (len < 0.001) return

      const dir = to.clone().sub(from).normalize()
      dummy.position.copy(from.clone().add(to).multiplyScalar(0.5))

      const dot = dir.dot(CYL_UP)
      if (Math.abs(dot) > 0.9999) {
        dummy.quaternion.set(0, 0, 0, 1)
        if (dot < 0) dummy.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      } else {
        dummy.quaternion.setFromUnitVectors(CYL_UP, dir)
      }

      dummy.scale.set(radius, len, radius)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)

      if (showAltitude) {
        const midZ = (seg.from.z + seg.to.z) / 2
        im.setColorAt(i, elevColor(normZ(midZ, mnZ, mxZ)))
      } else {
        im.setColorAt(i, new THREE.Color('#4fc3f7'))
      }
    })

    mat.clippingPlanes = props.clippingPlanes
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    
    setMesh(im)

    return () => {
      im.dispose()
      mat.dispose()
    }
  }, [caveLegs, zRange, cylGeo, radius, showAltitude, props.clippingPlanes])

  useEffect(() => {
    return () => cylGeo.dispose()
  }, [cylGeo])

  if (!mesh) return null
  return <primitive object={mesh} renderOrder={10} />
})

// ─── Station dots ─────────────────────────────────────────────────────────────
// ─── Stations moved to shared ───

// ─── Station labels ───────────────────────────────────────────────────────────
// ─── StationLabels moved to shared ───

// ─── Contour Label Item (with dynamic scaling) ──────────────────────────────
const ContourLabelItem = React.memo(({ pos, val, color, opacity }: any) => {
  return (
    <Html position={pos} center distanceFactor={85} occlude={false} style={{ pointerEvents: 'none', willChange: 'transform' }}>
      <div style={{
        fontSize: '10px',
        fontFamily: 'Inter, monospace',
        color: color || '#ffffff',
        fontWeight: 800,
        textShadow: '0 0 3px #000, 0 0 5px #000',
        opacity: opacity || 0.9,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        padding: '1px 4px',
        borderRadius: '4px',
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        lineHeight: 1.1
      }}>
        {val} m
      </div>
    </Html>
  );
});

// ─── Contour Labels (Altitude markers for major contours) ────────────────────
const ContourLabels = React.memo(({ surface, majorInterval, color, opacity, isMoving }: any) => {
  // Počas pohybu kamery skryjeme HTML overlay, aby sme garantovali okamžitú odozvu a 60 FPS
  if (isMoving) return null;

  const { dtm, centerOffset } = surface;
  const { data, samples, lines, calib } = dtm;

  const labelPoints = useMemo(() => {
    const pts: { x: number; y: number; z: number; val: number }[] = [];
    if (!majorInterval || majorInterval <= 0) return pts;

    // Jemnejší raster a obojsmerná detekcia pretnutia (horizontálna aj vertikálna)
    const stepR = Math.max(2, Math.floor(lines / 36));
    const stepC = Math.max(2, Math.floor(samples / 36));

    const maxDim = Math.max((samples - 1) * Math.abs(calib.xx || 1), (lines - 1) * Math.abs(calib.yy || 1));
    const minDist = Math.max(30, maxDim / 14);

    for (let r = 0; r < lines - stepR; r += stepR) {
      for (let c = 0; c < samples - stepC; c += stepC) {
        const idx = r * samples + c;
        const z = data[idx];

        // 1. Horizontálne hrany
        const idxRight = r * samples + (c + stepC);
        const zRight = data[idxRight];
        const minZh = Math.min(z, zRight);
        const maxZh = Math.max(z, zRight);

        if (maxZh - minZh > 0.001) {
          const startAlt = Math.ceil(minZh / majorInterval) * majorInterval;
          for (let targetAlt = startAlt; targetAlt <= maxZh; targetAlt += majorInterval) {
            const t = (targetAlt - z) / (zRight - z);
            if (t >= 0 && t <= 1) {
              const col = c + t * stepC;
              const wx = calib.xOrigin + col * calib.xx + r * calib.xy;
              const wy = calib.yOrigin + col * calib.yx + r * calib.yy;
              pts.push({
                x: wx - centerOffset.x,
                y: targetAlt - centerOffset.z,
                z: -(wy - centerOffset.y),
                val: targetAlt
              });
            }
          }
        }

        // 2. Vertikálne hrany
        const idxDown = (r + stepR) * samples + c;
        const zDown = data[idxDown];
        const minZv = Math.min(z, zDown);
        const maxZv = Math.max(z, zDown);

        if (maxZv - minZv > 0.001) {
          const startAlt = Math.ceil(minZv / majorInterval) * majorInterval;
          for (let targetAlt = startAlt; targetAlt <= maxZv; targetAlt += majorInterval) {
            const t = (targetAlt - z) / (zDown - z);
            if (t >= 0 && t <= 1) {
              const row = r + t * stepR;
              const wx = calib.xOrigin + c * calib.xx + row * calib.xy;
              const wy = calib.yOrigin + c * calib.yx + row * calib.yy;
              pts.push({
                x: wx - centerOffset.x,
                y: targetAlt - centerOffset.z,
                z: -(wy - centerOffset.y),
                val: targetAlt
              });
            }
          }
        }
      }
    }

    // Zoskupiť body podľa vrstevnice a rovnomerne ich rozmiestniť v zornom poli
    const grouped = new Map<number, typeof pts>();
    pts.forEach(p => {
      if (!grouped.has(p.val)) grouped.set(p.val, []);
      grouped.get(p.val)!.push(p);
    });

    const finalPts: typeof pts = [];
    grouped.forEach((levelPts) => {
      if (finalPts.length >= 36) return;
      levelPts.sort((a, b) => a.x - b.x || a.z - b.z);
      const chosen: typeof pts = [];
      for (const p of levelPts) {
        const tooClose = chosen.some(c => Math.hypot(c.x - p.x, c.z - p.z) < minDist);
        if (!tooClose) {
          chosen.push(p);
          if (chosen.length >= 3) break; // Dostatočný počet štítkov na vrstevnicu
        }
      }
      if (chosen.length === 1 && levelPts.length > 2) {
        chosen.push(levelPts[levelPts.length - 1]);
      }
      finalPts.push(...chosen);
    });

    return finalPts;
  }, [data, samples, lines, calib, majorInterval, centerOffset]);

  if (labelPoints.length === 0) return null;

  return (
    <group>
      {labelPoints.map((p, i) => (
        <ContourLabelItem 
          key={i} 
          pos={[p.x, p.y + 0.3, p.z]} 
          val={p.val} 
          color={color} 
          opacity={opacity} 
        />
      ))}
    </group>
  );
});

// --- Pokročilé Vyhladzovacie Algoritmy (Taubin Smoothing & Angle-Weighted Normals) ---



// ─── Cave scraps geometry builder ────────────────────────────────────────────

// ─── Cave wall scraps — solid + wireframe + altitude (independent) ─────────────

// ─── Terrain geometry builder ────────────────────────────────────────────────
function buildTerrainGeo(
  { positions, uvs, bitmapUvs, colors, indices }: { positions: Float32Array, uvs: Float32Array, bitmapUvs?: Float32Array, colors: Float32Array, indices: number[] },
  buildBoundsTree = true
) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
  if (bitmapUvs) {
    g.setAttribute('uv2', new THREE.BufferAttribute(bitmapUvs, 2));
  }
  g.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();

  if (buildBoundsTree) {
    // Vypočítať BVH strom pre bleskový raycasting terénu
    // @ts-ignore
    g.computeBoundsTree();
  }

  return g;
}

function buildSampleIndexes(start: number, count: number, maxIndex: number, subsample: number): number[] {
  const step = Math.max(1, Math.floor(subsample));
  const end = Math.min(start + count - 1, maxIndex);
  const indexes: number[] = [];

  for (let value = start; value <= end; value += step) {
    indexes.push(value);
  }

  if (indexes[indexes.length - 1] !== end) {
    indexes.push(end);
  }

  return indexes;
}

function getTerrainHeightRange(surface: CaveSurface): { minZ: number; maxZ: number } {
  if (surface.bounds && Number.isFinite(surface.bounds.minZ) && Number.isFinite(surface.bounds.maxZ)) {
    return { minZ: surface.bounds.minZ, maxZ: surface.bounds.maxZ };
  }

  const data = surface.dtm.data;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < minZ) minZ = data[i];
    if (data[i] > maxZ) maxZ = data[i];
  }
  return { minZ, maxZ };
}

function getMovingTerrainSubsample(samples: number, lines: number): number {
  const total = samples * lines;
  if (total > 4_000_000) return 8;
  if (total > 1_000_000) return 6;
  if (total > 250_000) return 4;
  if (total > 90_000) return 2;
  return 1;
}

function buildTerrainTileData(
  surface: CaveSurface,
  colStart: number,
  rowStart: number,
  colCount: number,
  rowCount: number,
  imgSize?: [number, number],
  subsample = 1,
  heightRange?: { minZ: number; maxZ: number }
) {
  const { dtm, bitmapCalib, centerOffset: { x: cx, y: cy, z: cz } } = surface;
  const { data, samples: origSamples, lines: origLines, calib } = dtm;
  const colIndexes = buildSampleIndexes(colStart, colCount, origSamples - 1, subsample);
  const rowIndexes = buildSampleIndexes(rowStart, rowCount, origLines - 1, subsample);

  const samples = colIndexes.length;
  const lines = rowIndexes.length;

  const { minZ: globalMinZ, maxZ: globalMaxZ } = heightRange || getTerrainHeightRange(surface);
  const positions = new Float32Array(lines * samples * 3);
  const uvs = new Float32Array(lines * samples * 2);
  const colors = new Float32Array(lines * samples * 3);
  const indices: number[] = [];

  // Pre LOX bitmap: vypočítame kalibrované UV priamo na CPU
  // Použijeme bitmapCalib ak existuje, inak DTM calib (pre custom upload)
  const texCalib = bitmapCalib || null;
  const bitmapUvs = texCalib ? new Float32Array(lines * samples * 2) : undefined;

  // Inverzná matica bitmapCalib pre prevod world → bitmap pixel
  let bDetInv = 0, bxx = 0, bxy = 0, byx = 0, byy = 0, bOx = 0, bOy = 0;
  if (texCalib) {
    const bDet = texCalib.xx * texCalib.yy - texCalib.xy * texCalib.yx;
    bDetInv = bDet !== 0 ? 1.0 / bDet : 0;
    bxx = texCalib.xx; bxy = texCalib.xy;
    byx = texCalib.yx; byy = texCalib.yy;
    bOx = texCalib.xOrigin; bOy = texCalib.yOrigin;
  }

  const det = calib.xx * calib.yy - calib.xy * calib.yx;
  let vIdx = 0, uIdx = 0, cIdx = 0, buIdx = 0;

  for (let r = 0; r < lines; r++) {
    const row = rowIndexes[r];
    for (let c = 0; c < samples; c++) {
      const col = colIndexes[c];
      
      const idx = row * origSamples + col;
      const wx = calib.xOrigin + col * calib.xx + row * calib.xy;
      const wy = calib.yOrigin + col * calib.yx + row * calib.yy;
      const wz = data[idx];

      positions[vIdx++] = wx - cx;
      positions[vIdx++] = wz - cz;
      positions[vIdx++] = -(wy - cy);

      // Štandardné UV normalizované podľa DTM mriežky (pre custom textúru)
      uvs[uIdx++] = col / (origSamples - 1);
      uvs[uIdx++] = row / (origLines - 1);

      // Kalibrované UV pre LOX bitmap: world → bitmap pixel
      // Vždy ukladáme surové pixelové súradnice, normalizáciu urobí shader podľa uImgSize
      if (bitmapUvs && texCalib) {
        const dx = wx - bOx;
        const dy = wy - bOy;
        const px = (dx * byy - dy * bxy) * bDetInv;
        const py = (dy * bxx - dx * byx) * bDetInv;
        bitmapUvs[buIdx++] = px;
        bitmapUvs[buIdx++] = py;
      }

      const colorVal = elevColor(normZ(wz, globalMinZ, globalMaxZ));
      colors[cIdx++] = colorVal.r; colors[cIdx++] = colorVal.g; colors[cIdx++] = colorVal.b;
    }
  }

  for (let r = 0; r < lines - 1; r++) {
    for (let c = 0; c < samples - 1; c++) {
      const i0 = r * samples + c, i1 = i0 + 1, i2 = i0 + samples, i3 = i2 + 1;
      if (det > 0) {
        indices.push(i0, i1, i2, i2, i1, i3);
      } else {
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  }
  
  return { positions, uvs, bitmapUvs, colors, indices };
}

// ─── Terrain surface mesh (všetky módy) ──────────────────────────────────────
const TILE_SIZE = 128; // Počet vrcholov na hranu dlaždice

type RemoteTextureSourceType = 'xyz' | 'wms';

interface RemoteTextureSource {
  type: RemoteTextureSourceType;
  url: string | string[];
  provider: string;
  format: string;
  maxZoom?: number;
  crs?: WmsCrs;
}

const REMOTE_TEXTURE_SOURCES: Record<string, RemoteTextureSource> = {
  'wms-orto': {
    type: 'wms',
    provider: 'ZBGIS',
    format: 'image/jpeg',
    crs: 'EPSG:5514',
    url: buildMapProxyUrlCandidates(
      'zbgis-wms-orto',
      '',
      {
        service: 'WMS',
        version: '1.3.0',
        request: 'GetMap',
        layers: '1',
        styles: 'default',
        crs: 'EPSG:5514',
        format: 'image/jpeg',
        width: '{width}',
        height: '{height}',
        bbox: '{bbox}',
      },
      '/wms-proxy/orto?service=WMS&version=1.3.0&request=GetMap&layers=1&styles=default&crs=EPSG%3A5514&format=image%2Fjpeg&width={width}&height={height}&bbox={bbox}',
      'https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get?service=WMS&version=1.3.0&request=GetMap&layers=1&styles=default&crs=EPSG%3A5514&format=image%2Fjpeg&width={width}&height={height}&bbox={bbox}'
    ),
  },
  'wms-shadow': {
    type: 'wms',
    provider: 'ZBGIS',
    format: 'image/jpeg',
    crs: 'EPSG:5514',
    url: buildMapProxyUrlCandidates(
      'zbgis-wms-shadow',
      '',
      {
        service: 'WMS',
        version: '1.3.0',
        request: 'GetMap',
        layers: '1',
        styles: 'default',
        crs: 'EPSG:5514',
        format: 'image/jpeg',
        width: '{width}',
        height: '{height}',
        bbox: '{bbox}',
      },
      '/wms-proxy/shadow?service=WMS&version=1.3.0&request=GetMap&layers=1&styles=default&crs=EPSG%3A5514&format=image%2Fjpeg&width={width}&height={height}&bbox={bbox}',
      'https://zbgisws.skgeodesy.sk/zbgis_dmr_wms/service.svc/get?service=WMS&version=1.3.0&request=GetMap&layers=1&styles=default&crs=EPSG%3A5514&format=image%2Fjpeg&width={width}&height={height}&bbox={bbox}'
    ),
  },
  'wms-orto-freemap': {
    type: 'xyz',
    provider: 'Freemap',
    format: 'image/jpeg',
    maxZoom: 20,
    url: buildMapProxyUrlCandidates(
      'freemap-orto',
      '{z}/{x}/{y}.jpg',
      {},
      '/xyz-proxy/freemap-orto/{z}/{x}/{y}.jpg',
      'https://ortofoto.tiles.freemap.sk/{z}/{x}/{y}.jpg'
    ),
  },
  'wms-geology': {
    type: 'wms',
    provider: 'ŠGÚDŠ',
    format: 'image/jpeg',
    crs: 'EPSG:5514',
    url: buildMapProxyUrlCandidates(
      'geology',
      '',
      {
        service: 'WMS',
        request: 'GetMap',
        layers: '0,1,2',
        styles: '',
        format: 'image/jpeg',
        transparent: 'false',
        version: '1.3.0',
        width: '{width}',
        height: '{height}',
        crs: 'EPSG:5514',
        bbox: '{bbox}',
      },
      '/wms-proxy/geology?service=WMS&request=GetMap&layers=0%2C1%2C2&styles=&format=image%2Fjpeg&transparent=false&version=1.3.0&width={width}&height={height}&crs=EPSG%3A5514&bbox={bbox}',
      'https://ags.geology.sk/arcgis/services/WebServices/GM50/MapServer/WMSServer?service=WMS&request=GetMap&layers=0%2C1%2C2&styles=&format=image%2Fjpeg&transparent=false&version=1.3.0&width={width}&height={height}&crs=EPSG%3A5514&bbox={bbox}'
    ),
  },
};

function resolutionToZoom(resolution: number): number {
  if (resolution <= 512) return 15;
  if (resolution <= 1024) return 16;
  if (resolution <= 2048) return 17;
  return 18;
}

function getWmsImageSize(sjtskBbox: string, requestedSize: number): { width: number; height: number } {
  const parts = sjtskBbox.split(',').map(Number);
  const base = Math.max(256, Math.min(4096, Math.round(requestedSize || 1024)));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return { width: base, height: base };

  const widthMeters = Math.abs(parts[2] - parts[0]);
  const heightMeters = Math.abs(parts[3] - parts[1]);
  if (widthMeters <= 0 || heightMeters <= 0) return { width: base, height: base };

  if (widthMeters >= heightMeters) {
    return { width: base, height: Math.max(256, Math.min(4096, Math.round(base * heightMeters / widthMeters))) };
  }

  return { width: Math.max(256, Math.min(4096, Math.round(base * widthMeters / heightMeters))), height: base };
}

const TerrainTile = React.memo(({ surface, colStart, rowStart, colCount, rowCount, imgSize, imgSizeUniformRef, xyzCalib, heightRange, contourMat, ...props }: any) => {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const terrainSubsample = !props.terrainReadyForFullDetail
    ? getMovingTerrainSubsample(surface.dtm.samples, surface.dtm.lines)
    : 1;
  const buildPreciseBvh = terrainSubsample === 1 && props.terrainReadyForFullDetail;

  useEffect(() => {
    const data = buildTerrainTileData(surface, colStart, rowStart, colCount, rowCount, imgSize, terrainSubsample, heightRange);
    const g = buildTerrainGeo(data, buildPreciseBvh);
    setGeo(g);
    return () => {
      // @ts-ignore
      if (g.boundsTree) g.disposeBoundsTree();
      g.dispose();
    };
  }, [surface, colStart, rowStart, colCount, rowCount, imgSize, terrainSubsample, heightRange, buildPreciseBvh]);

  const textureUniforms = useMemo(() => ({
    uIsLoxBitmap: { value: 0.0 },
    uHasCalib:    { value: 0.0 },
    uImgSize:     { value: (imgSize && imgSize[0] > 1) ? imgSize : [1.0, 1.0] },
    uTexOffset:   { value: [props.options.surfaceTextureOffset.x, props.options.surfaceTextureOffset.y] },
    uDtmDim:      { value: [1.0, 1.0] },
    uCalib0:      { value: new THREE.Vector4(0,0,0,0) },
    uCalib1:      { value: new THREE.Vector4(0,0,0,0) },
    uCenterOffset: { value: [surface.centerOffset.x, surface.centerOffset.y] },
    uTextureOpacity: { value: 1.0 }
  }), []);

  useEffect(() => {
    const hasBitmapCalib = !!surface.bitmapCalib;
    const calib = props.options.surfaceTextureCalibration;
    const dtmWidth = (surface.dtm.samples - 1) * Math.abs(surface.dtm.calib.xx || 1);
    const dtmHeight = (surface.dtm.lines - 1) * Math.abs(surface.dtm.calib.yy || 1);
    
	    const source = props.options.surfaceTextureSource || 'custom';
	    const isCustom = source === 'custom';
	    const isWmsXyz = source === 'wms-orto' || source === 'wms-shadow' || source === 'wms-geology' || source === 'wms-orto-freemap';
	    const canCalib = (isCustom && calib) || (isWmsXyz && !!surface.sjtskBbox && !!xyzCalib);
	    const useLoxBitmapUv = isCustom && hasBitmapCalib && !calib;

	    textureUniforms.uIsLoxBitmap.value = useLoxBitmapUv ? 1.0 : 0.0;
    
    // For XYZ, we set uHasCalib to 1.0 here, but uCalib0/1 are set async when texture is loaded.
    // For custom, we set it based on calib.
    textureUniforms.uHasCalib.value    = canCalib ? 1.0 : 0.0;
    
    textureUniforms.uImgSize.value     = (imgSize && imgSize[0] > 1) ? imgSize : [1.0, 1.0];
    textureUniforms.uTexOffset.value   = [props.options.surfaceTextureOffset.x, props.options.surfaceTextureOffset.y];
    textureUniforms.uDtmDim.value      = [dtmWidth, dtmHeight];
    
    if (isCustom && calib) {
      textureUniforms.uCalib0.value.set(calib.p1.mx, calib.p1.my, calib.p2.mx, calib.p2.my);
      if (calib.source === 'sjtsk-bbox') {
        textureUniforms.uCalib1.value.set(0, 0, imgSize[0], imgSize[1]);
      } else {
        textureUniforms.uCalib1.value.set(calib.p1.x, calib.p1.y, calib.p2.x, calib.p2.y);
      }
    } else if (isWmsXyz && xyzCalib) {
      textureUniforms.uCalib0.value.set(xyzCalib[0], xyzCalib[1], xyzCalib[2], xyzCalib[3]);
      textureUniforms.uCalib1.value.set(0, 0, imgSize[0], imgSize[1]);
    }

    textureUniforms.uTextureOpacity.value = props.options.surfaceTextureOpacity ?? 1.0;
  }, [textureUniforms, surface, imgSize, xyzCalib, props.options.surfaceTextureOffset, props.options.surfaceTextureCalibration, props.surfaceTextureUrl, props.options.surfaceTextureOpacity, props.options.surfaceTextureSource, props.options.surfaceWmsResolution]);

  if (!geo) return null;

  return (
    <group renderOrder={1}>
      {props.showMesh && (
        <mesh geometry={geo}>
          <meshStandardMaterial color={props.surfaceColor} side={THREE.DoubleSide} 
            transparent={props.opacity < 1} opacity={props.opacity}
            roughness={0.9} metalness={0.1} flatShading={true} 
            depthWrite={props.opacity === 1}
            polygonOffset polygonOffsetFactor={4} polygonOffsetUnits={4}
            clippingPlanes={props.clippingPlanes} />
        </mesh>
      )}
      {props.showNetwork && (
        <mesh geometry={geo}>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} transparent={props.opacity < 1} opacity={props.opacity}
            roughness={0.9} metalness={0.1} flatShading={true} 
            depthWrite={props.opacity === 1}
            polygonOffset polygonOffsetFactor={3} polygonOffsetUnits={3} 
            clippingPlanes={props.clippingPlanes} />
        </mesh>
      )}
      {props.showTexture && props.texture && (
        <mesh geometry={geo}>
          <meshStandardMaterial
            map={props.texture}
            side={THREE.DoubleSide}
            transparent={props.opacity < 1}
            opacity={props.opacity}
            roughness={0.85}
            depthWrite={props.opacity === 1}
            polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
            clippingPlanes={props.clippingPlanes}
            onBeforeCompile={(shader) => {
              shader.uniforms.uIsLoxBitmap = textureUniforms.uIsLoxBitmap;
              shader.uniforms.uHasCalib = textureUniforms.uHasCalib;
              shader.uniforms.uImgSize = textureUniforms.uImgSize;
              shader.uniforms.uTexOffset = textureUniforms.uTexOffset;
              shader.uniforms.uDtmDim = textureUniforms.uDtmDim;
              shader.uniforms.uCalib0 = textureUniforms.uCalib0;
              shader.uniforms.uCalib1 = textureUniforms.uCalib1;
              shader.uniforms.uCenterOffset = textureUniforms.uCenterOffset;
              shader.uniforms.uTextureOpacity = textureUniforms.uTextureOpacity;
              
              if (imgSizeUniformRef) {
                imgSizeUniformRef.current.push(shader.uniforms.uImgSize);
                imgSizeUniformRef.current.push(shader.uniforms.uTexOffset);
              }

              shader.vertexShader = `
                attribute vec2 uv2;
                uniform float uIsLoxBitmap;
                uniform float uHasCalib;
                uniform vec4 uCalib0; // mx1, my1, mx2, my2
                uniform vec4 uCalib1; // px1, py1, px2, py2
                uniform vec2 uImgSize;
                uniform vec2 uCenterOffset;
                varying vec2 vTexUv;
                varying vec2 vWorldPosXZ;
                ${shader.vertexShader}
              `.replace(
                '#include <project_vertex>',
                `#include <project_vertex>
                 vWorldPosXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
                 if (uIsLoxBitmap > 0.5) {
                   vTexUv = uv2;
                 } else if (uHasCalib > 0.5) {
                   float wx = vWorldPosXZ.x + uCenterOffset.x;
                   float wy = -(vWorldPosXZ.y - uCenterOffset.y); 
                   float u_px = uCalib1.x + (wx - uCalib0.x) * (uCalib1.z - uCalib1.x) / (uCalib0.z - uCalib0.x);
                   float v_py = uCalib1.y + (wy - uCalib0.y) * (uCalib1.w - uCalib1.y) / (uCalib0.w - uCalib0.y);
                   vTexUv = vec2(u_px, v_py);
                 } else {
                   vTexUv = uv;
                 }
                `
              );

              shader.fragmentShader = `
                varying vec2 vTexUv;
                varying vec2 vWorldPosXZ;
                uniform float uIsLoxBitmap;
                uniform vec2 uImgSize;
                uniform vec2 uTexOffset;
                uniform vec2 uDtmDim;
                uniform float uHasCalib;
                uniform float uTextureOpacity;
                ${shader.fragmentShader}
              `.replace(
                '#include <map_fragment>',
                `
                #ifdef USE_MAP
                  vec2 finalUv = vTexUv;
                  if (uIsLoxBitmap > 0.5 || uHasCalib > 0.5) {
                    finalUv = vTexUv / uImgSize;
                  } else {
                    finalUv = vTexUv + uTexOffset / uDtmDim;
                  }
                  
                  bool outOfBounds = false;
                  if (uIsLoxBitmap > 0.5 || uHasCalib > 0.5) {
                    if (finalUv.x < 0.0 || finalUv.x > 1.0 || finalUv.y < 0.0 || finalUv.y > 1.0) {
                      outOfBounds = true;
                    }
                  }
                  
                  if (outOfBounds) {
                    // Mimo orezania textúry — necháme pôvodnú diffuse farbu
                  } else {
                    vec4 texelColor = texture2D( map, finalUv );
                    texelColor.a *= uTextureOpacity;
                    diffuseColor *= texelColor;
                  }
                #endif
                `
              );
            }}
          />
        </mesh>
      )}
      {props.showContours && contourMat && (
        <mesh geometry={geo} material={contourMat} renderOrder={2} />
      )}
      {props.showMeshWire && (
        <mesh geometry={geo}>
          <meshBasicMaterial color={props.colorTerrainWire} wireframe depthWrite={false} transparent={true} opacity={0.45} clippingPlanes={props.clippingPlanes} />
        </mesh>
      )}
      <ClippingEdges 
        geo={geo} 
        planes={props.clippingPlanes || []} 
        active={props.options.showSurfaceClippingEdges} 
        color={props.options.colorSurfaceClippingEdges} 
      />
    </group>
  );
});

const TerrainMesh = React.memo(({ surface, isMeasuringMode, onStatusChange, onTextureDownloadInfo, ...props }: any) => {
  const { samples, lines } = surface.dtm;
  const heightRange = useMemo(() => getTerrainHeightRange(surface), [surface]);
  const initialTerrainSubsample = useMemo(() => getMovingTerrainSubsample(samples, lines), [samples, lines]);
  const [terrainReadyForFullDetail, setTerrainReadyForFullDetail] = useState(initialTerrainSubsample <= 1);

  useEffect(() => {
    setTerrainReadyForFullDetail(initialTerrainSubsample <= 1);
    if (initialTerrainSubsample <= 1) return;

    const detailTimer = window.setTimeout(() => {
      setTerrainReadyForFullDetail(true);
    }, 1200);

    return () => window.clearTimeout(detailTimer);
  }, [initialTerrainSubsample, surface]);
  
  const tiles = useMemo(() => {
    const t = [];
    for (let r = 0; r < lines - 1; r += TILE_SIZE - 1) {
      const rowCount = Math.min(TILE_SIZE, lines - r);
      for (let c = 0; c < samples - 1; c += TILE_SIZE - 1) {
        const colCount = Math.min(TILE_SIZE, samples - c);
        t.push({ colStart: c, rowStart: r, colCount, rowCount });
      }
    }
    return t;
  }, [samples, lines]);

  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [imgSize, setImgSize] = useState<[number, number]>([1, 1])
  const [wmsLoading, setWmsLoading] = useState(false);
  const [wmsProgress, setWmsProgress] = useState(0);
  const [xyzCalib, setXyzCalib] = useState<number[] | null>(null);
  const imgSizeUniformRef = useRef<{ value: [number, number] }[]>([])
  const textureInspectorRef = useRef<TextureDownloadInspector | null>(null)

  const reportTextureInspector = useCallback((info: TextureDownloadInspector | null) => {
    textureInspectorRef.current = info;
    onTextureDownloadInfo?.(info);
  }, [onTextureDownloadInfo]);


  useEffect(() => {
    let isActive = true;
    setTexture(null);
    setXyzCalib(null);
    reportTextureInspector(null);

    const source = props.options.surfaceTextureSource || 'custom';
    const remoteSource = REMOTE_TEXTURE_SOURCES[source];
    let url: string | string[] | null = null;

    if (source === 'custom') {
      url = props.surfaceTextureUrl || surface.bitmapUrl;
    } else if (remoteSource) {
      url = remoteSource.url;
    }

    if (!url) {
      return;
    }

    if (remoteSource) {
      if (!surface.sjtskBbox) {
        onStatusChange?.({ msg: 'Chyba: Povrch nemá S-JTSK kalibráciu pre mapové podklady', type: 'error' });
        return;
      }

      setWmsLoading(true);
      setWmsProgress(0);
      onStatusChange?.({ msg: 'Sťahujem mapové podklady...', type: 'progress', progress: 0 });

      const updateProgress = (p: Progress) => {
        if (!isActive) return;
        const progress = Math.round((p.current / p.total) * 100);
        setWmsProgress(progress);
        onStatusChange?.({ msg: `Sťahujem mapové podklady (${remoteSource.provider})...`, type: 'progress', progress });
      };

      const downloadPromise = remoteSource.type === 'wms'
        ? (() => {
            const size = getWmsImageSize(surface.sjtskBbox, props.options.surfaceWmsResolution);
            const startedAt = Date.now();
            reportTextureInspector({
              mode: 'wms',
              status: 'running',
              sourceKey: source,
              provider: remoteSource.provider,
              totalTiles: 1,
              completedTiles: 0,
              successfulTiles: 0,
              failedTiles: 0,
              cacheHits: 0,
              cacheMisses: 0,
              networkTiles: 0,
              candidateRequests: 0,
              fallbackRequests: 0,
              fallbackTiles: 0,
              bytesDownloaded: 0,
              bytesFromCache: 0,
              widthPixels: size.width,
              heightPixels: size.height,
              startedAt,
            });
            return downloadWmsImage(url, surface.sjtskBbox, size.width, size.height, remoteSource.format, (p) => {
              updateProgress(p);
              reportTextureInspector({
                mode: 'wms',
                status: 'running',
                sourceKey: source,
                provider: remoteSource.provider,
                totalTiles: p.total,
                completedTiles: p.current,
                successfulTiles: 0,
                failedTiles: 0,
                cacheHits: 0,
                cacheMisses: 0,
                networkTiles: 0,
                candidateRequests: 0,
                fallbackRequests: 0,
                fallbackTiles: 0,
                bytesDownloaded: 0,
                bytesFromCache: 0,
                widthPixels: size.width,
                heightPixels: size.height,
                startedAt,
                durationMs: Date.now() - startedAt,
              });
            }, remoteSource.crs || 'EPSG:3857');
          })()
          : (() => {
            const zoomPlan = selectBestXyzZoom(
              surface.sjtskBbox,
              remoteSource.maxZoom || resolutionToZoom(props.options.surfaceWmsResolution),
              props.options.surfaceWmsResolution
            );
            onStatusChange?.({
              msg: `Sťahujem mapové podklady... zoom ${zoomPlan.zoom}, ${zoomPlan.totalTiles} dlaždíc`,
              type: 'progress',
              progress: 0,
            });
            reportTextureInspector({
              mode: 'xyz',
              status: 'running',
              sourceKey: source,
              provider: remoteSource.provider,
              zoom: zoomPlan.zoom,
              totalTiles: zoomPlan.totalTiles,
              completedTiles: 0,
              successfulTiles: 0,
              failedTiles: 0,
              cacheHits: 0,
              cacheMisses: 0,
              networkTiles: 0,
              candidateRequests: 0,
              fallbackRequests: 0,
              fallbackTiles: 0,
              bytesDownloaded: 0,
              bytesFromCache: 0,
              widthPixels: zoomPlan.widthPixels,
              heightPixels: zoomPlan.heightPixels,
              metersPerPixel: zoomPlan.metersPerPixel,
              startedAt: Date.now(),
            });
            return downloadTiledXyz(url, surface.sjtskBbox, remoteSource.format, updateProgress, zoomPlan.zoom, {
              cacheKeyPrefix: source,
              sourceKey: source,
              provider: remoteSource.provider,
              onInspectorUpdate: reportTextureInspector,
            });
          })();

      downloadPromise.then((result: DownloadResult) => {
        if (!isActive) return;

        const loader = new THREE.TextureLoader();
        loader.load(result.dataUrl, (t) => {
          if (!isActive) return;
          t.colorSpace = THREE.SRGBColorSpace;
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.needsUpdate = true;
          setTexture(t);

          const img = t.image;
          if (img) {
            const newSize: [number, number] = [img.width, img.height];
            setImgSize(newSize);
            for (const u of imgSizeUniformRef.current) u.value = newSize;
          }

          // Use the exact downloaded bbox, converted to the terrain's native CRS when LOX DTM is UTM.
          const textureBounds = getTextureBboxInDtmCrs(surface.dtm, result.sjtskBbox, surface.sjtskBboxSource);
          const [ex0, ey0, ex1, ey1] = (textureBounds?.bbox || result.sjtskBbox).split(',').map(Number);
          setXyzCalib([ex0, ey0, ex1, ey1]);

          setWmsLoading(false);
          if (result.inspector) {
            reportTextureInspector({
              ...result.inspector,
              sourceKey: source,
              provider: remoteSource.provider,
            });
          }
          const failedCount = result.failedTiles?.length || 0;
          const successMsg = failedCount > 0
            ? `Mapové podklady načítané (${result.successfulTiles}/${result.totalTiles}, ${failedCount} chýb)`
            : 'Mapové podklady úspešne načítané';
          onStatusChange?.({ msg: successMsg, type: 'success' });
          if (props.onTextureReady) props.onTextureReady(result.dataUrl, result.sjtskBbox);
          setTimeout(() => { if (isActive) onStatusChange?.(null); }, 3000);
        });
      }).catch((err: Error) => {
        if (!isActive) return;
        console.error("Map texture download failed:", err);
        setWmsLoading(false);
        const previousInfo = textureInspectorRef.current;
        const now = Date.now();
        if (previousInfo) {
          reportTextureInspector({
            ...previousInfo,
            status: 'error',
            message: err.message,
            finishedAt: now,
            durationMs: now - previousInfo.startedAt,
          });
        }
        onStatusChange?.({ msg: `Chyba: Nepodarilo sa stiahnuť mapové podklady (${err.message})`, type: 'error' });
      });
    } else if (typeof url === 'string') {
      const loader = new THREE.TextureLoader()
      loader.load(url, (t) => {
        if (!isActive) return;
        t.colorSpace = THREE.SRGBColorSpace
        t.flipY = true 
        t.needsUpdate = true
        if (t.image && t.image.width && t.image.height) {
          const newSize: [number, number] = [t.image.width, t.image.height]
          setImgSize(newSize)
          for (const u of imgSizeUniformRef.current) u.value = newSize
        }
        setTexture(t)
      })
    }
    return () => {
      isActive = false;
    }
  }, [surface.bitmapUrl, props.surfaceTextureUrl, props.options.surfaceTextureSource, props.options.surfaceWmsResolution, surface.sjtskBbox, reportTextureInspector])

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  const hoverGeo = useMemo(() => new THREE.SphereGeometry(0.25, 8, 8), [])
  const hoverMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ef4444", depthTest: false }), [])

  useEffect(() => {
    return () => {
      hoverGeo.dispose()
      hoverMat.dispose()
    }
  }, [hoverGeo, hoverMat])
  const [hoveredSurf, setHoveredSurf] = useState<[number, number, number] | null>(null)

  const contourUniforms = useMemo(() => ({
    uMajorInterval: { value: props.contourInterval || 10.0 },
    uMinorInterval: { value: props.minorInterval || 2.5 },
    uContourColor: { value: new THREE.Color(props.contourColor) },
    uContourColorMajor: { value: new THREE.Color(props.contourColor10 || props.contourColor) },
    uOpacity: { value: props.opacity ?? 0.8 },
    uCenterZ: { value: surface.centerOffset.z }
  }), [surface.centerOffset.z, props.contourInterval, props.minorInterval, props.contourColor, props.contourColor10, props.opacity]);

  useEffect(() => {
    contourUniforms.uMajorInterval.value = props.contourInterval || 10.0;
    contourUniforms.uMinorInterval.value = props.minorInterval || 2.5;
    contourUniforms.uContourColor.value.set(props.contourColor);
    contourUniforms.uContourColorMajor.value.set(props.contourColor10 || props.contourColor);
    contourUniforms.uOpacity.value = props.opacity ?? 0.8;
  }, [contourUniforms, props.contourInterval, props.minorInterval, props.contourColor, props.contourColor10, props.opacity]);

  const contourMat = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      side: THREE.FrontSide,
      transparent: true,
      opacity: props.opacity ?? 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      clippingPlanes: props.clippingPlanes,
      onBeforeCompile: (shader: any) => {
        shader.uniforms.uMajorInterval = contourUniforms.uMajorInterval;
        shader.uniforms.uMinorInterval = contourUniforms.uMinorInterval;
        shader.uniforms.uContourColor = contourUniforms.uContourColor;
        shader.uniforms.uContourColorMajor = contourUniforms.uContourColorMajor;
        shader.uniforms.uOpacity = contourUniforms.uOpacity;
        shader.uniforms.uCenterZ = contourUniforms.uCenterZ;

        shader.vertexShader = `
          varying float vWorldZ;
          uniform float uCenterZ;
          ${shader.vertexShader}
        `.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vWorldZ = (modelMatrix * vec4(transformed, 1.0)).y + uCenterZ;
          `
        );

        shader.fragmentShader = `
          varying float vWorldZ;
          uniform float uMajorInterval;
          uniform float uMinorInterval;
          uniform vec3 uContourColor;
          uniform vec3 uContourColorMajor;
          uniform float uOpacity;
          ${shader.fragmentShader}
        `.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          
          float zMaj = vWorldZ / uMajorInterval;
          float zMin = vWorldZ / uMinorInterval;
          
          float fMaj = fract(zMaj + 0.5) - 0.5;
          float fMin = fract(zMin + 0.5) - 0.5;
          
          float dfMaj = fwidth(zMaj);
          float dfMin = fwidth(zMin);

          // Major ~ 2.2 (celková šírka cca 4.5px), Minor ~ 1.0 (celková šírka cca 2px)
          float wMaj = 2.2 * dfMaj; 
          float wMin = 1.0 * dfMin;

          // smoothstep s rozsahom df pre maximálnu ostrosť bez aliasingu
          float lineMaj = smoothstep(wMaj, wMaj - dfMaj, abs(fMaj));
          float lineMin = smoothstep(wMin, wMin - dfMin, abs(fMin));

          float finalLine = max(lineMaj, lineMin);
          if (finalLine < 0.1) discard;

          vec3 finalColor = mix(uContourColor, uContourColorMajor, lineMaj);
          gl_FragColor = vec4(finalColor, finalLine * uOpacity);
          `
        );
      }
    } as any);
  }, [surface.centerOffset.z, contourUniforms, props.clippingPlanes]);

  useEffect(() => {
    contourMat.opacity = props.opacity ?? 0.8;
    contourMat.clippingPlanes = props.clippingPlanes;
  }, [contourMat, props.opacity, props.clippingPlanes]);

  useEffect(() => {
    return () => {
      contourMat.dispose();
    };
  }, [contourMat]);

  if (!props.showMesh && !props.showMeshWire && !props.showTexture && !props.showNetwork && !props.showContours) return null

  return (
    <group 
      position={[props.options.surfaceOffset?.x || 0, props.options.surfaceOffset?.z || 0, -(props.options.surfaceOffset?.y || 0)]}
      onClick={props.onSurfaceClick ? (e: any) => {
        if (e.delta > 5) return
        if (e.point) {
          e.stopPropagation()
          const { x, y, z } = e.point
          const origX = x + surface.centerOffset.x
          const origY = -z + surface.centerOffset.y
          const altitude = y + surface.centerOffset.z
          const ctrl = e.nativeEvent.ctrlKey || e.nativeEvent.metaKey
          props.onSurfaceClick(origX, origY, altitude, e.nativeEvent.clientX, e.nativeEvent.clientY, ctrl)
        }
      } : undefined}
    >
      {tiles.map((tile, i) => (
        <TerrainTile 
          key={`${tile.colStart}-${tile.rowStart}-${imgSize[0]}x${imgSize[1]}`} 
          surface={surface} {...tile} {...props} 
          texture={texture} imgSize={imgSize} 
          xyzCalib={xyzCalib}
          heightRange={heightRange}
          terrainReadyForFullDetail={terrainReadyForFullDetail}
          imgSizeUniformRef={imgSizeUniformRef}
          contourMat={contourMat}
        />
      ))}
      
      {hoveredSurf && props.onSurfaceClick && (
        <mesh position={hoveredSurf} renderOrder={100} geometry={hoverGeo} material={hoverMat} />
      )}

      {props.showContours && props.options.showContourLabels && !props.isMoving && terrainReadyForFullDetail && (
        <ContourLabels 
          surface={surface} 
          majorInterval={props.contourInterval || 10.0} 
          color={props.contourColor10 || props.contourColor}
          opacity={props.opacity}
          isMoving={props.isMoving}
        />
      )}
    </group>
  )
})

// ─── Manual Connection Line (Ctrl+Click measuring) ────────────────────────────

// ─── 3D Jaskyniar (Mierka presne 1.8m) ──────────────────────────────────────

function SceneBackground({ texture, color }: { texture: THREE.Texture | null, color: string }) {
  const { scene } = useThree()
  
  useEffect(() => {
    if (texture) {
      scene.background = texture
    } else {
      scene.background = new THREE.Color(color)
    }
  }, [scene, texture, color])
  
  return null
}

function RaycasterManager() {
  const { raycaster } = useThree()
  useEffect(() => {
    if (raycaster.params.Points) {
      raycaster.params.Points.threshold = 0.5;
    }
  }, [raycaster]);
  return null
}

function CameraMonitor({ onUpdate }: { onUpdate: (data: any) => void }) {
  const { camera, size } = useThree()
  const lastPos = useRef(new THREE.Vector3())
  const lastQuat = useRef(new THREE.Quaternion())
  const lastTime = useRef(0)
  const lastHeading = useRef(-999)
  const lastDistBucket = useRef(-1)

  useEffect(() => {
    if (!onUpdate) return
    const checkUpdate = () => {
      const now = performance.now()
      if (now - lastTime.current < 60) return

      const posChanged = camera.position.distanceToSquared(lastPos.current) > 0.0001
      const quatChanged = camera.quaternion.angleTo(lastQuat.current) > 0.001
      if (!posChanged && !quatChanged) return

      // @ts-ignore
      const ctrl = camera.controls || (window as any)._orbitControls || (camera as any).controls
      const target = ctrl?.target || new THREE.Vector3(0, 0, 0)
      const dist = camera.position.distanceTo(target)

      const dx = target.x - camera.position.x
      const dz = target.z - camera.position.z
      const heading = Math.round((Math.atan2(dx, -dz) * (180 / Math.PI) + 360) % 360)
      const distBucket = dist < 25 ? 0 : dist < 60 ? 1 : dist < 120 ? 2 : dist < 300 ? 3 : dist < 600 ? 4 : dist < 1200 ? 5 : dist < 3000 ? 6 : 7

      const headingChanged = Math.abs(heading - lastHeading.current) >= 1
      const bucketChanged = distBucket !== lastDistBucket.current
      const largePosChange = camera.position.distanceToSquared(lastPos.current) > 0.25

      if (!headingChanged && !bucketChanged && !largePosChange && now - lastTime.current < 150) {
        return
      }

      lastTime.current = now
      lastPos.current.copy(camera.position)
      lastQuat.current.copy(camera.quaternion)
      lastHeading.current = heading
      lastDistBucket.current = distBucket

      const fov = (camera as THREE.PerspectiveCamera).fov || 55
      const perspective = camera as THREE.PerspectiveCamera
      onUpdate({
        dist,
        fov,
        width: size.width,
        height: size.height,
        aspect: perspective.aspect || size.width / Math.max(size.height, 1),
        near: perspective.near || 0.1,
        far: perspective.far || 10000,
        position: camera.position.toArray() as [number, number, number],
        quaternion: camera.quaternion.toArray() as [number, number, number, number],
        target: target.toArray() as [number, number, number],
      })
    }

    const timer = setInterval(checkUpdate, 100)
    checkUpdate()
    return () => clearInterval(timer)
  }, [camera, size, onUpdate])
  
  return null
}

function AutoFit({ cave, trigger }: { cave: ParsedCave, trigger?: number }) {
  const { camera, controls, size, invalidate } = useThree() as any
  useEffect(() => {
    const b = cave.bounds
    const targetX = b.center.x
    const targetY = b.center.z
    const targetZ = -b.center.y
    const { fitDist, frustumHalf, aspect } = calculateFitParams(b, size, camera.fov || 55, 'iso')

    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = -frustumHalf * aspect
      camera.right = frustumHalf * aspect
      camera.top = frustumHalf
      camera.bottom = -frustumHalf
      camera.zoom = 1
      camera.position.set(targetX + fitDist * 0.707, targetY + fitDist * 0.577, targetZ + fitDist * 0.707)
      camera.updateProjectionMatrix()
    } else {
      camera.position.set(targetX + fitDist * 0.707, targetY + fitDist * 0.577, targetZ + fitDist * 0.707)
      camera.near = Math.max(0.1, fitDist * 0.001)
      camera.far = Math.max(fitDist * 25, 10000)
      camera.updateProjectionMatrix()
    }

    if (controls && controls.target) {
      controls.target.set(targetX, targetY, targetZ)
      controls.update()
    }
    invalidate()
  }, [cave, trigger, camera, controls, size, invalidate])
  return null
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────
interface Props {
  cave: ParsedCave
  options: ViewerOptions
  onStationClick: (idx: number, screenX: number, screenY: number, ctrlKey: boolean, point?: Vec3) => void
  onSurfaceClick?: (origX: number, origY: number, altitude: number, screenX: number, screenY: number) => void
  onBackgroundClick?: () => void
  onMoveStateChange?: (moving: boolean) => void
  onCameraUpdate?: (data: ViewerCameraSnapshot) => void
  onProcessingStart?: (info: string) => void
  onProcessingEnd?: () => void
  onStatusChange?: (status: { msg: string; type: 'info' | 'error' | 'success' | 'progress'; progress?: number } | null) => void
  onTextureReady?: (dataUrl: string, bbox: string) => void
  onTextureDownloadInfo?: (info: TextureDownloadInspector | null) => void
  manualConnection?: { p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number} } | null
  placedCaver?: { pos: [number, number, number], pose: 'standing' | 'crawling' } | null
  fitTrigger?: number
  contourInterval?: number
  minorInterval?: number
  selectedStations?: SelStation[]
  activeProfilePoints?: SelStation[] | null
  isMeasuringMode: boolean
  lang?: string
}


// ─── EntranceMarkers moved to shared ───

const CaveViewer3D = ({ 
  cave, options: o, onStationClick, onSurfaceClick, onBackgroundClick, onMoveStateChange, onCameraUpdate, 
  onProcessingStart, onProcessingEnd, onStatusChange, onTextureReady, onTextureDownloadInfo, manualConnection, placedCaver, fitTrigger, selectedStations, activeProfilePoints,
  contourInterval, minorInterval, isMeasuringMode, lang = 'sk'
}: Props) => {
  const [isMoving, setIsMoving] = useState(false)
  const [isFullyIdle, setIsFullyIdle] = useState(true)
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [camData, setCamData] = useState<{ dist: number, fov: number, height: number } | null>(null)
  const handleModelClick = useCallback((x: number, y: number, z: number, screenX: number, screenY: number, ctrl = false) => {
    onStationClick(-1, screenX, screenY, ctrl, {
      x: x - cave.centerOffset.x - o.caveCalibrationOffset.x,
      y: y - cave.centerOffset.y - o.caveCalibrationOffset.y,
      z: z - cave.centerOffset.z - o.caveCalibrationOffset.z,
    })
  }, [cave.centerOffset, o.caveCalibrationOffset, onStationClick])

  const handleCameraMoveStart = () => {
    setIsMoving(true)
    setIsFullyIdle(false)
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current)
      idleTimeoutRef.current = null
    }
  }

  const handleCameraMoveEnd = () => {
    setIsMoving(false)
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    idleTimeoutRef.current = setTimeout(() => {
      setIsFullyIdle(true)
    }, 180)
  }

  const handleCameraChange = () => {
    if (isFullyIdle) {
      setIsFullyIdle(false)
    }
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    idleTimeoutRef.current = setTimeout(() => {
      setIsFullyIdle(true)
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    }
  }, [])

  const isLargeModel = useMemo(() => {
    const legCount = cave.segments?.length || 0
    const stationCount = cave.stations?.length || 0
    const pointCount = cave.pointCount || 0
    const scrapCount = cave.scraps?.length || 0
    return legCount > 800 || stationCount > 800 || pointCount > 100000 || scrapCount > 80
  }, [cave])

  const diag     = Math.sqrt(cave.bounds.size.x ** 2 + cave.bounds.size.y ** 2 + cave.bounds.size.z ** 2)
  const gridSize = Math.max(diag * 1.5, 200)

  // ─── Gradient background creation (CATIA style) ──────────────────────────────
  const bgTexture = useMemo(() => {
    if (!o.colorBackground2) return null
    const canvas = document.createElement('canvas')
    canvas.width = 2; canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, o.colorBackground)
    grad.addColorStop(1, o.colorBackground2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 2, 512)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [o.colorBackground, o.colorBackground2])

  // ─── Clipping Planes ───
  const compositeClippingPlanes = useMemo(() => {
    const planes: THREE.Plane[] = []
    
    // 1. Horizontálny rez
    if (o.showClipping) {
      planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), o.clippingHeight - cave.centerOffset.z))
    }
    
    // 2. Vertikálny (profilový) rez
    if (o.showProfileClipping && activeProfilePoints && activeProfilePoints.length === 2) {
      const s1 = activeProfilePoints[0]
      const s2 = activeProfilePoints[1]
      
      const p1 = new THREE.Vector3(s1.origX - (s1.centerX||0), 0, -(s1.origY - (s1.centerY||0)))
      const p2 = new THREE.Vector3(s2.origX - (s1.centerX||0), 0, -(s2.origY - (s1.centerY||0)))
      
      const v = new THREE.Vector3().subVectors(p2, p1).normalize()
      if (v.lengthSq() > 0.0001) {
        const normal = new THREE.Vector3(-v.z, 0, v.x)
        if (o.profileClipFlip) normal.multiplyScalar(-1)
        planes.push(new THREE.Plane(normal, -normal.dot(p1) - o.profileClipOffset))
      }
    }
    
    return planes
  }, [o.showClipping, o.clippingHeight, o.showProfileClipping, o.profileClipFlip, o.profileClipOffset, activeProfilePoints, cave.centerOffset.z])

  const caveClippingPlanes = useMemo(() => {
    if (o.excludeModelFromClipping) return []
    return compositeClippingPlanes
  }, [o.excludeModelFromClipping, compositeClippingPlanes])

  return (
    <Canvas
      id="main-cave-canvas"
      style={{ isolation: 'isolate' }}
      frameloop={o.autoRotate || isMoving || !isFullyIdle ? 'always' : 'demand'}
      dpr={isLargeModel ? 1.0 : (typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? 1.5 : 1)}
      gl={{ 
        antialias: !isLargeModel, 
        alpha: false, 
        preserveDrawingBuffer: true, 
        powerPreference: 'high-performance',
        localClippingEnabled: true // Aktivácia rezov
      }}
      raycaster={{ params: { Points: { threshold: 0.1 } } } as any}
      camera={{ fov: 55, near: 0.1, far: Math.max(diag * 20, 10000) }}
      onCreated={({ gl }) => {
        // Optimalizácia pre veľké modely – ak GPU nestíha
        gl.debug.checkShaderErrors = false 
      }}
      onPointerMissed={() => onBackgroundClick?.()}
    >
      <SceneBackground texture={bgTexture} color={o.colorBackground} />
      <RaycasterManager />
      <ProjectionController projection={o.cameraProjection ?? 'perspective'} cave={cave} />
      <ambientLight intensity={0.32} />
      <hemisphereLight color="#ffffff" groundColor="#334155" intensity={0.42} />
      <directionalLight position={[4, 6, 3]} intensity={1.15} color="#ffffff" castShadow={false} />
      <directionalLight position={[-5, 2, -4]} intensity={0.40} color="#e2e8f0" />
      <directionalLight position={[-4, 5, 6]} intensity={0.60} color="#bae6fd" />
      <directionalLight position={[0, -3, 2]} intensity={0.18} color="#fef3c7" />
 
      {/* ── Terrain (Fixed in world space) ── */}
      {(o.showSurfaceMesh || o.showSurfaceMeshWire || o.showSurfaceTexture || o.showSurfaceNetwork || o.showContours) && cave.surfaces?.map((surf: CaveSurface, i: number) => (
        <TerrainMesh
          key={i} surface={surf}
          showMesh={o.showSurfaceMesh}
          showMeshWire={o.showSurfaceMeshWire}
          showTexture={o.showSurfaceTexture}
          surfaceTextureUrl={o.surfaceTextureUrl}
          showNetwork={o.showSurfaceNetwork}
          showContours={o.showContours}
          contourColor={o.contourColor}
          contourColor10={o.contourColor10}
          contourInterval={contourInterval}
          minorInterval={minorInterval}
          opacity={o.surfaceOpacity}
          surfaceColor={o.surfaceColor}
          colorTerrainWire={o.colorTerrainWire}
          onSurfaceClick={onSurfaceClick}
          onStatusChange={onStatusChange}
          onTextureReady={onTextureReady}
          onTextureDownloadInfo={onTextureDownloadInfo}
          isMoving={!isFullyIdle}
          options={o}
          clippingPlanes={compositeClippingPlanes}
        />
      ))}

      {/* ─── CAVE MODEL (Movable for calibration) ─── */}
      <ModernGizmo visible={o.showGizmo && isMoving} modelScale={diag * 0.45} />
      <group position={[
        o.caveCalibrationOffset?.x || 0, 
        o.caveCalibrationOffset?.z || 0, 
        -(o.caveCalibrationOffset?.y || 0)
      ]}>
        {/* ── Entrances ── */}
        <group visible={isFullyIdle || !isLargeModel}>
          <EntranceMarkers cave={cave} options={o} />
        </group>
        
        {/* ── Jaskyniar (Mierka) ── */}
        {o.placedCaver && (
          <Character3D 
            pos={o.placedCaver.pos} 
            pose={o.placedCaver.pose} 
            clippingPlanes={compositeClippingPlanes}
          />
        )}

        {/* ── Cave scraps ── */}
        {(o.showScraps || o.accurateScraps || o.scrapsWireframe) && cave.scraps?.length > 0 && (
          <Scraps
            cave={cave} opacity={o.scrapsOpacity}
            // Ak beží Surface Nets, vypneme "Solid" v tomto komponente, aby sa neprekrývali
            showSolid={o.showScraps && o.scrapsSolid && !o.useSurfaceNet}
            showWire={o.scrapsWireframe}
            showAltitude={o.scrapsAltitude}
            smooth={o.smoothScraps && !o.accurateScraps}
            showRender={o.showRenderCave}
            caveTexture={o.caveTexture}
            renderOpacity={o.renderOpacity}
            isMoving={isMoving}
            isFullyIdle={isFullyIdle}
            options={o}
            clippingPlanes={caveClippingPlanes}
            onSurfaceClick={handleModelClick}
          />
        )}
        
        {/* ── Splay SDF Cave Walls (2D) ── */}
        {o.enableSplayWalls && (
          <SplayCaveWalls 
            cave={cave} 
            options={o} 
            showAltitude={o.splayAltitude ?? true}
            clippingPlanes={caveClippingPlanes}
            isMoving={!isFullyIdle}
            onStatusChange={onStatusChange}
          />
        )}

        {/* ── LiDAR Point Cloud ── */}
        {o.showScraps && cave.pointCount > 0 && cave.isLiDAR && (
          <PointCloud 
            key={`pointcloud-${o.scrapsAltitude}-${o.showCaveLiDAR}`}
            cave={cave} 
            options={o} 
            clippingPlanes={caveClippingPlanes} 
            onSurfaceClick={handleModelClick}
            isMoving={!isFullyIdle} 
          />
        )}

        {/* ── Organický vyhladený model (nezávislý od "Zobraziť steny", rovnaké správanie ako Splay SDF steny) ── */}
        {cave.pointCount > 0 && cave.isLiDAR && (
          <OrganicShell 
            key={`organic-${o.organicLevel}-${o.organicVoxelSize}-${o.organicDilation}-${o.smoothScraps}-${o.accurateScraps}`}
            cave={cave} 
            options={o} 
            clippingPlanes={caveClippingPlanes} 
            onSurfaceClick={handleModelClick}
            isMoving={!isFullyIdle} 
          />
        )}

        {/* ── Cave traverse (3D rúrky) ── */}
        {o.showCenterline !== false && o.showTraverse && cave.segments?.length > 0 && (
          <CaveTraverse 
            cave={cave} 
            radius={o.traverseRadius} 
            showAltitude={o.traverseAltitude} 
            isMoving={!isFullyIdle} 
            clippingPlanes={caveClippingPlanes}
          />
        )}

        {/* ── Survey legs ── */}
        <CaveLegs 
          cave={cave} 
          showSplay={o.showSplay} 
          showAltitude={o.traverseAltitude} 
          options={o} 
          clippingPlanes={compositeClippingPlanes}
          isMoving={!isFullyIdle}
          isLargeModel={isLargeModel}
        />

        {/* ── Station dots & labels & clickable targets ── */}
        <Stations cave={cave} options={o} />
        <SurveyPointPicker cave={cave} options={o} onStationClick={onStationClick} />
        <group visible={isFullyIdle}>
          {(o.showStationNames || o.showStationAlt) && (
            <StationLabels cave={cave} showNames={o.showStationNames} showAltitudes={o.showStationAlt} options={o} />
          )}
        </group>

        {isMeasuringMode
          ? <MeasurementOverlay stations={selectedStations ?? []} />
          : manualConnection && <ManualConnection p1={manualConnection.p1} p2={manualConnection.p2} />}
        {selectedStations && selectedStations.length === 3 && (
          <TectonicPlaneVisual
            p1={selectedStations[0].pos}
            p2={selectedStations[1].pos}
            p3={selectedStations[2].pos}
          />
        )}
        {selectedStations && selectedStations.length === 1 && selectedStations[0].distToSurf !== null && selectedStations[0].surfaceZ !== null && (
          <SurfaceDepthVisual station={selectedStations[0]} lang={lang} />
        )}
      </group>
 
      {/* ── Auto-fit pri zmene jaskyne alebo aktivácii triggera ── */}
      <AutoFit cave={cave} trigger={fitTrigger} />
 
      {/* ── Kompas / Gizmo v rohu ── */}
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ef4444', '#84cc16', '#3b82f6']} labelColor="white" labels={['V', 'H', 'J']} />
      </GizmoHelper>

      <DynamicGrid options={o} cameraData={camData} />
      {o.showBoundingBox && <BoundingBox cave={cave} show={o.showBoundingBox} options={o} />}

      <OrbitControls
        makeDefault
        enableDamping={!isLargeModel}
        dampingFactor={isLargeModel ? 0.2 : 0.05}
        onStart={handleCameraMoveStart}
        onEnd={handleCameraMoveEnd}
        onChange={handleCameraChange}
        rotateSpeed={isLargeModel ? 0.9 : 0.6}
        zoomSpeed={isLargeModel ? 1.0 : 0.8}
        panSpeed={isLargeModel ? 1.0 : 0.8}
        minDistance={1}
        maxDistance={Math.max(diag * 25, 10000)}
        autoRotate={o.autoRotate}
        autoRotateSpeed={o.autoRotateSpeed}
      />

      {o.enableEDL && <EDLPass strength={o.edlStrength || 1.0} radius={o.edlRadius || 1.0} />}

      <CameraMonitor onUpdate={(data) => {
        setCamData(data)
        if (onCameraUpdate) onCameraUpdate(data)
      }} />
    </Canvas>
  )
}


// ─── Map Georeferencing Utilities ─────────────────────────────────────────────


export default React.memo(CaveViewer3D)
