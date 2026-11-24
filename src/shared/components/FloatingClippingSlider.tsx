import React from 'react'
import type { ParsedCave, ViewerOptions } from '@shared/types'

export interface FloatingClippingSliderProps {
  cave: ParsedCave
  opts: ViewerOptions
  setOpts: React.Dispatch<React.SetStateAction<ViewerOptions>>
  lang?: 'sk' | 'en' | 'fr' | 'de'
  onClose?: () => void
}

export const FloatingClippingSlider: React.FC<FloatingClippingSliderProps> = ({
  cave,
  opts,
  setOpts,
  lang = 'sk',
  onClose,
}) => {
  if (!opts.showClipping) return null

  const offsetZ = cave.centerOffset?.z || 0
  const minZ = (cave.bounds?.min?.z || 0) + offsetZ
  const maxZ = (cave.bounds?.max?.z || 100) + offsetZ

  // Reference altitude (e.g. entrance / 1st station or lowest point)
  const baseAltitude = cave.stationLabels?.[0]?.altitude ?? (cave.stations?.[0] ? (cave.stations[0].z + offsetZ) : minZ)
  const currentHeight = opts.clippingHeight

  const isRel = opts.altitudeMode === 'relative'
  const displayVal = isRel ? (currentHeight - baseAltitude) : currentHeight
  const displayUnit = isRel ? 'm (rel)' : 'm n.m.'
  const displaySign = (isRel && displayVal > 0) ? '+' : ''

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setOpts(p => ({ ...p, clippingHeight: val }))
  }

  const stepHeight = (delta: number) => {
    setOpts(p => {
      const next = Math.max(minZ, Math.min(maxZ, p.clippingHeight + delta))
      return { ...p, clippingHeight: next }
    })
  }

  const toggleAltMode = () => {
    setOpts(p => ({
      ...p,
      altitudeMode: p.altitudeMode === 'relative' ? 'absolute' : 'relative'
    }))
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: '18px',
        top: '60px',
        zIndex: 40,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(99, 102, 241, 0.4)',
        borderRadius: '10px',
        padding: '12px',
        color: '#f8fafc',
        width: '240px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 15px rgba(99, 102, 241, 0.2)',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#818cf8' }}>content_cut</span>
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px' }}>
            {lang === 'sk' ? 'Horizontálny rez Z' : 'Z-Plane Slice'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Toggle Altitude Mode */}
          <button
            onClick={toggleAltMode}
            title={lang === 'sk' ? 'Prepnúť Nadmorská výška (m n.m.) ↔ Relatívna (voči vchodu 0m)' : 'Toggle Absolute (ASL) ↔ Relative (0m entrance)'}
            style={{
              background: isRel ? 'rgba(56, 189, 248, 0.2)' : 'rgba(99, 102, 241, 0.2)',
              border: `1px solid ${isRel ? '#38bdf8' : '#818cf8'}`,
              color: isRel ? '#38bdf8' : '#818cf8',
              borderRadius: '4px',
              padding: '2px 5px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isRel ? 'REL 0m' : 'm n.m.'}
          </button>
          {/* Close button */}
          <button
            onClick={() => {
              if (onClose) onClose()
              else setOpts(p => ({ ...p, showClipping: false }))
            }}
            title={lang === 'sk' ? 'Zavrieť rez' : 'Close slice'}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>
      </div>

      {/* Altitude Display */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
          {lang === 'sk' ? 'Výška roviny:' : 'Plane height:'}
        </span>
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
          {displaySign}{displayVal.toFixed(2)} <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'normal' }}>{displayUnit}</span>
        </span>
      </div>

      {/* Main Range Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="range"
          min={minZ}
          max={maxZ}
          step={0.1}
          value={currentHeight}
          onChange={handleSliderChange}
          style={{
            flex: 1,
            accentColor: '#38bdf8',
            cursor: 'pointer',
            height: '6px',
          }}
        />
      </div>

      {/* Step Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
        <button
          onClick={() => stepHeight(-5)}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '9px', fontWeight: 600, padding: '3px 0', cursor: 'pointer' }}
          title="-5m"
        >
          -5m
        </button>
        <button
          onClick={() => stepHeight(-1)}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '9px', fontWeight: 600, padding: '3px 0', cursor: 'pointer' }}
          title="-1m"
        >
          -1m
        </button>
        <button
          onClick={() => stepHeight(-0.1)}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '9px', fontWeight: 600, padding: '3px 0', cursor: 'pointer' }}
          title="-0.1m"
        >
          -0.1
        </button>
        <button
          onClick={() => stepHeight(0.1)}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '9px', fontWeight: 600, padding: '3px 0', cursor: 'pointer' }}
          title="+0.1m"
        >
          +0.1
        </button>
        <button
          onClick={() => stepHeight(1)}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '9px', fontWeight: 600, padding: '3px 0', cursor: 'pointer' }}
          title="+1m"
        >
          +1m
        </button>
        <button
          onClick={() => stepHeight(5)}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '9px', fontWeight: 600, padding: '3px 0', cursor: 'pointer' }}
          title="+5m"
        >
          +5m
        </button>
      </div>

      {/* Quick Level Presets & Flip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', paddingTop: '2px' }}>
        <button
          onClick={() => setOpts(p => ({ ...p, clippingHeight: minZ }))}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: '#94a3b8', fontSize: '8.5px', padding: '2px 0', cursor: 'pointer' }}
        >
          {lang === 'sk' ? 'Dno' : 'Bottom'}
        </button>
        <button
          onClick={() => setOpts(p => ({ ...p, clippingHeight: (minZ + maxZ) / 2 }))}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: '#94a3b8', fontSize: '8.5px', padding: '2px 0', cursor: 'pointer' }}
        >
          {lang === 'sk' ? 'Stred' : 'Mid'}
        </button>
        <button
          onClick={() => setOpts(p => ({ ...p, clippingHeight: maxZ }))}
          style={{ flex: 1, background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: '#94a3b8', fontSize: '8.5px', padding: '2px 0', cursor: 'pointer' }}
        >
          {lang === 'sk' ? 'Strop' : 'Top'}
        </button>
      </div>
    </div>
  )
}
