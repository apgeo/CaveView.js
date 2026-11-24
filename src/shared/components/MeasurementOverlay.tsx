import { Html, Line } from '@react-three/drei'
import type { SelStation } from '../../App'

export function MeasurementOverlay({ stations }: { stations: SelStation[] }) {
  const points: [number, number, number][] = stations.map(s => [s.pos.x, s.pos.z, -s.pos.y])
  return <group renderOrder={1000}>
    {points.length > 1 && <Line
      points={points.length > 2 ? [...points, points[0]] : points}
      color="#38bdf8" lineWidth={2.5} transparent depthTest={false} depthWrite={false} toneMapped={false} renderOrder={200}
    />}
    {points.map((point, i) => <Html key={i} position={point} center zIndexRange={[90, 80]} style={{ pointerEvents: 'none' }}>
      <span style={{
        display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%',
        border: '2px solid white', background: '#0369a1', color: 'white', fontSize: 11,
        fontWeight: 800, boxShadow: '0 2px 8px #0009',
      }}>{i < 2 ? ['A', 'B'][i] : i + 1}</span>
    </Html>)}
    {points.length === 2 && <Html center position={[
      (points[0][0] + points[1][0]) / 2,
      (points[0][1] + points[1][1]) / 2,
      (points[0][2] + points[1][2]) / 2,
    ]} style={{ pointerEvents: 'none' }} zIndexRange={[90, 80]}>
      <span style={{ background: '#0f172aee', color: '#7dd3fc', padding: '5px 9px', border: '1px solid #38bdf8', borderRadius: 6, whiteSpace: 'nowrap', font: '600 12px monospace' }}>
        {Math.hypot(
          stations[1].pos.x - stations[0].pos.x,
          stations[1].pos.y - stations[0].pos.y,
          stations[1].pos.z - stations[0].pos.z,
        ).toFixed(2)} m
      </span>
    </Html>}
  </group>
}
