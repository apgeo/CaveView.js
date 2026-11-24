import React, { useState, useRef } from 'react'
import type { SelStation } from '../../App'
import { calculateTectonics } from '@shared/utils/tectonics'
import { measureDistance, measurePolygon } from '@shared/utils/stationInteraction'
import { getTranslation } from '@shared/i18n'
import './MeasurementPanel.css'

export interface MeasurementPanelProps {
  mode: 'distance' | 'polygon'
  stations: SelStation[]
  onDeletePoint: (index: number) => void
  onClear: () => void
  onClose: () => void
  onSwap?: () => void
  onModeChange?: (mode: 'distance' | 'polygon') => void
  onSetProfile?: (stations: SelStation[]) => void
  lang?: 'sk' | 'en' | 'fr' | 'de'
  baseAltitude?: number
  altitudeMode?: 'absolute' | 'relative'
}

export const MeasurementPanel: React.FC<MeasurementPanelProps> = ({
  mode,
  stations,
  onDeletePoint,
  onClear,
  onClose,
  onSwap,
  onModeChange,
  onSetProfile,
  lang = 'sk',
  baseAltitude,
  altitudeMode = 'absolute'
}) => {
  const [posOffset, setPosOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; isDragging: boolean }>({ startX: 0, startY: 0, isDragging: false })
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const t = (key: string) => getTranslation(lang, key)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('dialog[open]') || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isRel = altitudeMode === 'relative'
  const base = baseAltitude ?? 0

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX - posOffset.x,
      startY: e.clientY - posOffset.y,
      isDragging: true
    }
    const handleMouseMove = (em: MouseEvent) => {
      if (!dragRef.current.isDragging) return
      setPosOffset({
        x: em.clientX - dragRef.current.startX,
        y: em.clientY - dragRef.current.startY
      })
    }
    const handleMouseUp = () => {
      dragRef.current.isDragging = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Calculate distance measurements for 2 points
  const distData = React.useMemo(() => {
    if (stations.length < 2) return null
    const p1 = stations[0]
    const p2 = stations[1]
    return {
      ...measureDistance(p1.pos, p2.pos),
      p1,
      p2
    }
  }, [stations])

  // Calculate polygon/area measurements for 3+ points
  const polyData = React.useMemo(() => {
    if (stations.length < 3) return null
    const p1 = stations[0]
    const p2 = stations[1]
    const p3 = stations[2]
    const tectonics = calculateTectonics(
      p1.pos, p2.pos, p3.pos,
      lang
    )

    return {
      tectonics,
      ...measurePolygon(stations.map(s => s.pos)),
    }
  }, [stations, lang])

  const handleCopy = async () => {
    let text = ''
    if (mode === 'distance' && distData) {
      text = [
        `=== ${lang === 'sk' ? 'Meranie vzdialenosti' : 'Distance Measurement'} ===`,
        `P1: ${distData.p1.name} (${distData.p1.origX.toFixed(2)}, ${distData.p1.origY.toFixed(2)}, ${distData.p1.altitude.toFixed(2)})`,
        `P2: ${distData.p2.name} (${distData.p2.origX.toFixed(2)}, ${distData.p2.origY.toFixed(2)}, ${distData.p2.altitude.toFixed(2)})`,
        `3D Vzdialenosť: ${distData.dist3d.toFixed(2)} m`,
        `Horizontálna vzdialenosť: ${distData.dist2d.toFixed(2)} m`,
        `Prevýšenie ΔH: ${distData.dz > 0 ? '+' : ''}${distData.dz.toFixed(2)} m`,
        `Sklon: ${distData.slopeDeg.toFixed(1)}°`,
        `Azimut: ${distData.azimuthDeg.toFixed(1)}°`,
      ].join('\n')
    } else if (mode === 'polygon' && polyData && polyData.tectonics) {
      const t = polyData.tectonics
      text = [
        `=== ${lang === 'sk' ? 'Meranie plochy a tektoniky' : 'Area & Tectonic Measurement'} ===`,
        `Plocha: ${polyData.area.toFixed(2)} m²`,
        `Obvod: ${polyData.perimeter.toFixed(2)} m`,
        `Sklon roviny (Dip): ${t.dipAngle.toFixed(1)}°`,
        `Smer sklonu (Dip direction): ${t.dipDirection.toFixed(1)}° (${t.cardinalDirection})`,
        `Smerník (Strike): ${Math.round(t.strike[0])}° - ${Math.round(t.strike[1])}°`,
        `Body (${stations.length}):`,
        ...stations.map((s, i) => `  P${i+1}: ${s.name} (${s.origX.toFixed(2)}, ${s.origY.toFixed(2)}, ${s.altitude.toFixed(2)})`)
      ].join('\n')
    }
    if (text) {
      try {
        await navigator.clipboard.writeText(text)
        setCopyError(null)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (error) {
        console.error('Measurement clipboard export failed', error)
        setCopyError(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const isDistance = mode === 'distance'

  return (
    <div className="measurement-panel" role="region" aria-label={t('navigation.measurement')} style={{
      position: 'fixed',
      top: 68 + posOffset.y,
      right: 20 - posOffset.x,
      zIndex: 250,
      width: 'min(340px, calc(100vw - 24px))',
      maxHeight: 'calc(100dvh - 96px)',
      overflowY: 'auto',
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${isDistance ? 'rgba(99, 102, 241, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
      borderRadius: '12px',
      boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 16px ${isDistance ? 'rgba(99, 102, 241, 0.15)' : 'rgba(168, 85, 247, 0.15)'}`,
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '12px',
      userSelect: 'none'
    }}>
      {/* Header - Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: isDistance ? 'rgba(99, 102, 241, 0.15)' : 'rgba(168, 85, 247, 0.15)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: isDistance ? '#818cf8' : '#c084fc' }}>
            {isDistance ? 'straighten' : 'square_foot'}
          </span>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f1f5f9' }}>
            {isDistance 
              ? (lang === 'sk' ? 'Meranie vzdialenosti' : 'Distance measurement')
              : (lang === 'sk' ? 'Meranie plôch / Polygón' : 'Area / Polygon measurement')}
          </span>
        </div>
        <button
          type="button"
          aria-label={t('toolbar.exitMeasurement')}
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: '2px 6px',
            borderRadius: '4px'
          }}
          title={lang === 'sk' ? 'Zavrieť' : 'Close'}
        >
          ✕
        </button>
      </div>

      {/* Content Area */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="measurement-actions">
          {onModeChange && <>
            <button type="button" aria-pressed={isDistance} onClick={() => onModeChange('distance')}>{t('navigation.distance')}</button>
            <button type="button" aria-pressed={!isDistance} onClick={() => onModeChange('polygon')}>{t('navigation.area')}</button>
          </>}
        </div>
        <p className="measurement-hint">{t('toolbar.pickHint')}</p>
        {!isDistance && <p className="measurement-hint">{t('toolbar.polygonHint')}</p>}
        
        {/* Status Prompt */}
        <div role="status" aria-live="polite" style={{
          padding: '7px 10px',
          borderRadius: '6px',
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(255,255,255,0.05)',
          fontSize: '11px',
          color: '#cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>
            {isDistance ? (
              stations.length === 0 ? (lang === 'sk' ? '👉 Kliknite na 1. bod v 3D scéne' : '👉 Click 1st point in 3D scene')
              : stations.length === 1 ? (lang === 'sk' ? '👉 Kliknite na 2. bod v 3D scéne' : '👉 Click 2nd point in 3D scene')
              : t('toolbar.distanceComplete')
            ) : (
              stations.length < 3 
                ? (lang === 'sk' ? `👉 Pridajte min. 3 body (${stations.length}/3)` : `👉 Add min. 3 points (${stations.length}/3)`)
                : (lang === 'sk' ? `✓ Plocha nameraná (${stations.length} bodov)` : `✓ Area measured (${stations.length} points)`)
            )}
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            background: isDistance ? '#6366f1' : '#a855f7',
            padding: '2px 6px',
            borderRadius: '10px',
            color: '#fff'
          }}>
            {stations.length} {lang === 'sk' ? 'bodov' : 'pts'}
          </span>
        </div>

        {/* List of points */}
        <div style={{
          maxHeight: '130px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          paddingRight: '2px'
        }}>
          {stations.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '12px 0', fontSize: '11px' }}>
              {lang === 'sk' ? 'Žiadne vybrané body' : 'No points selected'}
            </div>
          ) : (
            stations.map((st, idx) => {
              const alt = isRel ? (st.altitude - base) : st.altitude
              const sign = isRel && alt > 0 ? '+' : ''
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '11px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontWeight: 700,
                      color: isDistance ? '#818cf8' : '#c084fc',
                      minWidth: '20px'
                    }}>
                      {idx < 2 ? ['A', 'B'][idx] : idx + 1}
                    </span>
                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
                      {st.name || `St_${st.idx}`}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                      ({sign}{alt.toFixed(1)}m)
                    </span>
                  </div>
                  <button
                    onClick={() => onDeletePoint(idx)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px 5px',
                      lineHeight: 1
                    }}
                    title={lang === 'sk' ? 'Zmazať bod' : 'Delete point'}
                  >
                    ✕
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Results - Distance mode */}
        {isDistance && distData && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '8px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? '3D Vzdialenosť' : '3D Distance'}</span>
              <span style={{ color: '#818cf8', fontWeight: 800, fontSize: '16px' }}>{distData.dist3d.toFixed(2)} m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Horizontálna vzd.' : 'Horizontal dist.'}</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{distData.dist2d.toFixed(2)} m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Prevýšenie ΔH' : 'Elevation diff ΔH'}</span>
              <span style={{ color: distData.dz >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                {distData.dz > 0 ? '+' : ''}{distData.dz.toFixed(2)} m
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Sklon' : 'Slope'} / {lang === 'sk' ? 'Azimut' : 'Azimuth'}</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                {distData.slopeDeg.toFixed(1)}° • {distData.azimuthDeg.toFixed(1)}°
              </span>
            </div>
          </div>
        )}

        {/* Results - Polygon mode */}
        {!isDistance && polyData && polyData.tectonics && (
          <div style={{
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: '8px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Plocha roviny' : 'Surface Area'}</span>
              <span style={{ color: '#c084fc', fontWeight: 800, fontSize: '16px' }}>{polyData.area.toFixed(2)} m²</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Obvod polygónu' : 'Perimeter'}</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{polyData.perimeter.toFixed(2)} m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Sklon roviny (Dip)' : 'Dip angle'}</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{polyData.tectonics.dipAngle.toFixed(1)}°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{lang === 'sk' ? 'Smer sklonu' : 'Dip direction'}</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                {polyData.tectonics.dipDirection.toFixed(1)}° ({polyData.tectonics.cardinalDirection})
              </span>
            </div>
          </div>
        )}

        <div className="measurement-actions">
          <button type="button" disabled={!stations.length} onClick={() => onDeletePoint(stations.length - 1)}>{t('toolbar.undo')}</button>
          {isDistance && onSwap && <button type="button" disabled={stations.length !== 2} onClick={onSwap}>{t('toolbar.swap')}</button>}
        </div>
        {copyError && <p role="alert">{copyError}</p>}
        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            aria-label={t('toolbar.newMeasurement')}
            onClick={onClear}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(30, 41, 59, 0.8)',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
            title={lang === 'sk' ? 'Vyčistiť body a začať nové meranie' : 'Clear points and start new measurement'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>restart_alt</span>
            {t('toolbar.newMeasurement')}
          </button>

          {(distData || polyData) && (
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: copied ? '#10b981' : 'rgba(30, 41, 59, 0.8)',
                color: copied ? '#fff' : '#e2e8f0',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? (lang === 'sk' ? 'Skopírované' : 'Copied') : (lang === 'sk' ? 'Kopírovať' : 'Copy')}
            </button>
          )}

          {isDistance && distData && onSetProfile && (
            <button
              onClick={() => onSetProfile(stations)}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #6366f1',
                background: '#4f46e5',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
              title={lang === 'sk' ? 'Vytvoriť profilový rez zameraným úsekom' : 'Create profile section'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>content_cut</span>
              {lang === 'sk' ? 'Rez' : 'Section'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
