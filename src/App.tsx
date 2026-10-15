import React, { useState, useRef, useCallback, useEffect, Suspense, useMemo } from 'react'
import * as THREE from 'three'
import proj4 from 'proj4'
import {
  CheckCircle2 as CheckCircleIcon,
  Circle as CircleIcon,
  Diamond as DiamondIcon,
  Eraser as EraserIcon,
  Hexagon as HexagonIcon,
  MousePointer2 as MousePointerIcon,
  RotateCcw as RotateCcwIcon,
  Square as SquareIcon,
  Undo2 as UndoIcon,
  X as XIcon,
} from 'lucide-react'
import packageJson from '../package.json'
import { SJTSK_DEF, fetchAltitudeFromZbgis, wgs84ToJtsk } from '@shared/utils/geoUtils'
import { tryUtmToWgs84, tryJtskToWgs84 } from "@shared/utils/coords";
import { useEmbedHost, postToHost } from '@shared/embed/embedMessages'
import type { ParsedCave, ViewerOptions, CaveSurface, StationLabel, Vec3, ViewerCameraSnapshot, PointCloudShape } from '@shared/types'
import type { TextureDownloadInspector } from '@shared/utils/XyzTileDownloader'
import { clearBrowserTileCache } from '@shared/utils/tileCache'
import { calculateVolumeAndProfile } from '@shared/utils/speleoAnalysis'
import { calculateTectonics } from '@shared/utils/tectonics'
import { getSjtskBoundsFromDtm } from '@shared/utils/surfaceBounds'
import { createSurfaceTextureCalibrationFromSjtskBbox, parseSjtskBboxCalibrationText } from '@shared/utils/surfaceTextureCalibration'
import { getDefaultPointCloudSize, getPreferredEngineForFile } from '@shared/utils/modelDefaults'
import { renderLidarPlanMapToDataUrl, type LidarPlanMapData } from '@shared/utils/lidarPlanMap'
import {
  cloneLidarEditSnapshot,
  downsampleStrokePoints,
  filterLidarPointsByMask,
  selectProjectedLidarPoints,
  type LidarEditMode,
  type LidarScreenPoint,
} from '@shared/utils/lidarPointEditing'
import type { LiDARAnomaly } from '@shared/utils/speleoAnalysis'
import { DEFAULT_POINT_CLOUD_SHAPE, POINT_CLOUD_SHAPE_OPTIONS } from '@v2/components/pointCloudShape'
import { hasRenderablePointColors } from '@shared/utils/pointCloudColors'

const CaveViewer3D = React.lazy(() => import('@v1/components/CaveViewer3D'))
const CaveViewerNextGen = React.lazy(() => import('@v2/components/CaveViewerNextGen'))
const APP_VERSION = packageJson.version
const GIT_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : ''

const POINT_CLOUD_SHAPE_ICONS: Record<PointCloudShape, typeof SquareIcon> = {
  square: SquareIcon,
  sphere: CircleIcon,
  diamond: DiamondIcon,
  hex: HexagonIcon,
}

const POINT_CLOUD_SHAPE_LABELS_SK: Record<PointCloudShape, string> = {
  square: 'Štvorec',
  sphere: 'Guľôčka',
  diamond: 'Kosoštvorec',
  hex: 'Šesťuholník',
}

const POINT_CLOUD_SHAPE_LABELS_EN: Record<PointCloudShape, string> = {
  square: 'Square',
  sphere: 'Sphere',
  diamond: 'Diamond',
  hex: 'Hex',
}

type SpeleoWorkerMessage =
  | { type: 'status'; requestId: number; message: string | null }
  | { type: 'done'; requestId: number; anomalies: LiDARAnomaly[] }
  | { type: 'error'; requestId: number; error: string }

type LidarPlanMapPreview = {
  dataUrl: string;
  width: number;
  height: number;
  usedPoints: number;
  occupiedCells: number;
  cellSize: number;
};

type LidarPlanMapWorkerMessage =
  | { type: 'done'; requestId: number; data: LidarPlanMapData }
  | { type: 'error'; requestId: number; error: string }

const WELCOME_CHANGELOG = [
  {
    version: APP_VERSION,
    badge: 'Aktuálne',
    group: 'Kamera, Tektonika, UI & WMS mapy',
    items: [
      'Prepínanie kamery Perspektíva ↔ Ortografická projekcia v hornej lište pre axonometriu',
      'Nový 3-záložkový bočný panel (Jaskyňa / Terén / Analýza)',
      '3-bodové meranie štruktúrnej geológie a tektoniky (dip, strike, normála a 3D rovina)',
      'Interaktívny 3D raycasting a klikanie priamo na steny jaskyne (LOX scraps)',
      'Oficiálny GKÚ ZBGIS WMS servis s CORS & SSL bypass proxy',
      'LiDAR 2D pôdorysná mapa s workerom, editácia bodov a tvary mračna bodov',
    ],
  },
  {
    version: '2.2.0',
    group: 'STL a cave wall rendering',
    items: [
      'Podpora binárnych a ASCII STL modelov',
      'STL modely používajú rovnaké režimy ako cave walls',
      'Podlaha, strop a rez fungujú pre STL na rovnakom princípe ako PLY',
    ],
  },
  {
    version: '2.1.0',
    group: 'Parting line a stabilizácia',
    items: [
      'Nová segmentácia podlahy a stropu cez geometrický stred',
      'Presnejšie režimy floor, ceiling a section pre mesh modely',
      'Typová čistka a rýchlejší prenos dát medzi workerom a UI',
    ],
  },
  {
    version: '2.0.2',
    group: 'UI a NextGen integrácia',
    items: [
      'NextGen engine je zapojený priamo v sekcii Steny jaskyne',
      'Sidebar zobrazuje relevantné ovládanie podľa aktívneho motora',
      'Drôtený model a vrstevnice fungujú nezávisle od ostatných vrstiev',
    ],
  },
]

async function parseGeoTiffLazy(
  buffer: ArrayBuffer,
  tfwText: string | null,
  centerOffset?: { x: number; y: number; z: number }
): Promise<CaveSurface> {
  const { parseGeoTiff } = await import('@v1/parsers/tiffParser')
  return parseGeoTiff(buffer, tfwText, centerOffset)
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#0f172a', color: '#f8fafc', borderRadius: '12px', border: '1px solid #334155', margin: '2rem', textAlign: 'center' }}>
          <h2 style={{ color: '#f56565' }}>Ups! Niečo sa pokazilo pri vykresľovaní.</h2>
          <p style={{ opacity: 0.8 }}>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '1rem' }}>
            Obnoviť aplikáciu
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { getBrowserLanguage, getTranslation, Language, languages } from '@shared/i18n'

// ── Google Drive Config (Vymeň za tvoje reálne kľúče v .env súbore) ──
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ''
const LIDAR_CAVE_COLOR_FALLBACK = '#b3a694'

const htmlAttrEscapes: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;'
}

function normalizeLidarCaveColor(primary?: string, fallback?: string): string {
  const isUsable = (color?: string) => /^#[0-9a-f]{6}$/i.test(color || '') && color!.toLowerCase() !== '#ffffff'
  if (isUsable(primary)) return primary!.toLowerCase()
  if (isUsable(fallback)) return fallback!.toLowerCase()
  return LIDAR_CAVE_COLOR_FALLBACK
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, ch => htmlAttrEscapes[ch])
}

function clampEmbedDimension(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(120, Math.min(4096, Math.round(value)))
}

function imageExtensionFromDataUrl(dataUrl: string): string {
  const match = /^data:image\/([^;,]+)/.exec(dataUrl)
  if (!match) return 'jpg'
  if (match[1] === 'jpeg') return 'jpg'
  if (match[1] === 'svg+xml') return 'svg'
  return match[1]
}

function formatBytes(bytes?: number): string {
  if (!Number.isFinite(bytes) || !bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms?: number): string {
  if (!Number.isFinite(ms) || !ms) return '-'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function getTextureProgress(info: TextureDownloadInspector | null): number {
  if (!info || info.totalTiles <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((info.completedTiles / info.totalTiles) * 100)))
}

function isRemoteTextureSource(source: ViewerOptions['surfaceTextureSource']): boolean {
  return source === 'wms-orto' || source === 'wms-shadow' || source === 'wms-geology' || source === 'wms-orto-freemap'
}

function getTextureStatusLabel(info: TextureDownloadInspector, lang: Language): string {
  if (info.status === 'success') return lang === 'sk' ? 'Hotovo' : 'Done'
  if (info.status === 'error') return lang === 'sk' ? 'Chyba' : 'Error'
  return lang === 'sk' ? 'Sťahuje sa' : 'Downloading'
}

function TextureDownloadInspectorPanel({
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
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>troubleshoot</span>
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

type AppState = 'welcome' | 'loading' | 'viewer' | 'error'

interface LoadedFile {
  name: string
  size: number
  ext: string
}

const SUPPORTED = [
  { ext: '.lox', label: 'Therion LOX', icon: '🗺️' },
  { ext: '.3d',  label: 'Survex 3D',   icon: '📐' },
  { ext: '.plt', label: 'Compass PLT', icon: '🧭' },
  { ext: '.ply', label: 'LiDAR PLY',   icon: '☁️' },
  { ext: '.stl', label: '3D Mesh STL', icon: '🧱' },
]


/** Interpoluje výšku povrchu DTM pre danú world-space poziciú (x, y).
 *  Vráti výšku v metroch alebo null ak je bod mimo gridu. */
function sampleDtmAt(surface: CaveSurface, worldX: number, worldY: number): number | null {
  const { dtm } = surface
  const { data, samples, lines, calib } = dtm
  const det = calib.xx * calib.yy - calib.xy * calib.yx
  if (Math.abs(det) < 1e-12) return null

  const dx  = worldX - calib.xOrigin
  const dy  = worldY - calib.yOrigin
  const col = (dx * calib.yy - dy * calib.xy) / det
  const row = (dy * calib.xx - dx * calib.yx) / det

  if (col < 0 || col >= samples - 1 || row < 0 || row >= lines - 1) return null

  const c0 = Math.floor(col), r0 = Math.floor(row)
  const fc = col - c0, fr = row - r0
  const z00 = data[r0 * samples + c0]
  const z10 = data[r0 * samples + c0 + 1]
  const z01 = data[(r0 + 1) * samples + c0]
  const z11 = data[(r0 + 1) * samples + c0 + 1]
  return z00 * (1 - fc) * (1 - fr) + z10 * fc * (1 - fr) + z01 * (1 - fc) * fr + z11 * fc * fr
}

// ─── Station detail card ─────────────────────────────────────────────────────────────

export interface SelStation {
  idx:          number
  name:         string
  origX:        number
  origY:        number
  altitude:     number    // m n.m.
  pos:          Vec3      // Pridané súradnice pre 3D
  gps:          { lat: number; lon: number; zone?: number; epsg?: string } | null
  distToSurf:   number | null   // m, kladné = jaskyňa je pod povrchom
  screenX:      number
  screenY:      number
  centerX?:     number
  centerY?:     number
  centerZ?:     number
}

function StationDetailCard({ stations, onClose, onPlaceCaver, onSetProfile, onUpdateGps, t, lang }: { 
  stations: SelStation[]; 
  onClose: () => void;
  onPlaceCaver: (pos: [number, number, number] | null, pose: 'standing' | 'crawling') => void;
  onSetProfile: (sts: SelStation[]) => void;
  onUpdateGps: (stIdx: number, lat: number, lon: number, alt: number) => void;
  t: (key: string) => string;
  lang: string;
}) {
  const [posOffset, setPosOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; isDragging: boolean }>({ startX: 0, startY: 0, isDragging: false })
  const [copied, setCopied] = useState(false)
  
  // State for manual GPS entry
  const [editGps, setEditGps] = useState(false)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [altInput, setAltInput] = useState('')
  const [isFetchingAlt, setIsFetchingAlt] = useState(false)

  if (stations.length === 0) return null
  const st1 = stations[0]
  const st2 = stations.length > 1 ? stations[1] : null
  const st3 = stations.length > 2 ? stations[2] : null

  // Tectonic analysis for 3 points
  const tectonics = useMemo(() => {
    if (!st1 || !st2 || !st3) return null
    return calculateTectonics(
      { x: st1.origX, y: st1.origY, z: st1.altitude },
      { x: st2.origX, y: st2.origY, z: st2.altitude },
      { x: st3.origX, y: st3.origY, z: st3.altitude },
      lang
    )
  }, [st1, st2, st3, lang])

  // Initialize inputs when station changes or enters edit mode
  useEffect(() => {
    if (st1) {
      setLatInput(st1.gps?.lat.toString() || '')
      setLonInput(st1.gps?.lon.toString() || '')
      setAltInput(st1.altitude.toFixed(2))
    }
  }, [st1, editGps])

  const handleFetchAlt = async () => {
    const lat = parseFloat(latInput)
    const lon = parseFloat(lonInput)
    if (isNaN(lat) || isNaN(lon)) return
    
    setIsFetchingAlt(true)
    try {
      const alt = await fetchAltitudeFromZbgis(lat, lon)
      if (alt !== null) {
        setAltInput(alt.toFixed(2))
      }
    } finally {
      setIsFetchingAlt(false)
    }
  }

  const handleApplyGps = () => {
    const lat = parseFloat(latInput)
    const lon = parseFloat(lonInput)
    const alt = parseFloat(altInput)
    if (isNaN(lat) || isNaN(lon) || isNaN(alt)) return
    
    onUpdateGps(st1.idx, lat, lon, alt)
    setEditGps(false)
  }

  const handleCopyTectonics = () => {
    if (!tectonics || !st1 || !st2 || !st3) return
    const text = [
      `=== ${t('measuring.tectonicsTitle')} ===`,
      `${t('measuring.dip')}: ${tectonics.dipAngle.toFixed(1)}°`,
      `${t('measuring.dipDirection')}: ${tectonics.dipDirection.toFixed(1)}° (${tectonics.cardinalDirection})`,
      `${t('measuring.strike')}: ${Math.round(tectonics.strike[0]).toString().padStart(3, '0')}° - ${Math.round(tectonics.strike[1]).toString().padStart(3, '0')}°`,
      `Notation: ${tectonics.notation} (${tectonics.cardinalDirection})`,
      `${t('measuring.normalVector')}: [${tectonics.normal.map(n => n.toFixed(3)).join(', ')}]`,
      `${t('measuring.triangleArea')}: ${tectonics.area.toFixed(2)} m²`,
      `${t('measuring.perimeter')}: ${tectonics.perimeter.toFixed(2)} m`,
      `Points:`,
      `  P1: ${st1.name} (${st1.origX.toFixed(2)}, ${st1.origY.toFixed(2)}, ${st1.altitude.toFixed(2)})`,
      `  P2: ${st2.name} (${st2.origX.toFixed(2)}, ${st2.origY.toFixed(2)}, ${st2.altitude.toFixed(2)})`,
      `  P3: ${st3.name} (${st3.origX.toFixed(2)}, ${st3.origY.toFixed(2)}, ${st3.altitude.toFixed(2)})`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Pôvodná poloha karty
  const cx = Math.min(Math.max(st1.screenX, 280), window.innerWidth - 340)
  const cy = Math.min(Math.max(st1.screenY + 20, 60), window.innerHeight - 480)

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

  const Row = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.06)', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, textAlign: 'right', fontFamily: 'monospace' }}>
        {value}{sub && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>{sub}</span>}
      </span>
    </div>
  )

  const headerTitle = stations.length === 1
    ? st1.name
    : stations.length === 2
    ? `${t('measuring.selection')}: ${st1.name} → ${st2?.name}`
    : `${t('measuring.tectonicsTitle')}`

  const headerSub = stations.length === 3
    ? `${st1.name} • ${st2?.name} • ${st3?.name}`
    : null

  return (
    <div style={{
      position: 'fixed', left: cx + posOffset.x, top: cy + posOffset.y, zIndex: 200, minWidth: 300, maxWidth: 360,
      background: 'linear-gradient(135deg,rgba(8,15,35,.97),rgba(15,25,50,.97))',
      border: stations.length === 3 ? '1px solid rgba(192,132,252,.5)' : '1px solid rgba(79,195,247,.35)',
      borderRadius: 14, padding: '16px 18px',
      boxShadow: stations.length === 3 
        ? '0 8px 40px rgba(0,0,0,.8), 0 0 20px rgba(168,85,247,.25)'
        : '0 8px 40px rgba(0,0,0,.7),0 0 0 1px rgba(79,195,247,.1)',
      backdropFilter: 'blur(12px)',
      fontFamily: 'Inter, system-ui, sans-serif',
      userSelect: 'text',
    }}>
      {/* Header - Drag Handle */}
      <div 
        onMouseDown={handleMouseDown}
        style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, 
          cursor: 'grab', padding: '4px 0' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ 
            width: 8, height: 8, borderRadius: '50%', 
            background: stations.length === 3 ? '#c084fc' : '#4fc3f7', 
            boxShadow: stations.length === 3 ? '0 0 8px #c084fc' : '0 0 6px #4fc3f7' 
          }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.01em' }}>
              {headerTitle}
            </div>
            {headerSub && (
              <div style={{ fontSize: 10, color: '#c084fc', fontWeight: 600 }}>
                {headerSub}
              </div>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer',
          fontSize: 14, fontWeight: '700', lineHeight: 1, padding: '4px 8px', borderRadius: 6,
          transition: 'background 0.2s'
        }} title={t('ui.close')} aria-label={t('ui.close')}>✕</button>
      </div>

      {/* Zoznam vybraných bodov */}
      <div style={{ maxHeight: stations.length === 3 ? '130px' : 'none', overflowY: stations.length === 3 ? 'auto' : 'visible', marginBottom: 8 }}>
        {stations.map((st, i) => (
          <div key={i} style={{ marginBottom: stations.length > 1 ? 8 : 0, background: stations.length > 1 ? 'rgba(255,255,255,0.02)' : 'none', padding: stations.length > 1 ? '4px 6px' : 0, borderRadius: 6 }}>
            {stations.length > 1 && (
              <div style={{ fontSize: 9, color: i === 0 ? '#fbbf24' : i === 1 ? '#ef4444' : '#c084fc', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                {i === 0 ? `1. ${t('measuring.startPoint')}` : i === 1 ? `2. ${t('measuring.endPoint')}` : `3. ${t('measuring.point3')}`}: {st.name}
              </div>
            )}
            {stations.length === 1 && (
              st.idx !== -1 ? (
                <Row label={t('stations.title')} value={`#${st.idx}`} sub={`(${st.name})`} />
              ) : (
                <Row label={t('stations.coordinates')} value={st.name} />
              )
            )}
            
            {(!editGps || stations.length > 1) ? (
              <Row label={t('stations.altitude')} value={`${st.altitude.toFixed(2)} m`} sub="n.m." />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{t('stations.altitude')}</span>
                <input 
                  type="text" value={altInput} onChange={e => setAltInput(e.target.value)}
                  style={{ width: 80, background: 'rgba(0,0,0,0.3)', border: '1px solid #4fc3f7', color: '#fff', fontSize: 12, textAlign: 'right', borderRadius: 4, padding: '2px 4px' }}
                />
              </div>
            )}

            {st.distToSurf !== null && stations.length === 1 && (
              <Row
                label={t('stations.depth')}
                value={Math.abs(st.distToSurf).toFixed(1) + ' m'}
                sub={st.distToSurf >= 0 ? `(${t('terrain.title').toLowerCase()})` : `(nad ${t('terrain.title').toLowerCase()})`}
              />
            )}

            {/* GPS Section pre 1 bod */}
            {stations.length === 1 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 2px' }}>
                  <div style={{ fontSize: 10, color: '#4fc3f7', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    GPS WGS84 {st.gps ? (st.gps.zone ? `(UTM ${st.gps.zone}N)` : `(${st.gps.epsg})`) : ''}
                  </div>
                  {!editGps && (
                    <button 
                      onClick={() => setEditGps(true)}
                      style={{ background: 'none', border: 'none', color: '#4fc3f7', cursor: 'pointer', fontSize: 10, textDecoration: 'underline', padding: 0 }}
                    >
                      {st.gps ? t('ui.edit') : t('ui.add')}
                    </button>
                  )}
                </div>

                {!editGps ? (
                  st.gps ? (
                    <>
                      <Row label="Latitude" value={`${st.gps.lat.toFixed(6)}°`} />
                      <Row label="Longitude" value={`${st.gps.lon.toFixed(6)}°`} />
                      <div style={{ marginTop: 4 }}>
                        <a
                          href={`https://maps.google.com/?q=${st.gps.lat.toFixed(6)},${st.gps.lon.toFixed(6)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: '#4fc3f7', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          🗺️ {t('ui.googleMaps')}
                        </a>
                      </div>
                    </>
                  ) : (
                    <Row label="GPS" value={t('measuring.unavailable')} sub="" />
                  )
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', width: 60 }}>Lat</span>
                      <input 
                        type="text" placeholder="48.123456" value={latInput} onChange={e => setLatInput(e.target.value)}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, borderRadius: 4, padding: '4px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', width: 60 }}>Lon</span>
                      <input 
                        type="text" placeholder="17.123456" value={lonInput} onChange={e => setLonInput(e.target.value)}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, borderRadius: 4, padding: '4px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button 
                        onClick={handleFetchAlt} disabled={isFetchingAlt}
                        style={{ flex: 1, padding: '6px', background: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: 6, color: '#4fc3f7', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                      >
                        {isFetchingAlt ? t('ui.loadingAltitude') : t('ui.fetchAltitude')}
                      </button>
                      <button 
                        onClick={handleApplyGps}
                        style={{ flex: 1, padding: '6px', background: '#3b82f6', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                      >
                        {t('ui.apply')}
                      </button>
                      <button 
                        onClick={() => setEditGps(false)}
                        style={{ padding: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 10 }}
                      >
                        {t('ui.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Meranie ak sú zvolené presne dva body */}
      {stations.length === 2 && st1 && st2 && (() => {
        const dx = st2.origX - st1.origX
        const dy = st2.origY - st1.origY
        const dz = st2.altitude - st1.altitude
        const horizDist = Math.sqrt(dx * dx + dy * dy)
        const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const az = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
        const inc = Math.asin(dz / dist3D) * 180 / Math.PI
        return (
          <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: '#ef4444', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div style={{ width: 14, height: 2, borderBottom: '2px dashed #ef4444' }}></div>
              {t('measuring.title')}
            </div>
            <Row label={t('measuring.dist3d')} value={`${dist3D.toFixed(2)} m`} />
            <Row label={t('measuring.distHoriz')} value={`${horizDist.toFixed(2)} m`} />
            <Row label={t('measuring.climb')} value={`${(dz > 0 ? '+' : '')}${dz.toFixed(2)} m`} />
            <Row label={t('measuring.azimuth')} value={`${az.toFixed(1)}°`} />
            <Row label={t('measuring.slope')} value={`${(inc > 0 ? '+' : '')}${inc.toFixed(1)}°`} />
          </div>
        )
      })()}

      {/* Tektonické meranie roviny z 3 bodov */}
      {stations.length === 3 && tectonics && (
        <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(192,132,252,.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c084fc', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ fontSize: 14 }}>📐</span>
              {t('measuring.tectonicsTitle')}
            </div>
            <span style={{ fontSize: 11, background: '#7e22ce', color: '#fff', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
              {tectonics.notation} {tectonics.cardinalDirection}
            </span>
          </div>

          <Row label={t('measuring.dip')} value={`${tectonics.dipAngle.toFixed(1)}°`} />
          <Row label={t('measuring.dipDirection')} value={`${tectonics.dipDirection.toFixed(1)}°`} sub={`(${tectonics.cardinalDirection})`} />
          <Row label={t('measuring.strike')} value={`${Math.round(tectonics.strike[0]).toString().padStart(3, '0')}° - ${Math.round(tectonics.strike[1]).toString().padStart(3, '0')}°`} />
          <Row label={t('measuring.normalVector')} value={`[${tectonics.normal.map(n => n.toFixed(2)).join(', ')}]`} />
          <Row label={t('measuring.triangleArea')} value={`${tectonics.area.toFixed(2)} m²`} />
          <Row label={t('measuring.perimeter')} value={`${tectonics.perimeter.toFixed(2)} m`} />

          {/* Copy data button */}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button
              onClick={handleCopyTectonics}
              style={{
                flex: 1,
                padding: '6px 10px',
                background: copied ? '#10b981' : 'rgba(192,132,252,0.15)',
                border: copied ? '1px solid #10b981' : '1px solid rgba(192,132,252,0.4)',
                borderRadius: 6,
                color: copied ? '#fff' : '#c084fc',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                transition: 'all 0.2s',
              }}
            >
              <span>{copied ? '✓' : '📋'}</span>
              <span>{copied ? t('measuring.copied') : t('measuring.copyData')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mierka - Jaskyniar */}
      {stations.length === 1 && !editGps && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => onPlaceCaver([st1.pos.x, st1.pos.y, st1.pos.z], 'standing')}
              style={{ flex: 1, minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', background: 'rgba(79,195,247,.1)', border: '1px solid rgba(79,195,247,.3)', borderRadius: 8, color: '#4fc3f7', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, display: 'block' }}>accessibility_new</span>
              <span>{t('caver.standing')}</span>
            </button>
            <button 
              onClick={() => onPlaceCaver([st1.pos.x, st1.pos.y, st1.pos.z], 'crawling')}
              style={{ flex: 1, minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', background: 'rgba(79,195,247,.1)', border: '1px solid rgba(79,195,247,.3)', borderRadius: 8, color: '#4fc3f7', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, display: 'block' }}>child_care</span>
              <span>{t('caver.crawling')}</span>
            </button>
          </div>
          <button 
            onClick={() => onPlaceCaver(null, 'standing')}
            style={{ width: '100%', padding: '6px', background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
          >
            {t('caver.remove').toUpperCase()}
          </button>
        </div>
      )}

      {stations.length >= 2 && (
        <button 
          onClick={() => onSetProfile(stations)}
          style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', background: '#3b82f6', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, display: 'block' }}>content_cut</span>
          <span>{t('clipping.create')}</span>
        </button>
      )}

      <div style={{ marginTop: 10 }}>
        <button 
          className="btn-back" 
          style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }} 
          onClick={onClose}
        >
          {t('ui.closeWindow')}
        </button>
      </div>

      {/* Footer hint */}
      <div style={{ marginTop: 12, fontSize: 10, color: '#64748b', textAlign: 'center' }}>
        {stations.length === 1 ? t('ui.hint1') : stations.length === 2 ? t('ui.hint2') : (lang === 'sk' ? 'Kliknutím na ďalší bod začnete nové meranie' : 'Click another point to start a new measurement')}
      </div>
    </div>
  )
}

const MemoizedStatusBadge = React.memo(({ isMoving }: { isMoving: boolean }) => (
  <div className={`tb-badge ${isMoving ? 'draft' : 'stable'}`} style={{
    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
    background: isMoving ? '#f56565' : '#48bb78',
    color: '#fff', marginLeft: -4, boxShadow: isMoving ? '0 0 10px rgba(245,101,101,0.4)' : 'none',
    transition: 'all 0.1s'
  }}>
    {isMoving ? 'DRAFT' : 'STABLE'}
  </div>
))

// ─── Color Picker Component (Opravený — neblokuje UI) ─────────────────────────
const ColorPicker = ({ value, onChange, label, t }: { value: string, onChange: (c: string) => void, label?: string, t: (k: string) => string }) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
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
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 8 }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        title={label || t('ui.changeColor')}
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
            <div key={c} onClick={() => { onChange(c); setIsOpen(false) }}
              style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} />
          ))}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <input type="color" value={value} onChange={e => onChange(e.target.value)} onBlur={() => setIsOpen(false)}
            style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
        </div>
      )}
    </div>
  )
}

// ─── Scale Bar UI Component (Stabilná — mimo Canvasu) ─────────────────────────
const ScaleBar = ({ cameraData }: { cameraData: { dist: number, fov: number, height: number } | null }) => {
  if (!cameraData) return null
  const { dist, fov, height } = cameraData
  const fovRad = fov * Math.PI / 180
  const visibleHeight = 2 * Math.tan(fovRad / 2) * dist
  const pixelsPerUnit = height / visibleHeight
  const targetPx = 100
  const targetUnits = targetPx / pixelsPerUnit
  const niceUnits = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  let best = niceUnits[0]
  for (const u of niceUnits) if (Math.abs(u - targetUnits) < Math.abs(best - targetUnits)) best = u
  const width = best * pixelsPerUnit
  const label = best < 1 ? `${best * 100} cm` : `${best} m`
  return (
    <div style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', zIndex: 100 }}>
      <div style={{ fontSize: 9, color: '#fff', marginBottom: 1, textShadow: '0 1px 2px #000', fontWeight: 600 }}>{label}</div>
      <div style={{ width: `${width}px`, height: 3, border: '1px solid white', borderTop: 'none', background: 'rgba(255,255,255,0.2)' }} />
    </div>
  )
}

// ─── Color Scale Legend (Zobrazenie výšok pre farby) ─────────────────────────
const ColorScaleLegend = ({ caveLegend, surfLegend, lang }: { 
  caveLegend: { minAlt: number, maxAlt: number } | null, 
  surfLegend: { minAlt: number, maxAlt: number } | null,
  lang: string
}) => {
  if (!caveLegend && !surfLegend) return null
  
  const gradient = 'linear-gradient(to top, #142ea6 0%, #197ad9 18%, #1fc7b8 35%, #2ede61 50%, #ccf01a 65%, #f7990d 80%, #e01a1a 100%)'

  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 12, 
      display: 'flex', gap: 16, alignItems: 'flex-end',
      pointerEvents: 'none', zIndex: 100
    }}>
      {caveLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 2px #000', marginBottom: 4, fontWeight: 600 }}>
             {Math.round(caveLegend.maxAlt)} m
          </div>
          <div style={{ width: 12, height: 100, background: gradient, borderRadius: 2, border: '1px solid rgba(255,255,255,0.3)' }} />
          <div style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 2px #000', marginTop: 4, fontWeight: 600 }}>
             {Math.round(caveLegend.minAlt)} m
          </div>
          <div style={{ fontSize: 8, color: '#fff', textShadow: '0 1px 2px #000', marginTop: 2, fontWeight: 700, letterSpacing: '0.02em' }}>{lang === 'sk' ? 'Jaskyňa' : 'Cave'}</div>
        </div>
      )}
      {surfLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 2px #000', marginBottom: 4, fontWeight: 600 }}>
             {Math.round(surfLegend.maxAlt)} m
          </div>
          <div style={{ width: 12, height: 100, background: gradient, borderRadius: 2, border: '1px solid rgba(255,255,255,0.3)' }} />
          <div style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 2px #000', marginTop: 4, fontWeight: 600 }}>
             {Math.round(surfLegend.minAlt)} m
          </div>
          <div style={{ fontSize: 8, color: '#fff', textShadow: '0 1px 2px #000', marginTop: 2, fontWeight: 700, letterSpacing: '0.02em' }}>{lang === 'sk' ? 'Povrch' : 'Surface'}</div>
        </div>
      )}
      <div style={{ alignSelf: 'flex-end', fontSize: '8px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, paddingBottom: '2px', letterSpacing: '0.02em' }}>
        LochViewer by DankeZ
      </div>
    </div>
  )
}

// ─── Processing Overlay (Zobrazí sa len ak operácia trvá > 0.5s) ────────────────
const ProcessingOverlay = ({ info, lang }: { info: string | null, lang: string }) => {
  if (!info) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, transition: 'all 0.3s ease'
    }}>
      <div style={{
        background: '#1e293b', padding: '24px 40px', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16
      }}>
        <div className="processing-spinner" style={{
          width: 40, height: 40, border: '3px solid rgba(79, 195, 247, 0.1)',
          borderTopColor: '#4fc3f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
        <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, letterSpacing: '0.02em' }}>{info}</div>
        <div style={{ color: '#64748b', fontSize: 11 }}>{lang === 'sk' ? 'Toto môže trvať chvíľu pri veľkých modeloch...' : 'This may take a while for large models...'}</div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('welcome')
  const [loadedFile, setLoadedFile] = useState<LoadedFile | null>(null)
  const [showStationCard, setShowStationCard] = useState(false)
  const [activeProfilePoints, setActiveProfilePoints] = useState<SelStation[] | null>(null)
  const [cave, setCave] = useState<ParsedCave | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [loadingStatus, setLoadingStatus] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedStations, setSelectedStations] = useState<SelStation[]>([])
  const [isMeasuringMode, setIsMeasuringMode] = useState(false)
  // Embed / Share
  const [isEmbedMode] = useState(() => new URLSearchParams(window.location.search).get('embed') === 'true')
  const [embedAllowSidebar] = useState(() => new URLSearchParams(window.location.search).get('sidebar') === '1')
  // const [shareDialogOpen, setShareDialogOpen] = useState(false) // moved up
  const [shareCopied, setShareCopied] = useState(false)
  const [customShareUrl, setCustomShareUrl] = useState('')
  const [urlValidationStatus, setUrlValidationStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null)
  const [iframeWidth, setIframeWidth] = useState(800)
  const [iframeHeight, setIframeHeight] = useState(500)
  const [allowSidebarInEmbed, setAllowSidebarInEmbed] = useState(false)
  const [man1, setMan1] = useState('')
  const [man2, setMan2] = useState('')
  const [surfPointCache, setSurfPointCache] = useState<Record<string, SelStation>>({})
  const [fitTrigger, setFitTrigger] = useState(0)
  const [lang, setLang] = useState<Language>(getBrowserLanguage())
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [manualMatches, setManualMatches] = useState<{ src: { x: number; y: number }; dst: { x: number; y: number } }[] | null>(null)

  // GDrive states
  const [lastLoadedBuffer, setLastLoadedBuffer] = useState<ArrayBuffer | null>(null)
  const [gdriveStatus, setGdriveStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [activeViewPreset, setActiveViewPreset] = useState<'top' | 'front' | 'side' | 'iso' | null>(null)

  useEffect(() => {
    const savedLang = localStorage.getItem('cv-language');
    if (savedLang) return; 

    const browserLang = navigator.language.split('-')[0] as Language;
    const supported: Language[] = ['sk', 'en', 'fr', 'de'];
    
    if (supported.includes(browserLang) && browserLang !== lang) {
      console.log('Browser language detection:', browserLang);
      setLang(browserLang);
    }
  }, []);

  const t = useCallback((key: string) => getTranslation(lang, key), [lang])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isModelMoving, setIsModelMoving] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'cave' | 'terrain' | 'analysis'>('cave')
  const [cameraData, setCameraData] = useState<ViewerCameraSnapshot | null>(null)
  const [processingInfo, setProcessingInfo] = useState<string | null>(null)
  const [appStatus, setAppStatus] = useState<{ msg: string; type: 'info' | 'error' | 'success' | 'progress'; progress?: number } | null>(null)
  const [downloadableTexture, setDownloadableTexture] = useState<{ dataUrl: string, bbox: string } | null>(null)
  const [textureDownloadInfo, setTextureDownloadInfo] = useState<TextureDownloadInspector | null>(null)
  const [currentTheme, setCurrentTheme] = useState<string>('precision')
  
  // Speleological & LiDAR analysis states
  const [anomalies, setAnomalies] = useState<LiDARAnomaly[]>([])
  const [activeAnomalyId, setActiveAnomalyId] = useState<string | null>(null)
  const [isLiDARAnalyzing, setIsLiDARAnalyzing] = useState(false)
  const [isLidarMapGenerating, setIsLidarMapGenerating] = useState(false)
  const [lidarPlanMapPreview, setLidarPlanMapPreview] = useState<LidarPlanMapPreview | null>(null)
  const [lidarEditMode, setLidarEditMode] = useState<LidarEditMode>('off')
  const [lidarBrushSize, setLidarBrushSize] = useState(42)
  const [lidarEditStroke, setLidarEditStroke] = useState<LidarScreenPoint[]>([])
  const [lidarEditCursor, setLidarEditCursor] = useState<LidarScreenPoint | null>(null)
  const [lidarKeepSelectionCount, setLidarKeepSelectionCount] = useState(0)
  const [lidarEditBusy, setLidarEditBusy] = useState(false)
  const [lidarEditRemovedCount, setLidarEditRemovedCount] = useState(0)
  const [selectedSegmentProfile, setSelectedSegmentProfile] = useState<any | null>(null)

  const lidarWorkerRef = useRef<Worker | null>(null)
  const lidarMapWorkerRef = useRef<Worker | null>(null)
  const lidarAnalysisRequestId = useRef(0)
  const lidarMapRequestId = useRef(0)
  const lidarKeepMaskRef = useRef<Uint8Array | null>(null)
  const lidarOriginalCaveRef = useRef<ParsedCave | null>(null)
  const lidarUndoCaveRef = useRef<ParsedCave | null>(null)
  const lidarActiveStrokeRef = useRef<LidarScreenPoint[]>([])
  const surfNextId = useRef(1)
  const managedObjectUrls = useRef<Set<string>>(new Set())

  const trackObjectUrl = useCallback((url: string) => {
    managedObjectUrls.current.add(url)
    return url
  }, [])

  const revokeManagedObjectUrl = useCallback((url?: string | null) => {
    if (!url || !managedObjectUrls.current.delete(url)) return
    URL.revokeObjectURL(url)
  }, [])

  const revokeCaveObjectUrls = useCallback((target: ParsedCave | null) => {
    if (!target) return
    revokeManagedObjectUrl(target.pointCloudUrl)
    target.surfaces?.forEach(surface => revokeManagedObjectUrl(surface.bitmapUrl))
  }, [revokeManagedObjectUrl])

  const clearSurfaceTextureUrl = useCallback((url?: string | null) => {
    revokeManagedObjectUrl(url)
  }, [revokeManagedObjectUrl])

  useEffect(() => {
    return () => {
      managedObjectUrls.current.forEach(url => URL.revokeObjectURL(url))
      managedObjectUrls.current.clear()
    }
  }, [])

  const contourLevels = useMemo(() => {
    if (!cameraData) return { major: 10, minor: 2.5 };
    const dist = cameraData.dist;
    if (dist < 25)   return { major: 0.5, minor: 0.1 };
    if (dist < 60)   return { major: 1,   minor: 0.25 };
    if (dist < 120)  return { major: 2.5, minor: 0.5 };
    if (dist < 300)  return { major: 5,   minor: 1 };
    if (dist < 600)  return { major: 10,  minor: 2.5 };
    if (dist < 1200) return { major: 25,  minor: 5 };
    if (dist < 3000) return { major: 50,  minor: 10 };
    return { major: 100, minor: 25 };
  }, [cameraData])
  const [opts, setOpts] = useState<ViewerOptions>({
    engine:              'v1',
    cameraProjection:    'perspective',
    showSplay:           false,
    showStations:        true,
    showStationNames:    false,
    showStationAlt:      false,
    showEntrances:       true,
    showEntranceLabels:  true,
    showGrid:            false,
    showGizmo:           false,
    colorGrid:           '#222222',
    colorBoundingBox:    '#990000',
    showBoundingBox:     false,
    colorBackground:     '#020617',
    colorBackground2:    '#1e40af',
    // Cave scraps
    showScraps:          true,
    scrapsOpacity:       0.75,
    scrapsSolid:         true,
    scrapsWireframe:     false,
    scrapsAltitude:      false,
    scrapsIntensity:     false,
    scrapsClassification: false,
    scrapsRelief:        0.35,
    scrapsViewMode:      'all',
    scrapsHeightThreshold: 0.1,
    scrapsAngleThreshold: 0.0,
    scrapsSectionWidth:  0.08,
    smoothScraps:        false,
    accurateScraps:      false,
    organicLevel:        5,
    organicVoxelSize:     0.3,
    organicDilation:      0,
    showRenderCave:      false,
    caveTexture:         'limestone',
    renderOpacity:       1.0,
    placedCaver:         null,
    // Cave traverse
    showTraverse:        true,   // polygonový ťah
    traverseRadius:      0.1,     // polomer rúrky v m
    traverseAltitude:    true,   // farebné podľa výšky
    // Terrain surface
    showSurfaceMesh:     true,
    showSurfaceMeshWire: false,
    showSurfaceTexture:  false,
    showSurfaceNetwork:  false,
    showContours:        true,
    showContourLabels:  true,
    contourColor:        '#e1bba2',
    contourColor10:      '#f29d62',
    surfaceOpacity:      0.8,
    surfaceColor:        '#ffffff',
    showVegetation:      true,
    showGround:          true,
    showCaveLiDAR:       true,
    // Mapbox Terrain
    showMapboxTerrain:   false,
    mapboxToken:         import.meta.env.VITE_MAPBOX_TOKEN || '',
    mapboxZoom:          13,
    mapboxRadius:        2.0,
    mapboxOpacity:       0.5,
    pointCloudSize:      1.0,
    pointCloudBrightness: 1.2,
    pointCloudColorMode: 'original',
    pointCloudCustomColor: '#b3a694',
    pointCloudPlasticity: 1.0,
    pointCloudShape: DEFAULT_POINT_CLOUD_SHAPE,
    pointCloudViewMode: 'all',
    pointCloudHeightThreshold: 0.1,
    pointCloudAngleThreshold: 0.3,
    edlStrength:         0.8,
    edlRadius:           1.2,

    surfaceTextureOffset: { x: 0, y: 0 },
    surfaceTextureScale:  { x: 1, y: 1 },
    surfaceTextureCalibration: null,
    surfaceTextureUrl:   null,
    surfaceTextureSource: 'custom',
    surfaceTextureOpacity: 1.0,
    surfaceWmsResolution: 4096,
    surfaceOffset:       { x: 0, y: 0, z: 0 },
    colorSplay:          '#78909c',
    colorTraverse:       '#4fc3f7',
    colorScraps:         '#94a3b8',
    colorScrapsWire:     '#6a9fd8',
    colorStations:       '#fbbf24',
    colorStationNames:   '#fbbf24',
    colorStationAlt:     '#a5f3fc',
    colorTerrainWire:    '#6ab04c',
    // Clipping
    showClipping:        false,
    clippingHeight:      0,
    showProfileClipping: false,
    profileClipFlip:     false,
    profileClipOffset:   0,
    showClippingEdges:   true,
    showSurfaceClippingEdges: true,
    colorClippingEdges:  '#ff4444',
    colorSurfaceClippingEdges: '#44ff44',
    useSurfaceNet:       false,
    // Floor Map
    floorMapSvg:         null,
    floorMapTh2:         null,
    floorMapOpacity:     0.8,
    manualMatches:       null,
    // Cinematic / Presentation
    autoRotate:          false,
    autoRotateSpeed:     2.0,
    cinematicMode:       false,
    recordingDuration:   10, // 0 = manual
    excludeModelFromClipping: false,
    caveCalibrationOffset: { x: 0, y: 0, z: 0 },
    terrainCalibrationMode: false
  })

  useEffect(() => {
    setDownloadableTexture(null);
    setTextureDownloadInfo(null);
  }, [opts.surfaceTextureSource, opts.surfaceWmsResolution]);

  const handleClearTileCache = useCallback(async () => {
    await clearBrowserTileCache();
    setTextureDownloadInfo(null);
    setAppStatus({
      msg: lang === 'sk' ? 'Cache mapových dlaždíc vyčistená' : 'Map tile cache cleared',
      type: 'success',
    });
    setTimeout(() => setAppStatus(null), 2500);
  }, [lang]);

  useEffect(() => {
    return () => {
      lidarAnalysisRequestId.current += 1;
      lidarWorkerRef.current?.terminate();
      lidarWorkerRef.current = null;
      lidarMapRequestId.current += 1;
      lidarMapWorkerRef.current?.terminate();
      lidarMapWorkerRef.current = null;
    }
  }, []);

  const cancelLiDARAnalysis = useCallback(() => {
    lidarAnalysisRequestId.current += 1;
    lidarWorkerRef.current?.terminate();
    lidarWorkerRef.current = null;
    setIsLiDARAnalyzing(false);
    setAppStatus({
      msg: lang === 'sk' ? 'LiDAR analýza zrušená' : 'LiDAR analysis cancelled',
      type: 'info',
    });
    setTimeout(() => setAppStatus(null), 1800);
  }, [lang]);

  const runLiDARAnalysis = useCallback(() => {
    if (!cave?.points || cave.pointCount === 0) return;

    lidarWorkerRef.current?.terminate();
    const requestId = lidarAnalysisRequestId.current + 1;
    lidarAnalysisRequestId.current = requestId;
    setIsLiDARAnalyzing(true);
    setActiveAnomalyId(null);
    setAppStatus({
      msg: lang === 'sk' ? 'Pripravujem LiDAR dáta...' : 'Preparing LiDAR data...',
      type: 'progress',
    });

    try {
      const points = cave.points.slice();
      const pointNormals = cave.pointNormals ? cave.pointNormals.slice() : null;
      const worker = new Worker(new URL('./shared/workers/speleo.worker.ts', import.meta.url), { type: 'module' });
      lidarWorkerRef.current = worker;

      const finishRequest = () => {
        if (lidarWorkerRef.current === worker) {
          lidarWorkerRef.current = null;
        }
        worker.terminate();
      };

      worker.onmessage = (event: MessageEvent<SpeleoWorkerMessage>) => {
        const message = event.data;
        if (!message || message.requestId !== lidarAnalysisRequestId.current || lidarWorkerRef.current !== worker) return;

        if (message.type === 'status') {
          if (message.message) {
            setAppStatus({ msg: message.message, type: 'progress' });
          }
          return;
        }

        finishRequest();
        setIsLiDARAnalyzing(false);

        if (message.type === 'done') {
          setAnomalies(message.anomalies);
          setAppStatus({
            msg: lang === 'sk'
              ? `LiDAR analýza hotová: ${message.anomalies.length} nálezov`
              : `LiDAR analysis finished: ${message.anomalies.length} findings`,
            type: 'success',
          });
          setTimeout(() => {
            if (lidarAnalysisRequestId.current === requestId) setAppStatus(null);
          }, 2500);
        } else {
          setAppStatus({
            msg: lang === 'sk' ? `LiDAR analýza zlyhala: ${message.error}` : `LiDAR analysis failed: ${message.error}`,
            type: 'error',
          });
        }
      };

      worker.onerror = (event) => {
        if (lidarAnalysisRequestId.current !== requestId || lidarWorkerRef.current !== worker) return;
        finishRequest();
        setIsLiDARAnalyzing(false);
        setAppStatus({
          msg: lang === 'sk'
            ? `LiDAR worker zlyhal: ${event.message}`
            : `LiDAR worker failed: ${event.message}`,
          type: 'error',
        });
      };

      const transferables: Transferable[] = [points.buffer as ArrayBuffer];
      if (pointNormals) transferables.push(pointNormals.buffer as ArrayBuffer);
      worker.postMessage({
        type: 'analyze-lidar',
        requestId,
        points,
        pointNormals,
        pointCount: cave.pointCount,
        segments: cave.segments || [],
      }, transferables);
    } catch (error) {
      lidarWorkerRef.current?.terminate();
      lidarWorkerRef.current = null;
      setIsLiDARAnalyzing(false);
      setAppStatus({
        msg: lang === 'sk'
          ? `LiDAR analýza sa nepodarila spustiť: ${error instanceof Error ? error.message : String(error)}`
          : `Unable to start LiDAR analysis: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error',
      });
    }
  }, [cave, lang]);

  const cancelLidarPlanMap = useCallback(() => {
    lidarMapRequestId.current += 1;
    lidarMapWorkerRef.current?.terminate();
    lidarMapWorkerRef.current = null;
    setIsLidarMapGenerating(false);
    setAppStatus({
      msg: lang === 'sk' ? 'Generovanie 2D mapy zrušené' : '2D map generation cancelled',
      type: 'info',
    });
    setTimeout(() => setAppStatus(null), 1800);
  }, [lang]);

  const generateLidarPlanMap = useCallback(() => {
    if (!cave?.points || cave.pointCount === 0) return;

    lidarMapWorkerRef.current?.terminate();
    const requestId = lidarMapRequestId.current + 1;
    lidarMapRequestId.current = requestId;
    setIsLidarMapGenerating(true);
    setAppStatus({
      msg: lang === 'sk' ? 'Skladám 2D pôdorys z LiDAR bodov...' : 'Building 2D plan map from LiDAR points...',
      type: 'progress',
    });

    try {
      const points = cave.points.slice();
      const pointClassification = cave.pointClassification && cave.pointClassification.length > 0
        ? cave.pointClassification.slice()
        : null;
      const worker = new Worker(new URL('./shared/workers/lidarPlanMap.worker.ts', import.meta.url), { type: 'module' });
      lidarMapWorkerRef.current = worker;

      const finishRequest = () => {
        if (lidarMapWorkerRef.current === worker) {
          lidarMapWorkerRef.current = null;
        }
        worker.terminate();
      };

      worker.onmessage = (event: MessageEvent<LidarPlanMapWorkerMessage>) => {
        const message = event.data;
        if (!message || message.requestId !== lidarMapRequestId.current || lidarMapWorkerRef.current !== worker) return;

        finishRequest();
        setIsLidarMapGenerating(false);

        if (message.type === 'done') {
          const rendered = renderLidarPlanMapToDataUrl(message.data, {
            contourInterval: 0.5,
            minOutlineLengthMeters: 5,
            minContourLengthMeters: 5,
          });
          setLidarPlanMapPreview({
            ...rendered,
            usedPoints: message.data.usedPoints,
            occupiedCells: message.data.occupiedCells,
            cellSize: message.data.cellSize,
          });
          setAppStatus({
            msg: lang === 'sk' ? '2D mapa z LiDAR modelu je hotová' : 'LiDAR 2D plan map is ready',
            type: 'success',
          });
          setTimeout(() => {
            if (lidarMapRequestId.current === requestId) setAppStatus(null);
          }, 2200);
        } else {
          setAppStatus({
            msg: lang === 'sk' ? `Generovanie mapy zlyhalo: ${message.error}` : `Map generation failed: ${message.error}`,
            type: 'error',
          });
        }
      };

      worker.onerror = (event) => {
        if (lidarMapRequestId.current !== requestId || lidarMapWorkerRef.current !== worker) return;
        finishRequest();
        setIsLidarMapGenerating(false);
        setAppStatus({
          msg: lang === 'sk'
            ? `Worker mapy zlyhal: ${event.message}`
            : `Map worker failed: ${event.message}`,
          type: 'error',
        });
      };

      const transferables: Transferable[] = [points.buffer as ArrayBuffer];
      if (pointClassification) transferables.push(pointClassification.buffer as ArrayBuffer);
      worker.postMessage({
        type: 'build-lidar-plan-map',
        requestId,
        points,
        pointCount: cave.pointCount,
        pointClassification,
        options: { targetSize: 1024, contourInterval: 0.5, minOutlineLengthMeters: 5, minContourLengthMeters: 5 },
      }, transferables);
    } catch (error) {
      lidarMapWorkerRef.current?.terminate();
      lidarMapWorkerRef.current = null;
      setIsLidarMapGenerating(false);
      setAppStatus({
        msg: lang === 'sk'
          ? `Generovanie mapy sa nepodarilo spustiť: ${error instanceof Error ? error.message : String(error)}`
          : `Unable to start map generation: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error',
      });
    }
  }, [cave, lang]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      if (e.key === 'o' || e.key === 'O') {
        setOpts(p => {
          const next = p.cameraProjection === 'orthographic' ? 'perspective' : 'orthographic'
          if (next === 'perspective') setActiveViewPreset(null)
          return { ...p, cameraProjection: next }
        })
      } else if (e.key === '1') {
        setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
        setActiveViewPreset('top')
        window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))
      } else if (e.key === '2') {
        setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
        setActiveViewPreset('front')
        window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'front' } }))
      } else if (e.key === '3') {
        setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
        setActiveViewPreset('side')
        window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'side' } }))
      } else if (e.key === '4') {
        setActiveViewPreset('iso')
        window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'iso' } }))
      }
    }

    const handleSetViewEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ view: 'top' | 'front' | 'side' | 'iso' }>
      if (customEvent.detail?.view) {
        setActiveViewPreset(customEvent.detail.view)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('cave-set-view', handleSetViewEvent)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      window.removeEventListener('cave-set-view', handleSetViewEvent)
    }
  }, [])

  const clearLidarKeepSelection = useCallback(() => {
    lidarKeepMaskRef.current = null;
    setLidarKeepSelectionCount(0);
  }, []);

  const getActiveViewerCanvas = useCallback((): HTMLCanvasElement | null => {
    const id = opts.engine === 'v2' ? 'nextgen-cave-canvas' : 'main-cave-canvas';
    const canvasById = document.getElementById(id) as HTMLCanvasElement | null;
    if (canvasById) return canvasById;
    const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
    return canvases.find(canvas => {
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !String(canvas.className || '').includes('bg-canvas');
    }) || null;
  }, [opts.engine]);

  const getLidarPointerPoint = useCallback((event: React.PointerEvent<HTMLElement>): LidarScreenPoint | null => {
    const canvas = getActiveViewerCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, [getActiveViewerCanvas]);

  const pushLidarUndoSnapshot = useCallback((source: ParsedCave) => {
    lidarUndoCaveRef.current = cloneLidarEditSnapshot(source);
  }, []);

  const commitEditedLidarCave = useCallback((nextCave: ParsedCave, removedCount: number) => {
    const hasRenderableColors = hasRenderablePointColors(nextCave);
    setCave(nextCave);
    if (!hasRenderableColors) {
      setOpts(prev => ({
        ...prev,
        pointCloudColorMode: prev.pointCloudColorMode === 'elevation' ? 'elevation' : 'natural',
        pointCloudCustomColor: normalizeLidarCaveColor(prev.pointCloudCustomColor, prev.colorScraps),
      }));
    }
    setAnomalies([]);
    setActiveAnomalyId(null);
    setLidarPlanMapPreview(null);
    setLidarEditRemovedCount(prev => prev + removedCount);
  }, []);

  const applyLidarMaskEdit = useCallback((mask: Uint8Array, keepSelected: boolean) => {
    if (!cave?.points || cave.pointCount === 0) return 0;
    const result = filterLidarPointsByMask(cave, mask, keepSelected);
    if (result.removedCount <= 0) return 0;
    if (result.keptCount < 8) {
      setAppStatus({
        msg: lang === 'sk' ? 'Úprava by zmazala takmer celý LiDAR model' : 'Edit would remove almost the whole LiDAR model',
        type: 'error',
      });
      return 0;
    }

    pushLidarUndoSnapshot(cave);
    commitEditedLidarCave(result.cave, result.removedCount);
    return result.removedCount;
  }, [cave, commitEditedLidarCave, lang, pushLidarUndoSnapshot]);

  const selectLidarStrokePoints = useCallback((stroke: LidarScreenPoint[], existingMask?: Uint8Array | null) => {
    if (!cave?.points || cave.pointCount === 0 || !cameraData) return null;
    const canvas = getActiveViewerCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sampledStroke = downsampleStrokePoints(stroke, Math.max(4, lidarBrushSize * 0.35));
    return selectProjectedLidarPoints(
      cave,
      cameraData,
      { width: rect.width, height: rect.height },
      sampledStroke,
      lidarBrushSize,
      existingMask,
      opts.caveCalibrationOffset
    );
  }, [cameraData, cave, getActiveViewerCanvas, lidarBrushSize, opts.caveCalibrationOffset]);

  const applyLidarEditStroke = useCallback((stroke: LidarScreenPoint[], mode: LidarEditMode) => {
    if (mode === 'off' || stroke.length === 0 || lidarEditBusy) return;
    if (!cameraData) {
      setAppStatus({
        msg: lang === 'sk' ? 'Kamera ešte nie je pripravená na LiDAR editáciu' : 'Camera is not ready for LiDAR editing yet',
        type: 'error',
      });
      return;
    }

    setLidarEditBusy(true);
    window.requestAnimationFrame(() => {
      try {
        const selection = selectLidarStrokePoints(stroke, mode === 'keep' ? lidarKeepMaskRef.current : null);
        if (!selection || selection.newlySelectedCount === 0) {
          setAppStatus({
            msg: lang === 'sk' ? 'Ťah neoznačil žiadne LiDAR body' : 'Brush stroke did not select any LiDAR points',
            type: 'info',
          });
          return;
        }

        if (mode === 'keep') {
          lidarKeepMaskRef.current = selection.mask;
          setLidarKeepSelectionCount(selection.selectedCount);
          setAppStatus({
            msg: lang === 'sk'
              ? `Označené na ponechanie: ${selection.selectedCount.toLocaleString()} bodov`
              : `Marked to keep: ${selection.selectedCount.toLocaleString()} points`,
            type: 'info',
          });
          return;
        }

        const removed = applyLidarMaskEdit(selection.mask, false);
        if (removed > 0) {
          setAppStatus({
            msg: lang === 'sk'
              ? `Guma zmazala ${removed.toLocaleString()} bodov`
              : `Eraser removed ${removed.toLocaleString()} points`,
            type: 'success',
          });
        }
      } finally {
        setLidarEditBusy(false);
      }
    });
  }, [applyLidarMaskEdit, cameraData, lang, lidarEditBusy, selectLidarStrokePoints]);

  const applyLidarKeepSelection = useCallback(() => {
    const mask = lidarKeepMaskRef.current;
    if (!mask || lidarKeepSelectionCount === 0) {
      setAppStatus({
        msg: lang === 'sk' ? 'Najprv označ body, ktoré chceš ponechať' : 'Mark points to keep first',
        type: 'info',
      });
      return;
    }

    const removed = applyLidarMaskEdit(mask, true);
    if (removed > 0) {
      clearLidarKeepSelection();
      setLidarEditMode('off');
      setAppStatus({
        msg: lang === 'sk'
          ? `Ponechané označené body, zmazané ${removed.toLocaleString()} bodov`
          : `Kept marked points, removed ${removed.toLocaleString()} points`,
        type: 'success',
      });
    }
  }, [applyLidarMaskEdit, clearLidarKeepSelection, lang, lidarKeepSelectionCount]);

  const undoLidarEdit = useCallback(() => {
    const snapshot = lidarUndoCaveRef.current;
    if (!snapshot) return;
    const current = cave ? cloneLidarEditSnapshot(cave) : null;
    setCave(cloneLidarEditSnapshot(snapshot));
    lidarUndoCaveRef.current = current;
    clearLidarKeepSelection();
    setAnomalies([]);
    setActiveAnomalyId(null);
    setLidarPlanMapPreview(null);
    setAppStatus({
      msg: lang === 'sk' ? 'LiDAR úprava vrátená späť' : 'LiDAR edit undone',
      type: 'success',
    });
  }, [cave, clearLidarKeepSelection, lang]);

  const resetLidarEdits = useCallback(() => {
    const original = lidarOriginalCaveRef.current;
    if (!original) return;
    if (cave) pushLidarUndoSnapshot(cave);
    setCave(cloneLidarEditSnapshot(original));
    clearLidarKeepSelection();
    setLidarEditRemovedCount(0);
    setAnomalies([]);
    setActiveAnomalyId(null);
    setLidarPlanMapPreview(null);
    setAppStatus({
      msg: lang === 'sk' ? 'LiDAR body obnovené z pôvodného modelu' : 'LiDAR points restored from original model',
      type: 'success',
    });
  }, [cave, clearLidarKeepSelection, lang, pushLidarUndoSnapshot]);

  const beginLidarEditStroke = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (lidarEditMode === 'off' || lidarEditBusy || !cave?.points || cave.pointCount === 0) return;
    const point = getLidarPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    lidarActiveStrokeRef.current = [point];
    setLidarEditCursor(point);
    setLidarEditStroke([point]);
  }, [cave, getLidarPointerPoint, lidarEditBusy, lidarEditMode]);

  const moveLidarEditStroke = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (lidarActiveStrokeRef.current.length === 0) {
      const hoverPoint = getLidarPointerPoint(event);
      setLidarEditCursor(hoverPoint);
      return;
    }
    const point = getLidarPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    const stroke = lidarActiveStrokeRef.current;
    const last = stroke[stroke.length - 1];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy < 9) return;
    stroke.push(point);
    setLidarEditCursor(point);
    setLidarEditStroke([...stroke]);
  }, [getLidarPointerPoint]);

  const endLidarEditStroke = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (lidarActiveStrokeRef.current.length === 0) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be released by the browser on touch cancellation.
    }
    const stroke = lidarActiveStrokeRef.current;
    lidarActiveStrokeRef.current = [];
    setLidarEditStroke([]);
    applyLidarEditStroke(stroke, lidarEditMode);
  }, [applyLidarEditStroke, lidarEditMode]);

  // ─── DEFINÍCIA ŠABLÓN ────────────────────────────────────────────────────────
  const THEMES = {
    classic: {
      colorBackground:   '#050505',
      colorBackground2:  undefined,
      colorTraverse:     '#ffffff',
      colorSplay:        '#78909c',
      colorStations:     '#fbbf24',
      colorStationNames: '#fbbf24',
      colorStationAlt:   '#a5f3fc',
      showEntrances: true,
      showEntranceLabels: true,
      colorGrid:         '#224422',
      colorScraps:       '#94a3b8',
      colorScrapsWire:   '#6a9fd8',
      colorTerrainWire:  '#6ab04c',
      colorBoundingBox:  '#990000',
      surfaceColor:      '#e2e8f0',
    },
    precision: {
      colorBackground:   '#020617', // Deep blue/black top
      colorBackground2:  '#1e40af', // Vibrant blue bottom
      colorTraverse:     '#ffffff',
      colorSplay:        '#a5f3fc',
      colorStations:     '#fbbf24',
      colorStationNames: '#fbbf24',
      colorStationAlt:   '#a5f3fc',
      showEntrances: true,
      showEntranceLabels: true,
      colorGrid:         '#161e2b',
      colorScraps:       '#94a3b8',
      colorScrapsWire:   '#a5f3fc',
      colorTerrainWire:  '#1e293b',
      colorBoundingBox:  '#990000',
      surfaceColor:      '#dee2f2',
    },
    light: {
      colorBackground:   '#f8fafc',
      colorBackground2:  undefined,
      colorTraverse:     '#2a5585',
      colorSplay:        '#64748b',
      colorStations:     '#fbbf24',
      colorStationNames: '#1e293b',
      colorStationAlt:   '#0891b2',
      showEntrances: true,
      showEntranceLabels: true,
      colorGrid:         '#cbd5e1',
      colorScraps:       '#94a3b8',
      colorScrapsWire:   '#475569',
      colorTerrainWire:  '#166534',
      colorBoundingBox:  '#990000',
      surfaceColor:      '#ffffff',
    }
  }

  const applyTheme = (name: keyof typeof THEMES) => {
    setCurrentTheme(name)
    setOpts(prev => ({ ...prev, ...THEMES[name] }))
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textureFileInputRef = useRef<HTMLInputElement>(null)
  const tiffFileInputRef = useRef<HTMLInputElement>(null)
  const tfwFileInputRef = useRef<HTMLInputElement>(null)
  const calibFileInputRef = useRef<HTMLInputElement>(null)

  const getProjectProjection = useCallback(() => {
    if (!cave) return null
    for (const label of cave.stationLabels) {
      if (label.gps?.epsg === 'S-JTSK Křovák') return SJTSK_DEF
      if (label.gps?.zone) {
        return `+proj=utm +zone=${label.gps.zone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`
      }
    }
    return null
  }, [cave])

  const shiftTexture = (dx: number, dy: number) => {
    setOpts(p => ({
      ...p,
      surfaceTextureOffset: { x: p.surfaceTextureOffset.x + dx, y: p.surfaceTextureOffset.y + dy }
    }))
  }

  const handleTextureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const url = trackObjectUrl(URL.createObjectURL(file))
    setOpts(p => {
      clearSurfaceTextureUrl(p.surfaceTextureUrl)
      return { 
        ...p, 
        surfaceTextureUrl: url,
        surfaceTextureSource: 'custom',
        showSurfaceTexture: true 
      }
    })
  }

  const shiftCave = (dx: number, dy: number, dz: number) => {
    setOpts(p => ({
      ...p,
      caveCalibrationOffset: { 
        x: p.caveCalibrationOffset.x + dx, 
        y: p.caveCalibrationOffset.y + dy,
        z: p.caveCalibrationOffset.z + dz 
      }
    }))
  }

  const downloadGeneratedTexture = () => {
    if (!downloadableTexture) return;
    const { dataUrl, bbox } = downloadableTexture;

    // Download Image
    const aImg = document.createElement('a');
    aImg.href = dataUrl;
    aImg.download = `povrch_textura_${opts.surfaceTextureSource}.${imageExtensionFromDataUrl(dataUrl)}`;
    aImg.click();

    // Create a .txt file with calibration bbox data
    const calibText = `S-JTSK Bounding Box (Krovak EPSG:5514)\nminX, minY, maxX, maxY\n${bbox}\n\nTento súbor sa dá neskôr použiť na ručnú kalibráciu pre túto vygenerovanú textúru v CaveViewer aplikácii.`;
    const blob = new Blob([calibText], { type: 'text/plain;charset=utf-8' });
    const aTxt = document.createElement('a');
    const txtUrl = URL.createObjectURL(blob);
    aTxt.href = txtUrl;
    aTxt.download = `povrch_textura_${opts.surfaceTextureSource}_calib.txt`;
    aTxt.click();
    setTimeout(() => URL.revokeObjectURL(txtUrl), 0);
  }

  const handleCalibFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !cave) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const sjtskBbox = parseSjtskBboxCalibrationText(text)
      if (sjtskBbox && cave.surfaces?.[0]) {
        const calibration = createSurfaceTextureCalibrationFromSjtskBbox(cave.surfaces[0], sjtskBbox)
        if (calibration) {
          setOpts(p => ({
            ...p,
            surfaceTextureCalibration: calibration,
            surfaceTextureSource: 'custom',
            showSurfaceTexture: true
          }))
        }
        return
      }

      // Match [x1 y1 lat1 lon1 x2 y2 lat2 lon2]
      const match = text.match(/\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/)
      if (match) {
        const [_, x1, y1, lat1, lon1, x2, y2, lat2, lon2] = match.map(Number)
        const proj = getProjectProjection()
        if (proj) {
          const m1 = proj4("WGS84", proj, [lon1, lat1])
          const m2 = proj4("WGS84", proj, [lon2, lat2])
          setOpts(p => ({
            ...p,
            surfaceTextureCalibration: {
              source: 'therion',
              p1: { x: x1, y: y1, lat: lat1, lon: lon1, mx: m1[0], my: m1[1] },
              p2: { x: x2, y: y2, lat: lat2, lon: lon2, mx: m2[0], my: m2[1] }
            },
            surfaceTextureSource: 'custom',
            showSurfaceTexture: true
          }))
        }
      }
    }
    reader.readAsText(file)
  }
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastClickRef = useRef<{time: number, idx: number}>({time: 0, idx: -1})

  const handleStationClick = useCallback((idx: number, screenX: number, screenY: number, ctrlKey: boolean, point?: THREE.Vector3) => {
    if (!cave) return
    const now = Date.now()
    if (idx >= 0 && now - lastClickRef.current.time < 300 && lastClickRef.current.idx === idx) {
      return 
    }
    lastClickRef.current = { time: now, idx }

    let sl: StationLabel | null = null;
    let ox: number, oy: number, alt: number;
    let name: string = '';

    if (point) {
      // Direct point from LiDAR (v2)
      ox = point.x + (cave.centerOffset?.x || 0);
      oy = -point.z + (cave.centerOffset?.y || 0); 
      alt = point.y + (cave.centerOffset?.z || 0);
      name = `P (${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)})`;
    } else {
      sl = cave.stationLabels[idx];
      if (!sl) return;
      ox = sl.pos.x + (cave.centerOffset?.x || 0);
      oy = sl.pos.y + (cave.centerOffset?.y || 0);
      alt = sl.altitude;
      name = sl.name;
    }

    // Filter interaction
    const isPolygon = !point && sl && sl.name !== ''
    if (!isMeasuringMode && !ctrlKey && !isPolygon) return

    let gps: { lat: number; lon: number; zone?: number; epsg?: string } | null = null;
    gps = tryUtmToWgs84(ox, oy);
    if (!gps) {
      gps = tryJtskToWgs84(ox, oy);
    }

    let distToSurf: number | null = null
    if (cave.surfaces?.length > 0) {
      const surf = cave.surfaces[0]
      const zSurf = sampleDtmAt(surf, ox, oy)
      if (zSurf !== null) distToSurf = zSurf - alt
    }

    if (sl && sl.name) postToHost({ type: 'lochviewer:station', name: sl.name, x: ox, y: oy, z: alt })

    const newSt: SelStation = { 
      idx, name, origX: ox, origY: oy, altitude: alt, gps, distToSurf, screenX, screenY,
      pos: point ? { x: point.x, y: -point.z, z: point.y } : sl!.pos,
      centerX: cave.centerOffset.x, centerY: cave.centerOffset.y, centerZ: cave.centerOffset.z
    }
    
    setSelectedStations(prev => {
      if (!isMeasuringMode && !ctrlKey) return [newSt]
      if (prev.length === 1 && (prev[0].origX !== newSt.origX || prev[0].origY !== newSt.origY || prev[0].altitude !== newSt.altitude)) {
        return [prev[0], newSt]
      }
      if (prev.length === 2 && 
          (prev[0].origX !== newSt.origX || prev[0].origY !== newSt.origY || prev[0].altitude !== newSt.altitude) &&
          (prev[1].origX !== newSt.origX || prev[1].origY !== newSt.origY || prev[1].altitude !== newSt.altitude)) {
        return [prev[0], prev[1], newSt]
      }
      return [newSt]
    })
    setShowStationCard(true)
  }, [cave, isMeasuringMode]);

  useEffect(() => {
    if (!cave || selectedStations.length !== 2) {
      setSelectedSegmentProfile(null);
      return;
    }
    
    const s1 = selectedStations[0];
    const s2 = selectedStations[1];
    
    let activeSegment: any = null;
    if (cave.segments) {
      activeSegment = cave.segments.find((s: any) => 
        (s.from?.name === s1.name && s.to?.name === s2.name) ||
        (s.from?.name === s2.name && s.to?.name === s1.name)
      );
    }
    
    if (!activeSegment) {
      activeSegment = {
        from: s1.pos,
        to: s2.pos,
        fromLrud: undefined,
        toLrud: undefined,
        type: 'cave'
      };
    }
    
    try {
      const profile = calculateVolumeAndProfile(activeSegment, cave);
      setSelectedSegmentProfile(profile);
    } catch (e) {
      console.warn("Failed to calculate segment profile:", e);
      setSelectedSegmentProfile(null);
    }
  }, [selectedStations, cave]);

  const handleSurfaceClick = useCallback((origX: number, origY: number, altitude: number, screenX: number, screenY: number, ctrlKey: boolean = false) => {
    if (!cave || (!isMeasuringMode && !ctrlKey)) return // Klik na terén berieme IBA v režime merania alebo s CTRL
    const now = Date.now()
    if (now - lastClickRef.current.time < 300 && lastClickRef.current.idx === -1) return
    lastClickRef.current = { time: now, idx: -1 }

    let gps: { lat: number; lon: number; zone?: number; epsg?: string } | null = null;
    gps = tryUtmToWgs84(origX, origY);
    if (!gps) {
      gps = tryJtskToWgs84(origX, origY);
    }

    const sid = `Z${surfNextId.current++}`
    const newSt: SelStation = {
      idx: -1,
      name: sid,
      origX, origY, altitude,
      gps, distToSurf: 0,
      screenX, screenY,
      pos: {
        x: origX - (cave.centerOffset?.x || 0),
        y: origY - (cave.centerOffset?.y || 0),
        z: altitude - (cave.centerOffset?.z || 0)
      },
      centerX: cave.centerOffset?.x || 0, centerY: cave.centerOffset?.y || 0, centerZ: cave.centerOffset?.z || 0
    }
    
    setSurfPointCache(prev => ({ ...prev, [sid]: newSt }))

    setSelectedStations(prev => {
      if (!isMeasuringMode && !ctrlKey) return [newSt]
      if (prev.length === 1 && (prev[0].origX !== newSt.origX || prev[0].origY !== newSt.origY || prev[0].altitude !== newSt.altitude)) {
        return [prev[0], newSt]
      }
      if (prev.length === 2 && 
          (prev[0].origX !== newSt.origX || prev[0].origY !== newSt.origY || prev[0].altitude !== newSt.altitude) &&
          (prev[1].origX !== newSt.origX || prev[1].origY !== newSt.origY || prev[1].altitude !== newSt.altitude)) {
        return [prev[0], prev[1], newSt]
      }
      return [newSt]
    })
    setShowStationCard(true)
  }, [cave, isMeasuringMode])

  useEffect(() => {
    if (selectedStations.length > 0) {
      setMan1(selectedStations[0].name)
      if (selectedStations.length > 1) setMan2(selectedStations[1].name)
      else setMan2('')
    } else {
      setMan1('')
      setMan2('')
    }
  }, [selectedStations])

  const handleUpdateGps = useCallback((stIdx: number, lat: number, lon: number, alt: number) => {
    if (!cave) return
    
    // 1. Získaj cieľovú polohu v JTSK
    const jtsk = wgs84ToJtsk(lat, lon)
    if (!jtsk) return
    const [tx, ty] = jtsk

    // Získaj referenčný bod (buď stanica, alebo klik na terén/PLY)
    let refPos: Vec3 | null = null
    if (stIdx >= 0 && cave.stationLabels[stIdx]) {
      refPos = cave.stationLabels[stIdx].pos
    } else {
      const sel = selectedStations.find(s => s.idx === stIdx)
      if (sel) refPos = sel.pos
    }
    if (!refPos) return

    // 2. Vypočítaj nový globálny offset modelu (georeferencovanie)
    // origX = pos.x + offset.x -> offset.x = targetX - pos.x
    // origY = pos.y + offset.y -> offset.y = targetY - pos.y
    // alt   = pos.z + offset.z -> offset.z = altitude - pos.z
    const newOffsetX = tx - refPos.x
    const newOffsetY = ty - refPos.y
    const newOffsetZ = alt - refPos.z
    const newCenterOffset = { x: newOffsetX, y: newOffsetY, z: newOffsetZ }

    setCave((prev: ParsedCave | null) => {
      if (!prev) return null
      
      // 3. Prepočítaj VŠETKY stationLabels (georeferencujeme celý model)
      const newStationLabels = prev.stationLabels.map(sl => {
        const ox = sl.pos.x + newOffsetX
        const oy = sl.pos.y + newOffsetY
        const newAlt = sl.pos.z + newOffsetZ
        const newGps = tryJtskToWgs84(ox, oy)
        return {
          ...sl,
          gps: newGps || null,
          altitude: newAlt
        }
      })

      // 4. Aktualizuj povrchy (surfaces)
      const newSurfaces = prev.surfaces.map(s => ({
        ...s,
        centerOffset: newCenterOffset
      }))

      return { 
        ...prev, 
        centerOffset: newCenterOffset, 
        stationLabels: newStationLabels,
        surfaces: newSurfaces
      }
    })
    
    // 5. Aktualizácia vybraných staníc pre okamžitú odozvu v UI
    setSelectedStations(prev => prev.map(s => {
      const ox = s.pos.x + newOffsetX
      const oy = s.pos.y + newOffsetY
      const altNew = s.pos.z + newOffsetZ
      const gpsNew = tryJtskToWgs84(ox, oy)
      
      return { 
        ...s, 
        origX: ox, 
        origY: oy, 
        altitude: altNew, 
        gps: gpsNew || null,
        centerX: newOffsetX,
        centerY: newOffsetY,
        centerZ: newOffsetZ
      }
    }))
  }, [cave, selectedStations])

  const stationMeta = new Map<number, { name: string; z: number; isEntrance?: boolean }>()
  const findStationByName = (name: string): SelStation | null => {
    if (!name) return null
    if (surfPointCache[name]) return surfPointCache[name]
    if (!cave) return null
    const idx = cave.stationLabels.findIndex((sl: StationLabel) => sl.name.toLowerCase() === name.toLowerCase())
    if (idx === -1) return null

    const sl = cave.stationLabels[idx]
    const origX = sl.pos.x + (cave.centerOffset?.x || 0)
    const origY = sl.pos.y + (cave.centerOffset?.y || 0)
    const altitude = sl.altitude

    const gps = tryUtmToWgs84(origX, origY) || tryJtskToWgs84(origX, origY) || null

    let distToSurf: number | null = null
    if (cave.surfaces?.length > 0) {
      const zSurf = sampleDtmAt(cave.surfaces[0], origX, origY)
      if (zSurf !== null) distToSurf = zSurf - altitude
    }
    return { 
      idx, name: sl.name, origX, origY, altitude, gps, distToSurf, 
      screenX: window.innerWidth/2 - 140, screenY: window.innerHeight/2 - 150,
      pos: sl.pos,
      centerX: cave.centerOffset?.x || 0, centerY: cave.centerOffset?.y || 0, centerZ: cave.centerOffset?.z || 0
    }
  }

  const execManualMeasure = () => {
    const s1 = findStationByName(man1.trim())
    const s2 = findStationByName(man2.trim())
    if (!s1 || !s2) {
      setErrorMsg('Jeden alebo oba body zadané v meraní neboli nájdené!')
      setTimeout(() => setErrorMsg(null), 3500)
    } else {
      setSelectedStations([s1, s2])
      setShowStationCard(true)
    }
  }

  // particle background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number }
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.4 + 0.08,
    }))

    let id: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99,179,237,${p.a})`; ctx.fill()
      })
      id = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize) }
  }, [])

  const getExt = (name: string) => '.' + name.split('.').pop()!.toLowerCase()

  const runParserWorker = useCallback((buffer: ArrayBuffer, ext: string, onProgress: (msg: string) => void): Promise<ParsedCave> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./v1/parsers/parser.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.type === 'done') resolve(e.data.cave);
        else if (e.data.type === 'progress') onProgress(e.data.message);
        else reject(new Error(e.data.error || 'Worker parsing failed'));
        if (e.data.type === 'done' || e.data.type === 'error') worker.terminate();
      };
      worker.onerror = (err) => {
        reject(err);
        worker.terminate();
      };
      worker.postMessage({ buffer, ext }, [buffer]);
    });
  }, []);

  const processCaveData = useCallback((parsed: ParsedCave, buffer?: ArrayBuffer) => {
    let hasBitmap = false
    if (parsed.surfaces) {
      parsed.surfaces.forEach((s: CaveSurface) => {
        if (s.bitmapData && s.bitmapMimeType) {
          const blob = new Blob([s.bitmapData as any], { type: s.bitmapMimeType })
          s.bitmapUrl = trackObjectUrl(URL.createObjectURL(blob))
          hasBitmap = true
        }
      })
    }

    revokeCaveObjectUrls(lidarOriginalCaveRef.current)
    const isPLY = parsed.pointCount > 0
    lidarUndoCaveRef.current = null
    lidarKeepMaskRef.current = null
    setLidarKeepSelectionCount(0)
    setLidarEditRemovedCount(0)
    setLidarEditMode('off')

    // NextGen support: Create Blob URL for point cloud data for PLY files
    if (isPLY && buffer) {
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      parsed.pointCloudUrl = trackObjectUrl(URL.createObjectURL(blob));
    }
    lidarOriginalCaveRef.current = isPLY ? cloneLidarEditSnapshot(parsed) : null

    setCave(prev => {
      revokeCaveObjectUrls(prev)
      return parsed
    })
    setOpts(prev => {
      const hasBit = !!(hasBitmap)
      clearSurfaceTextureUrl(prev.surfaceTextureUrl)
      return { 
        ...prev, 
        clippingHeight: parsed.bounds.max.z + (parsed.centerOffset?.z || 0),
        // Pre PLY zapneme steny a vypneme stanice/merania
        showScraps: isPLY ? true : prev.showScraps,
        showStations: isPLY ? false : prev.showStations,
        showTraverse: isPLY ? false : prev.showTraverse,
        showSplay: isPLY ? false : prev.showSplay,
        scrapsSolid: true,
        scrapsAltitude: false,
        scrapsWireframe: false,
        // Necháme zapnutý mesh (tieňovaný model) ako podklad, kým sa načíta textúra
        showSurfaceMesh: true,
        showSurfaceTexture: hasBit,
        showSurfaceNetwork: false,
        surfaceTextureUrl: null,
        surfaceTextureCalibration: null,
        surfaceTextureOffset: { x: 0, y: 0 }
      }
    })
  }, [clearSurfaceTextureUrl, revokeCaveObjectUrls, trackObjectUrl])

  const handleFile = useCallback(async (file: File) => {
    const ext = getExt(file.name)
    if (!['.lox', '.3d', '.plt', '.ply', '.stl', '.tif', '.tiff'].includes(ext)) {
      setErrorMsg(`Nepodporovaný formát: ${ext}. Použite .lox, .3d, .plt, .ply, .stl alebo .tif`)
      return
    }

    if (ext === '.tif' || ext === '.tiff') {
      handleTiffFile(file);
      return;
    }

    // PLY is a point-cloud workflow; STL is a mesh/scrap workflow and belongs to v1 wall rendering.
    if (ext === '.ply' || ext === '.stl') {
      const isStl = ext === '.stl';
      setOpts(prev => ({ 
        ...prev, 
        engine: getPreferredEngineForFile(ext),
        pointCloudSize: getDefaultPointCloudSize(ext, file.size),
        pointCloudBrightness: 1.2,
        ...(isStl ? {
          showScraps: true,
          scrapsSolid: true,
          scrapsWireframe: false,
          scrapsAltitude: false,
          scrapsRelief: 0.55,
          scrapsViewMode: 'all',
          scrapsHeightThreshold: 0.1,
          scrapsAngleThreshold: 0.0,
          scrapsSectionWidth: 0.08,
          scrapsOpacity: 1.0,
          showRenderCave: false,
          smoothScraps: false,
          accurateScraps: false,
          showStations: false,
          showTraverse: false,
          showSplay: false,
        } : {})
      }))
    } else {
      setOpts(prev => ({ ...prev, engine: 'v1' }))
    }

    setErrorMsg(null)
    setLoadedFile({ name: file.name, size: file.size, ext })
    setAppState('loading')
    setProgress(10)

    try {
      setLoadingStatus('loading_file')

      const buf = await file.arrayBuffer()
      setLastLoadedBuffer(buf.slice(0))
      setProgress(50)

      // We use a clone for the worker because it will be transferred
      const workerBuf = buf.slice(0)
      const parsed = await runParserWorker(workerBuf, ext, setLoadingStatus)

      setLoadingStatus('finalizing')
      setProgress(95)

      if (parsed.segments.length === 0 && parsed.stations.length === 0 && parsed.pointCount === 0) {
        throw new Error('Súbor neobsahuje žiadne merania, stanice ani mračno bodov.')
      }

      processCaveData(parsed, buf)
      setTimeout(() => { setProgress(100); setTimeout(() => setAppState('viewer'), 200) }, 100)
    } catch (e: any) {
      console.error(e)
      setErrorMsg('Chyba pri načítaní: ' + (e?.message || String(e)))
      setAppState('error')
    }
  }, [])

  // A page embedding the viewer may hand it a file's bytes rather than an address
  // (see shared/embed/embedMessages.ts), and is told how the model it sent fared.
  useEmbedHost(handleFile)
  useEffect(() => {
    if (appState === 'viewer' && cave && loadedFile) {
      postToHost({ type: 'lochviewer:loaded', name: loadedFile.name, stations: cave.stationCount, segments: cave.segmentCount })
    } else if (appState === 'error') {
      postToHost({ type: 'lochviewer:error', message: errorMsg ?? '' })
    }
  }, [appState]) // once per outcome, not again for every later change to the model


  // Load from URL (for demo/test models served from public/)
  const loadFromUrl = useCallback(async (rawUrl: string, label: string) => {
    // Ak URL začína na /http, odrežeme úvodnú lomku (stáva sa pri zlom kódovaní parametrov)
    let url = rawUrl
    if (url.startsWith('/http')) url = url.substring(1)
    
    // Extrakcia prípony (.lox, .3d, .plt)
    let extString = url
    try {
      const u = new URL(url, window.location.href)
      if (u.searchParams.has('name')) extString = u.searchParams.get('name')!
      else extString = u.pathname
    } catch(e) {}
    
    const ext = '.' + extString.split('.').pop()!.toLowerCase()
    
    setErrorMsg(null)
    setLoadedFile({ name: label, size: 0, ext })
    setAppState('loading')
    setProgress(10)
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setProgress(40)
      const contentLength = Number(resp.headers.get('content-length') || 0)
      const buf = await resp.arrayBuffer()
      setLastLoadedBuffer(buf.slice(0)) 
      setProgress(60)
      setLoadedFile({ name: label, size: buf.byteLength, ext })

      // PLY is a point-cloud workflow; STL is a mesh/scrap workflow and belongs to v1 wall rendering.
      if (ext === '.ply' || ext === '.stl') {
        const isStl = ext === '.stl';
        setOpts(prev => ({ 
          ...prev, 
          engine: getPreferredEngineForFile(ext),
          pointCloudSize: getDefaultPointCloudSize(ext, buf.byteLength),
          pointCloudBrightness: 1.2,
          ...(isStl ? {
            showScraps: true,
            scrapsSolid: true,
            scrapsWireframe: false,
            scrapsAltitude: false,
            scrapsRelief: 0.55,
            scrapsViewMode: 'all',
            scrapsHeightThreshold: 0.1,
            scrapsAngleThreshold: 0.0,
            scrapsSectionWidth: 0.08,
            scrapsOpacity: 1.0,
            showRenderCave: false,
            smoothScraps: false,
            accurateScraps: false,
            showStations: false,
            showTraverse: false,
            showSplay: false,
          } : {})
        }))
      } else {
        setOpts(prev => ({ ...prev, engine: 'v1' }))
      }
      
      if (ext === '.tif' || ext === '.tiff') {
        let tfwText: string | null = null;
        // Try to fetch .tfw sidecar for any TIFF
        try {
          const tfwUrl = url.replace(/\.tiff?$/i, '.tfw');
          const tfwResp = await fetch(tfwUrl);
          if (tfwResp.ok) tfwText = await tfwResp.text();
        } catch(e) {}
        const surf = await parseGeoTiffLazy(buf, tfwText);
        const sjtskBounds = getSjtskBoundsFromDtm(surf.dtm);
        if (sjtskBounds) {
          surf.sjtskBbox = sjtskBounds.bbox;
          surf.sjtskBboxSource = sjtskBounds.sourceCrs;
          surf.sjtskAspect = sjtskBounds.aspect;
        }
        const b = surf.bounds!;
        const midZ = (b.minZ + b.maxZ) / 2;
        const halfW = b.width / 2;
        const halfH = b.height / 2;
        const centerOffset = { 
          x: surf.dtm.calib.xOrigin + halfW, 
          y: surf.dtm.calib.yOrigin - halfH,
          z: midZ
        };
        surf.centerOffset = centerOffset;
        const emptyCave: ParsedCave = {
          segments: [], stations: [], stationLabels: [], scraps: [],
          surfaces: [surf],
          bounds: { 
            min: { x: -halfW, y: -halfH, z: b.minZ - midZ },
            max: { x: halfW, y: halfH, z: b.maxZ - midZ },
            center: { x: 0, y: 0, z: 0 },
            size: { x: b.width, y: b.height, z: b.maxZ - b.minZ }
          },
          centerOffset,
          stationCount: 0, segmentCount: 0, scrapCount: 0, pointCount: 0,
          hasSurface: true
        };
        processCaveData(emptyCave, buf);
        setAppState('viewer');
        return;
      }

      // We use a clone for the worker because it will be transferred
      const workerBuf = buf.slice(0)
      const parsed = await runParserWorker(workerBuf, ext, setLoadingStatus)

      if (parsed.segments.length === 0 && parsed.stations.length === 0 && parsed.pointCount === 0)
        throw new Error('Súbor neobsahuje žiadne dáta.')
      
      processCaveData(parsed, buf)
      setLoadingStatus('done')
      setProgress(100)
      setTimeout(() => setAppState('viewer'), 150)
    } catch (e: any) {
      console.error(e)
      setErrorMsg('Chyba pri načítaní demo modelu: ' + (e?.message || String(e)))
      setAppState('error')
    }
  }, [])

  const handleTiffFile = async (tifFile: File, tfwFile?: File) => {
    try {
      setAppState('loading');
      setLoadingStatus('parsing_tiff');
      const tifBuf = await tifFile.arrayBuffer();
      let tfwText: string | null = null;
      if (tfwFile) {
        tfwText = await tfwFile.text();
      }
      
      const cx = cave ? cave.centerOffset : { x: 0, y: 0, z: 0 };
      const newSurface = await parseGeoTiffLazy(tifBuf, tfwText, cx);
      
      console.log('[TIFF] Parsed surface:', {
        samples: newSurface.dtm.samples,
        lines: newSurface.dtm.lines,
        calib: newSurface.dtm.calib,
        bounds: newSurface.bounds,
        centerOffset: newSurface.centerOffset
      });

      // Add map texture support if the raster is calibrated in S-JTSK coordinates.
      const sjtskBounds = getSjtskBoundsFromDtm(newSurface.dtm);
      if (sjtskBounds) {
        newSurface.sjtskBbox = sjtskBounds.bbox;
        newSurface.sjtskBboxSource = sjtskBounds.sourceCrs;
        newSurface.sjtskAspect = sjtskBounds.aspect;
        
        // Default initially to orthophoto
        // We no longer attach WMS here. The user must select WMS in the UI.
        newSurface.bitmapUrl = null;
      }

      if (!cave) {
        const b = newSurface.bounds!;
        const midZ = (b.minZ + b.maxZ) / 2;
        const halfW = b.width / 2;
        const halfH = b.height / 2;
        const centerOffset = { 
          x: newSurface.dtm.calib.xOrigin + halfW, 
          y: newSurface.dtm.calib.yOrigin - halfH,
          z: midZ
        };
        newSurface.centerOffset = centerOffset;
        const emptyCave: ParsedCave = {
          segments: [], stations: [], stationLabels: [], scraps: [],
          surfaces: [newSurface],
          bounds: { 
            min: { x: -halfW, y: -halfH, z: b.minZ - midZ },
            max: { x: halfW, y: halfH, z: b.maxZ - midZ },
            center: { x: 0, y: 0, z: 0 },
            size: { x: b.width, y: b.height, z: b.maxZ - b.minZ }
          },
          centerOffset,
          stationCount: 0, segmentCount: 0, scrapCount: 0, pointCount: 0,
          hasSurface: true
        };
        processCaveData(emptyCave, tifBuf);
        setAppState('viewer');
      } else {
        // Automatic Reprojection (S-JTSK -> Cave CRS)
        const cal = newSurface.dtm.calib;
        const isSjtsk = cal.xOrigin > -950000 && cal.xOrigin < -150000 && cal.yOrigin > -1350000 && cal.yOrigin < -900000;
        
        let caveProj = getProjectProjection();
        
        // Fallback: If cave projection is unknown but cave is centered at UTM-like coordinates
        if (!caveProj) {
          const { x, y } = cave.centerOffset;
          if (x > 100000 && x < 800000 && y > 4000000 && y < 6000000) {
            // Assume UTM zone 34N
            caveProj = "+proj=utm +zone=34 +ellps=WGS84 +datum=WGS84 +units=m +no_defs";
            console.log('[TIFF] Guessed Cave CRS as UTM 34N');
          }
        }

        if (isSjtsk && caveProj) {
          try {
            console.log('[TIFF] Reprojecting surface from S-JTSK to Cave CRS', caveProj);
            
            // Reproject origin and vectors
            const oWgs = proj4(SJTSK_DEF, "WGS84", [cal.xOrigin, cal.yOrigin]);
            const oTarget = proj4("WGS84", caveProj, oWgs);
            
            const xWgs = proj4(SJTSK_DEF, "WGS84", [cal.xOrigin + cal.xx, cal.yOrigin + cal.yx]);
            const xTarget = proj4("WGS84", caveProj, xWgs);
            
            const yWgs = proj4(SJTSK_DEF, "WGS84", [cal.xOrigin + cal.xy, cal.yOrigin + cal.yy]);
            const yTarget = proj4("WGS84", caveProj, yWgs);

            newSurface.dtm.calib = {
              xOrigin: oTarget[0],
              yOrigin: oTarget[1],
              xx: xTarget[0] - oTarget[0],
              yx: xTarget[1] - oTarget[1],
              xy: yTarget[0] - oTarget[0],
              yy: yTarget[1] - oTarget[1]
            };
            console.log('[TIFF] Reprojection successful:', newSurface.dtm.calib);
          } catch(e) {
            console.error('[TIFF] Failed to reproject:', e);
          }
        }

        // Add to existing cave
        setCave((prev: ParsedCave | null) => {
          if (!prev) return prev;
          return {
            ...prev,
            surfaces: [...prev.surfaces, newSurface],
            hasSurface: true
          };
        });
        setOpts(prev => ({
          ...prev,
          showSurfaceMesh: true
        }));
        setAppState('viewer');
      }

    } catch (e: any) {
      console.error(e);
      setErrorMsg('Chyba pri načítaní TIFF: ' + String(e));
      setAppState('error');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 1) {
      const tif = files.find(f => f.name.toLowerCase().endsWith('.tif') || f.name.toLowerCase().endsWith('.tiff'));
      const tfw = files.find(f => f.name.toLowerCase().endsWith('.tfw'));
      if (tif) {
        handleTiffFile(tif, tfw);
        return;
      }
    }
    if (files[0]) handleFile(files[0])
  }, [handleFile, cave])

  const handleReset = () => {
    setAppState('welcome'); setLoadedFile(null)
    revokeCaveObjectUrls(lidarOriginalCaveRef.current)
    lidarOriginalCaveRef.current = null
    lidarUndoCaveRef.current = null
    lidarKeepMaskRef.current = null
    setLidarKeepSelectionCount(0)
    setLidarEditRemovedCount(0)
    setLidarEditMode('off')
    setLidarEditStroke([])
    setLidarEditCursor(null)
    setCave(prev => {
      revokeCaveObjectUrls(prev)
      return null
    })
    setLastLoadedBuffer(null)
    setOpts(prev => {
      clearSurfaceTextureUrl(prev.surfaceTextureUrl)
      return { ...prev, surfaceTextureUrl: null, showSurfaceTexture: false }
    })
    setProgress(0); setErrorMsg(null)
  }

  // ── Auto-load model from URL params (embed & share links) ──────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const modelUrl = params.get('model')
    if (modelUrl) {
      let label = modelUrl.split('/').pop() || modelUrl
      try {
        const u = new URL(modelUrl, window.location.href)
        if (u.searchParams.has('name')) label = u.searchParams.get('name')!
      } catch (e) { /* ignore */ }
      loadFromUrl(modelUrl, label)
    }
  }, [])

  // ── Apply URL state after model loads ────────────────────────────────────────
  useEffect(() => {
    if (appState !== 'viewer') return
    const p = new URLSearchParams(window.location.search)
    if (!p.has('terrain') && !p.has('theme')) return // no state encoded, skip

    const terrain = p.get('terrain')
    setOpts(prev => ({
      ...prev,
      // Theme
      ...(p.get('theme') ? (() => { const th = p.get('theme') as keyof typeof THEMES; return THEMES[th] ?? {} })() : {}),
      // Terrain surface
      showSurfaceMesh:     terrain === 'shaded',
      showSurfaceNetwork:  terrain === 'network',
      showSurfaceTexture:  terrain === 'texture',
      showSurfaceMeshWire: p.get('wire') === '1',
      surfaceOpacity:      p.has('surfop') ? parseFloat(p.get('surfop')!) : prev.surfaceOpacity,
      surfaceColor:        p.get('surfcol') ? '#' + p.get('surfcol') : prev.surfaceColor,
      colorTerrainWire:    p.get('twire') ? '#' + p.get('twire') : prev.colorTerrainWire,
      // Cave walls
      showScraps:          p.get('scraps') !== '0',
      smoothScraps:        p.get('smooth') === '1',
      accurateScraps:      p.get('acc') === '1',
      scrapsSolid:         p.get('solid') !== '0',
      scrapsWireframe:     p.get('swire') === '1',
      scrapsAltitude:      p.get('salt') === '1',
      showRenderCave:      p.get('cave3d') === '1',
      caveTexture:         (p.get('ctex') as any) ?? prev.caveTexture,
      scrapsOpacity:       p.has('scrop') ? parseFloat(p.get('scrop')!) : prev.scrapsOpacity,
      scrapsRelief:        p.has('srelief') ? parseFloat(p.get('srelief')!) : prev.scrapsRelief,
      scrapsViewMode:      (p.get('sview') as any) ?? prev.scrapsViewMode,
      scrapsHeightThreshold: p.has('sth') ? parseFloat(p.get('sth')!) : prev.scrapsHeightThreshold,
      scrapsAngleThreshold: p.has('sang') ? parseFloat(p.get('sang')!) : prev.scrapsAngleThreshold,
      scrapsSectionWidth:  p.has('swidth') ? parseFloat(p.get('swidth')!) : prev.scrapsSectionWidth,
      renderOpacity:       p.has('rop') ? parseFloat(p.get('rop')!) : prev.renderOpacity,
      colorScraps:         p.get('cscraps') ? '#' + p.get('cscraps') : prev.colorScraps,
      colorScrapsWire:     p.get('cswire') ? '#' + p.get('cswire') : prev.colorScrapsWire,
      // Survey
      showTraverse:        p.get('trvrs') !== '0',
      traverseAltitude:    p.get('talt') === '1',
      traverseRadius:      p.has('tradius') ? parseFloat(p.get('tradius')!) : prev.traverseRadius,
      showSplay:           p.get('splay') === '1',
      colorTraverse:       p.get('ctrvrs') ? '#' + p.get('ctrvrs') : prev.colorTraverse,
      colorSplay:          p.get('csplay') ? '#' + p.get('csplay') : prev.colorSplay,
      // Stations
      showStations:        p.get('stations') !== '0',
      showStationNames:    p.get('snames') === '1',
      showStationAlt:      p.get('salta') === '1',
      showEntrances:       p.get('entrances') !== '0',
      showEntranceLabels:  p.get('elabels') === '1',
      colorStations:       p.get('cst') ? '#' + p.get('cst') : prev.colorStations,
      colorStationNames:   p.get('cstn') ? '#' + p.get('cstn') : prev.colorStationNames,
      colorStationAlt:     p.get('csta') ? '#' + p.get('csta') : prev.colorStationAlt,
      // Grid / BBox
      showGrid:            p.get('grid') !== '0',
      showBoundingBox:     p.get('bbox') === '1',
      colorGrid:           p.get('cgrid') ? '#' + p.get('cgrid') : prev.colorGrid,
      // Colors
      colorBackground:     p.get('bg') ? '#' + p.get('bg') : prev.colorBackground,
      // Clipping / Rezy
      showClipping:        p.get('clip') === '1',
      clippingHeight:      p.has('cliph') ? parseFloat(p.get('cliph')!) : prev.clippingHeight,
      showProfileClipping: p.get('pclip') === '1',
      profileClipFlip:     p.get('pflip') === '1',
      profileClipOffset:   p.has('poff') ? parseFloat(p.get('poff')!) : prev.profileClipOffset,
      excludeModelFromClipping: p.get('excl') === '1',
      // Auto-rotate
      autoRotate:          p.get('rot') === '1',
      autoRotateSpeed:     p.has('rotspd') ? parseFloat(p.get('rotspd')!) : prev.autoRotateSpeed,
    }))
  }, [appState])

  // ── State → URL encoder ──────────────────────────────────────────────────────
  const encodeState = (o: ViewerOptions, modelParam: string): URLSearchParams => {
    const p = new URLSearchParams()
    p.set('model', modelParam)
    p.set('embed', 'true')
    // Theme
    p.set('theme', currentTheme)
    // Terrain
    const terrain = o.showSurfaceTexture ? 'texture' : o.showSurfaceNetwork ? 'network' : 'shaded'
    p.set('terrain', terrain)
    if (o.showSurfaceMeshWire) p.set('wire', '1')
    if (o.surfaceOpacity !== 0.8) p.set('surfop', String(o.surfaceOpacity))
    const defSurfCol = '#e2e8f0'
    if (o.surfaceColor !== defSurfCol) p.set('surfcol', o.surfaceColor.replace('#', ''))
    if (o.colorTerrainWire !== '#6ab04c') p.set('twire', o.colorTerrainWire.replace('#', ''))
    // Cave walls
    if (!o.showScraps) p.set('scraps', '0')
    if (o.smoothScraps) p.set('smooth', '1')
    if (o.accurateScraps) p.set('acc', '1')
    if (!o.scrapsSolid) p.set('solid', '0')
    if (o.scrapsWireframe) p.set('swire', '1')
    if (o.scrapsAltitude) p.set('salt', '1')
    if (o.showRenderCave) p.set('cave3d', '1')
    if (o.caveTexture !== 'limestone') p.set('ctex', o.caveTexture)
    if (o.scrapsOpacity !== 0.85) p.set('scrop', String(o.scrapsOpacity))
    if (o.scrapsRelief !== 0.35) p.set('srelief', String(o.scrapsRelief))
    if (o.scrapsViewMode !== 'all') p.set('sview', o.scrapsViewMode)
    if (o.scrapsHeightThreshold !== 0.1) p.set('sth', String(o.scrapsHeightThreshold))
    if (o.scrapsAngleThreshold !== 0.0) p.set('sang', String(o.scrapsAngleThreshold))
    if (o.scrapsSectionWidth !== 0.08) p.set('swidth', String(o.scrapsSectionWidth))
    if (o.renderOpacity !== 1.0) p.set('rop', String(o.renderOpacity))
    if (o.colorScraps !== '#2a5585') p.set('cscraps', o.colorScraps.replace('#', ''))
    if (o.colorScrapsWire !== '#6a9fd8') p.set('cswire', o.colorScrapsWire.replace('#', ''))
    // Survey
    if (!o.showTraverse) p.set('trvrs', '0')
    if (o.traverseAltitude) p.set('talt', '1')
    if (o.traverseRadius !== 0.3) p.set('tradius', String(o.traverseRadius))
    if (o.showSplay) p.set('splay', '1')
    if (o.colorTraverse !== '#ffffff') p.set('ctrvrs', o.colorTraverse.replace('#', ''))
    if (o.colorSplay !== '#78909c') p.set('csplay', o.colorSplay.replace('#', ''))
    // Stations
    if (!o.showStations) p.set('stations', '0')
    if (o.showStationNames) p.set('snames', '1')
    if (o.showStationAlt) p.set('salta', '1')
    if (!o.showEntrances) p.set('entrances', '0')
    if (o.showEntranceLabels) p.set('elabels', '1')
    if (o.colorStations !== '#fbbf24') p.set('cst', o.colorStations.replace('#', ''))
    if (o.colorStationNames !== '#fbbf24') p.set('cstn', o.colorStationNames.replace('#', ''))
    if (o.colorStationAlt !== '#a5f3fc') p.set('csta', o.colorStationAlt.replace('#', ''))
    // Grid
    if (!o.showGrid) p.set('grid', '0')
    if (o.showBoundingBox) p.set('bbox', '1')
    if (o.colorGrid !== '#224422') p.set('cgrid', o.colorGrid.replace('#', ''))
    // Colors
    if (o.colorBackground !== '#020617') p.set('bg', o.colorBackground.replace('#', ''))
    // Clipping / Rezy
    if (o.showClipping) p.set('clip', '1')
    if (o.showClipping) p.set('cliph', String(o.clippingHeight))
    if (o.showProfileClipping) p.set('pclip', '1')
    if (o.profileClipFlip) p.set('pflip', '1')
    if (o.profileClipOffset !== 0) p.set('poff', String(o.profileClipOffset))
    if (o.excludeModelFromClipping) p.set('excl', '1')
    // Auto-rotate
    if (o.autoRotate) p.set('rot', '1')
    if (o.autoRotateSpeed !== 2.0) p.set('rotspd', String(o.autoRotateSpeed))
    // Sidebar access for embed visitors
    if (allowSidebarInEmbed) p.set('sidebar', '1')
    return p
  }

  // ── Share iframe generator ────────────────────────────────────────────────────
  const validateUrl = async (url: string) => {
    if (!url) return
    setUrlValidationStatus('checking')
    setUrlValidationError(null)
    try {
      // Skúsime HEAD request (rýchlejší, len hlavičky)
      const resp = await fetch(url, { method: 'HEAD' })
      if (resp.ok) {
        setUrlValidationStatus('valid')
      } else {
        setUrlValidationStatus('invalid')
        setUrlValidationError(`Chyba: Server vrátil status ${resp.status}`)
      }
    } catch (err: any) {
      setUrlValidationStatus('invalid')
      setUrlValidationError(lang === 'sk' 
        ? 'Súbor nie je prístupný. Skontroluj adresu alebo CORS nastavenia servera.' 
        : 'File not accessible. Check URL or CORS settings.')
    }
  }

  const getShareUrl = (withEmbed = true) => {
    const base = window.location.origin + window.location.pathname
    const params = new URLSearchParams(window.location.search)
    
    // Použijeme buď custom zadanú URL, alebo pôvodnú z parametrov/názvu
    const modelParam = customShareUrl || params.get('model') || `/${loadedFile?.name ?? ''}`
    
    if (!withEmbed) {
      return `${base}?model=${encodeURIComponent(modelParam)}`
    }
    const encoded = encodeState(opts, modelParam)
    return `${base}?${encoded.toString()}`
  }

  const getIframeCode = () => {
    const url = escapeHtmlAttribute(getShareUrl(true))
    const title = escapeHtmlAttribute(`LochViewer - ${loadedFile?.name ?? 'Cave Model'}`)
    const width = clampEmbedDimension(iframeWidth)
    const height = clampEmbedDimension(iframeHeight)
    return `<iframe src="${url}" width="${width}" height="${height}" style="border:0;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.4);" allowfullscreen loading="lazy" title="${title}"></iframe>`
  }

  const handleCopyShare = () => {
    if (urlValidationStatus === 'invalid') {
      if (!confirm(lang === 'sk' 
        ? 'Varovanie: URL adresa modelu nebola overená alebo je chybná. Chceš napriek tomu skopírovať kód?' 
        : 'Warning: Model URL was not verified or is invalid. Copy anyway?')) {
        return
      }
    }
    navigator.clipboard.writeText(getIframeCode()).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    })
  }

  const handleGDriveUpload = async () => {
    if (!lastLoadedBuffer || !loadedFile) return
    setGdriveStatus('uploading')
    
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (response: any) => {
          if (response.error) {
            setGdriveStatus('error')
            return
          }
          
          const accessToken = response.access_token
          
          const metadata = {
            name: loadedFile.name,
            mimeType: 'application/octet-stream'
          }
          
          const boundary = '-------314159265358979323846'
          const delimiter = "\r\n--" + boundary + "\r\n"
          const close_delim = "\r\n--" + boundary + "--"

          const metadataPart = delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)
          const mediaPart = delimiter + 'Content-Type: application/octet-stream\r\n\r\n'
          
          const body = new Blob([
            metadataPart,
            mediaPart,
            lastLoadedBuffer,
            close_delim
          ], { type: `multipart/related; boundary=${boundary}` })

          const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: body
          })
          
          if (!uploadResp.ok) {
            const errText = await uploadResp.text()
            throw new Error(`Upload failed: ${uploadResp.status} ${errText}`)
          }
          
          const fileData = await uploadResp.json()
          const fileId = fileData.id

          // 2. Set permissions to public
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          })
          
          // 3. Construct URL that works with CORS (requires API key)
          const gdriveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}&name=${encodeURIComponent(loadedFile.name)}`
          setCustomShareUrl(gdriveUrl)
          setGdriveStatus('success')
          setUrlValidationStatus('valid')
        }
      })
      client.requestAccessToken()
    } catch (err) {
      console.error('GDrive error:', err)
      setGdriveStatus('error')
    }
  }

  const openShareDialog = () => {
    const params = new URLSearchParams(window.location.search)
    const currentModel = params.get('model') || `/${loadedFile?.name ?? ''}`
    setCustomShareUrl(currentModel)
    setUrlValidationStatus('idle')
    setUrlValidationError(null)
    setShareDialogOpen(true)
  }

  const toggleOpt = (key: keyof ViewerOptions) =>
    setOpts(prev => ({ ...prev, [key]: !prev[key] }))

  // Compute stats for Legend
  const legendCave = useMemo(() => {
    if (!cave || (!opts.scrapsAltitude && !opts.traverseAltitude)) return null
    let minZ = Infinity, maxZ = -Infinity
    if (cave.scraps?.length) {
      for (const sc of cave.scraps) {
        for (const v of sc.vertices) {
          if (v.z < minZ) minZ = v.z
          if (v.z > maxZ) maxZ = v.z
        }
      }
    } else {
      minZ = cave.bounds.min.z
      maxZ = cave.bounds.max.z
    }
    if (minZ === Infinity) return null
    return {
      minAlt: minZ + (cave.centerOffset?.z || 0),
      maxAlt: maxZ + (cave.centerOffset?.z || 0)
    }
  }, [cave, opts.scrapsAltitude, opts.traverseAltitude])

  const legendSurf = useMemo(() => {
    if (!cave || (!opts.showSurfaceNetwork && !(opts.showSurfaceMesh && !opts.showSurfaceTexture))) return null
    let minZ = Infinity, maxZ = -Infinity
    if (cave.surfaces?.length > 0) {
      const d = cave.surfaces[0].dtm.data
      for(let i=0; i<d.length; i++){
        if (d[i] < minZ) minZ = d[i]
        if (d[i] > maxZ) maxZ = d[i]
      }
    }
    if (minZ === Infinity) return null
    return {
      minAlt: minZ,
      maxAlt: maxZ
    }
  }, [cave, opts.showSurfaceNetwork])

  const setOpacity = (key: 'scrapsOpacity' | 'surfaceOpacity' | 'floorMapOpacity', v: number) =>
    setOpts(prev => ({ ...prev, [key]: v }))

  const formatSize = (bytes: number) =>
    bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + ' MB' : (bytes / 1024).toFixed(1) + ' KB'

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Inter',system-ui,sans-serif;background:#050810;color:#e2e8f0;overflow:hidden}
        .bg-canvas{position:fixed;inset:0;pointer-events:none;z-index:0}

        /* WELCOME */
        .app{position:relative;z-index:1;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}
        .welcome{display:flex;flex-direction:row;align-items:stretch;width:100vw;height:100vh;background:#020617;overflow:hidden;position:fixed;top:0;left:0;z-index:1000}
        .welcome-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3rem; padding: 4rem; overflow-y: auto; background: radial-gradient(circle at center, #111827 0%, #020617 100%); position: relative; min-width: 0; }
        .welcome-main::before { content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; height: 800px; background: radial-gradient(circle at center, rgba(59, 130, 246, 0.03) 0%, transparent 70%); pointer-events: none; }
        .welcome-sidebar { width: 350px; background: rgba(15,23,42,0.5); border-left: 1px solid #1e293b; padding: 2.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; text-align: left; backdrop-filter: blur(10px); }

        .welcome-version { font-size: 0.78rem; color: #a5b4fc; font-weight: 800; background: rgba(99,102,241,0.12); padding: 4px 12px; border-radius: 6px; display: inline-block; margin-top: 0.75rem; border: 1px solid rgba(99,102,241,0.24); letter-spacing:.06em; }
        .changelog-title { font-size: 12px; font-weight: 800; color: #f8fafc; text-transform: uppercase; letter-spacing: .2em; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 10px; }
        .changelog-ver { font-size: 13px; font-weight: 700; color: #6366f1; margin-top: 2rem; margin-bottom: 0.8rem; border-bottom: 1px solid rgba(99,102,241,0.1); padding-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
        .changelog-ver:first-of-type { margin-top: 0; }
        .changelog-badge { font-size: 8px; background: #3b82f6; color: white; padding: 2px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing:.08em; }
        .changelog-list { list-style: none; padding: 0; margin: 0; }
        .changelog-item { font-size: 11.5px; color: #94a3b8; margin-bottom: 0.7rem; line-height: 1.6; display: flex; gap: 10px; }
        .changelog-item:before { content: "→"; color: #6366f1; flex-shrink: 0; font-weight: bold; }
        .changelog-group { font-size: 9px; font-weight: 800; color: #475569; text-transform: uppercase; margin: 1rem 0 0.5rem 0; letter-spacing: 0.1em; background: rgba(255,255,255,0.03); padding: 2px 6px; border-radius: 3px; display: inline-block; }
        .logo-icon{font-size:4rem;filter:drop-shadow(0 0 28px rgba(99,179,237,.55));animation:float 4s ease-in-out infinite}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        .logo-title{font-size:2.8rem;font-weight:800;letter-spacing:-.02em;background:linear-gradient(135deg,#63b3ed 0%,#9f7aea 50%,#63b3ed 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 4s linear infinite}
        @keyframes shimmer{0%{background-position:0% center}100%{background-position:200% center}}
        .logo-sub{font-size:.85rem;color:#718096;margin-top:.3rem;letter-spacing:.08em;text-transform:uppercase}

        .welcome-main > div { width: 100%; max-width: 920px; }
        .dropzone{width:100%; max-width: 920px; border:2px dashed rgba(99,179,237,.3);border-radius:20px;padding:2.5rem 2rem;text-align:center;cursor:pointer;transition-property:border-color,background-color,transform,box-shadow;transition-duration:.25s;transition-timing-function:ease;background:rgba(99,179,237,.03);position:relative;overflow:hidden}
        .dropzone:hover,.dropzone.over{border-color:rgba(99,179,237,.7);background:rgba(99,179,237,.08);transform:scale(1.01);box-shadow:0 0 40px rgba(99,179,237,.15)}
        .dz-icon{font-size:2.5rem;margin-bottom:.7rem;display:block}
        .dz-title{font-size:1.05rem;font-weight:600;margin-bottom:.3rem}
        .dz-sub{font-size:.82rem;color:#718096}
        .dz-or{margin:.9rem 0;color:#4a5568;font-size:.82rem}
        .btn-open{display:inline-flex;align-items:center;gap:.45rem;background:linear-gradient(135deg,#4299e1,#9f7aea);color:#fff;border:none;border-radius:10px;padding:.65rem 1.5rem;font-size:.875rem;font-weight:600;cursor:pointer;transition-property:transform,box-shadow;transition-duration:.2s;font-family:inherit;box-shadow:0 4px 20px rgba(66,153,225,.3)}
        .btn-open:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(66,153,225,.45)}

        .formats{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;width:100%}
        .fmt-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:.8rem;text-align:center;transition:all .2s}
        .fmt-card:hover{background:rgba(99,179,237,.06);border-color:rgba(99,179,237,.25);transform:translateY(-2px)}
        .fmt-icon{font-size:1.4rem;margin-bottom:.25rem}
        .fmt-label{font-size:.77rem;font-weight:600;color:#a0aec0}
        .fmt-ext{font-size:.72rem;color:#4a5568;margin-top:.1rem}

        .err-msg{width:100%;background:rgba(245,101,101,.12);border:1px solid rgba(245,101,101,.3);border-radius:10px;padding:.75rem 1rem;font-size:.85rem;color:#fc8181;display:flex;align-items:flex-start;gap:.5rem}
        input[type="file"]{display:none}

        /* LOADING */
        .loading-screen{display:flex;flex-direction:column;align-items:center;gap:1.4rem;padding:2rem;text-align:center}
        .load-icon{font-size:3.5rem;animation:pulse 1.4s ease-in-out infinite}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.1);opacity:.7}}
        .load-title{font-size:1.35rem;font-weight:700}
        .load-file{font-size:.82rem;color:#718096;margin-top:.15rem}
        .prog-wrap{width:320px;background:rgba(255,255,255,.05);border-radius:100px;height:7px;overflow:hidden}
        .prog-bar{height:100%;border-radius:100px;background:linear-gradient(90deg,#4299e1,#9f7aea);transition:width .1s linear;box-shadow:0 0 10px rgba(99,179,237,.6)}
        .prog-pct{font-size:.82rem;color:#718096}

        /* VIEWER */
        .viewer-shell{width:100vw;height:100vh;display:flex;flex-direction:column;overflow:hidden}
        .topbar{height:50px;background:rgba(5,8,16,.95);border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:1rem;padding:0 1.1rem;flex-shrink:0;backdrop-filter:blur(8px)}
        .tb-logo{font-size:1rem;font-weight:700;color:#63b3ed;white-space:nowrap}
        .tb-file{font-size:.77rem;color:#718096;background:rgba(255,255,255,.05);padding:.22rem .65rem;border-radius:6px;border:1px solid rgba(255,255,255,.08);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tb-badge{font-size:.7rem;font-weight:700;padding:.2rem .5rem;border-radius:4px;background:rgba(99,179,237,.15);color:#63b3ed;border:1px solid rgba(99,179,237,.3)}
        .tb-space{flex:1; display: flex; align-items: center; justify-content: center;}
        .status-bar { display: flex; align-items: center; gap: 10px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 2px 10px; max-width: 500px; min-width: 200px; height: 30px; margin: 0 10px; transition: all 0.3s ease; overflow: hidden; }
        .status-msg { font-size: 11px; font-weight: 600; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; display: flex; align-items: center; gap: 6px; }
        .status-msg .material-symbols-outlined { font-size: 14px; }
        .status-progress-bg { width: 80px; height: 5px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
        .status-progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #818cf8); box-shadow: 0 0 8px rgba(59, 130, 246, 0.5); transition: width 0.3s ease; }
        .status-error { color: #fca5a5 !important; border-color: rgba(239, 68, 68, 0.3) !important; background: rgba(239, 68, 68, 0.1) !important; }
        .status-success { color: #6ee7b7 !important; border-color: rgba(16, 185, 129, 0.3) !important; background: rgba(16, 185, 129, 0.1) !important; }
        .status-progress { color: #93c5fd !important; }
        .tb-stat{font-size:.75rem;color:#4a5568}
        .btn-back{display:flex;align-items:center;gap:.4rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#a0aec0;border-radius:8px;padding:.38rem .85rem;font-size:.78rem;font-weight:500;cursor:pointer;font-family:inherit;transition:all .2s;white-space:nowrap}
        .btn-back:hover{background:rgba(255,255,255,.1);color:#e2e8f0}

        .viewer-body{flex:1;display:flex;overflow:hidden;position:relative}
        .canvas-wrap{flex:1;position:relative}

        /* Sidebar */
        .sidebar-container { display: flex; flex-shrink: 0; z-index: 100; }
        .sidebar{width:230px;background:rgba(8,12,24,.97);border-left:1px solid rgba(255,255,255,.05);padding:.9rem;display:flex;flex-direction:column;gap:1rem;overflow-y:auto;flex-shrink:0;height:100%;max-height:100%}
        .mobile-sidebar-close{display:none;align-items:center;justify-content:center;gap:.45rem;position:fixed;right:calc(1rem + env(safe-area-inset-right));bottom:calc(1rem + env(safe-area-inset-bottom));z-index:10001;min-height:48px;max-width:calc(100vw - 2rem);padding:0 1rem;border:1px solid rgba(248,113,113,.5);border-radius:8px;background:rgba(220,38,38,.94);color:#fff;font-size:.95rem;font-weight:800;font-family:inherit;cursor:pointer;box-shadow:0 14px 36px rgba(0,0,0,.48);backdrop-filter:blur(8px);transition:background .2s,transform .2s,box-shadow .2s}
        .mobile-sidebar-close:hover{background:#dc2626;box-shadow:0 16px 42px rgba(0,0,0,.58)}
        .mobile-sidebar-close:active{transform:translateY(1px)}
        .mobile-sidebar-close-icon{width:20px;height:20px;flex-shrink:0}
        .lidar-edit-panel{margin:0 0 12px;padding:10px;border:1px solid rgba(20,184,166,.22);border-radius:8px;background:rgba(15,23,42,.72);box-shadow:0 10px 28px rgba(0,0,0,.2)}
        .lidar-edit-panel.active{border-color:rgba(45,212,191,.55);box-shadow:0 0 0 1px rgba(45,212,191,.1),0 12px 34px rgba(0,0,0,.28)}
        .lidar-edit-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;color:#ccfbf1}
        .lidar-edit-title{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0}
        .lidar-edit-title svg{width:16px;height:16px}
        .lidar-edit-count{font-variant-numeric:tabular-nums;font-size:10px;color:#5eead4;background:rgba(20,184,166,.1);border:1px solid rgba(20,184,166,.18);border-radius:6px;padding:3px 6px}
        .lidar-edit-toolbar{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
        .lidar-edit-toolbar.secondary{margin:8px 0 0}
        .lidar-edit-btn,.lidar-icon-btn{min-height:40px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:rgba(30,41,59,.7);color:#dbeafe;font-family:inherit;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition-property:background,border-color,color,transform,opacity;transition-duration:.16s}
        .lidar-edit-btn svg,.lidar-icon-btn svg{width:16px;height:16px;flex-shrink:0}
        .lidar-edit-btn:hover:not(:disabled),.lidar-icon-btn:hover:not(:disabled){background:rgba(51,65,85,.9);border-color:rgba(148,163,184,.42)}
        .lidar-edit-btn:active:not(:disabled),.lidar-icon-btn:active:not(:disabled){transform:scale(.96)}
        .lidar-edit-btn:disabled,.lidar-icon-btn:disabled{opacity:.42;cursor:not-allowed}
        .lidar-edit-btn.danger.active{background:rgba(220,38,38,.22);border-color:rgba(248,113,113,.62);color:#fecaca}
        .lidar-edit-btn.keep.active,.lidar-edit-btn.keep:not(:disabled):hover{background:rgba(13,148,136,.2);border-color:rgba(45,212,191,.56);color:#99f6e4}
        .lidar-brush-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;margin-top:4px;color:#94a3b8;font-size:10px;font-weight:800}
        .lidar-brush-row input{width:100%;accent-color:#14b8a6}
        .lidar-brush-row span{font-variant-numeric:tabular-nums;color:#5eead4}
        .lidar-keep-row{display:grid;grid-template-columns:1fr auto 40px;align-items:center;gap:6px;margin-top:8px}
        .lidar-keep-row>span{font-variant-numeric:tabular-nums;color:#5eead4;font-size:11px;font-weight:900;background:rgba(2,6,23,.7);border:1px solid rgba(20,184,166,.18);border-radius:8px;padding:8px 10px;min-height:40px;display:flex;align-items:center}
        .lidar-icon-btn{width:40px;padding:0}
        .lidar-edit-overlay{position:absolute;inset:0;z-index:35;cursor:none;touch-action:none;user-select:none}
        .lidar-edit-overlay.busy{cursor:progress}
        .lidar-edit-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
        .lidar-edit-brush{fill:rgba(20,184,166,.1);stroke:#5eead4;stroke-width:2;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 8px rgba(20,184,166,.45))}
        .lidar-edit-overlay.mode-erase .lidar-edit-brush{fill:rgba(239,68,68,.1);stroke:#fca5a5;filter:drop-shadow(0 0 8px rgba(239,68,68,.45))}
        .lidar-edit-trail{fill:none;stroke:#5eead4;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;opacity:.86}
        .lidar-edit-overlay.mode-erase .lidar-edit-trail{stroke:#fca5a5}
        .lidar-edit-floating{position:absolute;left:12px;bottom:12px;display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 10px;border:1px solid rgba(20,184,166,.34);border-radius:8px;background:rgba(2,6,23,.82);color:#ccfbf1;font-size:11px;font-weight:900;backdrop-filter:blur(8px);box-shadow:0 12px 30px rgba(0,0,0,.32)}
        .lidar-edit-overlay.mode-erase .lidar-edit-floating{border-color:rgba(248,113,113,.4);color:#fecaca}
        .lidar-edit-floating span{font-variant-numeric:tabular-nums;color:#5eead4}
        .sidebar::-webkit-scrollbar{width:5px}
        .sidebar::-webkit-scrollbar-track{background:rgba(0,0,0,0.1)}
        .sidebar::-webkit-scrollbar-thumb{background:rgba(99,179,237,0.3);border-radius:10px}
        .sidebar::-webkit-scrollbar-thumb:hover{background:rgba(99,179,237,0.5)}
        .s-label{font-size:.72rem;font-weight:900;color:#f8fafc;text-transform:uppercase;letter-spacing:.15em;margin-bottom:.8rem;margin-top:1.5rem;border-left:4px solid #3b82f6;padding-left:10px;display:flex;align-items:center;background:rgba(59,130,246,0.05);padding-top:4px;padding-bottom:4px;border-radius:0 4px 4px 0}
        .s-label:first-of-type { margin-top: 0.5rem; }
        .info-row{display:flex;justify-content:space-between;font-size:.75rem;padding:.28rem 0;border-bottom:1px solid rgba(255,255,255,.04);color:#718096}
        .info-val{color:#63b3ed;font-weight:600}

        .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid rgba(255,255,255,.04)}
        .toggle-label{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:#a0aec0;cursor:pointer}
        .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .switch{width:32px;height:17px;background:rgba(255,255,255,.1);border-radius:100px;position:relative;cursor:pointer;transition:background .2s;border:1px solid rgba(255,255,255,.1);flex-shrink:0}
        .switch.on{background:rgba(66,153,225,.6);border-color:rgba(66,153,225,.5)}
        .switch::after{content:'';position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
        .switch.on::after{transform:translateX(15px)}

        .slider-row{padding:.45rem 0;border-bottom:1px solid rgba(255,255,255,.04)}
        .slider-top{display:flex;justify-content:space-between;font-size:.76rem;color:#a0aec0;margin-bottom:.3rem}
        .slider-val{color:#63b3ed;font-weight:600}
        input[type=range]{width:100%;height:3px;-webkit-appearance:none;background:rgba(255,255,255,.1);border-radius:100px;outline:none;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#4299e1;cursor:pointer;box-shadow:0 0 6px rgba(66,153,225,.5)}

        .welcome-samples{width:100%;display:flex;flex-direction:column;gap:1.5rem;max-width:720px}
        .demo-title{font-size:.62rem;font-weight:700;color:#4a5568;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;text-align:center}
        .demo-title.danger{color:#f56565}
        .demo-grid{display:flex;gap:.6rem;justify-content:center}
        .btn-demo{background:rgba(99,179,237,.08);border:1px solid rgba(99,179,237,.25);color:#63b3ed;border-radius:8px;padding:.45rem 1rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition-property:background-color,border-color,transform;transition-duration:.2s;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:.35rem;text-align:center}
        .btn-demo:hover{background:rgba(99,179,237,.18);border-color:rgba(99,179,237,.5);transform:translateY(-1px)}
        .btn-demo:active,.btn-open:active{transform:scale(.96)}

        @media (max-width: 900px) {
          .app{align-items:stretch;justify-content:flex-start;height:100dvh}
          .welcome { display:block; overflow-y:auto; overflow-x:hidden; height:100dvh; min-height:0; position:fixed; inset:0; -webkit-overflow-scrolling:touch; }
          .welcome-main { padding:1.1rem 1rem 1.25rem; gap:1rem; flex:none; width:100%; justify-content:flex-start; overflow:visible; min-height:auto; }
          .welcome-main::before { display:none; }
          .welcome-main > div { max-width:100%; }
          .welcome-sidebar { width:100%; border-left:none; border-top:1px solid #1e293b; padding:1.1rem 1rem 1.4rem; flex:none; background:#020617; overflow:visible; gap:1rem; }
          .logo-icon{font-size:2.35rem;animation:none;margin-top:.1rem}
          .logo-title{font-size:clamp(2rem,9vw,2.45rem);line-height:1;text-wrap:balance}
          .logo-sub{font-size:.68rem;line-height:1.35;margin-top:.55rem!important;text-wrap:balance}
          .dropzone{padding:1rem .9rem;border-radius:14px;min-height:0!important}
          .dropzone:hover,.dropzone.over{transform:none}
          .dz-icon{font-size:1.65rem;margin-bottom:.35rem}
          .dz-title{font-size:.95rem;margin-bottom:.2rem}
          .dz-sub{font-size:.72rem;line-height:1.4;text-wrap:pretty}
          .dz-or{display:none}
          .btn-open{width:100%;min-height:44px;justify-content:center;padding:.7rem 1rem;margin-top:.8rem}
          .welcome-samples{gap:.85rem;max-width:100%}
          .demo-title{text-align:left;margin-bottom:.45rem;color:#64748b;letter-spacing:.08em}
          .demo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;justify-content:stretch}
          .demo-grid-stress{grid-template-columns:minmax(0,1fr)}
          .btn-demo{width:100%;min-height:44px;padding:.65rem .45rem;font-size:.78rem;line-height:1.2;white-space:normal;overflow-wrap:anywhere}
          .changelog-title{margin-bottom:1rem}
          .changelog-ver{margin-top:1.1rem}
          .changelog-item{font-size:11px;line-height:1.5;margin-bottom:.55rem}
        }

        @media (max-width: 360px) {
          .demo-grid{grid-template-columns:minmax(0,1fr)}
          .logo-title{font-size:1.9rem}
        }

        @media (max-width: 900px) and (orientation: landscape) and (max-height: 520px) {
          .welcome{display:flex;flex-direction:row}
          .welcome-main{width:62%;padding:.85rem;gap:.65rem}
          .welcome-sidebar{width:38%;border-top:none;border-left:1px solid #1e293b;overflow-y:auto;padding:.85rem}
          .logo-icon{display:none}
          .logo-sub{display:none}
          .dropzone{padding:.75rem}
          .welcome-samples{gap:.55rem}
        }

        .help-text{font-size:.72rem;color:#2d3748;line-height:1.6}
        .loading-3d{font-size:.85rem;color:#4a5568}
        
        .btn-record {
          width: 100%;
          margin-top: 12px;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.1);
          color: #fca5a5;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-record:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
          transform: translateY(-1px);
        }
        .btn-record.recording {
          background: rgba(239, 68, 68, 0.25);
          border-color: #ef4444;
          color: #fff;
        }
        .record-dot {
          width: 8px;
          height: 8px;
          background: #ef4444;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        }
        .recording .record-dot {
          animation: pulse-red 1s infinite;
        }
        @keyframes pulse-red {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
        .debug-btn {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          border-radius: 6px;
          width: 24px;
          height: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .debug-btn:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.25);
          transform: translateY(-1px);
        }
        .debug-btn:active {
          transform: translateY(0);
        }

        /* ── EMBED MODE ── */
        .embed-topbar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(8,12,24,0.85); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .embed-logo { font-size: 12px; font-weight: 800; color: #63b3ed; letter-spacing: .05em; }
        .embed-name { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
        .embed-spacer { flex: 1; }
        .embed-btn { background: rgba(99,179,237,0.12); border: 1px solid rgba(99,179,237,0.25); border-radius: 6px; color: #63b3ed; font-size: 10px; font-weight: 600; padding: 4px 8px; cursor: pointer; text-decoration: none; display: flex; align-items: center; gap: 4px; }
        .embed-btn:hover { background: rgba(99,179,237,0.22); }

        /* ── SHARE DIALOG ── */
        .share-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .share-dialog { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 1.5rem; max-width: 560px; width: 100%; box-shadow: 0 24px 80px rgba(0,0,0,0.7); position: relative; }
        .share-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem; color: #f1f5f9; padding-right: 30px; }
        .share-sub { font-size: 0.8rem; color: #64748b; margin-bottom: 1.2rem; }
        .share-code { background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 0.85rem; font-family: monospace; font-size: 11px; color: #7dd3fc; word-break: break-all; line-height: 1.6; margin-bottom: 0.75rem; max-height: 120px; overflow-y: auto; }
        .share-preview-label { font-size: 10px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 0.5rem; }
        .share-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
        .share-copy-btn { flex: 1; background: linear-gradient(135deg,#4299e1,#6366f1); color: #fff; border: none; border-radius: 8px; padding: 0.6rem 1rem; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
        .share-copy-btn:hover { opacity: 0.9; }
        .share-close-btn { position: absolute; top: 1.2rem; right: 1.2rem; background: #ef4444; border: none; color: #fff; border-radius: 8px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .2s; z-index: 10; }
        .share-close-btn:hover { background: #dc2626; }
        .share-open-link { display: block; font-size: 10px; color: #6366f1; text-align: center; margin-top: 0.75rem; text-decoration: none; }
        .share-open-link:hover { text-decoration: underline; }
        .plan-map-dialog { position:relative; background:#0f172a; border:1px solid #1e293b; border-radius:12px; width:min(96vw, 980px); max-height:92vh; padding:1rem; box-shadow:0 24px 80px rgba(0,0,0,.7); display:flex; flex-direction:column; gap:.75rem; }
        .plan-map-title { display:flex; align-items:center; justify-content:space-between; gap:.75rem; color:#f8fafc; font-size:1rem; font-weight:800; }
        .plan-map-image-wrap { background:#f6f4ee; border:1px solid #334155; border-radius:8px; overflow:auto; display:flex; justify-content:center; align-items:flex-start; max-height:68vh; }
        .plan-map-image { display:block; max-width:100%; height:auto; image-rendering:auto; }
        .plan-map-meta { display:flex; flex-wrap:wrap; gap:.5rem; color:#94a3b8; font-size:11px; }
        .plan-map-meta span { background:#020617; border:1px solid #1e293b; border-radius:6px; padding:.35rem .5rem; }
        .plan-map-actions { display:flex; gap:.5rem; justify-content:flex-end; flex-wrap:wrap; }

        .share-input-row { display: flex; gap: 8px; margin-bottom: 1.2rem; }
        .share-url-input { flex: 1; background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 13px; color: #f1f5f9; outline: none; }
        .share-url-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
        .btn-verify { background: #1e293b; border: 1px solid #334155; color: #94a3b8; border-radius: 8px; padding: 0.6rem 1rem; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
        .btn-verify:hover:not(:disabled) { background: #334155; color: #fff; }
        .btn-verify:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-verify.valid { border-color: #10b981; color: #10b981; }
        .btn-verify.invalid { border-color: #ef4444; color: #ef4444; }

        .validation-msg { font-size: 11px; margin-top: -0.8rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 4px; }
        .validation-msg.valid { color: #10b981; }
        .validation-msg.invalid { color: #ef4444; }
        .validation-msg.checking { color: #63b3ed; }

        .share-size-row { display: flex; align-items: center; gap: 6px; margin-bottom: 1rem; flex-wrap: wrap; }
        .share-size-preset { background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #94a3b8; font-size: 10px; font-weight: 600; padding: 4px 8px; cursor: pointer; transition: all 0.15s; }
        .share-size-preset:hover, .share-size-preset.active { background: #334155; color: #f1f5f9; border-color: #6366f1; }
        .share-size-input { width: 60px; background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 4px 6px; font-size: 12px; color: #f1f5f9; outline: none; text-align: center; }
        .share-size-input:focus { border-color: #3b82f6; }
        .share-toggle-row { display: flex; align-items: center; gap: 10px; padding: 0.6rem 0.8rem; background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; margin-bottom: 0.9rem; }
        .share-toggle-label { flex: 1; font-size: 12px; color: #c7d2fe; }
        .share-toggle-label small { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
        .embed-fullscreen-btn { background: rgba(99,179,237,0.12); border: 1px solid rgba(99,179,237,0.25); border-radius: 6px; color: #63b3ed; font-size: 14px; padding: 4px 8px; cursor: pointer; text-decoration: none; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
        .embed-fullscreen-btn:hover { background: rgba(99,179,237,0.25); }

        @media (max-width: 1023px) {
          .sidebar-container { display: none; }
          .sidebar-container.open { 
            display: flex; position: fixed; inset: 0; z-index: 9999; width: 100vw; height: 100vh;
            background: rgba(8,12,24,.96); backdrop-filter: blur(12px);
          }
          .sidebar { width: 100%; height: 100%; border-left: none; padding: 2rem 1.5rem 6rem; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
          .sidebar-container.open .mobile-sidebar-close { display: inline-flex; }
          .btn-menu { display: flex !important; }
          .tb-file, .tb-badge, .tb-stat { display: none; }
          .s-label { font-size: 0.9rem; margin-top: 1rem; color: #a0aec0; }
          .toggle-row, .slider-row, .info-row { padding: 0.8rem 0; font-size: 1rem; }
          .toggle-label { font-size: 1.05rem; }
          .switch { width: 44px; height: 24px; }
          .switch::after { width: 18px; height: 18px; top: 2px; left: 2px; }
          .switch.on::after { transform: translateX(20px); }
          .btn-back { font-size: 1rem; padding: 0.5rem 0.6rem; }
          .hide-mobile { display: none !important; }
          .hide-mobile-flex { display: none !important; }
          .btn-fit { display: none !important; }
          .show-mobile-flex { display: flex !important; }
        }
        .show-mobile-flex { display: none; }
      `}</style>

      <canvas ref={canvasRef} className="bg-canvas" style={{ background: opts.colorBackground }} />

      <div className="app">

        {/* ── WELCOME ── */}
        {(appState === 'welcome' || appState === 'error') && (
          <div className="welcome">
            <div className="welcome-main">
              <div style={{ textAlign: 'center' }}>
                <div className="logo-icon">🏔️</div>
                <h1 className="logo-title" style={{ marginBottom: '0.2rem' }}>LochViewer v{APP_VERSION}</h1>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.05em' }}>by DankeZ</div>
                <div className="welcome-version">aktuálna verzia v{APP_VERSION}{GIT_COMMIT ? ` (${GIT_COMMIT})` : ''}</div>
                <p className="logo-sub" style={{ marginTop: '1.2rem' }}>{t('welcome.sub')}</p>
              </div>

              <div
                className={`dropzone${isDragging ? ' over' : ''}`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
                onClick={() => fileInputRef.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <span className="dz-icon">📂</span>
                <p className="dz-title">{t('welcome.dzTitle')}</p>
                <p className="dz-sub">{t('welcome.dzSub')}</p>
                <div className="dz-or">— alebo —</div>
                <button
                  className="btn-open"
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                  type="button"
                >
                  📁 {t('welcome.selectFile')}
                </button>
                <input ref={fileInputRef} type="file" accept=".lox,.3d,.plt,.ply,.stl" onChange={e => {
                  const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''
                }} />
              </div>

              {errorMsg && (
                <div className="err-msg" role="alert">⚠️ {errorMsg}</div>
              )}

              {/* Demo models */}
              <div className="welcome-samples">
                <div>
                  <div className="demo-title">{t('welcome.demoTitle')}</div>
                  <div className="demo-grid">
                    <button className="btn-demo" onClick={() => loadFromUrl('/test_simple.lox', 'model-simple.lox')} type="button">
                      🗺️ Simple
                    </button>
                    <button className="btn-demo" onClick={() => loadFromUrl('/test_model2.lox', 'model2.lox')} type="button">
                      🗺️ Scraps
                    </button>
                    <button className="btn-demo" onClick={() => loadFromUrl('/vetrna_dira.ply', 'Vetrna_dira_merge.ply')} type="button">
                      ☁️ LiDAR
                    </button>
                    <button className="btn-demo" style={{ borderColor: '#818cf8', color: '#a5b4fc', background: 'rgba(99,102,241,0.05)' }} 
                      onClick={() => loadFromUrl('/dmr5.tif', 'dmr5.tif')} type="button">
                      🌍 TIFF
                    </button>
                  </div>
                </div>
                <div>
                  <div className="demo-title danger">{t('welcome.stressTitle')}</div>
                  <div className="demo-grid demo-grid-stress">
                    <button className="btn-demo" style={{ borderColor: 'rgba(245,101,101,0.4)', color: '#feb2b2', background: 'rgba(245,101,101,0.05)' }} 
                      onClick={() => loadFromUrl('/zlomiskovo.lox', 'zlomiskovo-lid2022.lox')} type="button">
                      🏔️ {t('welcome.bigModel')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable Changelog Sidebar */}
            <div className="welcome-sidebar">
              <div className="changelog-title">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>history</span>
                História verzií
              </div>

              {WELCOME_CHANGELOG.map(entry => (
                <React.Fragment key={entry.version}>
                  <div className="changelog-ver">
                    <span>v{entry.version}</span>
                    {entry.badge && <span className="changelog-badge">{entry.badge}</span>}
                  </div>
                  <div className="changelog-group">{entry.group}</div>
                  <ul className="changelog-list">
                    {entry.items.map(item => (
                      <li className="changelog-item" key={item}>{item}</li>
                    ))}
                  </ul>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {appState === 'loading' && (
          <div className="loading-screen">
            <div className="load-icon">⛏️</div>
            <div>
              <div className="load-title">
                {loadingStatus ? t(`ui.${loadingStatus}` as any) : t('ui.parsing')}
              </div>
              <div className="load-file">{loadedFile?.name}</div>
            </div>
            <div className="prog-wrap">
              <div className="prog-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="prog-pct">{progress}%</div>
          </div>
        )}

        {/* ── VIEWER ── */}
        {appState === 'viewer' && cave && (
          <div className="viewer-shell">
            {/* Top bar — hidden in embed mode */}
            {!isEmbedMode && (
            <div className="topbar">
              {/* Menu Button pre Mobily (prvá položka) */}
              <button className="btn-menu btn-back" style={{ display: 'none', marginRight: 8, background: 'rgba(255,255,255,0.15)', borderWidth: 0, padding: '0.4rem 0.7rem' }} onClick={() => setIsMobileMenuOpen(true)}>
                <span>☰</span>
              </button>

              <span className="tb-logo">LV 3D</span>
              <span className="tb-file" title={loadedFile?.name}>{loadedFile?.name}</span>
              <MemoizedStatusBadge isMoving={isModelMoving} />
              <span className="tb-badge hide-mobile">{loadedFile?.ext?.replace('.', '')?.toUpperCase()}</span>
              
              {downloadableTexture && (
                <button
                  onClick={downloadGeneratedTexture}
                  style={{
                    marginLeft: '8px',
                    padding: '4px 12px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }}
                  title={lang === 'sk' ? "Stiahnuť textúru a kalibračný súbor" : "Download texture with calibration"}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>download</span>
                  {lang === 'sk' ? 'Textúra' : 'Texture'}
                </button>
              )}

              <div className="hide-mobile-flex" style={{ display: 'flex', gap: '4px', background: '#0f172a', padding: '2px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                {(['classic', 'precision', 'light'] as const).map(th => (
                  <button key={th} onClick={() => applyTheme(th as any)}
                    style={{ flex: 1, padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      background: currentTheme === th ? '#334155' : 'transparent',
                      color: currentTheme === th ? '#f8fafc' : '#64748b' }}>
                    {t(`themes.${th}`)}
                  </button>
                ))}
              </div>

              <div className="tb-space">
                {appStatus && (
                  <div className={`status-bar status-${appStatus.type} hide-mobile`}>
                    <div className="status-msg">
                      {appStatus.type === 'error' && <span className="material-symbols-outlined" style={{ color: '#ef4444' }}>error</span>}
                      {appStatus.type === 'progress' && <span className="material-symbols-outlined" style={{ animation: 'spin 2s linear infinite' }}>sync</span>}
                      {appStatus.type === 'success' && <span className="material-symbols-outlined" style={{ color: '#10b981' }}>check_circle</span>}
                      {appStatus.type === 'info' && <span className="material-symbols-outlined">info</span>}
                      {appStatus.msg}
                    </div>
                    {appStatus.progress !== undefined && (
                      <div className="status-progress-bg">
                        <div className="status-progress-fill" style={{ width: `${appStatus.progress}%` }} />
                      </div>
                    )}
                    {appStatus.type !== 'progress' && (
                      <button onClick={() => setAppStatus(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isRecording && (
                <div className="recording-status hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(239, 68, 68, 0.15)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(239, 68, 68, 0.3)', marginRight: '10px' }}>
                  <div className="record-dot" />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#fca5a5' }}>
                    {lang === 'sk' ? 'NAHRÁVA SA...' : 'RECORDING...'}
                  </span>
                  <button 
                    onClick={() => (window as any)._activeRecorder?.stop()}
                    style={{ 
                      background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', 
                      padding: '2px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' 
                    }}
                  >
                    STOP
                  </button>
                </div>
              )}

              {downloadableTexture && (
                <button
                  className="btn-back hide-mobile-flex"
                  style={{
                    background: 'rgba(16,185,129,0.1)',
                    color: '#10b981',
                    borderColor: 'rgba(16,185,129,0.3)',
                    marginRight: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = downloadableTexture.dataUrl;
                    link.download = `surface_map_${opts.surfaceTextureSource}.${imageExtensionFromDataUrl(downloadableTexture.dataUrl)}`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  title={lang === 'sk' ? 'Stiahnuť textúru povrchu' : 'Download surface texture'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', display: 'block' }}>download</span>
                  <span>{lang === 'sk' ? 'Uložiť mapu' : 'Save Map'}</span>
                </button>
              )}

              {/* Camera Projection & View Presets Group */}
              <div className="hide-mobile-flex" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginRight: '6px' }}>
                {/* Perspective ↔ Orthographic Toggle */}
                <div style={{ display: 'flex', gap: '2px', background: '#0f172a', padding: '2px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <button
                    onClick={() => {
                      setOpts(p => ({ ...p, cameraProjection: 'perspective' }))
                      setActiveViewPreset(null)
                    }}
                    title={lang === 'sk' ? 'Perspektívna projekcia (3D hĺbka) [Kláves O]' : 'Perspective projection (3D depth) [Key O]'}
                    style={{
                      padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      background: opts.cameraProjection === 'perspective' ? '#334155' : 'transparent',
                      color: opts.cameraProjection === 'perspective' ? '#f8fafc' : '#64748b'
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', display: 'block' }}>view_in_ar</span>
                    <span>{lang === 'sk' ? 'Perspektíva' : 'Persp'}</span>
                  </button>
                  <button
                    onClick={() => setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))}
                    title={lang === 'sk' ? 'Ortogonálna projekcia (technické axonometrické zobrazenie bez skreslenia) [Kláves O]' : 'Orthographic projection (technical axonometric view without distortion) [Key O]'}
                    style={{
                      padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      background: opts.cameraProjection === 'orthographic' ? '#0284c7' : 'transparent',
                      color: opts.cameraProjection === 'orthographic' ? '#ffffff' : '#64748b',
                      boxShadow: opts.cameraProjection === 'orthographic' ? '0 1px 4px rgba(2,132,199,0.4)' : 'none'
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', display: 'block' }}>deployed_code</span>
                    <span>{lang === 'sk' ? 'Ortogonálne' : 'Ortho'}</span>
                    <span style={{ fontSize: '7.5px', background: opts.cameraProjection === 'orthographic' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>O</span>
                  </button>
                </div>

                {/* View Angle Presets: Plan (1), Profile (2), Section (3), 3D (4) */}
                <div style={{ display: 'flex', gap: '2px', background: '#0f172a', padding: '2px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <button
                    onClick={() => {
                      setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                      setActiveViewPreset('top')
                      window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))
                    }}
                    title={lang === 'sk' ? 'Pôdorys (kolmý pohľad zhora) [Kláves 1]' : 'Plan (Top view) [Key 1]'}
                    style={{
                      padding: '4px 6px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                      background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? '#0369a1' : 'transparent',
                      color: opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? '#ffffff' : '#94a3b8',
                      boxShadow: opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                    }}>
                    <span style={{ fontSize: '11px' }}>📐</span>
                    <span>{lang === 'sk' ? 'Pôdorys' : 'Plan'}</span>
                    <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>1</span>
                  </button>

                  <button
                    onClick={() => {
                      setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                      setActiveViewPreset('front')
                      window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'front' } }))
                    }}
                    title={lang === 'sk' ? 'Pozdĺžny profil (pohľad spredu) [Kláves 2]' : 'Profile (Front view) [Key 2]'}
                    style={{
                      padding: '4px 6px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                      background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'front' ? '#0369a1' : 'transparent',
                      color: opts.cameraProjection === 'orthographic' && activeViewPreset === 'front' ? '#ffffff' : '#94a3b8',
                      boxShadow: opts.cameraProjection === 'orthographic' && activeViewPreset === 'front' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                    }}>
                    <span style={{ fontSize: '11px' }}>↔️</span>
                    <span>{lang === 'sk' ? 'Profil' : 'Profile'}</span>
                    <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>2</span>
                  </button>

                  <button
                    onClick={() => {
                      setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                      setActiveViewPreset('side')
                      window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'side' } }))
                    }}
                    title={lang === 'sk' ? 'Priečny profil (pohľad zboku) [Kláves 3]' : 'Section (Side view) [Key 3]'}
                    style={{
                      padding: '4px 6px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                      background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'side' ? '#0369a1' : 'transparent',
                      color: opts.cameraProjection === 'orthographic' && activeViewPreset === 'side' ? '#ffffff' : '#94a3b8',
                      boxShadow: opts.cameraProjection === 'orthographic' && activeViewPreset === 'side' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                    }}>
                    <span style={{ fontSize: '11px' }}>↕️</span>
                    <span>{lang === 'sk' ? 'Bokorys' : 'Section'}</span>
                    <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>3</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveViewPreset('iso')
                      window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'iso' } }))
                    }}
                    title={lang === 'sk' ? '3D Izometrický / Axonometrický pohľad [Kláves 4]' : '3D Isometric view [Key 4]'}
                    style={{
                      padding: '4px 6px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                      background: activeViewPreset === 'iso' ? '#0369a1' : 'transparent',
                      color: activeViewPreset === 'iso' ? '#ffffff' : '#94a3b8',
                      boxShadow: activeViewPreset === 'iso' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                    }}>
                    <span style={{ fontSize: '11px' }}>🧊</span>
                    <span>3D</span>
                    <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px' }}>4</span>
                  </button>
                </div>
              </div>

              <button
                className={`btn-back hide-mobile-flex${isMeasuringMode ? ' active' : ''}`}
                style={{
                  background: isMeasuringMode ? '#6366f1' : 'rgba(99,179,237,0.1)',
                  color: isMeasuringMode ? '#fff' : '#63b3ed',
                  borderColor: isMeasuringMode ? '#818cf8' : 'rgba(99,179,237,0.3)',
                  marginRight: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => setIsMeasuringMode(!isMeasuringMode)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', display: 'block' }}>straighten</span>
                <span>{t('sidebar.measure')}</span>
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* NextGen Navigation Controls */}
                {opts.engine === 'v2' && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('cave-navigation-undo'))}
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Undo Movement (Ctrl+Z)"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>undo</span>
                    </button>
                    <button 
                      onClick={() => setFitTrigger(prev => prev + 1)}
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Fit to Screen"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>fit_screen</span>
                    </button>
                  </div>
                )}

                <div className="hide-mobile-flex" style={{ display: 'flex', gap: '4px', background: 'rgba(30,41,59,0.5)', padding: '2px', borderRadius: '6px' }}>
                  {(['sk', 'en', 'fr', 'de'] as Language[]).map(l => (
                    <button key={l} onClick={() => setLang(l)}
                      style={{ padding: '4px 6px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: lang === l ? '#6366f1' : 'transparent',
                        color: lang === l ? 'white' : '#94a3b8' }}>
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="show-mobile-flex" style={{ alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => {
                      setOpts(p => {
                        const next = p.cameraProjection === 'orthographic' ? 'perspective' : 'orthographic'
                        if (next === 'perspective') setActiveViewPreset(null)
                        return { ...p, cameraProjection: next }
                      })
                    }}
                    style={{
                      background: opts.cameraProjection === 'orthographic' ? '#0284c7' : 'rgba(30,41,59,0.8)',
                      border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                    }}
                    title={opts.cameraProjection === 'orthographic' ? 'Ortogonálne' : 'Perspektíva'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {opts.cameraProjection === 'orthographic' ? 'deployed_code' : 'view_in_ar'}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                      setActiveViewPreset('top')
                      window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))
                    }}
                    style={{
                      background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? '#0369a1' : 'rgba(30,41,59,0.8)',
                      border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', padding: '6px 8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                    }}
                    title="Pôdorys / Plan View"
                  >
                    <span>📐</span>
                  </button>
                </div>

                <button 
                  className="show-mobile-flex"
                  onClick={() => setFitTrigger(prev => prev + 1)}
                  style={{ background: '#3b82f6', border: '1px solid #2563eb', borderRadius: '6px', color: '#fff', padding: '6px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}
                  title="Fit to screen"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', display: 'block' }}>fit_screen</span>
                </button>

                {/* Share button - only when model is loaded from a public URL */}
                {!isEmbedMode && (
                  <button
                    onClick={openShareDialog}
                    className="hide-mobile-flex"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '6px', color: '#818cf8', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={lang === 'sk' ? 'Zdieľať ako iframe' : 'Share as iframe'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', display: 'block' }}>share</span>
                    <span>{lang === 'sk' ? 'Zdieľať' : 'Share'}</span>
                  </button>
                )}

                <button 
                  onClick={handleReset}
                  style={{ background: '#ef4444', border: '1px solid #dc2626', borderRadius: '6px', color: '#fff', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', display: 'block' }}>close</span>
                  <span>{t('ui.close')}</span>
                </button>
              </div>
            </div>
            )}

            <div className="viewer-body">
              <div className="canvas-wrap" style={isEmbedMode ? { paddingTop: 36 } : undefined}>
                <Suspense fallback={
                  <div className="loading-overlay">
                    <span className="loading-3d">{t('ui.init3d')}</span>
                  </div>
                }>
                  <ErrorBoundary>
                    {opts.engine === 'v1' ? (
                      <CaveViewer3D
                        cave={cave}
                        options={opts}
                        onStationClick={handleStationClick}
                        onSurfaceClick={handleSurfaceClick}
                        onMoveStateChange={setIsModelMoving}
                        onCameraUpdate={setCameraData}
                        contourInterval={contourLevels.major}
                        minorInterval={contourLevels.minor}
                        onProcessingStart={setProcessingInfo}
                        onProcessingEnd={() => setProcessingInfo(null)}
                        onStatusChange={setAppStatus}
                        onTextureReady={(dataUrl, bbox) => setDownloadableTexture({ dataUrl, bbox })}
                        onTextureDownloadInfo={setTextureDownloadInfo}
                        fitTrigger={fitTrigger}
                        selectedStations={selectedStations}
                        activeProfilePoints={activeProfilePoints}
                        isMeasuringMode={isMeasuringMode}
                        manualConnection={
                          selectedStations.length === 2 && selectedStations[0] && selectedStations[1]
                            ? {
                                p1: { 
                                  x: selectedStations[0].origX - (cave.centerOffset?.x || 0), 
                                  y: selectedStations[0].origY - (cave.centerOffset?.y || 0), 
                                  z: selectedStations[0].altitude - (cave.centerOffset?.z || 0) 
                                },
                                p2: { 
                                  x: selectedStations[1].origX - (cave.centerOffset?.x || 0), 
                                  y: selectedStations[1].origY - (cave.centerOffset?.y || 0), 
                                  z: selectedStations[1].altitude - (cave.centerOffset?.z || 0) 
                                }
                              }
                            : null
                        }
                      />
                    ) : (
                      <CaveViewerNextGen
                        cave={cave}
                        options={opts}
                        onStationClick={handleStationClick}
                        onCameraUpdate={setCameraData}
                        onStatusChange={setAppStatus}
                        fitTrigger={fitTrigger}
                        selectedStations={selectedStations}
                        activeProfilePoints={activeProfilePoints}
                        isMeasuringMode={isMeasuringMode}
                        anomalies={anomalies}
                        activeAnomalyId={activeAnomalyId}
                        onSurfaceOffsetChange={(offset) => setOpts(prev => ({ ...prev, surfaceOffset: offset }))}
                      />
                    )}
	                  </ErrorBoundary>
	                </Suspense>

                {lidarEditMode !== 'off' && cave.pointCount > 0 && (
                  <div
                    className={`lidar-edit-overlay mode-${lidarEditMode}${lidarEditBusy ? ' busy' : ''}`}
                    onPointerDown={beginLidarEditStroke}
                    onPointerMove={moveLidarEditStroke}
                    onPointerUp={endLidarEditStroke}
                    onPointerCancel={endLidarEditStroke}
                    onPointerLeave={() => {
                      if (lidarActiveStrokeRef.current.length === 0) setLidarEditCursor(null);
                    }}
                  >
                    <svg className="lidar-edit-svg" aria-hidden="true">
                      {lidarEditStroke.length > 1 && (
                        <polyline
                          points={lidarEditStroke.map(point => `${point.x},${point.y}`).join(' ')}
                          className="lidar-edit-trail"
                        />
                      )}
                      {lidarEditCursor && (
                        <circle
                          cx={lidarEditCursor.x}
                          cy={lidarEditCursor.y}
                          r={lidarBrushSize}
                          className="lidar-edit-brush"
                        />
                      )}
                    </svg>
                    <div className="lidar-edit-floating">
                      {lidarEditMode === 'erase'
                        ? (lang === 'sk' ? 'Guma' : 'Erase')
                        : (lang === 'sk' ? 'Ponechať' : 'Keep')}
                      {lidarEditMode === 'keep' && lidarKeepSelectionCount > 0 && (
                        <span>{lidarKeepSelectionCount.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}

	                {/* Station detail card overlay */}
                {selectedStations.length > 0 && showStationCard && (
                    <StationDetailCard
                      stations={selectedStations}
                      onClose={() => setShowStationCard(false)}
                      onPlaceCaver={(pos, pose) => setOpts(p => ({ ...p, placedCaver: pos ? { pos, pose } : null }))}
                      onSetProfile={(sts) => {
                        setActiveProfilePoints([...sts])
                        setOpts(p => ({ ...p, showProfileClipping: true, profileClipOffset: 0 }))
                        setShowStationCard(false)
                      }}
                      onUpdateGps={handleUpdateGps}
                      t={t}
                      lang={lang}
                    />
                )}
              </div>

              {/* Sidebar container — hidden in embed mode unless sidebar=1 is in URL */}
              {(!isEmbedMode || embedAllowSidebar) && <div className={`sidebar-container ${isMobileMenuOpen ? 'open' : ''}`}>
                <aside className="sidebar">
                  {isMobileMenuOpen && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e2e8f0' }}>{t('sidebar.control')}</span>
                        <button className="btn-back" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={() => setIsMobileMenuOpen(false)}>✖ {t('ui.close')}</button>
                      </div>
                      
                      <div className="s-label" style={{ marginBottom: '8px' }}>Rýchle nastavenia (Mobil)</div>
                      
                      <button
                        className={`btn-back${isMeasuringMode ? ' active' : ''}`}
                        style={{ width: '100%', marginBottom: '10px', background: isMeasuringMode ? '#6366f1' : 'rgba(99,179,237,0.1)', color: isMeasuringMode ? '#fff' : '#63b3ed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                        onClick={() => { setIsMeasuringMode(!isMeasuringMode); setIsMobileMenuOpen(false); }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>straighten</span>
                        <span>{t('sidebar.measure')}</span>
                      </button>

                      <div style={{ display: 'flex', gap: '4px', background: '#0f172a', padding: '4px', borderRadius: '8px', marginBottom: '10px' }}>
                        {(['classic', 'precision', 'light'] as const).map(th => (
                          <button key={th} onClick={() => applyTheme(th as any)}
                            style={{ flex: 1, padding: '8px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', background: currentTheme === th ? '#334155' : 'transparent', color: currentTheme === th ? '#f8fafc' : '#64748b' }}>
                            {t(`themes.${th}`)}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '4px', background: 'rgba(30,41,59,0.5)', padding: '4px', borderRadius: '8px', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                        {(['sk', 'en', 'fr', 'de'] as Language[]).map(l => (
                          <button key={l} onClick={() => setLang(l)}
                            style={{ flex: 1, padding: '8px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', background: lang === l ? '#6366f1' : 'transparent', color: lang === l ? 'white' : '#94a3b8' }}>
                            {l.toUpperCase()}
                          </button>
                        ))}
                      </div>

                      <div style={{ background: 'rgba(30,41,59,0.5)', padding: '10px', borderRadius: '8px', marginBottom: '1rem' }}>
                        <div className="toggle-row" style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>label</span>
                            {lang === 'sk' ? 'Výšky vrstevníc' : 'Contour labels'}
                          </span>
                          <div className={`switch${opts.showContourLabels ? ' on' : ''}`}
                            onClick={() => toggleOpt('showContourLabels')} role="switch"
                            aria-checked={opts.showContourLabels} tabIndex={0} />
                        </div>
                        <div className="toggle-row" style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>tag</span>
                            {t('stations.names')}
                          </span>
                          <div className={`switch${opts.showStationNames ? ' on' : ''}`}
                            onClick={() => toggleOpt('showStationNames')} role="switch"
                            aria-checked={opts.showStationNames} tabIndex={0} />
                        </div>
                        <div className="toggle-row">
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>height</span>
                            {t('stations.altitude')}
                          </span>
                          <div className={`switch${opts.showStationAlt ? ' on' : ''}`}
                            onClick={() => toggleOpt('showStationAlt')} role="switch"
                            aria-checked={opts.showStationAlt} tabIndex={0} />
                        </div>
                      </div>
                    </div>
                  )}
                <div>
                  <div className="s-label">{t('file.title')}</div>
                  <div className="info-row"><span>{t('file.format')}</span><span className="info-val">{loadedFile?.ext.replace('.', '').toUpperCase()}</span></div>
                  <div className="info-row"><span>{t('file.segments')}</span><span className="info-val">{cave.segmentCount.toLocaleString()}</span></div>
                  <div className="info-row"><span>{t('file.stations')}</span><span className="info-val">{cave.stationCount.toLocaleString()}</span></div>
                  {cave.scrapCount > 0 && (
                    <div className="info-row"><span>{t('file.scraps')}</span><span className="info-val">{cave.scrapCount.toLocaleString()}</span></div>
                  )}
                </div>

                {/* ─── SIDEBAR TAB BAR ─────────────────────────────────────────────────────── */}
                <div style={{
                  display: 'flex', gap: '2px', background: 'rgba(15,23,42,0.9)', padding: '4px',
                  borderRadius: '10px', border: '1px solid rgba(51,65,85,0.6)', margin: '12px 0 16px',
                  position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(8px)'
                }}>
                  {([
                    { id: 'cave',     icon: 'domain',      label: lang === 'sk' ? 'Jaskyňa' : 'Cave' },
                    { id: 'terrain',  icon: 'terrain',     label: lang === 'sk' ? 'Terén' : 'Terrain' },
                    { id: 'analysis', icon: 'architecture', label: lang === 'sk' ? 'Analýza' : 'Analysis' },
                  ] as const).map(tab => (
                    <button key={tab.id} onClick={() => setSidebarTab(tab.id)}
                      style={{
                        flex: 1, padding: '7px 4px', fontSize: '10px', fontWeight: 700, borderRadius: '7px',
                        border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                        background: sidebarTab === tab.id ? '#1e3a5f' : 'transparent',
                        color: sidebarTab === tab.id ? '#60a5fa' : '#64748b',
                        boxShadow: sidebarTab === tab.id ? '0 1px 6px rgba(59,130,246,0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {/* TAB 1: JASKYŇA & 3D ZOBRAZENIE                                           */}
                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {sidebarTab === 'cave' && <div>

                {/* ── ANALÝZA PRIESTOROVÝCH REZOV ── */}
                <div style={{ marginBottom: '20px' }}>
                    <div className="s-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', display: 'block' }}>content_cut</span>
                      <span>{t('clipping.title')}</span>
                    </div>
                    
                    <div style={{ padding: '12px', background: 'rgba(30,41,59,0.5)', borderRadius: '8px', border: '1px solid rgba(51,65,85,0.5)' }}>
                      <div className="toggle-row" style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>{t('clipping.horiz')}</span>
                        <div className={`switch${opts.showClipping ? ' on' : ''}`}
                          onClick={() => toggleOpt('showClipping')} role="switch"
                          aria-checked={opts.showClipping} tabIndex={0}
                        />
                      </div>

                      {opts.showClipping && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '6px' }}>
                            <span>{t('clipping.height')}</span>
                            <span style={{ color: '#818cf8', fontWeight: 'bold' }}>{opts.clippingHeight.toFixed(1)} m</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => setOpts(p => ({ ...p, clippingHeight: p.clippingHeight - 1 }))}
                              style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>-</button>
                            <input type="range" className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              min={(cave.bounds.min.z + (cave.centerOffset?.z || 0)) - 10} max={(cave.bounds.max.z + (cave.centerOffset?.z || 0)) + 10}
                              step={0.1} value={opts.clippingHeight} onChange={(e) => setOpts(p => ({ ...p, clippingHeight: parseFloat(e.target.value) }))} />
                            <button onClick={() => setOpts(p => ({ ...p, clippingHeight: p.clippingHeight + 1 }))}
                              style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>+</button>
                          </div>
                        </div>
                      )}

                      <div className="toggle-row">
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>{t('clipping.vert')}</span>
                        <div className={`switch${opts.showProfileClipping ? ' on' : ''}`}
                          onClick={() => toggleOpt('showProfileClipping')} role="switch"
                          aria-checked={opts.showProfileClipping} tabIndex={0}
                        />
                      </div>
                      
                      {opts.showProfileClipping && activeProfilePoints && (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '6px' }}>
                            <span>{t('clipping.offset')}</span>
                            <span style={{ color: '#818cf8', fontWeight: 'bold' }}>{opts.profileClipOffset.toFixed(1)} m</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <button onClick={() => setOpts(p => ({ ...p, profileClipOffset: p.profileClipOffset - 0.5 }))}
                              style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>-</button>
                            <input type="range" className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              min={-50} max={50} step={0.1} value={opts.profileClipOffset}
                              onChange={(e) => setOpts(p => ({ ...p, profileClipOffset: parseFloat(e.target.value) }))} />
                            <button onClick={() => setOpts(p => ({ ...p, profileClipOffset: p.profileClipOffset + 0.5 }))}
                              style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>+</button>
                          </div>

                          <button 
                            onClick={() => toggleOpt('profileClipFlip')}
                            style={{ width: '100%', padding: '6px', background: '#1e293b', color: '#94a3b8', fontSize: '10px', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', display: 'block' }}>swap_horiz</span>
                            <span>{t('clipping.flip')}</span>
                          </button>
                        </div>
                      )}

                      {(opts.showClipping || opts.showProfileClipping) && (
                        <>
                          <div style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="toggle-row" style={{ marginBottom: '8px' }}>
                              <label className="toggle-label" style={{ fontSize: '10px', color: '#94a3b8' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>border_outer</span>
                                {lang === 'sk' ? 'Hrana rezu jaskyne' : 'Cave clipping edge'}
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="color" value={opts.colorClippingEdges} 
                                  onChange={(e) => setOpts(p => ({ ...p, colorClippingEdges: e.target.value }))}
                                  style={{ width: '20px', height: '20px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                                <div className={`switch${opts.showClippingEdges ? ' on' : ''}`}
                                  onClick={() => toggleOpt('showClippingEdges')} role="switch"
                                  aria-checked={opts.showClippingEdges} tabIndex={0} />
                              </div>
                            </div>

                            <div className="toggle-row" style={{ marginBottom: '12px' }}>
                              <label className="toggle-label" style={{ fontSize: '10px', color: '#94a3b8' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>landscape</span>
                                {lang === 'sk' ? 'Hrana rezu povrchu' : 'Surface clipping edge'}
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="color" value={opts.colorSurfaceClippingEdges} 
                                  onChange={(e) => setOpts(p => ({ ...p, colorSurfaceClippingEdges: e.target.value }))}
                                  style={{ width: '20px', height: '20px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                                <div className={`switch${opts.showSurfaceClippingEdges ? ' on' : ''}`}
                                  onClick={() => toggleOpt('showSurfaceClippingEdges')} role="switch"
                                  aria-checked={opts.showSurfaceClippingEdges} tabIndex={0} />
                              </div>
                            </div>
                          </div>
                          
                          <div className="toggle-row" style={{ marginTop: '4px' }}>
                            <label className="toggle-label" style={{ fontSize: '10px', color: '#94a3b8' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility_off</span>
                              {lang === 'sk' ? 'Vynechať jaskyňu z rezu' : 'Exclude cave from clip'}
                            </label>
                            <div className={`switch${opts.excludeModelFromClipping ? ' on' : ''}`}
                              onClick={() => toggleOpt('excludeModelFromClipping')} role="switch"
                              aria-checked={opts.excludeModelFromClipping} tabIndex={0} />
                          </div>
                        </>
                      )}
                    </div>
                </div>

                {/* ── VRSTVY (survey) ── */}
                <div>
                  <div className="s-label">{t('survey.title')}</div>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: opts.colorSplay }} />
                        {t('survey.splay')}
                        <ColorPicker t={t} value={opts.colorSplay} onChange={(c) => setOpts(p => ({ ...p, colorSplay: c }))} />
                      </label>
                      <div className={`switch${opts.showSplay ? ' on' : ''}`}
                        onClick={() => toggleOpt('showSplay')} role="switch"
                        aria-checked={opts.showSplay} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: opts.colorGrid }} />
                        {t('survey.grid')}
                        <ColorPicker t={t} value={opts.colorGrid} onChange={(c) => setOpts(p => ({ ...p, colorGrid: c }))} />
                      </label>
                      <div className={`switch${opts.showGrid ? ' on' : ''}`}
                        onClick={() => toggleOpt('showGrid')} role="switch"
                        aria-checked={opts.showGrid} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">{t('survey.gizmo')}</label>
                      <div className={`switch${opts.showGizmo ? ' on' : ''}`}
                        onClick={() => toggleOpt('showGizmo')} role="switch"
                        aria-checked={opts.showGizmo} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">{t('survey.bbox')}</label>
                      <div className={`switch${opts.showBoundingBox ? ' on' : ''}`}
                        onClick={() => toggleOpt('showBoundingBox')} role="switch"
                        aria-checked={opts.showBoundingBox} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">{t('survey.altitude')}</label>
                      <div className={`switch${opts.traverseAltitude ? ' on' : ''}`}
                        onClick={() => toggleOpt('traverseAltitude')} role="switch"
                        aria-checked={opts.traverseAltitude} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: opts.colorTraverse }} />
                        {t('survey.tubes')}
                        <ColorPicker t={t} value={opts.colorTraverse} onChange={(c) => setOpts(p => ({ ...p, colorTraverse: c }))} />
                      </label>
                      <div className={`switch${opts.showTraverse ? ' on' : ''}`}
                        onClick={() => toggleOpt('showTraverse')} role="switch"
                        aria-checked={opts.showTraverse} tabIndex={0} />
                    </div>

                    {opts.showTraverse && (
                      <div style={{ marginTop: '8px', padding: '0 4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                          <span>{t('survey.tubes')} - {t('terrain.wire').toLowerCase()}</span>
                          <span style={{ color: '#4fc3f7' }}>{(opts.traverseRadius * 100).toFixed(0)} cm</span>
                        </div>
                        <input type="range" min={0.01} max={1.5} step={0.01}
                          value={opts.traverseRadius}
                          onChange={e => setOpts(p => ({ ...p, traverseRadius: Number(e.target.value) }))}
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                      </div>
                    )}
                </div>

                {/* ── STENY JASKYNE (scraps / point cloud) ── */}
                {(cave.scrapCount > 0 || cave.pointCount > 0) && (
                  <div>
                    <div className="s-label">
                      <div className="dot" style={{ background: opts.colorScraps }} />
                      {t('cave.title')}
                      <ColorPicker t={t} value={opts.colorScraps} onChange={(c) => setOpts(p => ({ ...p, colorScraps: c }))} />
                    </div>

                    {/* MAIN NEXTGEN SWITCH - only for point-cloud models */}
	                    {cave.pointCount > 0 && (
	                      <div className="toggle-row" style={{ background: 'rgba(99,102,241,0.1)', padding: '8px', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <label className="toggle-label" style={{ color: '#a5b4fc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>blur_on</span>
                          {lang === 'sk' ? 'LIDAR NEXTGEN' : 'LiDAR NEXTGEN'}
                        </label>
                        <div className={`switch${opts.engine === 'v2' ? ' on' : ''}`}
                          onClick={() => setOpts(p => ({ ...p, engine: p.engine === 'v2' ? 'v1' : 'v2' }))} role="switch"
                          aria-checked={opts.engine === 'v2'} tabIndex={0} />
	                      </div>
	                    )}

                    {cave.pointCount > 0 && (
                      <div className={`lidar-edit-panel${lidarEditMode !== 'off' ? ' active' : ''}`}>
                        <div className="lidar-edit-header">
                          <span className="lidar-edit-title">
                            <EraserIcon aria-hidden="true" />
                            {lang === 'sk' ? 'LiDAR editácia' : 'LiDAR editing'}
                          </span>
                          <span className="lidar-edit-count">{cave.pointCount.toLocaleString()}</span>
                        </div>

                        <div className="lidar-edit-toolbar">
                          <button
                            type="button"
                            className={`lidar-edit-btn danger${lidarEditMode === 'erase' ? ' active' : ''}`}
                            onClick={() => setLidarEditMode(mode => mode === 'erase' ? 'off' : 'erase')}
                            disabled={lidarEditBusy}
                            title={lang === 'sk' ? 'Guma' : 'Eraser'}
                          >
                            <EraserIcon aria-hidden="true" />
                            <span>{lang === 'sk' ? 'Guma' : 'Erase'}</span>
                          </button>
                          <button
                            type="button"
                            className={`lidar-edit-btn keep${lidarEditMode === 'keep' ? ' active' : ''}`}
                            onClick={() => setLidarEditMode(mode => mode === 'keep' ? 'off' : 'keep')}
                            disabled={lidarEditBusy}
                            title={lang === 'sk' ? 'Ponechať označené body' : 'Keep marked points'}
                          >
                            <MousePointerIcon aria-hidden="true" />
                            <span>{lang === 'sk' ? 'Ponechať' : 'Keep'}</span>
                          </button>
                        </div>

                        <div className="lidar-brush-row">
                          <label>{lang === 'sk' ? 'Štetec' : 'Brush'}</label>
                          <input
                            type="range"
                            min={16}
                            max={120}
                            step={2}
                            value={lidarBrushSize}
                            onChange={event => setLidarBrushSize(Number(event.target.value))}
                            disabled={lidarEditBusy}
                          />
                          <span>{lidarBrushSize}px</span>
                        </div>

                        {lidarEditMode === 'keep' && (
                          <div className="lidar-keep-row">
                            <span>{lidarKeepSelectionCount.toLocaleString()}</span>
                            <button
                              type="button"
                              className="lidar-edit-btn keep"
                              onClick={applyLidarKeepSelection}
                              disabled={lidarEditBusy || lidarKeepSelectionCount === 0}
                              title={lang === 'sk' ? 'Použiť výber' : 'Apply selection'}
                            >
                              <CheckCircleIcon aria-hidden="true" />
                              <span>{lang === 'sk' ? 'Použiť' : 'Apply'}</span>
                            </button>
                            <button
                              type="button"
                              className="lidar-icon-btn"
                              onClick={clearLidarKeepSelection}
                              disabled={lidarEditBusy || lidarKeepSelectionCount === 0}
                              title={lang === 'sk' ? 'Zrušiť výber' : 'Clear selection'}
                              aria-label={lang === 'sk' ? 'Zrušiť výber' : 'Clear selection'}
                            >
                              <XIcon aria-hidden="true" />
                            </button>
                          </div>
                        )}

                        <div className="lidar-edit-toolbar secondary">
                          <button
                            type="button"
                            className="lidar-edit-btn"
                            onClick={undoLidarEdit}
                            disabled={lidarEditBusy || !lidarUndoCaveRef.current}
                            title={lang === 'sk' ? 'Vrátiť poslednú úpravu' : 'Undo last edit'}
                          >
                            <UndoIcon aria-hidden="true" />
                            <span>Undo</span>
                          </button>
                          <button
                            type="button"
                            className="lidar-edit-btn"
                            onClick={resetLidarEdits}
                            disabled={lidarEditBusy || !lidarOriginalCaveRef.current || lidarEditRemovedCount === 0}
                            title={lang === 'sk' ? 'Obnoviť pôvodný LiDAR' : 'Restore original LiDAR'}
                          >
                            <RotateCcwIcon aria-hidden="true" />
                            <span>Reset</span>
                          </button>
                        </div>
                      </div>
                    )}

	                    {/* CASE A: NEXTGEN IS ON (v2 Engine) */}
                    {opts.engine === 'v2' && cave.pointCount > 0 ? (
                      <div style={{ padding: '0 4px' }}>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{lang === 'sk' ? 'VEĽKOSŤ BODOV' : 'POINT SIZE'}</label>
                            <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{opts.pointCloudSize.toFixed(2)}</span>
                          </div>
                          <input type="range" min={0.0} max={2.0} step={0.05}
                            value={opts.pointCloudSize}
                            onChange={e => setOpts(p => ({ ...p, pointCloudSize: Number(e.target.value) }))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{lang === 'sk' ? 'JAS MODELU' : 'BRIGHTNESS'}</label>
                            <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{opts.pointCloudBrightness.toFixed(2)}</span>
                          </div>
                          <input type="range" min={0.1} max={3.0} step={0.1}
                            value={opts.pointCloudBrightness}
                            onChange={e => setOpts(p => ({ ...p, pointCloudBrightness: Number(e.target.value) }))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{lang === 'sk' ? 'PLASTICITA' : 'PLASTICITY'}</label>
                            <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{opts.pointCloudPlasticity.toFixed(1)}</span>
                          </div>
                          <input type="range" min={0.5} max={2.5} step={0.1}
                            value={opts.pointCloudPlasticity}
                            onChange={e => setOpts(p => ({ ...p, pointCloudPlasticity: Number(e.target.value) }))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                            {lang === 'sk' ? 'TVAR BODOV' : 'POINT SHAPE'}
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {POINT_CLOUD_SHAPE_OPTIONS.map(option => {
                              const shape = option.id;
                              const ShapeIcon = POINT_CLOUD_SHAPE_ICONS[shape];
                              const active = (opts.pointCloudShape ?? DEFAULT_POINT_CLOUD_SHAPE) === shape;
                              const label = lang === 'sk' ? POINT_CLOUD_SHAPE_LABELS_SK[shape] : POINT_CLOUD_SHAPE_LABELS_EN[shape];
                              return (
                                <button key={shape} onClick={() => setOpts(p => ({ ...p, pointCloudShape: shape }))}
                                  title={label}
                                  style={{ flex: '1 1 45%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', minHeight: 30, fontSize: '9px', padding: '5px 3px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                    background: active ? '#6366f1' : 'rgba(30,41,59,0.5)', color: 'white' }}>
                                  <ShapeIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                                  <span>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                            {lang === 'sk' ? 'REŽIM FARIEB' : 'COLOR MODE'}
                          </label>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[
                              { id: 'original',  label: lang === 'sk' ? 'PLY' : 'Original' },
                              { id: 'elevation', label: lang === 'sk' ? 'Výška' : 'Elevation' },
                              { id: 'natural',   label: lang === 'sk' ? 'Vlastná' : 'Custom' },
                            ].map(mode => (
                              <button key={mode.id} onClick={() => setOpts(p => ({ ...p, pointCloudColorMode: mode.id as any }))}
                                style={{ flex: 1, fontSize: '9px', padding: '4px 2px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                  background: opts.pointCloudColorMode === mode.id ? '#6366f1' : 'rgba(30,41,59,0.5)', color: 'white' }}>
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {opts.pointCloudColorMode === 'natural' && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="dot" style={{ background: opts.pointCloudCustomColor, width: '12px', height: '12px' }} />
                              <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{lang === 'sk' ? 'FARBA JASKYNE' : 'CAVE COLOR'}</label>
                              <div style={{ marginLeft: 'auto' }}>
                                <ColorPicker t={t} value={opts.pointCloudCustomColor} onChange={(c) => setOpts(p => ({ ...p, pointCloudCustomColor: c }))} />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Selektívne zobrazenie LiDAR Point Cloudu */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                            {lang === 'sk' ? 'SELEKTÍVNE ZOBRAZENIE' : 'SELECTIVE VIEW'}
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {[
                              { id: 'all',     label: lang === 'sk' ? 'Všetko' : 'All' },
                              { id: 'floor',   label: lang === 'sk' ? 'Podlaha' : 'Floor' },
                              { id: 'ceiling', label: lang === 'sk' ? 'Strop' : 'Ceiling' },
                              { id: 'contour', label: lang === 'sk' ? 'Vrstevnice' : 'Contours' },
                              { id: 'heatmap', label: lang === 'sk' ? 'Heatmapa' : 'Heatmap' },
                            ].map(mode => (
                              <button key={mode.id} onClick={() => setOpts(p => ({ ...p, pointCloudViewMode: mode.id as any }))}
                                style={{ flex: '1 1 30%', fontSize: '9px', padding: '5px 2px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                  background: opts.pointCloudViewMode === mode.id ? '#6366f1' : 'rgba(30,41,59,0.5)', color: 'white' }}>
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Interaktívne posuvníky prahových hodnôt segmentácie */}
                        {opts.pointCloudViewMode !== 'all' && (
                          <>
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>
                                  {lang === 'sk' ? 'HRANIČNÁ VÝŠKA REZU' : 'HEIGHT THRESHOLD'}
                                </label>
                                <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 'auto', fontWeight: 700 }}>
                                  {(opts.pointCloudHeightThreshold ?? 0.1).toFixed(2)}
                                </span>
                              </div>
                              <input type="range" min="-0.8" max="0.8" step="0.05"
                                value={opts.pointCloudHeightThreshold ?? 0.1}
                                onChange={e => setOpts(p => ({ ...p, pointCloudHeightThreshold: Number(e.target.value) }))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>
                                  {lang === 'sk' ? 'UHOL SKLONU PLOCHY' : 'ANGLE THRESHOLD'}
                                </label>
                                <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 'auto', fontWeight: 700 }}>
                                  {(opts.pointCloudAngleThreshold ?? 0.3).toFixed(2)}
                                </span>
                              </div>
                              <input type="range" min="0.0" max="0.9" step="0.05"
                                value={opts.pointCloudAngleThreshold ?? 0.3}
                                onChange={e => setOpts(p => ({ ...p, pointCloudAngleThreshold: Number(e.target.value) }))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      /* CASE B: NEXTGEN IS OFF (Standard Mesh - v1) */
                      <>
                        <div className="toggle-row">
                          <label className="toggle-label">{t('cave.show')}</label>
                          <div className={`switch${opts.showScraps ? ' on' : ''}`}
                            onClick={() => toggleOpt('showScraps')} role="switch"
                            aria-checked={opts.showScraps} tabIndex={0} />
                        </div>

                        {opts.showScraps && (
                          <>
                            <div className="toggle-row">
                              <label className="toggle-label">{t('cave.organic')}</label>
                              <div className={`switch${opts.smoothScraps ? ' on' : ''}`}
                                onClick={() => {
                                  const newVal = !opts.smoothScraps;
                                  setOpts(p => ({ ...p, smoothScraps: newVal, accurateScraps: newVal ? false : p.accurateScraps }));
                                }} role="switch"
                                aria-checked={opts.smoothScraps} tabIndex={0} />
                            </div>

                            <div className="toggle-row">
                              <label className="toggle-label">{t('cave.accurateMesh')}</label>
                              <div className={`switch${opts.accurateScraps ? ' on' : ''}`}
                                onClick={() => {
                                  const newVal = !opts.accurateScraps;
                                  setOpts(p => ({ ...p, accurateScraps: newVal, smoothScraps: newVal ? false : p.smoothScraps }));
                                }} role="switch"
                                aria-checked={opts.accurateScraps} tabIndex={0} />
                            </div>

                            <div className="toggle-row">
                              <label className="toggle-label">{t('cave.render3d')}</label>
                              <div className={`switch${opts.showRenderCave ? ' on' : ''}`}
                                onClick={() => toggleOpt('showRenderCave')} role="switch"
                                aria-checked={opts.showRenderCave} tabIndex={0} />
                            </div>

                            <div style={{ marginTop: 8, padding: '0 4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '6px' }}>
                                <span>{lang === 'sk' ? 'Materiál stien' : 'Wall material'}</span>
                                <span style={{ color: '#4fc3f7' }}>{opts.showRenderCave ? (lang === 'sk' ? '3D aktívny' : '3D active') : (lang === 'sk' ? 'zapne 3D' : 'enables 3D')}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}>
                                {[
                                  { id: 'limestone', label: lang === 'sk' ? 'Vápenec' : 'Limestone', swatch: '#d8d2bf' },
                                  { id: 'dolomite', label: 'Dolomit', swatch: '#e8dccb' },
                                  { id: 'grey_limestone', label: lang === 'sk' ? 'Sivý' : 'Grey', swatch: '#dbeafe' },
                                  { id: 'technical', label: lang === 'sk' ? 'Tech' : 'Tech', swatch: '#7dd3fc' },
                                ].map(preset => (
                                  <button
                                    key={preset.id}
                                    onClick={() => setOpts(p => ({ ...p, caveTexture: preset.id as any, showRenderCave: true }))}
                                    style={{
                                      minHeight: '34px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '3px',
                                      fontSize: '8px',
                                      lineHeight: 1.05,
                                      padding: '5px 2px',
                                      borderRadius: '5px',
                                      border: opts.caveTexture === preset.id ? '1px solid rgba(125,211,252,0.8)' : '1px solid rgba(148,163,184,0.16)',
                                      background: opts.caveTexture === preset.id ? 'rgba(14,165,233,0.18)' : 'rgba(30,41,59,0.5)',
                                      color: opts.caveTexture === preset.id ? '#e0f2fe' : '#cbd5e1',
                                      cursor: 'pointer',
                                      boxShadow: opts.caveTexture === preset.id ? '0 0 0 1px rgba(14,165,233,0.18) inset' : 'none',
                                      transitionProperty: 'background, border-color, color, transform',
                                      transitionDuration: '120ms',
                                    }}
                                  >
                                    <span style={{ width: 13, height: 13, borderRadius: '50%', background: preset.swatch, boxShadow: '0 0 0 1px rgba(255,255,255,0.18) inset' }} />
                                    <span>{preset.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="toggle-row">
                              <label className="toggle-label">{t('cave.wire') || 'Drôtený model'}</label>
                              <div className={`switch${opts.scrapsWireframe ? ' on' : ''}`}
                                onClick={() => toggleOpt('scrapsWireframe')} role="switch"
                                aria-checked={opts.scrapsWireframe} tabIndex={0} />
                            </div>

                            <div className="toggle-row">
                              <label className="toggle-label">{t('cave.altitude')}</label>
                              <div className={`switch${opts.scrapsAltitude ? ' on' : ''}`}
                                onClick={() => toggleOpt('scrapsAltitude')} role="switch"
                                aria-checked={opts.scrapsAltitude} tabIndex={0} />
                            </div>

                            {loadedFile?.ext === '.stl' && (
                              <div style={{ marginTop: 12, padding: '0 4px' }}>
                                <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                                  {lang === 'sk' ? 'SELEKTÍVNE ZOBRAZENIE STL' : 'STL SELECTIVE VIEW'}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}>
                                  {[
                                    { id: 'all', label: lang === 'sk' ? 'Všetko' : 'All' },
                                    { id: 'floor', label: lang === 'sk' ? 'Podlaha' : 'Floor' },
                                    { id: 'ceiling', label: lang === 'sk' ? 'Strop' : 'Ceiling' },
                                    { id: 'section', label: lang === 'sk' ? 'Rez' : 'Cut' },
                                  ].map(mode => (
                                    <button key={mode.id} onClick={() => setOpts(p => ({ ...p, scrapsViewMode: mode.id as any }))}
                                      style={{ fontSize: '9px', padding: '5px 2px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                        background: opts.scrapsViewMode === mode.id ? '#0ea5e9' : 'rgba(30,41,59,0.5)', color: 'white' }}>
                                      {mode.label}
                                    </button>
                                  ))}
                                </div>

                                {opts.scrapsViewMode !== 'all' && (
                                  <>
                                    <div style={{ marginTop: 10 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                                        <span>{lang === 'sk' ? 'Hranica rezu' : 'Cut threshold'}</span>
                                        <span style={{ color: '#4fc3f7' }}>{opts.scrapsHeightThreshold.toFixed(2)}</span>
                                      </div>
                                      <input type="range" min={-0.8} max={0.8} step={0.05}
                                        value={opts.scrapsHeightThreshold}
                                        onChange={e => setOpts(p => ({ ...p, scrapsHeightThreshold: Number(e.target.value) }))}
                                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                                    </div>

                                    {opts.scrapsViewMode !== 'section' && (
                                      <div style={{ marginTop: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                                          <span>{lang === 'sk' ? 'Rovinnosť plochy' : 'Surface flatness'}</span>
                                          <span style={{ color: '#4fc3f7' }}>{opts.scrapsAngleThreshold.toFixed(2)}</span>
                                        </div>
                                        <input type="range" min={0} max={0.9} step={0.05}
                                          value={opts.scrapsAngleThreshold}
                                          onChange={e => setOpts(p => ({ ...p, scrapsAngleThreshold: Number(e.target.value) }))}
                                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                                      </div>
                                    )}

                                    {opts.scrapsViewMode === 'section' && (
                                      <div style={{ marginTop: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                                          <span>{lang === 'sk' ? 'Hrúbka rezu' : 'Cut thickness'}</span>
                                          <span style={{ color: '#4fc3f7' }}>{opts.scrapsSectionWidth.toFixed(2)}</span>
                                        </div>
                                        <input type="range" min={0.02} max={0.3} step={0.01}
                                          value={opts.scrapsSectionWidth}
                                          onChange={e => setOpts(p => ({ ...p, scrapsSectionWidth: Number(e.target.value) }))}
                                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            <div style={{ marginTop: '8px', padding: '0 4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                                <span>{lang === 'sk' ? 'Plasticita stien' : 'Wall relief'}</span>
                                <span style={{ color: '#4fc3f7' }}>{opts.scrapsRelief.toFixed(2)}</span>
                              </div>
                              <input type="range" min={0} max={1} step={0.05}
                                value={opts.scrapsRelief}
                                onChange={e => setOpts(p => ({ ...p, scrapsRelief: Number(e.target.value) }))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── TERÉN (surface) ── */}
                </div>}{/* end cave tab */}

                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {/* TAB 2: TERÉN & MAPY (GIS)                                                 */}
                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {sidebarTab === 'terrain' && <div>

                {cave && (
                  <div>
                    <div className="s-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {t('terrain.title')}
                      {!cave.hasSurface && <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 'normal' }}>({lang === 'sk' ? 'žiadny' : 'none'})</span>}
                    </div>
                    
                    {cave.hasSurface ? (
                      <>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: opts.surfaceColor }} />
                        {t('terrain.shaded')}
                        <ColorPicker t={t} value={opts.surfaceColor} onChange={(c) => setOpts(p => ({ ...p, surfaceColor: c }))} />
                      </label>
                      <div className={`switch${opts.showSurfaceMesh ? ' on' : ''}`}
                        onClick={() => setOpts(p => ({ 
                          ...p, 
                          showSurfaceMesh: !p.showSurfaceMesh, 
                          showSurfaceNetwork: false, 
                          showSurfaceTexture: false 
                        }))} role="switch"
                        aria-checked={opts.showSurfaceMesh} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: opts.colorTerrainWire, border: '1px solid #4a7c3f' }} />
                        {t('terrain.wire')}
                        <ColorPicker t={t} value={opts.colorTerrainWire} onChange={(c) => setOpts(p => ({ ...p, colorTerrainWire: c }))} />
                      </label>
                      <div className={`switch${opts.showSurfaceMeshWire ? ' on' : ''}`}
                        onClick={() => toggleOpt('showSurfaceMeshWire')} role="switch"
                        aria-checked={opts.showSurfaceMeshWire} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: 'linear-gradient(180deg,#e53935 0%,#f9a825 33%,#43a047 66%,#1565c0 100%)', border: 'none' }} />
                        {t('terrain.network')}
                      </label>
                      <div className={`switch${opts.showSurfaceNetwork ? ' on' : ''}`}
                        onClick={() => setOpts(p => ({ 
                          ...p, 
                          showSurfaceMesh: false, 
                          showSurfaceNetwork: !p.showSurfaceNetwork, 
                          showSurfaceTexture: false 
                        }))} role="switch"
                        aria-checked={opts.showSurfaceNetwork} tabIndex={0} />
                    </div>
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: opts.contourColor, border: '1px solid #4a7c3f' }} />
                        {t('terrain.contours')} ({contourLevels.major}m)
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <ColorPicker t={t} label={t('terrain.contourBase')} value={opts.contourColor} onChange={(c) => setOpts(p => ({ ...p, contourColor: c }))} />
                          <ColorPicker t={t} label={t('terrain.contourMajor')} value={opts.contourColor10} onChange={(c) => setOpts(p => ({ ...p, contourColor10: c }))} />
                        </div>
                      </label>
                      <div className={`switch${opts.showContours ? ' on' : ''}`}
                        onClick={() => toggleOpt('showContours')} role="switch"
                        aria-checked={opts.showContours} tabIndex={0} />
                    </div>
                    {opts.showContours && (
                      <div className="toggle-row" style={{ paddingLeft: '20px', borderTop: 'none', marginTop: '-8px', opacity: 0.8 }}>
                        <label className="toggle-label" style={{ fontSize: '10px', color: '#94a3b8' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>label</span>
                          {lang === 'sk' ? 'Zobraziť výšky' : 'Show altitudes'}
                        </label>
                        <div className={`switch${opts.showContourLabels ? ' on' : ''}`}
                          onClick={() => toggleOpt('showContourLabels')} role="switch"
                          aria-checked={opts.showContourLabels} tabIndex={0} />
                      </div>
                    )}
                    <div className="toggle-row">
                      <label className="toggle-label">
                        <div className="dot" style={{ background: '#8fbc8f', border: '1px solid #4a7c3f' }} />
                        {t('terrain.texture')}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => {
                            const inp = document.createElement('input');
                            inp.type = 'file';
                            inp.accept = 'image/jpeg,image/png';
                            inp.onchange = (e: any) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const url = trackObjectUrl(URL.createObjectURL(file));
                                setOpts(p => {
                                  clearSurfaceTextureUrl(p.surfaceTextureUrl)
                                  return { 
                                    ...p, 
                                    surfaceTextureUrl: url, 
                                    showSurfaceTexture: true,
                                    showSurfaceMesh: false,
                                    showSurfaceNetwork: false
                                  }
                                });
                              }
                            };
                            inp.click();
                          }}
                          style={{
                            background: 'rgba(79,195,247,0.15)',
                            border: '1px solid rgba(79,195,247,0.3)',
                            borderRadius: '4px',
                            color: '#4fc3f7',
                            fontSize: '9px',
                            padding: '2px 6px',
                            cursor: 'pointer'
                          }}
                        >
                          {lang === 'sk' ? 'Nahrať' : 'Upload'}
                        </button>
                        {opts.surfaceTextureUrl && (
                          <button 
                            onClick={() => setOpts(p => {
                              clearSurfaceTextureUrl(p.surfaceTextureUrl)
                              return { ...p, surfaceTextureUrl: null }
                            })}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '10px', padding: '0 4px' }}
                          >✕</button>
                        )}
                        <div className={`switch${opts.showSurfaceTexture ? ' on' : ''}`}
                          onClick={() => setOpts(p => ({ 
                            ...p, 
                            showSurfaceMesh: false, 
                            showSurfaceNetwork: false, 
                            showSurfaceTexture: !p.showSurfaceTexture 
                          }))} role="switch"
                          aria-checked={opts.showSurfaceTexture} tabIndex={0} />
                      </div>
                    </div>

                    {opts.showSurfaceTexture && (
                      <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(15,23,42,0.5)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>map</span>
                              {lang === 'sk' ? 'ZDROJ TEXTÚRY' : 'TEXTURE SOURCE'}
                            </div>
                            <select 
                              value={opts.surfaceTextureSource} 
                              onChange={(e) => setOpts(p => ({ ...p, surfaceTextureSource: e.target.value as any }))}
                              style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px', padding: '2px 4px', outline: 'none', maxWidth: '200px' }}
                            >
                              <option value="custom">{lang === 'sk' ? 'Súbor (JPG/PNG/Lox)' : 'Custom File (JPG/PNG/Lox)'}</option>
                              <option value="wms-orto">WMS: Ortofotomapa (ZBGIS GKÚ)</option>
                              <option value="wms-orto-freemap">XYZ: Ortofotomapa (Freemap)</option>
                              <option value="wms-shadow">WMS: DMR5 Tieňovaný reliéf (ZBGIS GKÚ)</option>
                              <option value="wms-geology">WMS: Geologická mapa (ŠGÚDŠ)</option>
                              <option value="none">{lang === 'sk' ? 'Vypnutá' : 'None'}</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{lang === 'sk' ? 'Priehľadnosť' : 'Opacity'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, marginLeft: '12px' }}>
                              <input 
                                type="range" min="0" max="1" step="0.05"
                                value={opts.surfaceTextureOpacity}
                                onChange={(e) => setOpts(p => ({ ...p, surfaceTextureOpacity: parseFloat(e.target.value) }))}
                                style={{ flex: 1, height: '4px' }}
                              />
                              <span style={{ fontSize: '10px', color: '#e2e8f0', minWidth: '25px', textAlign: 'right' }}>{Math.round(opts.surfaceTextureOpacity * 100)}%</span>
                            </div>
                          </div>

                          {isRemoteTextureSource(opts.surfaceTextureSource) && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{lang === 'sk' ? 'Rozlíšenie / zoom' : 'Resolution / zoom'}</span>
                              <select 
                                value={opts.surfaceWmsResolution} 
                                onChange={(e) => setOpts(p => ({ ...p, surfaceWmsResolution: parseInt(e.target.value) }))}
                                style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px', padding: '1px 4px', outline: 'none' }}
                              >
                                <option value="512">{lang === 'sk' ? 'Auto nízka' : 'Auto low'}</option>
                                <option value="1024">{lang === 'sk' ? 'Auto stredná' : 'Auto medium'}</option>
                                <option value="2048">{lang === 'sk' ? 'Auto vysoká' : 'Auto high'}</option>
                                <option value="4096">{lang === 'sk' ? 'Auto maximum' : 'Auto maximum'}</option>
                              </select>
                            </div>
                          )}

                          {isRemoteTextureSource(opts.surfaceTextureSource) && (
                            <TextureDownloadInspectorPanel
                              info={textureDownloadInfo}
                              lang={lang}
                              onClearCache={handleClearTileCache}
                            />
                          )}

                          {opts.surfaceTextureSource === 'custom' && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button 
                                onClick={() => textureFileInputRef.current?.click()}
                                style={{ flex: 1, padding: '4px', fontSize: '10px', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '4px', color: '#93c5fd', cursor: 'pointer' }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '4px' }}>upload</span>
                                {lang === 'sk' ? 'Nahrať JPG/PNG' : 'Upload JPG/PNG'}
                              </button>
                              {opts.surfaceTextureUrl && (
                                <button 
                                  onClick={() => setOpts(p => {
                                    clearSurfaceTextureUrl(p.surfaceTextureUrl)
                                    return { ...p, surfaceTextureUrl: null }
                                  })}
                                  className="btn-mini" style={{ color: '#f87171' }}
                                >✕</button>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>tune</span>
                          {lang === 'sk' ? 'KALIBRÁCIA TEXTÚRY' : 'TEXTURE CALIBRATION'}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', alignItems: 'center' }}>
                          <button onClick={() => shiftTexture(-0.5, 0)} className="btn-mini" title="Vľavo">←</button>
                          <div style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: '#e2e8f0', fontFamily: 'monospace' }}>
                            {opts.surfaceTextureOffset.x > 0 ? '+' : ''}{opts.surfaceTextureOffset.x.toFixed(1)} / {opts.surfaceTextureOffset.y > 0 ? '+' : ''}{opts.surfaceTextureOffset.y.toFixed(1)}m
                          </div>
                          <button onClick={() => shiftTexture(0.5, 0)} className="btn-mini" title="Vpravo">→</button>
                          <button onClick={() => shiftTexture(0, 0.5)} className="btn-mini" title="Hore">↑</button>
                          <button onClick={() => shiftTexture(0, -0.5)} className="btn-mini" title="Dole">↓</button>
                        </div>

                        <button 
                          onClick={() => setOpts(p => ({ ...p, surfaceTextureOffset: { x: 0, y: 0 } }))}
                          style={{ width: '100%', marginBottom: '10px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#94a3b8', fontSize: '9px', padding: '2px 0', cursor: 'pointer' }}
                        >
                          {lang === 'sk' ? 'Reset posunu textúry' : 'Reset texture offset'}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{lang === 'sk' ? 'Súbor .txt (Therion/S-JTSK)' : 'Therion/S-JTSK .txt calib'}</span>
                          <button onClick={() => calibFileInputRef.current?.click()} className="btn-mini" style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', padding: '2px 8px' }}>
                            {lang === 'sk' ? 'Nahrať' : 'Load'}
                          </button>
                        </div>
                        {opts.surfaceTextureCalibration && (
                          <div style={{ fontSize: '9px', color: '#10b981', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check_circle</span>
                            {lang === 'sk' ? 'Kalibrácia aktívna' : 'Calibration active'}
                            <button onClick={() => setOpts(p => ({ ...p, surfaceTextureCalibration: null }))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', padding: 0 }}>✕</button>
                          </div>
                        )}
                        <input type="file" ref={calibFileInputRef} onChange={handleCalibFile} accept=".txt" style={{ display: 'none' }} />
                        <input type="file" ref={textureFileInputRef} onChange={handleTextureFile} accept="image/*" style={{ display: 'none' }} />
                      </div>
                    )}
                    
                    {/* Kalibrácia modelu voči povrchu */}
                    <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(30,41,59,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>location_on</span>
                        {lang === 'sk' ? 'KALIBRÁCIA MODELU (X, Y, Z)' : 'CAVE CALIBRATION (X, Y, Z)'}
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>X</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => shiftCave(-0.5, 0, 0)} className="btn-mini" title="-0.5m">-</button>
                            <button onClick={() => shiftCave(0.5, 0, 0)} className="btn-mini" title="+0.5m">+</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>Y</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => shiftCave(0, -0.5, 0)} className="btn-mini" title="-0.5m">-</button>
                            <button onClick={() => shiftCave(0, 0.5, 0)} className="btn-mini" title="+0.5m">+</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>Z (alt)</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => shiftCave(0, 0, -0.5)} className="btn-mini" title="-0.5m">-</button>
                            <button onClick={() => shiftCave(0, 0, 0.5)} className="btn-mini" title="+0.5m">+</button>
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '10px', color: '#e2e8f0', fontFamily: 'monospace' }}>
                         [{opts.caveCalibrationOffset.x > 0 ? '+' : ''}{opts.caveCalibrationOffset.x.toFixed(1)}, 
                          {opts.caveCalibrationOffset.y > 0 ? '+' : ''}{opts.caveCalibrationOffset.y.toFixed(1)}, 
                          {opts.caveCalibrationOffset.z > 0 ? '+' : ''}{opts.caveCalibrationOffset.z.toFixed(1)}] m
                      </div>
                      <button 
                        onClick={() => setOpts(p => ({ ...p, caveCalibrationOffset: { x: 0, y: 0, z: 0 } }))}
                        style={{ width: '100%', marginTop: '6px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#94a3b8', fontSize: '9px', padding: '2px 0', cursor: 'pointer' }}
                      >
                        {lang === 'sk' ? 'Resetovať polohu' : 'Reset position'}
                      </button>
                    </div>

                    {/* Kalibrácia Povrchu (DMR) voči svetu/modelu */}
                    <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(30,41,59,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>terrain</span>
                        {lang === 'sk' ? 'KALIBRÁCIA POVRCHU (X, Y, Z)' : 'SURFACE CALIBRATION (X, Y, Z)'}
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>X</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, x: p.surfaceOffset.x - 0.5 } }))} className="btn-mini">-</button>
                            <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, x: p.surfaceOffset.x + 0.5 } }))} className="btn-mini">+</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>Y</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, y: p.surfaceOffset.y - 0.5 } }))} className="btn-mini">-</button>
                            <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, y: p.surfaceOffset.y + 0.5 } }))} className="btn-mini">+</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>Z (alt)</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, z: p.surfaceOffset.z - 0.5 } }))} className="btn-mini">-</button>
                            <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, z: p.surfaceOffset.z + 0.5 } }))} className="btn-mini">+</button>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '6px', textAlign: 'center', fontFamily: 'monospace' }}>
                        {opts.surfaceOffset.x.toFixed(1)}, {opts.surfaceOffset.y.toFixed(1)}, {opts.surfaceOffset.z.toFixed(1)}m
                      </div>
                      <button 
                        onClick={() => setOpts(p => ({ ...p, surfaceOffset: { x: 0, y: 0, z: 0 } }))}
                        style={{ width: '100%', marginTop: '6px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#94a3b8', fontSize: '9px', padding: '2px 0', cursor: 'pointer' }}
                      >
                        {lang === 'sk' ? 'Reset kalibrácie povrchu' : 'Reset surface calibration'}
                      </button>
                    </div>

                      </>
                    ) : (
                      <div style={{ padding: '12px', background: 'rgba(30,41,59,0.2)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '8px' }}>
                          {lang === 'sk' ? 'Model nemá povrch.' : 'No surface for this model.'}
                        </div>
                      </div>
                    )}

                    {/* Vždy zobrazená možnosť pridania TIFF povrchu */}
                    <div style={{ padding: '10px', background: 'rgba(99,102,241,0.05)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' }}>
                      <div className="toggle-row" style={{ border: 'none', padding: 0 }}>
                        <label className="toggle-label">
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '6px' }}>upload_file</span>
                          {lang === 'sk' ? 'Pridať TIFF povrch' : 'Add TIFF surface'}
                        </label>
                        <button 
                          onClick={() => tiffFileInputRef.current?.click()}
                          style={{ padding: '4px 8px', fontSize: '10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer' }}
                        >
                          {lang === 'sk' ? 'Vybrať .tif' : 'Select .tif'}
                        </button>
                        <input 
                          type="file" ref={tiffFileInputRef} accept=".tif,.tiff" style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleTiffFile(file);
                          }}
                        />
                      </div>
                      
                      <div style={{ padding: '8px', background: 'rgba(30,41,59,0.3)', borderRadius: '6px', marginTop: '8px', fontSize: '9px', color: '#64748b' }}>
                        {lang === 'sk' 
                          ? 'Tip: Ak máš aj .tfw (World file), načítaj ho pre presné umiestnenie.'
                          : 'Tip: If you have a .tfw file, load it for precise positioning.'}
                        <button 
                          onClick={() => tfwFileInputRef.current?.click()}
                          style={{ display: 'block', marginTop: '4px', background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >
                          {lang === 'sk' ? 'Načítať .tfw' : 'Load .tfw'}
                        </button>
                        <input 
                          type="file" ref={tfwFileInputRef} accept=".tfw" style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && cave) {
                              alert(lang === 'sk' ? 'Najlepšie je pretiahnuť oba súbory (tif+tfw) naraz do okna.' : 'Best results: drag and drop both tif and tfw together.');
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                </div>}{/* end terrain tab */}

                {/* Stations, Colors & Cinematic — cave tab (bottom) */}
                {sidebarTab === 'cave' && <div>

                <div>
                  <div className="s-label">{t('stations.title')}</div>
                  <div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: opts.colorStations, border: '1px solid rgba(255,255,255,.2)' }} />
                      {t('stations.show')}
                      <ColorPicker t={t} value={opts.colorStations} onChange={(c) => setOpts(p => ({ ...p, colorStations: c }))} />
                    </label>
                    <div className={`switch${opts.showStations ? ' on' : ''}`}
                      onClick={() => toggleOpt('showStations')} role="switch"
                      aria-checked={opts.showStations} tabIndex={0} />
                  </div>
                  <div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: opts.colorStationNames }} />
                      {t('stations.names')}
                      <ColorPicker t={t} value={opts.colorStationNames} onChange={(c) => setOpts(p => ({ ...p, colorStationNames: c }))} />
                    </label>
                    <div className={`switch${opts.showStationNames ? ' on' : ''}`}
                      onClick={() => toggleOpt('showStationNames')} role="switch"
                      aria-checked={opts.showStationNames} tabIndex={0} />
                  </div>
                  <div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: opts.colorStationAlt }} />
                      {t('stations.altitude')}
                      <ColorPicker t={t} value={opts.colorStationAlt} onChange={(c) => setOpts(p => ({ ...p, colorStationAlt: c }))} />
                    </label>
                    <div className={`switch${opts.showStationAlt ? ' on' : ''}`}
                      onClick={() => toggleOpt('showStationAlt')} role="switch"
                      aria-checked={opts.showStationAlt} tabIndex={0} />
                  </div>
                  <div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: '#fb8c00', border: '1px solid white' }} />
                      {t('stations.entrances')}
                    </label>
                    <div className={`switch${opts.showEntrances ? ' on' : ''}`}
                      onClick={() => toggleOpt('showEntrances')} role="switch"
                      aria-checked={opts.showEntrances} tabIndex={0} />
                  </div>
                  <div className="toggle-row">
                    <label className="toggle-label">{t('stations.entranceLabels')}</label>
                    <div className={`switch${opts.showEntranceLabels ? ' on' : ''}`}
                      onClick={() => toggleOpt('showEntranceLabels')} role="switch"
                      aria-checked={opts.showEntranceLabels} tabIndex={0} />
                  </div>
                </div>

                <div>
                  <div className="s-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>accessibility_new</span>
                    {lang === 'sk' ? 'Mierka (Jaskyniar)' : 'Scale (Caver)'}
                  </div>
                  {opts.placedCaver ? (
                    <div style={{ padding: '8px', background: 'rgba(30,41,59,0.3)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {opts.placedCaver.pose === 'standing' ? (lang === 'sk' ? 'Stojaci' : 'Standing') : (lang === 'sk' ? 'Ležiaci' : 'Crawling')}
                        </span>
                        <button 
                          onClick={() => setOpts(p => ({ ...p, placedCaver: null }))}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                        >
                          {lang === 'sk' ? 'ODSTRÁNIŤ' : 'REMOVE'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                         <button onClick={() => setOpts(p => ({ ...p, placedCaver: { ...p.placedCaver!, pose: 'standing' } }))} className={`btn-mini ${opts.placedCaver.pose === 'standing' ? 'active' : ''}`} style={{ flex: 1 }}>{lang === 'sk' ? 'Stojaci' : 'Stand'}</button>
                         <button onClick={() => setOpts(p => ({ ...p, placedCaver: { ...p.placedCaver!, pose: 'crawling' } }))} className={`btn-mini ${opts.placedCaver.pose === 'crawling' ? 'active' : ''}`} style={{ flex: 1 }}>{lang === 'sk' ? 'Ležiaci' : 'Crawl'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="help-text" style={{ fontSize: '9px', opacity: 0.7, padding: '4px 0' }}>
                      {lang === 'sk' ? 'Klikni na ľubovoľný bod jaskyne pre pridanie postavy.' : 'Click on any cave point to add a caver.'}
                    </div>
                  )}
                </div>

                {/* ─── SPELEO & GEOLÓGIA ────────────────────────────────────────────────── */}
                </div>}{/* end cave tab (stations+colors) */}

                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {/* TAB 3: ANALÝZA & MERANIE                                                   */}
                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {sidebarTab === 'analysis' && <div>

                <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                  <div className="s-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(147, 51, 234, 0.1)', borderLeft: '4px solid #a855f7' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#c084fc' }}>insights</span>
                    {lang === 'sk' ? 'SPELEO & GEOLÓGIA' : 'SPELEO & GEOLOGY'}
                  </div>

                  {/* 0. Projekcia a Uhly pohľadu */}
                  <div style={{ background: 'rgba(30,41,59,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: '#e2e8f0', marginBottom: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#38bdf8' }}>videocam</span>
                      {t('projection.title')}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                      <button
                        onClick={() => setOpts(p => ({ ...p, cameraProjection: 'perspective' }))}
                        className={`btn-mini ${opts.cameraProjection === 'perspective' ? 'active' : ''}`}
                        style={{
                          background: opts.cameraProjection === 'perspective' ? '#0284c7' : 'rgba(30,41,59,0.6)',
                          color: opts.cameraProjection === 'perspective' ? '#fff' : '#94a3b8',
                          padding: '6px 4px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        {t('projection.perspective')}
                      </button>
                      <button
                        onClick={() => setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))}
                        className={`btn-mini ${opts.cameraProjection === 'orthographic' ? 'active' : ''}`}
                        style={{
                          background: opts.cameraProjection === 'orthographic' ? '#0284c7' : 'rgba(30,41,59,0.6)',
                          color: opts.cameraProjection === 'orthographic' ? '#fff' : '#94a3b8',
                          padding: '6px 4px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        {t('projection.orthographic')}
                      </button>
                    </div>

                    <p style={{ fontSize: '8px', color: '#64748b', margin: '0 0 8px 0', lineHeight: '1.3' }}>
                      {opts.cameraProjection === 'orthographic' ? t('projection.orthographicDesc') : t('projection.perspectiveDesc')}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <button
                        onClick={() => {
                          setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                          setActiveViewPreset('top')
                          window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))
                        }}
                        style={{
                          background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? '#0369a1' : 'rgba(15,23,42,0.8)',
                          border: '1px solid rgba(56,189,248,0.3)', color: '#bae6fd',
                          padding: '5px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          boxShadow: opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                        }}
                      >
                        <span>📐</span> {t('projection.planView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>1</span>
                      </button>

                      <button
                        onClick={() => {
                          setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                          setActiveViewPreset('front')
                          window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'front' } }))
                        }}
                        style={{
                          background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'front' ? '#0369a1' : 'rgba(15,23,42,0.8)',
                          border: '1px solid rgba(56,189,248,0.3)', color: '#bae6fd',
                          padding: '5px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          boxShadow: opts.cameraProjection === 'orthographic' && activeViewPreset === 'front' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                        }}
                      >
                        <span>↔️</span> {t('projection.profileView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>2</span>
                      </button>

                      <button
                        onClick={() => {
                          setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                          setActiveViewPreset('side')
                          window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'side' } }))
                        }}
                        style={{
                          background: opts.cameraProjection === 'orthographic' && activeViewPreset === 'side' ? '#0369a1' : 'rgba(15,23,42,0.8)',
                          border: '1px solid rgba(56,189,248,0.3)', color: '#bae6fd',
                          padding: '5px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          boxShadow: opts.cameraProjection === 'orthographic' && activeViewPreset === 'side' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                        }}
                      >
                        <span>↕️</span> {t('projection.sectionView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>3</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveViewPreset('iso')
                          window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'iso' } }))
                        }}
                        style={{
                          background: activeViewPreset === 'iso' ? '#0369a1' : 'rgba(15,23,42,0.8)',
                          border: '1px solid rgba(56,189,248,0.3)', color: '#bae6fd',
                          padding: '5px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          boxShadow: activeViewPreset === 'iso' ? '0 0 6px rgba(3,105,161,0.5)' : 'none'
                        }}
                      >
                        <span>🧊</span> {t('projection.isoView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>4</span>
                      </button>
                    </div>
                  </div>

                  {/* 1. Tektonika & Geológia (3-bodový sklonomer a spádnica) */}
                  <div style={{ background: 'rgba(30,41,59,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: '#e2e8f0', marginBottom: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#c084fc' }}>architecture</span>
                      {lang === 'sk' ? 'Tektonické meranie (3 body: Sklon & Spádnica)' : 'Tectonic Plane (Dip & Dip Direction)'}
                    </div>

                    <p style={{ fontSize: '9px', color: '#94a3b8', margin: '0 0 8px 0', lineHeight: '1.35' }}>
                      {lang === 'sk' 
                        ? 'Vyberte 3 body na stene jaskyne, vrstve alebo v teréne. Systém automaticky vypočíta normálu, sklon po spádnici a azimut.' 
                        : 'Pick 3 points on cave wall, bedding plane or terrain to calculate dip, dip direction and strike.'}
                    </p>

                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                      <button
                        onClick={() => setIsMeasuringMode(!isMeasuringMode)}
                        className={`btn-back${isMeasuringMode ? ' active' : ''}`}
                        style={{
                          flex: 1,
                          background: isMeasuringMode ? '#6366f1' : 'rgba(99,102,241,0.12)',
                          color: isMeasuringMode ? '#ffffff' : '#a5b4fc',
                          borderColor: isMeasuringMode ? '#818cf8' : 'rgba(99,102,241,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '6px 8px',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{isMeasuringMode ? 'check_circle' : 'touch_app'}</span>
                        <span>{isMeasuringMode ? (lang === 'sk' ? 'Meranie aktívne' : 'Measuring active') : (lang === 'sk' ? 'Aktivovať výber 3 bodov' : 'Enable 3-Point Picker')}</span>
                      </button>

                      {selectedStations.length > 0 && (
                        <button
                          onClick={() => setSelectedStations([])}
                          className="btn-back"
                          style={{
                            background: 'rgba(239,68,68,0.1)',
                            color: '#f87171',
                            borderColor: 'rgba(239,68,68,0.25)',
                            padding: '6px 8px',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title={lang === 'sk' ? 'Resetovať vybrané body' : 'Reset points'}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>restart_alt</span>
                        </button>
                      )}
                    </div>

                    {/* Stav výberu bodov */}
                    <div style={{ 
                      fontSize: '9px', 
                      padding: '5px 8px', 
                      borderRadius: '4px', 
                      background: selectedStations.length === 3 ? 'rgba(16,185,129,0.12)' : selectedStations.length > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(15,23,42,0.6)',
                      border: `1px solid ${selectedStations.length === 3 ? 'rgba(16,185,129,0.3)' : selectedStations.length > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      color: selectedStations.length === 3 ? '#6ee7b7' : selectedStations.length > 0 ? '#fcd34d' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: selectedStations.length === 3 ? '8px' : '0'
                    }}>
                      <span>
                        {selectedStations.length === 0 && (lang === 'sk' ? 'Kliknite na 1. bod v 3D scéne' : 'Click 1st point in 3D scene')}
                        {selectedStations.length === 1 && (lang === 'sk' ? 'Vybraný 1. bod. Kliknite na 2. bod' : 'Point 1 selected. Click 2nd point')}
                        {selectedStations.length === 2 && (lang === 'sk' ? 'Vybrané 2 body. Kliknite na 3. bod' : 'Points 1 & 2 selected. Click 3rd point')}
                        {selectedStations.length === 3 && (lang === 'sk' ? 'Rovina kompletne zameraná' : 'Plane fully measured')}
                      </span>
                      <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                        {selectedStations.length}/3
                      </span>
                    </div>

                    {/* Ak sú vybrané 3 body, zobrazíme živé výsledky priamo v bočnom paneli */}
                    {selectedStations.length === 3 && (() => {
                      const tect = calculateTectonics(selectedStations[0].pos, selectedStations[1].pos, selectedStations[2].pos, lang);
                      if (!tect) return null;
                      return (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <div style={{ background: '#0f172a', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ color: '#64748b', fontSize: '8px' }}>{t('tectonics.dip')}</div>
                              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#60a5fa', fontFamily: 'monospace' }}>
                                {tect.dipAngle.toFixed(1)}°
                              </div>
                            </div>
                            <div style={{ background: '#0f172a', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ color: '#64748b', fontSize: '8px' }}>{t('tectonics.dipDirection')}</div>
                              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#4ade80', fontFamily: 'monospace' }}>
                                {tect.dipDirection.toFixed(1)}° <span style={{ fontSize: '10px', color: '#86efac' }}>({tect.cardinalDirection})</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ background: '#0f172a', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '9px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{t('tectonics.strike')}:</span>
                              <strong style={{ color: '#fde047', fontFamily: 'monospace' }}>{`${tect.strike[0].toFixed(0)}° - ${tect.strike[1].toFixed(0)}°`}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{t('tectonics.triangleArea')}:</span>
                              <strong style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{tect.area.toFixed(2)} m²</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Geol. zápis:</span>
                              <strong style={{ color: '#c084fc', fontFamily: 'monospace' }}>{tect.notation}</strong>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const strikeStr = `${tect.strike[0].toFixed(0)}° - ${tect.strike[1].toFixed(0)}°`;
                              const text = `Tektonika / Geológia:\nSklon po spádnici: ${tect.dipAngle.toFixed(1)}°\nAzimut spádnice: ${tect.dipDirection.toFixed(1)}° (${tect.cardinalDirection})\nSmer vrstvy (Strike): ${strikeStr}\nPlocha: ${tect.area.toFixed(2)} m²\nGeol. zápis: ${tect.notation}`;
                              navigator.clipboard.writeText(text);
                            }}
                            className="btn-back"
                            style={{
                              width: '100%',
                              background: 'rgba(192,132,252,0.12)',
                              color: '#c084fc',
                              borderColor: 'rgba(192,132,252,0.25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '5px',
                              fontSize: '9px'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>content_copy</span>
                            <span>{t('tectonics.copyData')}</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2. 3D Kalibrácia Terénu (Gizmo) */}
                  <div style={{ background: 'rgba(30,41,59,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                    <div className="toggle-row" style={{ border: 'none', padding: 0, marginBottom: '6px' }}>
                      <label className="toggle-label" style={{ fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#38bdf8' }}>open_with</span>
                        {lang === 'sk' ? '3D kalibračné gizmo terénu' : '3D Terrain Gizmo'}
                      </label>
                      <div className={`switch${opts.terrainCalibrationMode ? ' on' : ''}`}
                        onClick={() => setOpts(p => ({ ...p, terrainCalibrationMode: !p.terrainCalibrationMode }))}
                        role="switch"
                        aria-checked={opts.terrainCalibrationMode}
                        tabIndex={0}
                      />
                    </div>
                    <p style={{ fontSize: '9px', color: '#64748b', margin: '0 0 8px 0', lineHeight: '1.3' }}>
                      {lang === 'sk' ? 'Aktivuje 3D manipulačné šípky priamo nad terénom v scéne pre real-time doladenie pozície.' : 'Activates 3D transformation arrows directly above the terrain in the scene for real-time alignment.'}
                    </p>
                    {opts.surfaceOffset && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: '#94a3b8', background: '#0f172a', padding: '4px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        <span>Offset:</span>
                        <span>X: {opts.surfaceOffset.x} | Y: {opts.surfaceOffset.y} | Z: {opts.surfaceOffset.z}m</span>
                      </div>
                    )}
                  </div>

                  {/* 2. LiDAR & Splay Analyzátor Anomálií */}
                  <div style={{ background: 'rgba(30,41,59,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: '#e2e8f0', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#a855f7' }}>analytics</span>
                      {lang === 'sk' ? 'LiDAR & Splay detektor komínov' : 'LiDAR Anomaly Detector'}
                    </div>
                    
                    <button 
                      onClick={isLiDARAnalyzing ? cancelLiDARAnalysis : runLiDARAnalysis}
                      className="btn-back"
                      style={{ width: '100%', marginBottom: '8px', background: 'rgba(147, 51, 234, 0.1)', color: '#c084fc', borderColor: 'rgba(147, 51, 234, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px', fontSize: '10px' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>youtube_searched_for</span>
                      <span>{isLiDARAnalyzing ? (lang === 'sk' ? 'Zrušiť LiDAR analýzu' : 'Cancel LiDAR analysis') : (lang === 'sk' ? 'Detegovať komíny, okná a pukliny' : 'Detect Chimneys & Windows')}</span>
                    </button>

                    <button
                      onClick={isLidarMapGenerating ? cancelLidarPlanMap : generateLidarPlanMap}
                      className="btn-back"
                      disabled={!cave.points || cave.pointCount === 0}
                      style={{
                        width: '100%',
                        marginBottom: '8px',
                        background: 'rgba(15,118,110,0.12)',
                        color: '#5eead4',
                        borderColor: 'rgba(20,184,166,0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '6px',
                        fontSize: '10px',
                        opacity: (!cave.points || cave.pointCount === 0) ? 0.45 : 1
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>map</span>
                      <span>{isLidarMapGenerating ? (lang === 'sk' ? 'Zrušiť kreslenie mapy' : 'Cancel map drawing') : (lang === 'sk' ? 'Nakresliť 2D mapu z LiDARu' : 'Draw 2D LiDAR map')}</span>
                    </button>

                    {anomalies.length > 0 ? (
                      <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
                        {anomalies.map((a) => (
                          <div 
                            key={a.id} 
                            onClick={() => setActiveAnomalyId(activeAnomalyId === a.id ? null : a.id)}
                            style={{ 
                              padding: '6px', 
                              borderRadius: '4px', 
                              background: activeAnomalyId === a.id ? 'rgba(147,51,234,0.2)' : 'rgba(15,23,42,0.6)', 
                              border: `1px solid ${activeAnomalyId === a.id ? '#c084fc' : 'rgba(255,255,255,0.05)'}`,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
                              <span style={{ 
                                fontWeight: 'bold', 
                                color: a.type === 'chimney' ? '#f97316' : a.type === 'window' ? '#06b6d4' : '#c084fc',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                                  {a.type === 'chimney' ? 'vertical_align_top' : a.type === 'window' ? 'open_in_new' : 'splitscreen'}
                                </span>
                                {a.type === 'chimney' ? (lang === 'sk' ? 'Komín / Dóm' : 'Chimney') : a.type === 'window' ? (lang === 'sk' ? 'Okno / Puklina' : 'Window') : (lang === 'sk' ? 'Geologická anomália' : 'Anomaly')}
                              </span>
                              <span style={{ color: '#10b981', fontWeight: 'bold' }}>{a.confidence.toFixed(0)}% spoľ.</span>
                            </div>
                            <div style={{ fontSize: '8px', color: '#94a3b8', lineHeight: '1.2' }}>
                              {a.description} (Veľkosť: {a.size.toFixed(1)}m)
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center', padding: '6px 0' }}>
                        {lang === 'sk' ? 'Žiadne zistené anomálie. Spusťte analýzu.' : 'No anomalies detected yet. Click scan.'}
                      </div>
                    )}
                  </div>

                  {/* 3. Objemový Profiler a 2D rezy */}
                  <div style={{ background: 'rgba(30,41,59,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: '#e2e8f0', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#06b6d4' }}>layers</span>
                      {lang === 'sk' ? '2D rez chodbou a objem' : '2D Cross-section & Volume'}
                    </div>

                    {selectedSegmentProfile ? (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px', fontSize: '9px', color: '#94a3b8' }}>
                          <div style={{ background: '#0f172a', padding: '4px 6px', borderRadius: '4px' }}>
                            <div style={{ color: '#64748b', fontSize: '8px' }}>{lang === 'sk' ? 'Prierezová plocha' : 'Cross-section area'}</div>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#06b6d4', fontFamily: 'monospace' }}>{(selectedSegmentProfile.area ?? 0).toFixed(1)} m²</div>
                          </div>
                          <div style={{ background: '#0f172a', padding: '4px 6px', borderRadius: '4px' }}>
                            <div style={{ color: '#64748b', fontSize: '8px' }}>{lang === 'sk' ? 'Odhadovaný objem' : 'Cave segment volume'}</div>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#10b981', fontFamily: 'monospace' }}>{(selectedSegmentProfile.volume ?? 0).toFixed(1)} m³</div>
                          </div>
                        </div>

                        <div style={{ background: '#0f172a', padding: '4px 6px', borderRadius: '4px', marginBottom: '8px', fontSize: '9px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Dĺžka úseku: <strong style={{ color: '#e2e8f0' }}>{(selectedSegmentProfile.length ?? 0).toFixed(1)} m</strong></span>
                          <span>LRUD: <strong style={{ color: '#e2e8f0' }}>{(selectedSegmentProfile.lrud?.l ?? 0).toFixed(1)}/{(selectedSegmentProfile.lrud?.r ?? 0).toFixed(1)}/{(selectedSegmentProfile.lrud?.u ?? 0).toFixed(1)}/{(selectedSegmentProfile.lrud?.d ?? 0).toFixed(1)}</strong></span>
                        </div>

                        {/* Textový výpis profilu chodby (bez SVG grafiky) */}
                        <div style={{ background: '#090d16', borderRadius: '6px', padding: '8px', border: '1px solid rgba(6,182,212,0.15)', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: '8px', color: '#06b6d4', fontWeight: 'bold', marginBottom: '4px' }}>
                            {lang === 'sk' ? 'Tvar profilu chodby' : 'Passage shape'}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '9px', color: '#94a3b8' }}>
                            <div>Strop: <strong style={{ color: '#e2e8f0' }}>{(selectedSegmentProfile.lrud?.u ?? 0).toFixed(1)}m</strong></div>
                            <div>Dno: <strong style={{ color: '#e2e8f0' }}>{(selectedSegmentProfile.lrud?.d ?? 0).toFixed(1)}m</strong></div>
                            <div>Ľavá: <strong style={{ color: '#e2e8f0' }}>{(selectedSegmentProfile.lrud?.l ?? 0).toFixed(1)}m</strong></div>
                            <div>Pravá: <strong style={{ color: '#e2e8f0' }}>{(selectedSegmentProfile.lrud?.r ?? 0).toFixed(1)}m</strong></div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center', padding: '10px 0', lineHeight: '1.4' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', display: 'block', marginBottom: '4px', color: '#64748b' }}>query_stats</span>
                        {lang === 'sk' ? 'Pre výpočet objemu a 2D prierezu chodby zapnite režim merania a kliknite na 2 po sebe nasledujúce stanice.' : 'To compute volume & 2D cross-section, turn on measurement tool and select two connected stations.'}
                      </div>
                    )}
                  </div>
                </div>
                </div>}{/* end analysis tab */}

                {/* Help, Presentation, Legend — cave tab (bottom) */}
                {sidebarTab === 'cave' && <div>

                <div>
                  <div className="s-label">{t('ui.help')}</div>
                  <div className="help-text" style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.6', background: 'rgba(30,41,59,0.3)', padding: '8px', borderRadius: '6px' }}>
                    {t('ui.helpRotate')}<br />
                    {t('ui.helpPan')}<br />
                    {t('ui.helpZoom')}<br />
                    {t('ui.helpTouch')}
                  </div>
                </div>

                <div>
                  <div className="s-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                    {lang === 'sk' ? 'Prezentácia' : 'Presentation'}
                  </div>
                  <div className="toggle-row">
                    <label className="toggle-label">{lang === 'sk' ? 'Auto-rotácia' : 'Auto-rotate'}</label>
                    <div className={`switch${opts.autoRotate ? ' on' : ''}`}
                      onClick={() => toggleOpt('autoRotate')} role="switch"
                      aria-checked={opts.autoRotate} tabIndex={0} />
                  </div>
                  {opts.autoRotate && (
                    <div style={{ marginTop: '8px', padding: '0 4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                        <span>{lang === 'sk' ? 'Rýchlosť' : 'Speed'}</span>
                        <span style={{ color: '#4fc3f7' }}>{opts.autoRotateSpeed.toFixed(1)}x</span>
                      </div>
                      <input type="range" min={0.1} max={10} step={0.1}
                        value={opts.autoRotateSpeed}
                        onChange={e => setOpts(p => ({ ...p, autoRotateSpeed: Number(e.target.value) }))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                    </div>
                  )}
                  <div className="toggle-row" style={{ borderBottom: 'none' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                        <span>{lang === 'sk' ? 'Dĺžka (sekundy)' : 'Duration (sec)'}</span>
                        <span style={{ color: '#818cf8' }}>{opts.recordingDuration === 0 ? (lang === 'sk' ? 'Manuálne' : 'Manual') : `${opts.recordingDuration}s`}</span>
                      </div>
                      <input type="range" min={0} max={60} step={5}
                        value={opts.recordingDuration}
                        onChange={e => setOpts(p => ({ ...p, recordingDuration: Number(e.target.value) }))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    </div>
                  </div>
                  <button 
                    className={`btn-record ${isRecording ? 'recording' : ''}`}
                    disabled={isRecording}
                    onClick={() => {
                      const container = document.getElementById('main-cave-canvas')
                      const canvas = container?.querySelector('canvas') as HTMLCanvasElement
                      if (!canvas) {
                        alert('Canvas not found!')
                        return
                      }
                      
                      try {
                        const captureStream = (canvas as any).captureStream || (canvas as any).webkitCaptureStream
                        if (!captureStream) throw new Error('CaptureStream not supported')
                        
                        const stream = captureStream.call(canvas, 60)
                        const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
                        const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm'
                        
                        const recorder = new MediaRecorder(stream, { mimeType })
                        const chunks: Blob[] = []
                        
                        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
                        recorder.onstop = () => {
                          const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url; a.download = `cave_presentation_${new Date().getTime()}.webm`
                          a.click()
                          setTimeout(() => URL.revokeObjectURL(url), 0)
                          setIsRecording(false)
                          delete (window as any)._activeRecorder
                        }
                        
                        (window as any)._activeRecorder = recorder
                        setIsRecording(true)
                        recorder.start()
                        
                        if (opts.recordingDuration > 0) {
                          setTimeout(() => {
                            if (recorder.state === 'recording') recorder.stop()
                          }, opts.recordingDuration * 1000)
                        }
                      } catch (err) {
                        console.error('Recording error:', err)
                        alert('Error starting recording')
                        setIsRecording(false)
                      }
                    }}
                  >
                    <div className="record-dot" />
                    {isRecording 
                      ? (lang === 'sk' ? 'Nahráva sa...' : 'Recording...') 
                      : (lang === 'sk' ? 'Nahrať prezentáciu' : 'Record Presentation')}
                  </button>
                </div>

                <div>
                  <div className="s-label">{t('legend.title')}</div>
                  {[
                    { color: '#4fc3f7', label: t('legend.cave') },
                    { color: '#78909c', label: t('legend.splay') },
                    { color: '#81c784', label: t('legend.surface') },
                  ].map(({ color, label }) => (
                    <div className="toggle-row" key={label} style={{ marginBottom: '4px' }}>
                      <div className="toggle-label">
                        <div className="dot" style={{ background: color }} />
                        <span style={{ fontSize: '11px' }}>{label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                </div>}{/* end cave tab (help+legend) */}
              </aside>
              {isMobileMenuOpen && (
                <button
                  type="button"
                  className="mobile-sidebar-close"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label={lang === 'sk' ? 'Zavrieť nastavenia' : 'Close settings'}
                >
                  <XIcon className="mobile-sidebar-close-icon" aria-hidden="true" />
                  <span>{lang === 'sk' ? 'Zavrieť nastavenia' : 'Close settings'}</span>
                </button>
              )}
              </div>}
            <ScaleBar cameraData={cameraData} />
            <ColorScaleLegend caveLegend={legendCave} surfLegend={legendSurf} lang={lang} />
            <ProcessingOverlay info={processingInfo} lang={lang} />
          </div>
        </div>
      )}
    </div>

      {/* ── LIDAR PLAN MAP PREVIEW ── */}
      {lidarPlanMapPreview && (
        <div className="share-overlay" onClick={() => setLidarPlanMapPreview(null)}>
          <div className="plan-map-dialog" onClick={e => e.stopPropagation()}>
            <div className="plan-map-title">
              <span>{lang === 'sk' ? '2D mapa z LiDAR modelu' : '2D map from LiDAR model'}</span>
              <button className="share-close-btn" onClick={() => setLidarPlanMapPreview(null)}>✕</button>
            </div>
            <div className="plan-map-image-wrap">
              <img
                src={lidarPlanMapPreview.dataUrl}
                className="plan-map-image"
                alt={lang === 'sk' ? 'Pôdorys jaskyne z LiDAR modelu' : 'Cave plan map from LiDAR model'}
              />
            </div>
            <div className="plan-map-meta">
              <span>{lidarPlanMapPreview.width} × {lidarPlanMapPreview.height}px</span>
              <span>{lidarPlanMapPreview.usedPoints.toLocaleString()} {lang === 'sk' ? 'bodov' : 'points'}</span>
              <span>{lidarPlanMapPreview.occupiedCells.toLocaleString()} {lang === 'sk' ? 'buniek' : 'cells'}</span>
              <span>{lidarPlanMapPreview.cellSize.toFixed(2)} m/px</span>
            </div>
            <div className="plan-map-actions">
              <button
                className="share-copy-btn"
                style={{ flex: 0, background: '#334155' }}
                onClick={() => setLidarPlanMapPreview(null)}
              >
                {t('ui.close')}
              </button>
              <button
                className="share-copy-btn"
                style={{ flex: 0 }}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = lidarPlanMapPreview.dataUrl;
                  link.download = `${loadedFile?.name?.replace(/\.[^.]+$/, '') || 'lidar-cave'}-2d-map.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                {lang === 'sk' ? 'Uložiť PNG' : 'Save PNG'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHARE DIALOG ── */}
      {shareDialogOpen && (
        <div className="share-overlay" onClick={() => setShareDialogOpen(false)}>
          <div className="share-dialog" onClick={e => e.stopPropagation()}>
            <div className="share-title">🔗 {lang === 'sk' ? 'Zdieľať model' : 'Share model'}</div>
            <div className="share-sub">
              {lang === 'sk'
                ? 'Nastav si vzhľad modelu v sidebari, potom klikni Share — všetky nastavenia sa uložia do odkazu rovnako ako Google Maps.'
                : 'Configure the model look in the sidebar, then click Share — all settings are saved into the link, just like Google Maps.'}
            </div>
            <div className="share-preview-label">🌐 {lang === 'sk' ? 'Verejná URL adresa modelu' : 'Public Model URL'}</div>
            <div className="share-input-row">
              <input 
                type="text" 
                className="share-url-input"
                placeholder="https://vasadomena.sk/model.lox"
                value={customShareUrl}
                onChange={e => {
                  setCustomShareUrl(e.target.value)
                  setUrlValidationStatus('idle')
                  setUrlValidationError(null)
                }}
              />
              <button 
                className={`btn-verify ${urlValidationStatus}`}
                onClick={() => validateUrl(customShareUrl)}
                disabled={urlValidationStatus === 'checking' || !customShareUrl}
              >
                {urlValidationStatus === 'checking' ? '...' : (lang === 'sk' ? 'Overiť' : 'Verify')}
              </button>
            </div>
            {urlValidationStatus === 'checking' && <div className="validation-msg checking">⌛ {lang === 'sk' ? 'Kontrolujem dostupnosť...' : 'Checking accessibility...'}</div>}
            {urlValidationStatus === 'valid' && <div className="validation-msg valid">✅ {lang === 'sk' ? 'Súbor je dostupný' : 'File is accessible'}</div>}
            {urlValidationStatus === 'invalid' && <div className="validation-msg invalid">❌ {urlValidationError}</div>}

            {/* ── GDrive Upload ── */}
            {!isEmbedMode && lastLoadedBuffer && (
              <div style={{ marginBottom: '1.2rem', padding: '1rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_to_drive</span>
                    {lang === 'sk' ? 'Automatický upload na tvoj Disk' : 'Auto upload to your Drive'}
                  </div>
                  {gdriveStatus === 'success' && <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold' }}>HOTOVO! ✅</span>}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '0.8rem' }}>
                  {lang === 'sk' 
                    ? 'Súbor sa nahrá na tvoj Google Disk a nastaví sa ako verejný. Získaš odkaz, ktorý funguje všade.' 
                    : 'File will be uploaded to your Google Drive and set to public. You get a link that works everywhere.'}
                </div>
                <button 
                  onClick={handleGDriveUpload}
                  disabled={gdriveStatus === 'uploading'}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    background: gdriveStatus === 'uploading' ? '#1e293b' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: gdriveStatus === 'uploading' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {gdriveStatus === 'uploading' ? '...' : (lang === 'sk' ? 'Nahrať a vygenerovať odkaz' : 'Upload and generate link')}
                </button>
                {gdriveStatus === 'error' && (
                  <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '6px', textAlign: 'center' }}>
                    {lang === 'sk' ? 'Chyba pri nahrávaní. Skús to znova.' : 'Upload error. Try again.'}
                  </div>
                )}
              </div>
            )}

            {/* ── Rozmery iframu ── */}
            <div className="share-preview-label">📐 {lang === 'sk' ? 'Veľkosť okna' : 'Window size'}</div>
            <div className="share-size-row">
              {([{w:400,h:300},{w:600,h:400},{w:800,h:500},{w:1200,h:700}] as const).map(({w,h}) => (
                <button key={w}
                  className={`share-size-preset${iframeWidth===w && iframeHeight===h ? ' active' : ''}`}
                  onClick={() => { setIframeWidth(w); setIframeHeight(h) }}
                >{w}×{h}</button>
              ))}
              <span style={{ color: '#475569', fontSize: 10, margin: '0 4px' }}>|</span>
              <input type="number" className="share-size-input" value={iframeWidth} min={200} max={3840}
                onChange={e => setIframeWidth(+e.target.value)} title="width" />
              <span style={{ color: '#475569', fontSize: 11 }}>×</span>
              <input type="number" className="share-size-input" value={iframeHeight} min={150} max={2160}
                onChange={e => setIframeHeight(+e.target.value)} title="height" />
              <span style={{ color: '#475569', fontSize: 10 }}>px</span>
            </div>

            {/* ── Sidebar povolenie pre návštevníkov ── */}
            <div className="share-toggle-row">
              <div className="share-toggle-label">
                {lang === 'sk' ? 'Zobraziť sidebar návštevníkom' : 'Show sidebar to visitors'}
                <small>{lang === 'sk' ? 'Návštevník bude môcť meniť nastavenia modelu' : 'Visitor can change model settings'}</small>
              </div>
              <div className={`switch${allowSidebarInEmbed ? ' on' : ''}`}
                onClick={() => setAllowSidebarInEmbed(p => !p)} role="switch"
                aria-checked={allowSidebarInEmbed} tabIndex={0} />
            </div>

            <div className="share-preview-label">📋 iframe kód (s aktuálnymi nastaveniami)</div>
            <div className="share-code">{getIframeCode()}</div>
            
            <div style={{ fontSize: '10px', color: '#475569', marginBottom: '0.8rem', lineHeight: 1.5 }}>
              💡 {lang === 'sk'
                ? 'Tip: Ak model hostuješ na vlastnom serveri, nezabudni povoliť CORS.'
                : 'Tip: If hosting the model on your own server, remember to enable CORS.'}
            </div>
            <button className="share-close-btn" onClick={() => setShareDialogOpen(false)}>✕</button>

            <div className="share-actions">
              <button className="share-copy-btn" onClick={handleCopyShare}>
                {shareCopied ? '✓ Skopírované!' : '📋 Kopírovať iframe kód'}
              </button>
              <button
                className="share-copy-btn"
                style={{ background: '#334155', flex: 0, padding: '0.6rem 0.8rem' }}
                onClick={() => navigator.clipboard.writeText(getShareUrl(true)).then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 2500) })}
                title={lang === 'sk' ? 'Kopírovať priamy odkaz' : 'Copy direct link'}
              >🔗</button>
            </div>
            <a href={getShareUrl(true)} target="_blank" rel="noopener noreferrer" className="share-open-link">
              ↗ {lang === 'sk' ? 'Otvoriť v novom okne (embed náhľad)' : 'Open in new window (embed preview)'}
            </a>
          </div>
        </div>
      )}

      {/* ── EMBED MODE TOP BAR (minimal branding) ── */}
      {isEmbedMode && appState === 'viewer' && (() => {
        const fullUrl = `${window.location.origin}${window.location.pathname}?model=${encodeURIComponent(new URLSearchParams(window.location.search).get('model') ?? '')}`
        return (
          <div className="embed-topbar">
            <span className="embed-logo">🏔️</span>
            <span className="embed-name">{loadedFile?.name}</span>
            <span className="embed-spacer" />
            {/* Fullscreen — otvoriť v novom okne */}
            <a href={fullUrl} target="_blank" rel="noopener noreferrer"
              className="embed-fullscreen-btn"
              title={lang === 'sk' ? 'Otvoriť na celej obrazovke' : 'Open fullscreen'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, display: 'block' }}>open_in_full</span>
            </a>
            <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="embed-btn">
              LV
            </a>
          </div>
        )
      })()}
      {!isEmbedMode && (
        <div style={{ position: 'fixed', bottom: '10px', right: '12px', fontSize: '10px', opacity: 0.4, zIndex: 1000, pointerEvents: 'auto' }}>
          <a href="/privacy.html" style={{ color: 'white', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      )}
    </>
  )
}
