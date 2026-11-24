import React, { useMemo } from 'react'
import type { ViewerCameraSnapshot } from '@shared/types'

export interface CompassRoseProps {
  cameraData: ViewerCameraSnapshot | null
  onResetNorth?: () => void
  lang?: 'sk' | 'en' | 'fr' | 'de'
  size?: number
}

const CARDINALS_SK = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ']
const CARDINALS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export const CompassRose: React.FC<CompassRoseProps> = ({
  cameraData,
  onResetNorth,
  lang = 'sk',
  size = 54
}) => {
  // Compute horizontal azimuth / heading (0° = North, 90° = East, 180° = South, 270° = West)
  const headingDeg = useMemo(() => {
    if (!cameraData) return 0
    const [px, , pz] = cameraData.position
    const [tx, , tz] = cameraData.target

    // Forward vector in horizontal X-Z plane
    // In our coordinate system: -Z is North, +X is East, +Z is South, -X is West
    const dx = tx - px
    const dz = tz - pz

    if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) {
      // Looking straight down/up - fallback to camera quaternion
      const [qx, qy, qz, qw] = cameraData.quaternion
      const siny_cosp = 2 * (qw * qy + qx * qz)
      const cosy_cosp = 1 - 2 * (qy * qy + qz * qz)
      let yaw = Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI)
      return (yaw + 360) % 360
    }

    let rad = Math.atan2(dx, -dz)
    let deg = rad * (180 / Math.PI)
    if (deg < 0) deg += 360
    return deg
  }, [cameraData])

  const cardinalLabel = useMemo(() => {
    const cardinals = lang === 'sk' ? CARDINALS_SK : CARDINALS_EN
    const index = Math.round(headingDeg / 45) % 8
    return cardinals[index]
  }, [headingDeg, lang])

  const handleClick = () => {
    if (onResetNorth) {
      onResetNorth()
    } else {
      window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))
    }
  }

  // The compass rose dial rotates by -headingDeg so the 'N' mark points in the actual direction of North
  const needleRotation = -headingDeg

  return (
    <div
      onClick={handleClick}
      title={lang === 'sk' ? `Azimut: ${Math.round(headingDeg)}° (${cardinalLabel}) • Kliknutím vyrovnať na Sever` : `Heading: ${Math.round(headingDeg)}° (${cardinalLabel}) • Click to reset North`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: '50%',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4), 0 0 10px rgba(59, 130, 246, 0.2)',
        transition: 'transform 0.15s ease, border-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.06)'
        e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.6)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{
          transform: `rotate(${needleRotation}deg)`,
          transition: 'transform 0.05s linear',
        }}
      >
        {/* Outer Ring */}
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(148, 163, 184, 0.2)" strokeWidth="2" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" strokeDasharray="2,3" />

        {/* Degree Ticks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = i * 30
          const isCardinal = angle % 90 === 0
          return (
            <line
              key={i}
              x1="50"
              y1={isCardinal ? "8" : "11"}
              x2="50"
              y2={isCardinal ? "15" : "14"}
              stroke={isCardinal ? "#94a3b8" : "rgba(148, 163, 184, 0.4)"}
              strokeWidth={isCardinal ? "2" : "1"}
              transform={`rotate(${angle} 50 50)`}
            />
          )
        })}

        {/* North Indicator (Red arrow) */}
        <polygon points="50,14 56,48 50,44 44,48" fill="#ef4444" />
        {/* South Indicator (Silver arrow) */}
        <polygon points="50,86 56,52 50,56 44,52" fill="#94a3b8" />

        {/* Cardinal Letter N */}
        <text
          x="50"
          y="27"
          fill="#f87171"
          fontSize="11"
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {lang === 'sk' ? 'S' : 'N'}
        </text>

        {/* Center Pivot */}
        <circle cx="50" cy="50" r="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
      </svg>

      {/* Dynamic Azimuth Badge under the dial */}
      <div
        style={{
          position: 'absolute',
          bottom: '-16px',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '4px',
          padding: '1px 4px',
          fontSize: '8px',
          fontWeight: 700,
          fontFamily: 'monospace',
          color: '#38bdf8',
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      >
        {`${Math.round(headingDeg).toString().padStart(3, '0')}° ${cardinalLabel}`}
      </div>
    </div>
  )
}
