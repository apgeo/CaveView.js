import React, { useState, useRef, useEffect } from 'react';
import { Circle as CircleIcon, Diamond as DiamondIcon, Disc as DiscIcon, Hexagon as HexagonIcon, Square as SquareIcon } from 'lucide-react';
import type { ViewerOptions, PointCloudShape } from '@shared/types';
import type { TextureDownloadInspector } from '@shared/utils/XyzTileDownloader';
import { Language } from '@shared/i18n';

export const POINT_CLOUD_SHAPE_ICONS: Record<PointCloudShape, typeof SquareIcon> = {
  square: SquareIcon,
  sphere: CircleIcon,
  diamond: DiamondIcon,
  hex: HexagonIcon,
  surfel: DiscIcon,
}

export const POINT_CLOUD_SHAPE_LABELS_SK: Record<PointCloudShape, string> = {
  square: 'Štvorec',
  sphere: 'Guľôčka',
  diamond: 'Kosoštvorec',
  hex: 'Šesťuholník',
  surfel: 'Surfel (Disk)',
}

export const POINT_CLOUD_SHAPE_LABELS_EN: Record<PointCloudShape, string> = {
  square: 'Square',
  sphere: 'Sphere',
  diamond: 'Diamond',
  hex: 'Hex',
  surfel: 'Surfel (Disk)',
}

export function formatBytes(bytes?: number): string {
  if (!Number.isFinite(bytes) || !bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms?: number): string {
  if (!Number.isFinite(ms) || !ms) return '-'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function getTextureProgress(info: TextureDownloadInspector | null): number {
  if (!info || info.totalTiles <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((info.completedTiles / info.totalTiles) * 100)))
}

export function isRemoteTextureSource(source: ViewerOptions['surfaceTextureSource']): boolean {
  return source === 'wms-orto' || source === 'wms-shadow' || source === 'wms-geology' || source === 'wms-orto-freemap'
}

export function getTextureStatusLabel(info: TextureDownloadInspector, lang: Language): string {
  if (info.status === 'success') return lang === 'sk' ? 'Hotovo' : 'Done'
  if (info.status === 'error') return lang === 'sk' ? 'Chyba' : 'Error'
  return lang === 'sk' ? 'Sťahuje sa' : 'Downloading'
}

export function TextureDownloadInspectorPanel({
  info,
  lang,
  onClearCache,
}: {
  info: TextureDownloadInspector | null
  lang: Language
  onClearCache: () => void
}) {
  const progress = getTextureProgress(info)
  const statusColor = info?.status === 'success' ? '#10b981' : info?.status === 'error' ? '#ef4444' : '#60a5fa'
  const outputFormat = info?.outputFormat ? info.outputFormat.replace('image/', '').toUpperCase() : '-'

  const Row = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '10px', lineHeight: 1.35 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: color || '#cbd5e1', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ borderTop: '1px solid rgba(148,163,184,0.16)', paddingTop: '9px', marginTop: '2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">troubleshoot</span>
          {lang === 'sk' ? 'INSPEKTOR DLAŽDÍC' : 'TILE INSPECTOR'}
        </div>
        <button
          type="button"
          onClick={onClearCache}
          className="btn-mini"
          style={{ fontSize: '9px', padding: '2px 7px', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}
        >
          {lang === 'sk' ? 'Vyčistiť cache' : 'Clear cache'}
        </button>
      </div>

      {info ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ height: '4px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(148,163,184,0.15)' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: statusColor, transition: 'width .2s ease' }} />
          </div>
          <Row label={lang === 'sk' ? 'Stav' : 'Status'} value={getTextureStatusLabel(info, lang)} color={statusColor} />
          <Row label={lang === 'sk' ? 'Zdroj' : 'Source'} value={info.provider || info.sourceKey || '-'} />
          <Row
            label={info.mode === 'xyz' ? 'XYZ' : 'WMS'}
            value={info.mode === 'xyz' && info.zoom ? `z${info.zoom} · ${info.widthPixels || '-'}x${info.heightPixels || '-'}` : `${info.widthPixels || '-'}x${info.heightPixels || '-'}`}
          />
          <Row
            label={lang === 'sk' ? 'Dlaždice' : 'Tiles'}
            value={`${info.completedTiles}/${info.totalTiles} · ok ${info.successfulTiles} · err ${info.failedTiles}`}
          />
          <Row
            label="Cache"
            value={`${info.cacheHits} hit · ${info.cacheMisses} miss · ${formatBytes(info.bytesFromCache)}`}
          />
          <Row
            label={lang === 'sk' ? 'Sieť' : 'Network'}
            value={`${info.networkTiles} · ${formatBytes(info.bytesDownloaded)}`}
          />
          <Row
            label="Fallback"
            value={`${info.fallbackTiles} tile · ${info.fallbackRequests} req`}
            color={info.fallbackTiles > 0 ? '#fbbf24' : undefined}
          />
          <Row
            label={lang === 'sk' ? 'Výstup' : 'Output'}
            value={`${outputFormat} · ${formatDuration(info.durationMs)}`}
          />
          {info.message && (
            <div style={{ color: '#fca5a5', fontSize: '10px', lineHeight: 1.35, wordBreak: 'break-word' }}>
              {info.message}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.35 }}>
          {lang === 'sk' ? 'Bez aktívneho sťahovania' : 'No active download'}
        </div>
      )}
    </div>
  )
}

export const ColorPicker = ({ value, onChange, label, t, style }: { value: string, onChange: (c: string) => void, label?: string, t: (k: string) => string, style?: React.CSSProperties }) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const palette = ['#fbbf24', '#ef4444', '#ffffff']

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div ref={containerRef} onKeyDown={event => {
      if (event.key === 'Escape' && isOpen) {
        event.stopPropagation()
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 8, ...style }}>
      <button type="button" ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        title={label || t('ui.changeColor')}
        aria-label={label || t('ui.changeColor')}
        aria-expanded={isOpen}
        style={{
          width: 22, height: 16, borderRadius: 3, background: value,
          border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer',
          padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        <span style={{ fontSize: 9, filter: 'invert(1) grayscale(1) contrast(100)' }}>🎨</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 1001,
          background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
          padding: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex', gap: 6
        }}>
          {palette.map(c => (
            <button type="button" key={c} aria-label={c} onClick={() => { onChange(c); setIsOpen(false); triggerRef.current?.focus() }}
              style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} />
          ))}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <input type="color" aria-label={label || t('ui.changeColor')} value={value} onChange={e => onChange(e.target.value)} onBlur={() => setIsOpen(false)}
            style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
        </div>
      )}
    </div>
  )
}
