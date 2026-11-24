import React, { useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { SelStation } from '../../App'

export interface SurfaceDepthVisualProps {
  station: SelStation
  lang?: string
}

export const SurfaceDepthVisual: React.FC<SurfaceDepthVisualProps> = React.memo(({ station, lang = 'sk' }) => {
  const {
    distToSurf,
    surfaceZ,
    pos,
    closestSurfDist,
    closestSurfPos,
    closestSurfAltitude,
  } = station

  if (distToSurf === null || distToSurf === undefined || !Number.isFinite(distToSurf) || !pos) {
    return null
  }

  // Súradnice stanice a kolmého povrchu v Three.js priestore (Y je hore, Z je -Cave Y)
  const pStation = useMemo(() => new THREE.Vector3(pos.x, pos.z, -pos.y), [pos])
  const pVert = useMemo(() => new THREE.Vector3(pos.x, pos.z + distToSurf, -pos.y), [pos, distToSurf])
  const midVert = useMemo(() => new THREE.Vector3(pos.x, pos.z + distToSurf / 2, -pos.y), [pos, distToSurf])

  // Najbližší 3D bod na povrchu
  const pClosest = useMemo(() => {
    if (closestSurfPos) {
      return new THREE.Vector3(closestSurfPos.x, closestSurfPos.z, -closestSurfPos.y)
    }
    return pVert.clone()
  }, [closestSurfPos, pVert])

  const midClosest = useMemo(() => {
    return new THREE.Vector3(
      (pStation.x + pClosest.x) / 2,
      (pStation.y + pClosest.y) / 2,
      (pStation.z + pClosest.z) / 2
    )
  }, [pStation, pClosest])

  // Zisťujeme, či sa kolmica a 3D najbližší bod líšia (aspoň o 25 cm)
  const isDistinct = useMemo(() => {
    return pVert.distanceTo(pClosest) >= 0.25
  }, [pVert, pClosest])

  const isBelow = distToSurf >= 0
  const vertDepthText = `${Math.abs(distToSurf).toFixed(1)} m`
  const closestDist = closestSurfDist !== null && closestSurfDist !== undefined ? closestSurfDist : Math.abs(distToSurf)
  const closestText = `${closestDist.toFixed(1)} m`

  const subVert = lang === 'sk' ? 'kolmo hore' : lang === 'de' ? 'senkrecht' : lang === 'fr' ? 'à l\'aplomb' : 'vertical'
  const subClosest = lang === 'sk' ? 'najbližší povrch (3D)' : lang === 'de' ? 'nächste Oberfläche (3D)' : lang === 'fr' ? 'surface la plus proche (3D)' : 'closest surface (3D)'
  const subCombined = lang === 'sk' ? 'kolmo / min. k povrchu' : lang === 'de' ? 'senkrecht / nächste Oberfläche' : lang === 'fr' ? 'à l\'aplomb / plus proche' : 'vertical / closest surface'
  const surfLabel = lang === 'sk' ? 'Povrch' : lang === 'de' ? 'Oberfläche' : lang === 'fr' ? 'Surface' : 'Surface'

  return (
    <group>
      {/* ── Zvýraznenie stanice v jaskyni (kontrastná sféra) ── */}
      <mesh position={pStation} renderOrder={170}>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" depthTest={false} />
      </mesh>
      <mesh position={pStation} renderOrder={165}>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.5} depthTest={false} />
      </mesh>

      {/* ── 1. NAJKRATŠIA 3D SPOJNICA K POVRCHU (výrazná jantárová / oranžová) ── */}
      <Line
        points={[pStation, pClosest]}
        color="#f59e0b"
        lineWidth={3.8}
        dashed={true}
        dashScale={1}
        dashSize={0.9}
        gapSize={0.35}
        depthTest={false}
        transparent
        opacity={0.95}
        renderOrder={155}
      />

      {/* Terč na najbližšom bode povrchu */}
      <group position={pClosest} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh renderOrder={165}>
          <ringGeometry args={[0.4, 0.85, 32]} />
          <meshBasicMaterial color="#f59e0b" side={THREE.DoubleSide} transparent opacity={0.9} depthTest={false} />
        </mesh>
        <mesh renderOrder={165}>
          <circleGeometry args={[0.18, 16]} />
          <meshBasicMaterial color="#d97706" side={THREE.DoubleSide} transparent opacity={0.95} depthTest={false} />
        </mesh>
      </group>

      {/* Kóta na polceste najbližšej 3D vzdialenosti */}
      <Html position={midClosest} center distanceFactor={14}>
        <div style={{
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(6px)',
          border: '1.5px solid rgba(245, 158, 11, 0.85)',
          borderRadius: '6px',
          padding: '3px 8px',
          color: '#f8fafc',
          fontSize: '11px',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
          textAlign: 'center',
          userSelect: 'none'
        }}>
          <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '12px' }}>
            ★ {closestText}
          </div>
          <div style={{ fontSize: '9px', color: '#fde68a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isDistinct ? subClosest : subCombined}
          </div>
        </div>
      </Html>

      {/* Nadmorská výška v najbližšom bode povrchu */}
      {closestSurfAltitude !== null && closestSurfAltitude !== undefined && (
        <Html position={[pClosest.x, pClosest.y + 0.45, pClosest.z]} center distanceFactor={14}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.90)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(245, 158, 11, 0.55)',
            borderRadius: '4px',
            padding: '2px 7px',
            color: '#cbd5e1',
            fontSize: '10px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none'
          }}>
            {surfLabel}: <span style={{ color: '#fbbf24', fontWeight: 600 }}>{closestSurfAltitude.toFixed(1)} m n.m.</span>
            {station.closestSurfGps && (
              <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: '9px' }}>
                ({station.closestSurfGps.lat.toFixed(5)}°, {station.closestSurfGps.lon.toFixed(5)}°)
              </span>
            )}
          </div>
        </Html>
      )}

      {/* ── 2. VERTIKÁLNA SPOJNICA (KOLMO HORE) - svetlomodrá cyan, jemnejšia ── */}
      {isDistinct && (
        <>
          <Line
            points={[pStation, pVert]}
            color="#38bdf8"
            lineWidth={1.8}
            dashed={true}
            dashScale={1}
            dashSize={0.6}
            gapSize={0.4}
            depthTest={false}
            transparent
            opacity={0.8}
            renderOrder={150}
          />

          {/* Terč kolmo hore */}
          <group position={pVert} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh renderOrder={160}>
              <ringGeometry args={[0.3, 0.65, 32]} />
              <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.75} depthTest={false} />
            </mesh>
            <mesh renderOrder={160}>
              <circleGeometry args={[0.12, 16]} />
              <meshBasicMaterial color="#0284c7" side={THREE.DoubleSide} transparent opacity={0.85} depthTest={false} />
            </mesh>
          </group>

          {/* Kóta na polceste kolmej hĺbky */}
          <Html position={midVert} center distanceFactor={14}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: '5px',
              padding: '2px 6px',
              color: '#f8fafc',
              fontSize: '10px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
              textAlign: 'center',
              userSelect: 'none'
            }}>
              <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '11px' }}>
                {isBelow ? '▼' : '▲'} {vertDepthText}
              </div>
              <div style={{ fontSize: '8.5px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {subVert}
              </div>
            </div>
          </Html>

          {/* Nadmorská výška kolmo hore na povrchu */}
          {surfaceZ !== null && surfaceZ !== undefined && (
            <Html position={[pVert.x, pVert.y + 0.4, pVert.z]} center distanceFactor={14}>
              <div style={{
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '4px',
                padding: '2px 6px',
                color: '#94a3b8',
                fontSize: '10px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                userSelect: 'none'
              }}>
                {surfLabel} (kolmo): <span style={{ color: '#38bdf8', fontWeight: 600 }}>{surfaceZ.toFixed(1)} m n.m.</span>
              </div>
            </Html>
          )}
        </>
      )}
    </group>
  )
})
