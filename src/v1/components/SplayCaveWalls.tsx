import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { elevColor, normZ } from '@shared/utils/colorUtils';
import { getSplayCacheKey, getCachedSplayGeometry, setCachedSplayGeometry } from '../utils/splayCache';
import { ClippingEdges } from '@shared/components/Scraps';
import type {
  SplayCaveWallsProps,
  SplayWorkerInputMessage,
  SplayWorkerOutputMessage,
  SplayWorkerConfig,
  SplayMeshGeometryData,
  SplayPoint,
  StationWithSplays,
} from '../types/splayTypes';

if (!(THREE.BufferGeometry.prototype as any).computeBoundsTree) {
  (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
  (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

function createSplayBufferGeometry(
  data: SplayMeshGeometryData,
  cave: any
): THREE.BufferGeometry {
  const { positions, normals, indices, vertexCount } = data;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  // Recompute bounding sphere/box for Three.js frustum culling
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // Precompute BVH bounds tree for rapid raycasting and cross-section clipping edges
  if ((geo as any).computeBoundsTree) {
    (geo as any).computeBoundsTree();
  }

  // Calculate altitude vertex colors for "Color by height"
  const minZ = cave?.bounds?.min ? cave.bounds.min.z : (geo.boundingBox ? geo.boundingBox.min.y : 0);
  const maxZ = cave?.bounds?.max ? cave.bounds.max.z : (geo.boundingBox ? geo.boundingBox.max.y : 100);

  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const y = positions[i * 3 + 1]; // Three.js Y represents vertical altitude
    const c = elevColor(normZ(y, minZ, maxZ));
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * High-performance R3F Component for generating solid, watertight 3D cave walls
 * from radial survey splay measurements using Signed Distance Fields (SDF) and Surface Nets.
 * 
 * Runs all heavy math and isosurface extraction in a background Web Worker,
 * receiving zero-copy geometry buffers (positions, normals, indices).
 */
export const SplayCaveWalls: React.FC<SplayCaveWallsProps> = ({
  stations: stationsProp,
  cave,
  options,
  clippingPlanes,
  isMoving = false,
  showAltitude: showAltitudeProp,
  voxelSize: voxelSizeProp,
  padding: paddingProp,
  smoothK: smoothKProp,
  isovalue: isovalueProp,
  includeTraverseCapsules = true,
  capsuleRadius: capsuleRadiusProp,
  color,
  roughness = 0.85,
  metalness = 0.1,
  opacity,
  transparent,
  wireframe = false,
  onGenerated,
  onError,
  onStatusChange,
}) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const workerRef = useRef<Worker | null>(null);

  const voxelSize = voxelSizeProp ?? options?.splayVoxelSize ?? 0.22;
  const padding = paddingProp ?? options?.splayPadding ?? 0.6;
  const smoothK = smoothKProp ?? options?.splaySmoothK ?? 0.06; // Sharp, angular, non-bloated cave facets
  const isovalue = isovalueProp ?? options?.splayIsovalue ?? 0.0;
  const capsuleRadius = capsuleRadiusProp ?? options?.splayCapsuleRadius ?? 0.10; // Tight corridor radius

  const showAltitude = showAltitudeProp ?? options?.splayAltitude ?? options?.scrapsAltitude ?? true;
  const wallColor = color ?? options?.colorScraps ?? '#cbd5e1';
  const wallOpacity = opacity ?? options?.scrapsOpacity ?? 0.85;
  const wallTransparent = transparent ?? (wallOpacity < 1.0);

  const stations = useMemo(() => {
    if (stationsProp && stationsProp.length > 0) return stationsProp;
    if (!cave || !cave.segments) return [];

    const stationMap = new Map<string, { 
      pos: SplayPoint; 
      splays: SplayPoint[]; 
      connected: SplayPoint[];
      hasCaveLeg: boolean;
      hasSurfaceLeg: boolean;
    }>();

    // 1. First pass: map stations and classify underground cave vs surface surveys
    cave.segments.forEach((seg: any) => {
      if (!seg.from || !seg.to) return;
      const kFrom = `${seg.from.x.toFixed(2)},${seg.from.y.toFixed(2)},${seg.from.z.toFixed(2)}`;
      const kTo = `${seg.to.x.toFixed(2)},${seg.to.y.toFixed(2)},${seg.to.z.toFixed(2)}`;

      if (!stationMap.has(kFrom)) {
        stationMap.set(kFrom, {
          pos: { x: seg.from.x, y: seg.from.z, z: -seg.from.y },
          splays: [],
          connected: [],
          hasCaveLeg: false,
          hasSurfaceLeg: false,
        });
      }
      if (!stationMap.has(kTo)) {
        stationMap.set(kTo, {
          pos: { x: seg.to.x, y: seg.to.z, z: -seg.to.y },
          splays: [],
          connected: [],
          hasCaveLeg: false,
          hasSurfaceLeg: false,
        });
      }

      if (seg.type === 'cave') {
        stationMap.get(kFrom)!.hasCaveLeg = true;
        stationMap.get(kTo)!.hasCaveLeg = true;
        const pTo: SplayPoint = { x: seg.to.x, y: seg.to.z, z: -seg.to.y };
        stationMap.get(kFrom)!.connected.push(pTo);
      } else if (seg.type === 'surface') {
        stationMap.get(kFrom)!.hasSurfaceLeg = true;
        stationMap.get(kTo)!.hasSurfaceLeg = true;
      }
    });

    // 2. Second pass: attach splays ONLY for cave / underground stations (ignore surface survey polygon splays)
    cave.segments.forEach((seg: any) => {
      if (seg.type !== 'splay' || !seg.from || !seg.to) return;
      const kFrom = `${seg.from.x.toFixed(2)},${seg.from.y.toFixed(2)},${seg.from.z.toFixed(2)}`;
      const stData = stationMap.get(kFrom);
      if (!stData) return;

      // If station only belongs to a surface polygon and has no underground cave legs, skip it
      if (stData.hasSurfaceLeg && !stData.hasCaveLeg) return;

      const pTo: SplayPoint = { x: seg.to.x, y: seg.to.z, z: -seg.to.y };
      stData.splays.push(pTo);
    });

    const totalSplays = Array.from(stationMap.values()).reduce((sum, s) => sum + s.splays.length, 0);
    if (totalSplays === 0) {
      return [];
    }

    return Array.from(stationMap.entries())
      .filter(([_, data]) => {
        // Exclude pure surface stations
        if (data.hasSurfaceLeg && !data.hasCaveLeg) return false;
        // Include cave stations that have splays or underground cave traverse connections
        return data.splays.length > 0 || data.connected.length > 0;
      })
      .map(([id, data]) => ({
        id,
        position: data.pos,
        splays: data.splays,
        connectedTo: data.connected,
      }));
  }, [stationsProp, cave]);

  // Memoize configuration payload to avoid unnecessary re-computations
  const config: SplayWorkerConfig = useMemo(
    () => ({
      voxelSize,
      padding,
      smoothK,
      isovalue,
      includeTraverseCapsules,
      capsuleRadius,
    }),
    [voxelSize, padding, smoothK, isovalue, includeTraverseCapsules, capsuleRadius]
  );

  useEffect(() => {
    if (!stations || stations.length === 0) {
      if (geometry) {
        geometry.dispose();
        setGeometry(null);
      }
      if (onStatusChange) {
        onStatusChange({
          msg: 'Tento model neobsahuje pomocné splay zámery (lúče na steny) pre 2D SDF rekonštrukciu.',
          type: 'info',
        });
        setTimeout(() => {
          if (onStatusChange) onStatusChange(null);
        }, 4000);
      }
      return;
    }

    const caveId = cave?.name || (cave?.bounds?.min ? `${cave.bounds.min.x.toFixed(1)}_${cave.bounds.min.y.toFixed(1)}` : 'default');
    const cacheKey = getSplayCacheKey(
      caveId,
      stations.length,
      config.voxelSize,
      config.smoothK,
      config.capsuleRadius,
      config.isovalue
    );

    // 1. Check in-memory session cache for instant reuse
    const cached = getCachedSplayGeometry(cacheKey);
    if (cached) {
      const geo = createSplayBufferGeometry(cached, cave);
      setGeometry(prev => {
        if (prev) {
          (prev as any).disposeBoundsTree?.();
          prev.dispose();
        }
        return geo;
      });
      setIsComputing(false);
      if (onGenerated) {
        onGenerated({
          vertexCount: cached.vertexCount,
          triangleCount: cached.triangleCount,
          durationMs: 0,
        });
      }
      return;
    }

    // 2. Terminate any previous worker instance and run computation
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setIsComputing(true);
    if (onStatusChange) {
      onStatusChange({
        msg: 'Generujem 3D steny jaskyne (Splay SDF)... Prosím čakajte.',
        type: 'progress',
        progress: 5,
      });
    }

    // Instantiate background Web Worker
    const worker = new Worker(
      new URL('../workers/splayWall.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<SplayWorkerOutputMessage>) => {
      const data = e.data;

      if (data.status === 'progress') {
        if (onStatusChange) {
          onStatusChange({
            msg: data.message || `Generujem 3D steny jaskyne (Splay SDF)... ${data.progress}%`,
            type: 'progress',
            progress: data.progress,
          });
        }
      } else if (data.status === 'success' && data.geometry) {
        // Save to session cache for instant future toggle
        setCachedSplayGeometry(cacheKey, data.geometry);

        const geo = createSplayBufferGeometry(data.geometry, cave);

        // Safely dispose old geometry
        setGeometry(prev => {
          if (prev) {
            (prev as any).disposeBoundsTree?.();
            prev.dispose();
          }
          return geo;
        });

        setIsComputing(false);

        if (onStatusChange) {
          onStatusChange({
            msg: `Splay SDF steny vygenerované (${data.geometry.triangleCount.toLocaleString()} trojuholníkov za ${(data.durationMs / 1000).toFixed(1)}s)`,
            type: 'success',
          });
          setTimeout(() => {
            if (onStatusChange) onStatusChange(null);
          }, 3500);
        }

        if (onGenerated) {
          onGenerated({
            vertexCount: data.geometry.vertexCount,
            triangleCount: data.geometry.triangleCount,
            durationMs: data.durationMs,
          });
        }
      } else if (data.status === 'error') {
        setIsComputing(false);
        if (onStatusChange) {
          onStatusChange({
            msg: `Chyba pri generovaní Splay SDF stien: ${data.error}`,
            type: 'error',
          });
        }
        if (onError) onError(data.error);
      }
    };

    worker.onerror = (err: ErrorEvent) => {
      setIsComputing(false);
      const errMsg = err.message || 'Worker computation error';
      if (onStatusChange) {
        onStatusChange({
          msg: `Chyba Splay SDF workera: ${errMsg}`,
          type: 'error',
        });
      }
      if (onError) onError(errMsg);
    };

    const inputMsg: SplayWorkerInputMessage = {
      type: 'GENERATE_SURFACE',
      stations,
      config,
    };

    worker.postMessage(inputMsg);

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [stations, config, cave, onGenerated, onError, onStatusChange]);

  // Clean up geometry resource on unmount
  useEffect(() => {
    return () => {
      if (geometry) {
        (geometry as any).disposeBoundsTree?.();
        geometry.dispose();
      }
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          key={showAltitude ? 'alt' : 'mono'}
          color={showAltitude ? '#ffffff' : wallColor}
          vertexColors={showAltitude}
          roughness={roughness}
          metalness={metalness}
          opacity={wallOpacity}
          transparent={wallTransparent}
          wireframe={wireframe}
          side={THREE.DoubleSide}
          clippingPlanes={clippingPlanes}
        />
      </mesh>
      <ClippingEdges
        geo={geometry}
        planes={clippingPlanes || []}
        active={options?.showClippingEdges ?? true}
        color={options?.colorClippingEdges || '#ff4444'}
      />
    </>
  );
};

export default SplayCaveWalls;
