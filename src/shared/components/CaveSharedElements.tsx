import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Html, Text, Line } from '@react-three/drei';
import type { ParsedCave, ViewerOptions, StationLabel, Segment, Scrap } from '@shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CYL_UP = new THREE.Vector3(0, 1, 0);

const ELEV_STOPS: [number, [number, number, number]][] = [
  [0.00, [0.08, 0.18, 0.65]],
  [0.18, [0.10, 0.48, 0.85]],
  [0.35, [0.12, 0.78, 0.72]],
  [0.50, [0.18, 0.87, 0.38]],
  [0.65, [0.80, 0.94, 0.10]],
  [0.80, [0.97, 0.60, 0.05]],
  [1.00, [0.88, 0.10, 0.10]],
];

function elevColor(t: number): THREE.Color {
  const clampedT = Math.max(0, Math.min(1, t));
  for (let i = 0; i < ELEV_STOPS.length - 1; i++) {
    const [t0, c0] = ELEV_STOPS[i];
    const [t1, c1] = ELEV_STOPS[i + 1];
    if (clampedT >= t0 && clampedT <= t1) {
      const f = (clampedT - t0) / (t1 - t0);
      return new THREE.Color(
        c0[0] + f * (c1[0] - c0[0]),
        c0[1] + f * (c1[1] - c0[1]),
        c0[2] + f * (c1[2] - c0[2]),
      );
    }
  }
  return new THREE.Color(0.88, 0.10, 0.10);
}

function normZ(z: number, minZ: number, maxZ: number): number {
  return maxZ === minZ ? 0.5 : Math.max(0, Math.min(1, (z - minZ) / (maxZ - minZ)));
}

// ─── Components ───────────────────────────────────────────────────────────────

export const Stations = React.memo(({ cave, options: o }: { cave: ParsedCave, options: ViewerOptions }) => {
  const geos = useMemo(() => {
    let numPoly = 0, numSplay = 0;
    for (let i = 0; i < cave.stations.length; i++) {
      const lbl = cave.stationLabels?.[i];
      if (lbl && lbl.name !== '') numPoly++;
      else numSplay++;
    }

    const pP = new Float32Array(numPoly * 3);
    const pS = new Float32Array(numSplay * 3);
    let idxP = 0, idxS = 0;

    for (let i = 0; i < cave.stations.length; i++) {
      const s = cave.stations[i];
      const lbl = cave.stationLabels?.[i];
      if (lbl && lbl.name !== '') {
        pP[idxP++] = s.x; pP[idxP++] = s.z; pP[idxP++] = -s.y;
      } else {
        pS[idxS++] = s.x; pS[idxS++] = s.z; pS[idxS++] = -s.y;
      }
    }
    const gP = new THREE.BufferGeometry();
    gP.setAttribute('position', new THREE.BufferAttribute(pP, 3));
    const gS = new THREE.BufferGeometry();
    gS.setAttribute('position', new THREE.BufferAttribute(pS, 3));
    const fixedPositions = cave.stationLabels.filter(label => label.isFixed).flatMap(label => [label.pos.x, label.pos.z, -label.pos.y])
    const fixedGeo = new THREE.BufferGeometry()
    fixedGeo.setAttribute('position', new THREE.Float32BufferAttribute(fixedPositions, 3))
    return { polyGeo: gP, splayGeo: gS, fixedGeo };
  }, [cave]);

  useEffect(() => {
    return () => {
      geos.polyGeo.dispose();
      geos.splayGeo.dispose();
      geos.fixedGeo.dispose();
    }
  }, [geos]);

  if (!o.showStations && !o.showSplay && !o.showFixedStations) return null;

  return (
    <group renderOrder={12}>
      {o.showFixedStations && <points geometry={geos.fixedGeo}>
        <pointsMaterial color="#fbbf24" size={9} sizeAttenuation={false} depthTest={true} />
      </points>}
      {o.showSplay && (
        <points geometry={geos.splayGeo}>
          <pointsMaterial color={o.colorStations} size={2} sizeAttenuation={false} depthTest={true} />
        </points>
      )}
      {o.showStations && (
        <points geometry={geos.polyGeo}>
          <pointsMaterial color={o.colorStations} size={5} sizeAttenuation={false} depthTest={true} />
        </points>
      )}
    </group>
  );
});

export const StationLabels = React.memo(({ cave, showNames, showAltitudes, options: o }: { cave: ParsedCave; showNames: boolean; showAltitudes: boolean, options: ViewerOptions }) => {
  if (!showNames && !showAltitudes) return null;
  if (!cave.stationLabels?.length) return null;
  const maxLabels = cave.stationLabels.length > 500 ? 50 : 100;
  const labels = cave.stationLabels.length > maxLabels
    ? cave.stationLabels.filter((_: any, i: number) => i % Math.ceil(cave.stationLabels.length / maxLabels) === 0)
    : cave.stationLabels;

  const baseAlt = cave.stationLabels?.[0]?.altitude ?? (cave.stations?.[0] ? (cave.stations[0].z + (cave.centerOffset?.z || 0)) : 0);
  const isRel = o.altitudeMode === 'relative';
    
  return (
    <>
      {labels.map((sl: StationLabel, i: number) => {
        const displayAlt = isRel ? (sl.altitude - baseAlt) : sl.altitude;
        const sign = (isRel && displayAlt > 0) ? '+' : '';
        return (
          <Html key={i} position={[sl.pos.x, sl.pos.z + 0.8, -sl.pos.y]}
            style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }} occlude={false}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
              {showNames && sl.name !== '' && (
                <span style={{ fontSize: '9px', fontFamily: 'Inter, monospace', color: o.colorStationNames, fontWeight: 600, textShadow: '0 0 3px #000,0 0 6px #000', lineHeight: 1.2 }}>
                  {o.stationLabelMode === 'gps'
                    ? sl.gps ? `${sl.gps.lat.toFixed(6)}, ${sl.gps.lon.toFixed(6)}` : '—'
                    : o.stationLabelMode === 'short' ? sl.name.split('@')[0].split('.').pop()
                      : o.stationLabelMode === 'full' ? sl.qualifiedName || sl.fullLabel || sl.name : sl.name}
                </span>
              )}
              {showAltitudes && sl.name !== '' && (
                <span style={{ fontSize: '8px', fontFamily: 'Inter, monospace', color: o.colorStationAlt, textShadow: '0 0 3px #000,0 0 5px #000', lineHeight: 1.2 }}>
                  {sign}{displayAlt.toFixed(1)} m{isRel ? ' (rel)' : ''}
                </span>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
});

export const CaveLegs = React.memo(({ cave, showSplay, showAltitude, options: o, clippingPlanes, isMoving, isLargeModel }: { cave: ParsedCave; showSplay: boolean; showAltitude: boolean, options: ViewerOptions, clippingPlanes?: THREE.Plane[], isMoving?: boolean, isLargeModel?: boolean }) => {
  const caveLegs = useMemo(() => cave.segments.filter((s: Segment) => s.type === 'cave'), [cave]);
  const splayLegs = useMemo(() => cave.segments.filter((s: Segment) => s.type === 'splay'), [cave]);
  
  const zRange = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const s of caveLegs) {
      if (s.from.z < mn) mn = s.from.z; if (s.from.z > mx) mx = s.from.z;
      if (s.to.z < mn) mn = s.to.z; if (s.to.z > mx) mx = s.to.z;
    }
    return [mn, mx] as [number, number];
  }, [caveLegs]);

  const points = useMemo(() => {
    const pts: number[] = [];
    const colors: number[] = [];
    const [mnZ, mxZ] = zRange;

    caveLegs.forEach(seg => {
      pts.push(seg.from.x, seg.from.z, -seg.from.y);
      pts.push(seg.to.x, seg.to.z, -seg.to.y);
      
      if (showAltitude) {
        const c1 = elevColor(normZ(seg.from.z, mnZ, mxZ));
        const c2 = elevColor(normZ(seg.to.z, mnZ, mxZ));
        colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
      }
    });
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    if (showAltitude) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    return geo;
  }, [caveLegs, zRange, showAltitude]);

  const splayPoints = useMemo(() => {
    const pts: number[] = [];
    splayLegs.forEach(seg => {
      pts.push(seg.from.x, seg.from.z, -seg.from.y);
      pts.push(seg.to.x, seg.to.z, -seg.to.y);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, [splayLegs]);

  useEffect(() => {
    return () => {
      points.dispose();
    };
  }, [points]);

  useEffect(() => {
    return () => {
      splayPoints.dispose();
    };
  }, [splayPoints]);

  return (
    <group renderOrder={10}>
      {o.showCenterline !== false && <lineSegments geometry={points}>
        <lineBasicMaterial 
          color={o.colorTraverse} 
          vertexColors={showAltitude} 
          clippingPlanes={clippingPlanes}
          transparent={false}
          depthTest={true}
        />
      </lineSegments>}
      {showSplay && splayLegs.length > 0 && (!isMoving || !isLargeModel) && (
        <lineSegments geometry={splayPoints}>
          <lineBasicMaterial color={o.colorSplay} transparent opacity={0.45} depthTest={true} />
        </lineSegments>
      )}
    </group>
  );
});

export const EntranceMarkers = React.memo(({ cave, options: o }: { cave: ParsedCave, options: ViewerOptions }) => {
  if (!o.showEntrances) return null;
  const entrances = cave.stationLabels.filter((l: StationLabel) => l.isEntrance);
  
  return (
    <group>
      {entrances.map((ent, i) => (
        <group key={i} position={[ent.pos.x, ent.pos.z, -ent.pos.y]}>
          <Html center occlude={false}>
            <div style={{
              background: '#ef4444',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              border: '2px solid white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}>
              {ent.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
});

export const Character3D = React.memo(({ pos, pose, clippingPlanes }: { pos: [number, number, number], pose: 'standing' | 'crawling', clippingPlanes?: THREE.Plane[] }) => {
  const isStanding = pose === 'standing'
  
  return (
    <group position={pos}>
      {/* Svetlo jaskyniara - aby bol viditeľný v tme */}
      <pointLight position={isStanding ? [0, 1.6, 0.2] : [0, 0.4, 0.4]} intensity={0.6} distance={10} color="#fffec8" />
      
      {/* Telo / Kombinéza */}
      <mesh position={isStanding ? [0, 1.2, 0] : [0, 0.15, -0.4]}>
        <boxGeometry args={isStanding ? [0.38, 0.6, 0.2] : [0.35, 0.3, 1.1]} />
        <meshStandardMaterial color="#ef4444" emissive="#220000" clippingPlanes={clippingPlanes} />
      </mesh>
      
      {/* Nohy */}
      {isStanding && (
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.3, 0.9, 0.18]} />
          <meshStandardMaterial color="#ef4444" emissive="#220000" clippingPlanes={clippingPlanes} />
        </mesh>
      )}

      {/* Hlava / Prilba */}
      <mesh position={isStanding ? [0, 1.6, 0] : [0, 0.35, 0.1]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial color="#fbbf24" clippingPlanes={clippingPlanes} />
      </mesh>

      {/* Čelovka (Glow) */}
      <mesh position={isStanding ? [0, 1.65, 0.12] : [0, 0.4, 0.22]}>
        <boxGeometry args={[0.08, 0.05, 0.05]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
});

export const ManualConnection = React.memo(({ p1, p2 }: { p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number} }) => {
  if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p1.z) || isNaN(p2.x) || isNaN(p2.y) || isNaN(p2.z)) {
    return null;
  }

  const points = useMemo(() => [
    new THREE.Vector3(p1.x, p1.z, -p1.y),
    new THREE.Vector3(p2.x, p2.z, -p2.y)
  ], [p1, p2]);
  
  const dist = points[0].distanceTo(points[1]);
  const mid = points[0].clone().add(points[1]).multiplyScalar(0.5);

  return (
    <group>
      <Line points={points} color="#f87171" lineWidth={3} />
      <Html position={[mid.x, mid.y + 0.5, mid.z]}>
        <div style={{ background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
          {dist.toFixed(2)} m
        </div>
      </Html>
    </group>
  );
});
