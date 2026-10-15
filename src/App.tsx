import { NavigationSidebar } from '@shared/components/NavigationSidebar/NavigationSidebar';
import { ViewerToolbar } from '@shared/components/ViewerToolbar'
import { ProjectSection } from '@shared/components/NavigationSidebar/ProjectSection';
import { ViewSection } from '@shared/components/NavigationSidebar/ViewSection';
import { LayersSection } from '@shared/components/NavigationSidebar/LayersSection';
import { SurfaceSection } from '@shared/components/NavigationSidebar/SurfaceSection';
import { AnalysisSection } from '@shared/components/NavigationSidebar/AnalysisSection';
import { SystemSection } from '@shared/components/NavigationSidebar/SystemSection';
import type { NavigationBindings } from '@shared/components/NavigationSidebar/types';

import React, { useState, useRef, useCallback, useEffect, Suspense, useMemo } from 'react';
import type * as THREE from 'three'
import proj4 from 'proj4'

import packageJson from '../package.json'
import { SJTSK_DEF, fetchAltitudeFromZbgis, wgs84ToJtsk } from '@shared/utils/geoUtils';
import { loadGoogleIdentity } from '@shared/utils/googleIdentity';
import { tryUtmToWgs84, tryJtskToWgs84, worldToWgs84, getZbgisPointUrl } from "@shared/utils/coords";
import type { ParsedCave, ViewerOptions, CaveSurface, StationLabel, Vec3, ViewerCameraSnapshot, ViewPreset } from '@shared/types';
import type { TextureDownloadInspector } from '@shared/utils/XyzTileDownloader';
import { clearBrowserTileCache } from '@shared/utils/tileCache';
import { calculateVolumeAndProfile } from '@shared/utils/speleoAnalysis';
import { calculateTectonics } from '@shared/utils/tectonics';
import { getSjtskBoundsFromDtm } from '@shared/utils/surfaceBounds';
import { createSurfaceTextureCalibrationFromSjtskBbox, parseSjtskBboxCalibrationText } from '@shared/utils/surfaceTextureCalibration';
import { getDefaultPointCloudSize, getPreferredEngineForFile, isPlyLidarData } from '@shared/utils/modelDefaults';
import { renderLidarPlanMapToDataUrl, type LidarPlanMapData } from '@shared/utils/lidarPlanMap';
import { cloneLidarEditSnapshot, downsampleStrokePoints, filterLidarPointsByMask, selectProjectedLidarPoints, type LidarEditMode, type LidarScreenPoint } from '@shared/utils/lidarPointEditing';
import type { LiDARAnomaly } from '@shared/utils/speleoAnalysis';
import { DEFAULT_POINT_CLOUD_SHAPE } from '@v2/components/pointCloudShape';
import { hasRenderablePointColors } from '@shared/utils/pointCloudColors';
import { CompassRose } from '@shared/components/CompassRose';
import { FloatingClippingSlider } from '@shared/components/FloatingClippingSlider';
import { MeasurementPanel } from '@shared/components/MeasurementPanel';
import { resolveStationPosition } from '@shared/utils/stationInteraction'
import { calculateStationDepths, findReferenceStation, sampleDtmAt } from '@shared/utils/stationAltitude'
import {
  calculateDmr5Bounds,
  fetchDmr5GeoTiff,
  createDmr5Surface,
  downloadDmrFiles,
} from '@shared/utils/dmrDownloader'

const HelpModal = React.lazy(() => import('@shared/components/HelpModal').then(m => ({ default: m.HelpModal })))

const CaveViewer3D = React.lazy(() => import('@v1/components/CaveViewer3D'))
const CaveViewerNextGen = React.lazy(() => import('@v2/components/CaveViewerNextGen'))
const APP_VERSION = packageJson.version
const GIT_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : ''







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
    group: 'Odstránenie SSAO a vyčistenie UI',
    items: [
      'Funkcia Ambient Occlusion (SSAO) úplne odstránená — nemala reálne využitie a stále pôsobila príliš tmavo',
      'Odstránené interné pracovné označenia z popiskov (napr. "(2A)", "(2C)", "(3C)")',
      'Prepínač Splay teraz spoločne skrýva alebo zobrazuje lúče aj ich koncové bodky',
    ],
  },
  {
    version: '2.4.20',
    group: 'Natrvalo opravené stmavovanie modelu po zastavení kamery',
    items: [
      'Skutočná príčina: priehľadnosť stien (75 % default) sa po zastavení kamery zapla a presvitalo cez ňu tmavé pozadie',
      'Nová predvolená hodnota: priehľadnosť stien 100 % (nepriehľadné) — model sa už sám od seba nestmaví',
      'Slider "Priehľadnosť stien" ostáva k dispozícii pre tých, čo priehľadnosť chcú',
    ],
  },
  {
    version: '2.4.19',
    group: 'Ambient Occlusion (SSAO) — svetlejšie a presnejšie',
    items: [
      'Pozadie/obloha sa už pri zapnutom SSAO nestmavuje (opravená detekcia hĺbky pozadia)',
      'Odstránené plošné stmavovanie terénu a modelu — zatienenie je teraz relatívne k vzdialenosti, funguje správne pri malých aj veľkých mierkach',
      'Jemnejší predvolený efekt (nižšia intenzita a polomer, vyššie minimálne jas)',
    ],
  },
  {
    version: '2.4.18',
    group: 'Priehľadnosť stien a nezávislý organický model',
    items: [
      'Nový ovládací prvok "Priehľadnosť stien" (slider 10 – 100 %)',
      'Organický / Vyhladený model funguje nezávisle od "Zobraziť steny"',
      'Doplnený preklad SK/EN/FR/DE pre novú položku',
    ],
  },
  {
    version: '2.4.17',
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

import { getBrowserLanguage, getTranslation, Language } from '@shared/i18n';

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



// ─── Station detail card ─────────────────────────────────────────────────────────────

export interface SelStation {
  idx:          number
  name:         string
  origX:        number
  origY:        number
  altitude:     number    // m n.m.
  pos:          Vec3      // Pridané súradnice pre 3D
  gps:          { lat: number; lon: number; zone?: number; epsg?: string } | null
  distToSurf:   number | null   // m, kladné = jaskyňa je pod povrchom, záporné = nad povrchom (kolmo hore)
  surfaceZ?:    number | null   // m n.m. nadmorská výška povrchu priamo kolmo nad bodom
  closestSurfDist?: number | null // m, najkratšia 3D vzdialenosť k povrchu
  closestSurfPos?: Vec3 | null    // Centrované súradnice najbližšieho bodu povrchu (pre 3D visual)
  closestSurfWorld?: Vec3 | null  // World súradnice najbližšieho bodu povrchu
  closestSurfAltitude?: number | null // m n.m. v najbližšom bode povrchu
  closestHorizontalDist?: number | null // m, horizontálny posun od kolmice
  closestSurfGps?: { lat: number; lon: number } | null // GPS súradnice najbližšieho bodu povrchu
  entranceAlt?: number | null   // m n.m. nadmorská výška referenčného vchodu / bodu
  denivEntrance?: number | null // m, prevýšenie / denivelácia od vchodu (altitude - entranceAlt)
  refStationName?: string | null // meno referenčného vchodu / bodu
  refStationType?: 'entrance_gps' | 'entrance' | 'lowest_station' | 'none'
  screenX:      number
  screenY:      number
  centerX?:     number
  centerY?:     number
  centerZ?:     number
}

function StationDetailCard({ stations, onClose, onPlaceCaver, onSetProfile, onUpdateGps, onDownloadDmr, t, lang, baseAltitude, altitudeMode }: { 
  stations: SelStation[]; 
  onClose: () => void;
  onPlaceCaver: (pos: [number, number, number] | null, pose: 'standing' | 'crawling') => void;
  onSetProfile: (sts: SelStation[]) => void;
  onUpdateGps: (stIdx: number, lat: number, lon: number, alt: number) => void;
  onDownloadDmr?: (lat: number, lon: number, extentMeters: number) => Promise<void>;
  t: (key: string) => string;
  lang: string;
  baseAltitude?: number;
  altitudeMode?: 'absolute' | 'relative';
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

  // Pôvodná poloha karty ukotvená na bočný okraj
  const defaultLeft = 20
  const defaultTop = 92

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
    <div className="station-detail-card" role="region" aria-label={headerTitle} style={{
      position: 'fixed', left: defaultLeft + posOffset.x, top: defaultTop + posOffset.y, zIndex: 200, minWidth: 300, maxWidth: 360,
      maxHeight: 'calc(100dvh - 112px)', overflowY: 'auto',
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
                <Row label={t('stations.title')} value={st.name} />
              ) : (
                <Row label={t('stations.coordinates')} value={st.name} />
              )
            )}
            {stations.length === 1 && <Row label={t('stations.coordinates')}
              value={`X ${st.origX.toFixed(2)} · Y ${st.origY.toFixed(2)}`} />}
            
            {(!editGps || stations.length > 1) ? (
              <Row
                label={t('stations.altitude')}
                value={`${st.altitude.toFixed(2)} m`}
                sub={st.gps ? 'm n.m.' : 'Z (rel)'}
              />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{t('stations.altitude')}</span>
                <input 
                  type="text" value={altInput} onChange={e => setAltInput(e.target.value)}
                  style={{ width: 80, background: 'rgba(0,0,0,0.3)', border: '1px solid #4fc3f7', color: '#fff', fontSize: 12, textAlign: 'right', borderRadius: 4, padding: '2px 4px' }}
                />
              </div>
            )}

            {/* 1. Denivelácia od vchodu / referenčného bodu (+/- hodnota) */}
            {stations.length === 1 && (
              <Row
                label={st.refStationType === 'lowest_station'
                  ? `${t('stations.refDenivelation')} ${st.refStationName || ''}`.trim()
                  : t('stations.entranceDenivelation')}
                value={st.denivEntrance !== null && st.denivEntrance !== undefined
                  ? `${st.denivEntrance >= 0 ? '+' : ''}${st.denivEntrance.toFixed(2)} m`
                  : (baseAltitude !== undefined ? `${(st.altitude - baseAltitude) >= 0 ? '+' : ''}${(st.altitude - baseAltitude).toFixed(2)} m` : t('measuring.unavailable'))}
                sub={st.refStationName ? (
                  `${st.refStationType === 'entrance_gps' ? 'vchod s GPS' : st.refStationType === 'entrance' ? 'vchod' : 'ref. bod'} ${st.refStationName}${st.entranceAlt !== null && st.entranceAlt !== undefined ? ` (${st.entranceAlt.toFixed(1)} m)` : ''}`
                ) : undefined}
              />
            )}

            {/* 2. Najkratšia 3D vzdialenosť k povrchu (minimálna hrúbka masívu) */}
            {stations.length === 1 && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 8,
                padding: '8px 10px',
                margin: '6px 0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>
                    ★ {t('stations.closestSurfaceDist')}
                  </span>
                  <span style={{ fontSize: 13, color: '#fef08a', fontWeight: 700, fontFamily: 'monospace' }}>
                    {st.closestSurfDist === null || st.closestSurfDist === undefined ? t('measuring.unavailable') : `${st.closestSurfDist.toFixed(1)} m`}
                  </span>
                </div>

                {st.closestSurfDist !== null && st.closestSurfDist !== undefined ? (
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', color: '#cbd5e1' }}>
                      <span>{t('stations.minRockCover')}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#fde68a' }}>
                        {st.closestHorizontalDist != null && `${t('stations.horizontalOffset')}: ${st.closestHorizontalDist.toFixed(1)} m`}
                        {st.closestSurfAltitude != null && ` • ${t('stations.surfaceAltitude')}: ${st.closestSurfAltitude.toFixed(1)} m`}
                      </span>
                    </div>

                    {st.closestSurfGps && (
                      <div style={{
                        marginTop: 4,
                        paddingTop: 4,
                        borderTop: '1px dashed rgba(245, 158, 11, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#d97706', fontWeight: 600, fontSize: 10 }}>{t('stations.surfaceGps')}:</span>
                          <span style={{ color: '#fde68a', fontFamily: 'monospace', fontSize: 10 }}>
                            {st.closestSurfGps.lat.toFixed(6)}°, {st.closestSurfGps.lon.toFixed(6)}°
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 14, marginTop: 2, alignItems: 'center' }}>
                          <a
                            href={`https://maps.google.com/?q=${st.closestSurfGps.lat.toFixed(6)},${st.closestSurfGps.lon.toFixed(6)}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 10, color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            🗺️ {t('ui.googleMaps')}
                          </a>
                          <a
                            href={getZbgisPointUrl(st.closestSurfGps.lat, st.closestSurfGps.lon)}
                            target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 10, color: '#f59e0b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            🏔️ {t('ui.zbgisLidar')}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 3 }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {t('stations.noSurfaceDtm')}
                    </div>
                    {st.gps && onDownloadDmr && (
                      <button
                        type="button"
                        onClick={() => onDownloadDmr(st.gps!.lat, st.gps!.lon, 500)}
                        style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          borderRadius: '4px',
                          color: '#f59e0b',
                          fontSize: '10px',
                          padding: '3px 6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          alignSelf: 'flex-start',
                          marginTop: '2px',
                        }}
                        title={lang === 'sk' ? "Stiahnuť terén DMR 5.0 (GKÚ SR LiDAR) pre okolie tohto bodu" : "Download DMR 5.0 terrain around this point"}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>cloud_download</span>
                        <span>{lang === 'sk' ? 'Stiahnuť DMR 5.0 (500m)' : 'Download DMR 5.0 (500m)'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. Vertikálna hĺbka pod povrchom (kolmo hore) */}
            {stations.length === 1 && (
              <Row
                label={t('stations.surfaceDepth')}
                value={st.distToSurf === null || st.distToSurf === undefined ? t('measuring.unavailable') : `${Math.abs(st.distToSurf).toFixed(1)} m`}
                sub={st.distToSurf === null || st.distToSurf === undefined
                  ? t('stations.noSurfaceDtm')
                  : `${st.distToSurf >= 0 ? t('stations.underSurface') : t('stations.aboveSurface')}${st.surfaceZ !== null && st.surfaceZ !== undefined ? ` (${t('stations.surfaceAltitude')}: ${st.surfaceZ.toFixed(1)} m)` : ''}`}
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
                      <div style={{ marginTop: 6, display: 'flex', gap: 14, alignItems: 'center' }}>
                        <a
                          href={`https://maps.google.com/?q=${st.gps.lat.toFixed(6)},${st.gps.lon.toFixed(6)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: '#4fc3f7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          🗺️ {t('ui.googleMaps')}
                        </a>
                        <a
                          href={getZbgisPointUrl(st.gps.lat, st.gps.lon)}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: '#f59e0b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          🏔️ {t('ui.zbgisLidar')}
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
        {t('toolbar.inspectHint')}
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
const ColorScaleLegend = ({ caveLegend, surfLegend, lang, baseAltitude, altitudeMode }: { 
  caveLegend: { minAlt: number, maxAlt: number } | null, 
  surfLegend: { minAlt: number, maxAlt: number } | null,
  lang: string,
  baseAltitude?: number,
  altitudeMode?: 'absolute' | 'relative'
}) => {
  if (!caveLegend && !surfLegend) return null
  
  const gradient = 'linear-gradient(to top, #142ea6 0%, #197ad9 18%, #1fc7b8 35%, #2ede61 50%, #ccf01a 65%, #f7990d 80%, #e01a1a 100%)'
  const isRel = altitudeMode === 'relative'
  const base = baseAltitude ?? 0

  const formatAlt = (val: number) => {
    if (!isRel) return `${Math.round(val)} m`
    const diff = Math.round(val - base)
    return `${diff > 0 ? '+' : ''}${diff} m`
  }

  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 12, 
      display: 'flex', gap: 16, alignItems: 'flex-end',
      pointerEvents: 'none', zIndex: 100
    }}>
      {caveLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 2px #000', marginBottom: 4, fontWeight: 600 }}>
             {formatAlt(caveLegend.maxAlt)}
          </div>
          <div style={{ width: 12, height: 100, background: gradient, borderRadius: 2, border: '1px solid rgba(255,255,255,0.3)' }} />
          <div style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 2px #000', marginTop: 4, fontWeight: 600 }}>
             {formatAlt(caveLegend.minAlt)}
          </div>
          <div style={{ fontSize: 8, color: '#fff', textShadow: '0 1px 2px #000', marginTop: 2, fontWeight: 700, letterSpacing: '0.02em' }}>
            {lang === 'sk' ? 'Jaskyňa' : 'Cave'}{isRel ? ' (rel)' : ''}
          </div>
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
  const isPlyLidar = useMemo(() => isPlyLidarData(loadedFile?.ext, cave), [loadedFile?.ext, cave])
  const refStationInfo = useMemo(() => cave ? findReferenceStation(cave) : null, [cave])
  const baseAltitude = useMemo(() => {
    if (refStationInfo && refStationInfo.type !== 'none') return refStationInfo.altitude
    if (!cave) return undefined
    return cave.stations?.[0] ? (cave.stations[0].z + (cave.centerOffset?.z || 0)) : undefined
  }, [cave, refStationInfo])
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [loadingStatus, setLoadingStatus] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedStations, setSelectedStations] = useState<SelStation[]>([])
  const [measurementMode, setMeasurementMode] = useState<'off' | 'distance' | 'polygon'>('off')
  const isMeasuringMode = measurementMode !== 'off'
  const [profilePicking, setProfilePicking] = useState(false)
  const startProfilePick = useCallback(() => {
    setOpts(prev => ({ ...prev, autoRotate: false, showProfileClipping: true, profileClipOffset: 0 }))
    setActiveProfilePoints(null)
    setSelectedStations([])
    setMeasurementMode('distance')
    setProfilePicking(true)
  }, [])
  const setProfileClipping = useCallback((on: boolean) => {
    if (!on) {
      setProfilePicking(false)
      setOpts(prev => ({ ...prev, showProfileClipping: false }))
      return
    }
    if (activeProfilePoints?.length === 2) setOpts(prev => ({ ...prev, showProfileClipping: true }))
    else startProfilePick()
  }, [activeProfilePoints, startProfilePick])

  const cycleMeasurementMode = () => {
    setOpts(prev => ({ ...prev, autoRotate: false }))
    setMeasurementMode(prev => {
      if (prev === 'off') return 'distance'
      if (prev === 'distance') return 'polygon'
      return 'off'
    })
    setSelectedStations([])
  }
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

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // GDrive states
  const [lastLoadedBuffer, setLastLoadedBuffer] = useState<ArrayBuffer | null>(null)
  const [gdriveStatus, setGdriveStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)
  const [activeViewPreset, setActiveViewPreset] = useState<ViewPreset | null>(null)

  useEffect(() => {
    const savedLang = localStorage.getItem('cv-language');
    if (savedLang) return; 

    const detected = getBrowserLanguage();
    if (detected !== lang) {
      setLang(detected);
    }
  }, []);

  const t = useCallback((key: string) => getTranslation(lang, key), [lang])

  const [isModelMoving, setIsModelMoving] = useState(false)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])
  const [cameraData, setCameraData] = useState<ViewerCameraSnapshot | null>(null)
  const [processingInfo, setProcessingInfo] = useState<string | null>(null)
  const [appStatus, setAppStatus] = useState<{ msg: string; type: 'info' | 'error' | 'success' | 'progress'; progress?: number } | null>(null)
  const [downloadableTexture, setDownloadableTexture] = useState<{ dataUrl: string, bbox: string } | null>(null)
  const [textureDownloadInfo, setTextureDownloadInfo] = useState<TextureDownloadInspector | null>(null)
  const [isDmrDownloading, setIsDmrDownloading] = useState(false)
  const [lastDownloadedDmr, setLastDownloadedDmr] = useState<{
    tifBuffer: ArrayBuffer;
    tfwText: string;
    filename: string;
    minZ: number;
    maxZ: number;
    width: number;
    height: number;
    heightSystem?: 'bpv' | 'etrs89';
    quasigeoidUndulation?: number;
  } | null>(null)
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
  const [selectedSegmentProfile, setSelectedSegmentProfile] = useState<ReturnType<typeof calculateVolumeAndProfile> | null>(null)

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
    enableScrapsBatching: true,
    enableSplayWalls:    false,
    splayVoxelSize:      0.22,
    splaySmoothK:        0.06,
    splayCapsuleRadius:  0.10,
    splayAltitude:       true,
    enableEDL:           false,
    cameraProjection:    'perspective',
    altitudeMode:        'absolute',
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
    colorBackground:     '#103258', // Modrý technický gradient (hore)
    colorBackground2:    '#1d5b9b', // Svetlejšia modrá (dole)
    // Cave scraps
    showScraps:          true,
    scrapsOpacity:       1.0,
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
    colorScraps:         '#cbd5e1',
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

  const splayCount = useMemo(() => {
    if (!cave || !cave.segments) return 0;
    return cave.segments.filter((s: any) => s.type === 'splay').length;
  }, [cave]);

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
      } else if (e.key === 'c' || e.key === 'C') {
        setOpts(p => {
          if (p.engine === 'v2' && isPlyLidar) {
            const modes: Array<ViewerOptions['pointCloudColorMode']> = ['original', 'elevation', 'natural']
            const curIdx = modes.indexOf(p.pointCloudColorMode || 'original')
            const nextMode = modes[(curIdx + 1) % modes.length]
            return { ...p, pointCloudColorMode: nextMode }
          } else {
            return { ...p, scrapsAltitude: !p.scrapsAltitude }
          }
        })
      } else if (e.key === 'h' || e.key === 'H') {
        setOpts(p => ({
          ...p,
          altitudeMode: p.altitudeMode === 'relative' ? 'absolute' : 'relative'
        }))
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
      const customEvent = e as CustomEvent<{ view: ViewPreset | 'fit' }>
      if (customEvent.detail?.view && customEvent.detail.view !== 'fit') {
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
    // R3F puts the id on its wrapper div, not on the <canvas> itself.
    const canvasById = document.querySelector<HTMLCanvasElement>(`#${id} canvas`);
    if (canvasById) return canvasById;
    const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
    return canvases.find(canvas => {
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !String(canvas.className || '').includes('bg-canvas');
    }) || null;
  }, [opts.engine]);

  const handleExportScreenshot = useCallback(() => {
    const canvas = getActiveViewerCanvas();
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const safeName = 'cave_view';
      a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Screenshot export failed:', err);
    }
  }, [getActiveViewerCanvas]);

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

  // ─── DEFINÍCIA ŠABLÓN (STITCH CAD & FIELDWORK) ───────────────────────────────
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
      colorScraps:       '#cbd5e1',
      colorScrapsWire:   '#6a9fd8',
      colorTerrainWire:  '#6ab04c',
      colorBoundingBox:  '#990000',
      surfaceColor:      '#e2e8f0',
    },
    precision: {
      colorBackground:   '#103258', // Modrý technický gradient (hore)
      colorBackground2:  '#1d5b9b', // Svetlejšia modrá (dole)
      colorTraverse:     '#ffffff',
      colorSplay:        '#00d2ff', // Electric Cyan
      colorStations:     '#fbbf24',
      colorStationNames: '#f8fafc',
      colorStationAlt:   '#38bdf8',
      showEntrances: true,
      showEntranceLabels: true,
      colorGrid:         '#1e293b',
      colorScraps:       '#cbd5e1',
      colorScrapsWire:   '#00d2ff',
      colorTerrainWire:  '#10b981', // Subterranean Emerald
      colorBoundingBox:  '#ef4444',
      surfaceColor:      '#dee2f2',
    },
    light: {
      colorBackground:   '#f7f3eb', // Jemná svetlá piesková (hore)
      colorBackground2:  '#d5c4ad', // Tmavšia piesková (dole)
      colorTraverse:     '#0f2b48', // Centerline Survey Vectors (Dark Navy)
      colorSplay:        '#0284c7', // Volumetric rays
      colorStations:     '#ea580c',
      colorStationNames: '#1c1917',
      colorStationAlt:   '#0284c7',
      showEntrances: true,
      showEntranceLabels: true,
      colorGrid:         '#c2b3a0', // Teplá piesková mriežka
      colorScraps:       '#a89988',
      colorScrapsWire:   '#0284c7',
      colorTerrainWire:  '#059669',
      colorBoundingBox:  '#dc2626',
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

  const handleStationClick = useCallback((idx: number, screenX: number, screenY: number, ctrlKey: boolean, point?: Vec3) => {
    if (!cave) return
    const now = Date.now()
    if (idx >= 0 && now - lastClickRef.current.time < 300 && lastClickRef.current.idx === idx) {
      return 
    }
    lastClickRef.current = { time: now, idx }

    const resolved = resolveStationPosition(cave, idx, point)
    if (!resolved) return
    const sl = cave.stationLabels[idx]
    const ox = resolved.position.x + cave.centerOffset.x
    const oy = resolved.position.y + cave.centerOffset.y
    const alt = resolved.position.z + cave.centerOffset.z
    const name = resolved.name

    // Filter interaction
    const isPolygon = resolved.station
    if (!isMeasuringMode && !ctrlKey && !isPolygon && !point) return

    let gps: { lat: number; lon: number; zone?: number; epsg?: string } | null = null;
    gps = sl?.gps ?? tryUtmToWgs84(ox, oy);
    if (!gps) {
      gps = tryJtskToWgs84(ox, oy);
    }

    const depthInfo = calculateStationDepths(
      cave,
      { x: ox, y: oy, z: alt },
      { caveCalibrationOffset: opts.caveCalibrationOffset, surfaceOffset: opts.surfaceOffset }
    )

    const closestPosCentered = depthInfo.closestSurfWorld ? {
      x: depthInfo.closestSurfWorld.x - cave.centerOffset.x,
      y: depthInfo.closestSurfWorld.y - cave.centerOffset.y,
      z: depthInfo.closestSurfWorld.z - cave.centerOffset.z,
    } : null

    const closestGps = depthInfo.closestSurfWorld ? (
      worldToWgs84(depthInfo.closestSurfWorld.x, depthInfo.closestSurfWorld.y, { x: ox, y: oy, gps: gps || undefined })
    ) : null

    const newSt: SelStation = { 
      idx, name, origX: ox, origY: oy, altitude: alt, gps,
      distToSurf: depthInfo.distToSurf,
      surfaceZ: depthInfo.surfaceZ,
      closestSurfDist: depthInfo.closestSurfDist,
      closestSurfPos: closestPosCentered,
      closestSurfWorld: depthInfo.closestSurfWorld,
      closestSurfAltitude: depthInfo.closestSurfAltitude,
      closestHorizontalDist: depthInfo.closestHorizontalDist,
      closestSurfGps: closestGps,
      denivEntrance: depthInfo.denivEntrance,
      refStationName: depthInfo.refStationName,
      refStationType: depthInfo.refStationType,
      entranceAlt: depthInfo.entranceAlt,
      screenX, screenY,
      pos: resolved.position,
      centerX: cave.centerOffset.x, centerY: cave.centerOffset.y, centerZ: cave.centerOffset.z
    }
    
    setSelectedStations(prev => {
      if (measurementMode === 'off' && !ctrlKey) return [newSt]
      if (measurementMode === 'distance') {
        if (prev.length >= 2) return [prev[0], newSt]
        return [...prev, newSt]
      }
      if (measurementMode === 'polygon') {
        const isDuplicate = prev.some(p => Math.abs(p.origX - newSt.origX) < 0.001 && Math.abs(p.origY - newSt.origY) < 0.001 && Math.abs(p.altitude - newSt.altitude) < 0.001)
        if (isDuplicate) return prev
        return [...prev, newSt]
      }
      return [newSt]
    })
    if (measurementMode === 'off') {
      setShowStationCard(true)
    }
  }, [cave, isMeasuringMode, measurementMode, opts.caveCalibrationOffset, opts.surfaceOffset]);

  useEffect(() => {
    if (!profilePicking) return
    if (measurementMode !== 'distance') { setProfilePicking(false); return }
    if (selectedStations.length !== 2) return
    setActiveProfilePoints([...selectedStations])
    setOpts(p => ({ ...p, showProfileClipping: true, profileClipOffset: 0 }))
    setProfilePicking(false)
    setMeasurementMode('off')
    setSelectedStations([])
  }, [profilePicking, measurementMode, selectedStations])

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

    const depthInfo = calculateStationDepths(
      cave,
      { x: origX, y: origY, z: altitude },
      { caveCalibrationOffset: opts.caveCalibrationOffset, surfaceOffset: opts.surfaceOffset }
    )

    const sid = `Z${surfNextId.current++}`
    const surfPos = {
      x: origX - cave.centerOffset.x - opts.caveCalibrationOffset.x,
      y: origY - cave.centerOffset.y - opts.caveCalibrationOffset.y,
      z: altitude - cave.centerOffset.z - opts.caveCalibrationOffset.z
    }
    const newSt: SelStation = {
      idx: -1,
      name: sid,
      origX, origY, altitude,
      gps,
      distToSurf: 0,
      surfaceZ: altitude,
      closestSurfDist: 0,
      closestSurfPos: surfPos,
      closestSurfWorld: { x: origX, y: origY, z: altitude },
      closestSurfAltitude: altitude,
      closestHorizontalDist: 0,
      closestSurfGps: gps,
      denivEntrance: depthInfo.denivEntrance,
      refStationName: depthInfo.refStationName,
      refStationType: depthInfo.refStationType,
      entranceAlt: depthInfo.entranceAlt,
      screenX, screenY,
      pos: surfPos,
      centerX: cave.centerOffset?.x || 0, centerY: cave.centerOffset?.y || 0, centerZ: cave.centerOffset?.z || 0
    }
    
    setSurfPointCache(prev => ({ ...prev, [sid]: newSt }))

    setSelectedStations(prev => {
      if (measurementMode === 'off' && !ctrlKey) return [newSt]
      if (measurementMode === 'distance') {
        if (prev.length >= 2) return [prev[0], newSt]
        return [...prev, newSt]
      }
      if (measurementMode === 'polygon') {
        const isDuplicate = prev.some(p => Math.abs(p.origX - newSt.origX) < 0.001 && Math.abs(p.origY - newSt.origY) < 0.001 && Math.abs(p.altitude - newSt.altitude) < 0.001)
        if (isDuplicate) return prev
        return [...prev, newSt]
      }
      return [newSt]
    })
    if (measurementMode === 'off') {
      setShowStationCard(true)
    }
  }, [cave, isMeasuringMode, measurementMode, opts.caveCalibrationOffset, opts.surfaceOffset])

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

    // 3. Prepočítaj VŠETKY stationLabels (georeferencujeme celý model)
    const newStationLabels = cave.stationLabels.map(sl => {
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
    const newSurfaces = cave.surfaces.map(s => ({
      ...s,
      centerOffset: newCenterOffset
    }))

    const updatedCave: ParsedCave = { 
      ...cave, 
      centerOffset: newCenterOffset, 
      stationLabels: newStationLabels,
      surfaces: newSurfaces
    }

    setCave(updatedCave)
    
    // 5. Aktualizácia vybraných staníc pre okamžitú odozvu v UI
    setSelectedStations(prev => prev.map(s => {
      const ox = s.pos.x + newOffsetX
      const oy = s.pos.y + newOffsetY
      const altNew = s.pos.z + newOffsetZ
      const gpsNew = tryJtskToWgs84(ox, oy) || tryUtmToWgs84(ox, oy)
      
      const depthInfo = calculateStationDepths(
        updatedCave,
        { x: ox, y: oy, z: altNew },
        { caveCalibrationOffset: opts.caveCalibrationOffset, surfaceOffset: opts.surfaceOffset }
      )

      const closestPosCentered = depthInfo.closestSurfWorld ? {
        x: depthInfo.closestSurfWorld.x - newOffsetX,
        y: depthInfo.closestSurfWorld.y - newOffsetY,
        z: depthInfo.closestSurfWorld.z - newOffsetZ,
      } : null

      const closestGps = depthInfo.closestSurfWorld ? (
        worldToWgs84(depthInfo.closestSurfWorld.x, depthInfo.closestSurfWorld.y, { x: ox, y: oy, gps: gpsNew || undefined })
      ) : null

      return { 
        ...s, 
        origX: ox, 
        origY: oy, 
        altitude: altNew, 
        gps: gpsNew || null,
        distToSurf: depthInfo.distToSurf,
        surfaceZ: depthInfo.surfaceZ,
        closestSurfDist: depthInfo.closestSurfDist,
        closestSurfPos: closestPosCentered,
        closestSurfWorld: depthInfo.closestSurfWorld,
        closestSurfAltitude: depthInfo.closestSurfAltitude,
        closestHorizontalDist: depthInfo.closestHorizontalDist,
        closestSurfGps: closestGps,
        denivEntrance: depthInfo.denivEntrance,
        refStationName: depthInfo.refStationName,
        refStationType: depthInfo.refStationType,
        entranceAlt: depthInfo.entranceAlt,
        centerX: newOffsetX,
        centerY: newOffsetY,
        centerZ: newOffsetZ
      }
    }))
  }, [cave, selectedStations, opts.caveCalibrationOffset, opts.surfaceOffset])

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

    const depthInfo = calculateStationDepths(
      cave,
      { x: origX, y: origY, z: altitude },
      { caveCalibrationOffset: opts.caveCalibrationOffset, surfaceOffset: opts.surfaceOffset }
    )

    const closestPosCentered = depthInfo.closestSurfWorld ? {
      x: depthInfo.closestSurfWorld.x - (cave.centerOffset?.x || 0),
      y: depthInfo.closestSurfWorld.y - (cave.centerOffset?.y || 0),
      z: depthInfo.closestSurfWorld.z - (cave.centerOffset?.z || 0),
    } : null

    const closestGps = depthInfo.closestSurfWorld ? (
      worldToWgs84(depthInfo.closestSurfWorld.x, depthInfo.closestSurfWorld.y, { x: origX, y: origY, gps: gps || undefined })
    ) : null

    return { 
      idx, name: sl.name, origX, origY, altitude, gps,
      distToSurf: depthInfo.distToSurf,
      surfaceZ: depthInfo.surfaceZ,
      closestSurfDist: depthInfo.closestSurfDist,
      closestSurfPos: closestPosCentered,
      closestSurfWorld: depthInfo.closestSurfWorld,
      closestSurfAltitude: depthInfo.closestSurfAltitude,
      closestHorizontalDist: depthInfo.closestHorizontalDist,
      closestSurfGps: closestGps,
      denivEntrance: depthInfo.denivEntrance,
      refStationName: depthInfo.refStationName,
      refStationType: depthInfo.refStationType,
      entranceAlt: depthInfo.entranceAlt,
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
    if (appState !== 'welcome' && appState !== 'error') return
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
  }, [appState])

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
    const isPLY = isPlyLidarData(loadedFile?.ext, parsed)
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
        engine: isPLY ? prev.engine : 'v1',
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
    setSelectedStations([])
    setMeasurementMode('off')
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
      setLastLoadedBuffer(buf)
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
      setLastLoadedBuffer(buf) 
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

  const handleDownloadDmr5 = useCallback(async (lat: number, lon: number, extentMeters = 500, heightSystem: 'bpv' | 'etrs89' = 'bpv') => {
    try {
      setIsDmrDownloading(true);
      const bounds = calculateDmr5Bounds(lat, lon, extentMeters);
      setAppStatus({ msg: `Sťahujem výškový model DMR 5.0 (${bounds.width}×${bounds.height} m)...`, type: 'progress' });

      const tifBuffer = await fetchDmr5GeoTiff(bounds.minE, bounds.maxE, bounds.minN, bounds.maxN);

      setAppStatus({ msg: 'Spracovávam DMR 5.0 GeoTIFF a generujem 3D povrch...', type: 'progress' });
      const { surface, tfwText, quasigeoidUndulation } = await createDmr5Surface(tifBuffer, bounds.minE, bounds.maxN, cave, { heightSystem });

      setCave((prev: ParsedCave | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          surfaces: [surface],
          hasSurface: true,
        };
      });

      setOpts(prev => ({
        ...prev,
        showSurfaceMesh: true,
        showSurfaceNetwork: false,
      }));

      const sysSuffix = heightSystem === 'bpv' ? 'bpv' : 'etrs89';
      const filename = `dmr5_${lat.toFixed(4)}_${lon.toFixed(4)}_${extentMeters}m_${sysSuffix}`;
      setLastDownloadedDmr({
        tifBuffer,
        tfwText,
        filename,
        minZ: surface.bounds?.minZ || 0,
        maxZ: surface.bounds?.maxZ || 0,
        width: bounds.width,
        height: bounds.height,
        heightSystem,
        quasigeoidUndulation,
      });

      const sysText = heightSystem === 'bpv'
        ? `Bpv m n.m. (-${quasigeoidUndulation.toFixed(1)} m kvázigeoid)`
        : 'ETRS89 elipsoidické';
      setAppStatus({
        msg: `DMR 5.0 úspešne načítaný (${bounds.width}×${bounds.height} m, ${(surface.bounds?.minZ || 0).toFixed(1)} – ${(surface.bounds?.maxZ || 0).toFixed(1)} m n.m., ${sysText})`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('[DMR5] Download error:', err);
      setAppStatus({
        msg: `Chyba pri sťahovaní DMR 5.0: ${err?.message || String(err)}`,
        type: 'error',
      });
    } finally {
      setIsDmrDownloading(false);
    }
  }, [cave]);

  const handleSaveDmrFiles = useCallback(() => {
    if (!lastDownloadedDmr) return;
    downloadDmrFiles(lastDownloadedDmr.tifBuffer, lastDownloadedDmr.tfwText, lastDownloadedDmr.filename);
  }, [lastDownloadedDmr]);

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
    if (!p.has('terrain') && !p.has('theme') && !p.has('sdf') && !p.has('scraps')) return // no state encoded, skip

    const terrain = p.get('terrain')
    const labelMode = p.get('labels')
    const stationLabelMode = labelMode === 'off' || labelMode === 'short' || labelMode === 'full' || labelMode === 'altitude' || labelMode === 'gps' ? labelMode : undefined
    setOpts(prev => ({
      ...prev,
      // Engine & Projection
      engine:              (p.get('eng') === 'v2' && loadedFile?.ext?.toLowerCase() === '.ply') ? 'v2' : (loadedFile?.ext?.toLowerCase() === '.ply' ? prev.engine : 'v1'),
      cameraProjection:    p.get('proj') === 'ortho' ? 'orthographic' : prev.cameraProjection,
      // Advanced toggles
      enableScrapsBatching: p.has('batch') ? p.get('batch') !== '0' : prev.enableScrapsBatching,
      enableEDL:           p.has('edl') ? p.get('edl') !== '0' : prev.enableEDL,
      // Splay SDF Walls (2D) & parameters
      enableSplayWalls:    p.get('sdf') === '1',
      splaySmoothK:        p.has('smin') ? parseFloat(p.get('smin')!) : prev.splaySmoothK,
      splayCapsuleRadius:  p.has('srad') ? parseFloat(p.get('srad')!) : prev.splayCapsuleRadius,
      splayVoxelSize:      p.has('svox') ? parseFloat(p.get('svox')!) : prev.splayVoxelSize,
      splayAltitude:       p.has('salt') ? p.get('salt') === '1' : (prev.splayAltitude ?? true),
      // Theme
      ...(p.get('theme') ? (() => { const th = p.get('theme') as keyof typeof THEMES; return THEMES[th] ?? {} })() : {}),
      // Terrain surface
      showSurfaceMesh:     terrain === 'shaded',
      showSurfaceNetwork:  terrain === 'network',
      showSurfaceTexture:  terrain === 'texture',
      surfaceTextureSource: (p.get('tsrc') as any) || prev.surfaceTextureSource,
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
      showCenterline:      p.get('cline') !== '0',
      showTraverse:        p.get('trvrs') !== '0',
      traverseAltitude:    p.get('talt') === '1',
      traverseRadius:      p.has('tradius') ? parseFloat(p.get('tradius')!) : prev.traverseRadius,
      showSplay:           p.get('splay') === '1',
      colorTraverse:       p.get('ctrvrs') ? '#' + p.get('ctrvrs') : prev.colorTraverse,
      colorSplay:          p.get('csplay') ? '#' + p.get('csplay') : prev.colorSplay,
      // Stations
      showFixedStations:   p.get('fixed') === '1',
      stationLabelMode,
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
      // Auto-rotation
      autoRotate:          p.get('rot') === '1',
      autoRotateSpeed:     p.has('rotspd') ? parseFloat(p.get('rotspd')!) : prev.autoRotateSpeed,
    }))
  }, [appState, loadedFile?.ext])

  // ── State → URL encoder ──────────────────────────────────────────────────────
  const encodeState = (o: ViewerOptions, modelParam: string): URLSearchParams => {
    const p = new URLSearchParams()
    p.set('model', modelParam)
    p.set('embed', 'true')
    // Engine & Projection
    if (o.engine === 'v2' && isPlyLidar) p.set('eng', 'v2')
    if (o.cameraProjection === 'orthographic') p.set('proj', 'ortho')
    // Advanced rendering
    if (o.enableScrapsBatching === false) p.set('batch', '0')
    if (o.enableEDL === false) p.set('edl', '0')
    // Splay SDF Walls (2D) & Parameters
    if (o.enableSplayWalls) {
      p.set('sdf', '1')
      if (o.splayAltitude === false) p.set('salt', '0')
      if (o.splaySmoothK !== undefined && o.splaySmoothK !== 0.06) p.set('smin', String(o.splaySmoothK))
      if (o.splayCapsuleRadius !== undefined && o.splayCapsuleRadius !== 0.10) p.set('srad', String(o.splayCapsuleRadius))
      if (o.splayVoxelSize !== undefined && o.splayVoxelSize !== 0.22) p.set('svox', String(o.splayVoxelSize))
    }
    // Theme
    p.set('theme', currentTheme)
    // Terrain
    const terrain = o.showSurfaceTexture ? 'texture' : o.showSurfaceNetwork ? 'network' : 'shaded'
    p.set('terrain', terrain)
    if (o.surfaceTextureSource && o.surfaceTextureSource !== 'custom') p.set('tsrc', o.surfaceTextureSource)
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
    if (o.scrapsOpacity !== 1.0) p.set('scrop', String(o.scrapsOpacity))
    if (o.scrapsRelief !== 0.35) p.set('srelief', String(o.scrapsRelief))
    if (o.scrapsViewMode !== 'all') p.set('sview', o.scrapsViewMode)
    if (o.scrapsHeightThreshold !== 0.1) p.set('sth', String(o.scrapsHeightThreshold))
    if (o.scrapsAngleThreshold !== 0.0) p.set('sang', String(o.scrapsAngleThreshold))
    if (o.scrapsSectionWidth !== 0.08) p.set('swidth', String(o.scrapsSectionWidth))
    if (o.renderOpacity !== 1.0) p.set('rop', String(o.renderOpacity))
    if (o.colorScraps !== '#2a5585') p.set('cscraps', o.colorScraps.replace('#', ''))
    if (o.colorScrapsWire !== '#6a9fd8') p.set('cswire', o.colorScrapsWire.replace('#', ''))
    // Survey
    if (o.showCenterline === false) p.set('cline', '0')
    if (!o.showTraverse) p.set('trvrs', '0')
    if (o.traverseAltitude) p.set('talt', '1')
    if (o.traverseRadius !== 0.3) p.set('tradius', String(o.traverseRadius))
    if (o.showSplay) p.set('splay', '1')
    if (o.colorTraverse !== '#ffffff') p.set('ctrvrs', o.colorTraverse.replace('#', ''))
    if (o.colorSplay !== '#78909c') p.set('csplay', o.colorSplay.replace('#', ''))
    // Stations
    if (o.showFixedStations) p.set('fixed', '1')
    if (o.stationLabelMode) p.set('labels', o.stationLabelMode)
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
    if (o.colorBackground !== '#103258') p.set('bg', o.colorBackground.replace('#', ''))
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
      await loadGoogleIdentity()
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
    // Started here, not on the upload click: see loadGoogleIdentity.
    if (GOOGLE_CLIENT_ID) loadGoogleIdentity().catch(() => { /* reported when the upload is tried */ })
    const params = new URLSearchParams(window.location.search)
    const currentModel = params.get('model') || `/${loadedFile?.name ?? ''}`
    setCustomShareUrl(currentModel)
    setUrlValidationStatus('idle')
    setUrlValidationError(null)
    setShareDialogOpen(true)
  }

  const toggleOpt = (key: keyof ViewerOptions) =>
    setOpts(prev => ({ ...prev, [key]: !prev[key], ...(['showStationNames', 'showStationAlt'].includes(key) ? { stationLabelMode: undefined } : {}) }))

  // Compute stats for Legend
  const legendCave = useMemo(() => {
    if (!cave || (!opts.scrapsAltitude && !opts.traverseAltitude && !(opts.splayAltitude && opts.enableSplayWalls))) return null
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

  const handleProcessingEnd = useCallback(() => setProcessingInfo(null), [])
  const handleTextureReady = useCallback((dataUrl: string, bbox: string) => setDownloadableTexture({ dataUrl, bbox }), [])
  const handleSurfaceOffsetChange = useCallback((offset: Vec3) => setOpts(prev => ({ ...prev, surfaceOffset: offset })), [])
  const manualConnectionMemo = useMemo(() => {
    if (selectedStations.length !== 2 || !selectedStations[0] || !selectedStations[1] || !cave) return null
    return {
      p1: selectedStations[0].pos,
      p2: selectedStations[1].pos,
    }
  }, [selectedStations, cave])

  // ── RENDER ──────────────────────────────────────────────────────────────────
  const navigationBindings = cave ? {
    t,
    lang,
    isPlyLidar,
    loadedFile,
    cave,
    handleExportScreenshot,
    isEmbedMode,
    openShareDialog,
    opts,
    toggleOpt,
    setOpts,
    isRecording,
    setIsRecording,
    setActiveViewPreset,
    activeViewPreset,
    setFitTrigger,
    splayCount,
    appStatus,
    setAppStatus,
    lidarEditMode,
    setLidarEditMode,
    lidarEditBusy,
    lidarBrushSize,
    setLidarBrushSize,
    lidarKeepSelectionCount,
    applyLidarKeepSelection,
    clearLidarKeepSelection,
    undoLidarEdit,
    lidarUndoCaveRef,
    resetLidarEdits,
    lidarOriginalCaveRef,
    lidarEditRemovedCount,
    contourLevels,
    trackObjectUrl,
    clearSurfaceTextureUrl,
    textureDownloadInfo,
    handleClearTileCache,
    textureFileInputRef,
    shiftTexture,
    calibFileInputRef,
    handleCalibFile,
    handleTextureFile,
    shiftCave,
    tiffFileInputRef,
    handleTiffFile,
    tfwFileInputRef,
    activeProfilePoints,
    profilePicking,
    startProfilePick,
    setProfileClipping,
    measurementMode,
    cycleMeasurementMode,
    selectedStations,
    setSelectedStations,
    isLiDARAnalyzing,
    cancelLiDARAnalysis,
    runLiDARAnalysis,
    isLidarMapGenerating,
    cancelLidarPlanMap,
    generateLidarPlanMap,
    anomalies,
    setActiveAnomalyId,
    activeAnomalyId,
    selectedSegmentProfile,
    toggleFullscreen,
    applyTheme,
    currentTheme,
    setLang,
    setHelpDialogOpen,
    handleFile,
    loadFromUrl,
    handleReset,
    downloadableTexture,
    downloadGeneratedTexture,
    handleDownloadDmr5,
    isDmrDownloading,
    lastDownloadedDmr,
    handleSaveDmrFiles,
  } satisfies NavigationBindings : null

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
        :root {
          --cv-bg: #0b0f17;
          --cv-surface: #0f131c;
          --cv-surface-low: #181c24;
          --cv-surface-card: #1c2028;
          --cv-surface-high: #262a33;
          --cv-surface-highest: #31353e;
          --cv-text: #dfe2ee;
          --cv-text-muted: #94a3b8;
          --cv-primary: #00d2ff;
          --cv-primary-dim: #a5e7ff;
          --cv-secondary: #10b981;
          --cv-border: rgba(255, 255, 255, 0.08);
          --cv-border-strong: #334155;
          --cv-font-sans: 'Inter', system-ui, -apple-system, sans-serif;
          --cv-font-mono: 'JetBrains Mono', monospace;
        }

        .theme-light {
          --cv-bg: #f7f3eb;
          --cv-surface: #ffffff;
          --cv-surface-low: #f2ece2;
          --cv-surface-card: #ffffff;
          --cv-surface-high: #e8ded0;
          --cv-surface-highest: #d9cdbd;
          --cv-text: #1c1917;
          --cv-text-muted: #78716c;
          --cv-primary: #0284c7;
          --cv-primary-dim: #0369a1;
          --cv-secondary: #059669;
          --cv-border: rgba(60, 45, 30, 0.12);
          --cv-border-strong: #d5c4ad;
        }

        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:var(--cv-font-sans);background:var(--cv-bg);color:var(--cv-text);overflow:hidden}
        .bg-canvas{position:fixed;inset:0;pointer-events:none;z-index:0}

        .cad-card{background:var(--cv-surface-card);border:1px solid var(--cv-border);border-radius:8px;padding:.75rem;box-shadow:0 2px 8px rgba(0,0,0,.25)}
        .theme-light .cad-card{background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.06)}
        .cad-metric-box{background:var(--cv-surface-low);border:1px solid var(--cv-border);border-radius:6px;padding:.35rem .5rem;text-align:center}
        .theme-light .cad-metric-box{background:#f8fafc}
        .cad-metric-label{display:block;font-size:9px;font-family:var(--cv-font-mono);text-transform:uppercase;letter-spacing:.05em;color:var(--cv-text-muted)}
        .cad-metric-val{font-size:12px;font-weight:700;font-family:var(--cv-font-mono);font-variant-numeric:tabular-nums;color:var(--cv-primary)}

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
        .changelog-badge { font-size: 8px; background: #1d4ed8; color: white; padding: 2px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing:.08em; }
        .changelog-list { list-style: none; padding: 0; margin: 0; }
        .changelog-item { font-size: 11.5px; color: #94a3b8; margin-bottom: 0.7rem; line-height: 1.6; display: flex; gap: 10px; }
        .changelog-item:before { content: "→"; color: #6366f1; flex-shrink: 0; font-weight: bold; }
        .changelog-group { font-size: 9px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin: 1rem 0 0.5rem 0; letter-spacing: 0.1em; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 3px; display: inline-block; }
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
        .viewer-shell{width:100vw;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:var(--cv-bg);color:var(--cv-text)}
        .topbar{height:48px;background:rgba(15,19,28,0.92);border-bottom:1px solid var(--cv-border);display:flex;align-items:center;gap:0.85rem;padding:0 1.1rem;flex-shrink:0;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
        .theme-light .topbar{background:rgba(255,255,255,0.94);border-bottom:1px solid var(--cv-border)}
        .tb-logo{font-size:1rem;font-weight:800;color:var(--cv-primary);white-space:nowrap;letter-spacing:-0.02em}
        .tb-file{font-size:.77rem;color:var(--cv-text);background:var(--cv-surface-low);padding:.25rem .65rem;border-radius:6px;border:1px solid var(--cv-border);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--cv-font-mono)}
        .tb-badge{font-size:.7rem;font-weight:700;font-family:var(--cv-font-mono);padding:.2rem .5rem;border-radius:4px;background:rgba(0,210,255,0.12);color:var(--cv-primary);border:1px solid rgba(0,210,255,0.25)}
        .tb-space{flex:1; display: flex; align-items: center; justify-content: center;}
        .status-bar { display: flex; align-items: center; gap: 10px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 2px 10px; max-width: 500px; min-width: 200px; height: 30px; margin: 0 10px; transition: all 0.3s ease; overflow: hidden; }
        .status-msg { font-size: 11px; font-weight: 600; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; display: flex; align-items: center; gap: 6px; }
        .status-msg .material-symbols-outlined { font-size: 14px; }
        .status-progress-bg { width: 80px; height: 5px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
        .status-progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #818cf8); box-shadow: 0 0 8px rgba(59, 130, 246, 0.5); transition: width 0.3s ease; }
        .status-error { color: #fca5a5 !important; border-color: rgba(239, 68, 68, 0.3) !important; background: rgba(239, 68, 68, 0.1) !important; }
        .status-success { color: #6ee7b7 !important; border-color: rgba(16, 185, 129, 0.3) !important; background: rgba(16, 185, 129, 0.1) !important; }
        .status-progress { color: #93c5fd !important; }
        .tb-stat{font-size:.75rem;color:var(--cv-text-muted);font-family:var(--cv-font-mono);font-variant-numeric:tabular-nums}
        .btn-back{display:flex;align-items:center;gap:.4rem;background:var(--cv-surface-low);border:1px solid var(--cv-border);color:var(--cv-text);border-radius:6px;padding:.38rem .75rem;font-size:.78rem;font-weight:500;cursor:pointer;font-family:inherit;transition:all .18s;white-space:nowrap}
        .btn-back:hover{background:var(--cv-surface-high);border-color:var(--cv-primary);color:#fff}

        .viewer-body{flex:1;display:flex;overflow:hidden;position:relative}
        .canvas-wrap{flex:1;position:relative;min-width:0}

        /* Sidebar */
        .sidebar-container { display: flex; flex-shrink: 0; z-index: 100; height: 100%; max-height: 100%; overflow: hidden; }
        .sidebar{width:320px;background:var(--cv-surface);border-left:1px solid var(--cv-border);display:flex;flex-direction:column;height:100%;max-height:100%;flex-shrink:0;overflow:hidden;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
        .theme-light .sidebar{background:var(--cv-surface);border-left:1px solid var(--cv-border);color:var(--cv-text)}
        .sidebar-pinned-header{flex-shrink:0;position:sticky;top:0;background:var(--cv-surface);border-bottom:1px solid var(--cv-border);padding:0.85rem 1rem 0.65rem;display:flex;flex-direction:column;gap:0.65rem;z-index:50}
        .sidebar-dataset-banner{display:flex;flex-direction:column;gap:0.45rem}
        .sidebar-dataset-top{display:flex;align-items:center;justify-content:space-between}
        .sidebar-dataset-title{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--cv-text-muted)}
        .sidebar-close-btn{background:transparent;border:1px solid transparent;color:var(--cv-text-muted);cursor:pointer;border-radius:4px;padding:2px 4px;display:flex;align-items:center;justify-content:center;transition:all .15s ease}
        .sidebar-close-btn:hover{background:var(--cv-surface-high);color:var(--cv-text);border-color:var(--cv-border)}
        .sidebar-dataset-grid{display:grid;gap:6px}
        .sidebar-stat-card{background:var(--cv-surface-card);border:1px solid var(--cv-border);border-radius:6px;padding:5px 4px;text-align:center}
        .sidebar-stat-label{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:0.04em;color:var(--cv-text-muted);font-family:var(--cv-font-mono)}
        .sidebar-stat-val{display:block;font-size:11.5px;font-weight:700;color:var(--cv-text);font-family:var(--cv-font-mono);font-variant-numeric:tabular-nums;margin-top:1px}
        .sidebar-stat-val.accent{color:var(--cv-primary)}
        .sidebar-tab-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:var(--cv-surface-low);border:1px solid var(--cv-border);padding:3px;border-radius:8px}
        .sidebar-tab-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 4px;border-radius:6px;border:none;background:transparent;color:var(--cv-text-muted);font-size:10px;font-weight:600;cursor:pointer;transition:all .15s ease}
        .sidebar-tab-btn:hover{color:var(--cv-text);background:rgba(255,255,255,0.04)}
        .theme-light .sidebar-tab-btn:hover{background:rgba(0,0,0,0.04)}
        .sidebar-tab-btn.active{background:var(--cv-surface-card);color:var(--cv-primary);font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.2);border:1px solid var(--cv-border)}
        .theme-light .sidebar-tab-btn.active{box-shadow:0 1px 4px rgba(15,23,42,0.08)}
        .sidebar-scrollable-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0.85rem 1rem 2.5rem;display:flex;flex-direction:column;gap:0.75rem}
        .sidebar-scrollable-body::-webkit-scrollbar{width:5px}
        .sidebar-scrollable-body::-webkit-scrollbar-track{background:transparent}
        .sidebar-scrollable-body::-webkit-scrollbar-thumb{background:var(--cv-border);border-radius:10px}
        .sidebar-scrollable-body::-webkit-scrollbar-thumb:hover{background:var(--cv-primary)}

        /* Unified CAD Card Styles */
        .cad-card{background:var(--cv-surface-card);border:1px solid var(--cv-border);border-radius:8px;padding:11px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.12);transition:border-color .18s ease,box-shadow .18s ease}
        .theme-light .cad-card{background:#ffffff;border-color:rgba(60,45,30,0.12);box-shadow:0 1px 3px rgba(60,45,30,0.06),0 4px 12px rgba(60,45,30,0.04)}
        .cad-card:hover{border-color:rgba(0,210,255,0.22)}
        .theme-light .cad-card:hover{border-color:rgba(2,132,199,0.35)}
        .cad-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .cad-card-title{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--cv-text)}
        .cad-card-title .material-symbols-outlined{font-size:16px;color:var(--cv-primary)}
        .cad-subcard{background:var(--cv-surface-low);border:1px solid var(--cv-border);border-radius:6px;padding:8px 10px;margin-top:8px}
        .theme-light .cad-subcard{background:#f5efe6;border-color:#dfd5c6}
        .theme-light .sidebar-stat-card{background:#f5efe6;border-color:#dfd5c6}
        .cad-control-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;color:var(--cv-text);margin-bottom:5px}
        .cad-control-label{font-size:11px;color:var(--cv-text);font-weight:600;display:flex;align-items:center;gap:6px}
        .cad-control-value{font-family:var(--cv-font-mono);font-size:11px;font-weight:700;color:var(--cv-primary);font-variant-numeric:tabular-nums}
        .cad-slider{width:100%;height:4px;background:var(--cv-surface-high);border-radius:4px;appearance:none;-webkit-appearance:none;cursor:pointer;accent-color:var(--cv-primary)}
        .theme-light .cad-slider{background:#d5c4ad}
        .cad-slider::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--cv-primary);cursor:pointer;box-shadow:0 0 6px var(--cv-primary-glow)}
        .cad-tool-btn{background:var(--cv-surface-low);border:1px solid var(--cv-border);color:var(--cv-text-muted);padding:5px 8px;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s ease}
        .cad-tool-btn:hover{background:var(--cv-surface-high);color:var(--cv-text);border-color:rgba(0,210,255,0.3)}
        .cad-tool-btn.active{background:rgba(0,210,255,0.16);border-color:var(--cv-primary);color:var(--cv-primary);font-weight:700}
        .theme-light .cad-tool-btn.active{background:rgba(2,132,199,0.12);border-color:var(--cv-primary);color:var(--cv-primary)}
        .cad-select{background:var(--cv-surface-high);color:var(--cv-text);border:1px solid var(--cv-border);border-radius:4px;font-size:10px;padding:3px 6px;outline:none;font-family:inherit}
        .theme-light .cad-select{background:#fff;border-color:var(--cv-border);color:var(--cv-text)}
        .btn-mini{background:var(--cv-surface-low);border:1px solid var(--cv-border);color:var(--cv-text);border-radius:4px;padding:3px 7px;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s ease;display:inline-flex;align-items:center;justify-content:center;gap:3px}
        .btn-mini:hover{background:var(--cv-surface-high);color:var(--cv-primary);border-color:var(--cv-primary)}
        .btn-mini.active{background:rgba(0,210,255,0.16);border-color:var(--cv-primary);color:var(--cv-primary);font-weight:700}
        .theme-light .btn-mini.active{background:rgba(2,132,199,0.12);border-color:var(--cv-primary);color:var(--cv-primary)}

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
        .sidebar::-webkit-scrollbar-thumb{background:rgba(0,210,255,0.25);border-radius:10px}
        .sidebar::-webkit-scrollbar-thumb:hover{background:rgba(0,210,255,0.45)}
        .s-label{font-size:.6875rem;font-weight:700;font-family:var(--cv-font-mono);color:var(--cv-text);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem;margin-top:1.1rem;border-left:3px solid var(--cv-primary);padding-left:8px;display:flex;align-items:center;background:rgba(0,210,255,0.04);padding-top:3px;padding-bottom:3px;border-radius:0 4px 4px 0}
        .theme-light .s-label{color:#0f172a;background:rgba(2,132,199,0.06);border-left-color:var(--cv-primary)}
        .s-label:first-of-type { margin-top: 0.3rem; }
        .info-row{display:flex;justify-content:space-between;font-size:.75rem;padding:.32rem 0;border-bottom:1px solid var(--cv-border);color:var(--cv-text-muted);font-family:var(--cv-font-sans)}
        .info-val{color:var(--cv-primary);font-weight:600;font-family:var(--cv-font-mono);font-variant-numeric:tabular-nums}

        .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--cv-border)}
        .toggle-label{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--cv-text);cursor:pointer}
        .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .switch{width:32px;height:16px;padding:0;appearance:none;background:var(--cv-surface-high);border-radius:9999px;position:relative;cursor:pointer;transition:all .2s cubic-bezier(0.16,1,0.3,1);border:1px solid var(--cv-border);flex-shrink:0}
        .switch:focus-visible{outline:2px solid var(--cv-primary);outline-offset:3px}
        .switch.on{background:var(--cv-primary);border-color:var(--cv-primary);box-shadow:0 0 8px rgba(0,210,255,0.35)}
        .switch::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .2s cubic-bezier(0.16,1,0.3,1);box-shadow:0 1px 3px rgba(0,0,0,.4)}
        .switch.on::after{transform:translateX(16px)}

        .slider-row{padding:.45rem 0;border-bottom:1px solid var(--cv-border)}
        .slider-top{display:flex;justify-content:space-between;font-size:.76rem;color:var(--cv-text-muted);margin-bottom:.3rem}
        .slider-val{color:var(--cv-primary);font-weight:600;font-family:var(--cv-font-mono);font-variant-numeric:tabular-nums}
        input[type=range]{width:100%;height:4px;-webkit-appearance:none;background:var(--cv-surface-high);border-radius:9999px;outline:none;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--cv-primary);cursor:pointer;box-shadow:0 0 8px rgba(0,210,255,0.45);transition:transform .1s}
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.15)}

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

        @media (max-width: 768px) {
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
          .mobile-drawer-header { display: block !important; }
        }
        .show-mobile-flex { display: none; }
        .mobile-drawer-header { display: none; }
      `}</style>

      <canvas ref={canvasRef} className="bg-canvas" style={{ background: opts.colorBackground2 ? `linear-gradient(to bottom, ${opts.colorBackground}, ${opts.colorBackground2})` : opts.colorBackground }} />

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
                <input ref={fileInputRef} type="file" aria-label={t('welcome.selectFile')} accept=".lox,.3d,.plt,.ply,.stl" onChange={e => {
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

                {/* User Guide / Help button on welcome screen */}
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <button
                    onClick={() => setHelpDialogOpen(true)}
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#60a5fa',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s'
                    }}
                    type="button"
                  >
                    <span>📖</span>
                    <span>{lang === 'sk' ? 'Otvoriť používateľskú príručku (Návod)' : 'Open User Guide & Documentation'}</span>
                  </button>
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
          <div className={`viewer-shell theme-${currentTheme}`}>
            {/* Top bar — hidden in embed mode */}
            {!isEmbedMode && (
            <div className="topbar" style={{ position: 'relative', zIndex: 110 }}>
              {/* Brand Logo LOCH 3D with radar icon */}
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                title={lang === 'sk' ? 'LochViewer 3D' : 'LochViewer 3D'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--cv-primary)' }}>radar</span>
                <span className="tb-logo" style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.02em' }}>LOCH 3D</span>
              </div>

              {/* Active Dataset Pill */}
              <div className="hide-mobile-flex" style={{
                alignItems: 'center',
                gap: '6px',
                background: 'var(--cv-surface-low)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid var(--cv-border)',
                flexShrink: 0
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px rgba(16,185,129,0.7)' }} />
                <span style={{ fontSize: '11px', fontFamily: 'var(--cv-font-mono)', fontWeight: 600, color: 'var(--cv-text)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={loadedFile?.name}>
                  {loadedFile?.name}
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--cv-font-mono)', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(0,210,255,0.12)', color: 'var(--cv-primary)' }}>
                  {loadedFile?.ext?.replace('.', '')?.toUpperCase()}
                </span>
                <MemoizedStatusBadge isMoving={isModelMoving} />
              </div>

              {navigationBindings && <ViewerToolbar bindings={navigationBindings}
                onOpen={() => fileInputRef.current?.click()}
                canReload={Boolean(lastLoadedBuffer && loadedFile)}
                onReload={() => {
                  if (lastLoadedBuffer && loadedFile) void handleFile(new File([lastLoadedBuffer], loadedFile.name))
                }} />}
              <input hidden ref={fileInputRef} type="file" accept=".lox,.3d,.plt,.ply,.stl"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ''
                }} />
              {/* Hairline divider */}
              <div className="hide-mobile" style={{ width: '1px', height: '18px', background: 'var(--cv-border)', margin: '0 2px', flexShrink: 0 }} />

              {/* Status / Message Center */}
              <div className="tb-space" style={{ position: 'absolute', top: 54, right: 12, maxWidth: 'min(500px, 80vw)', zIndex: 110 }}>
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
                <div className="recording-status hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(239, 68, 68, 0.15)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(239, 68, 68, 0.3)', marginRight: '8px' }}>
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
                    {opts.engine === 'v1' || !isPlyLidar ? (
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
                        onProcessingEnd={handleProcessingEnd}
                        onStatusChange={setAppStatus}
                        onTextureReady={handleTextureReady}
                        onTextureDownloadInfo={setTextureDownloadInfo}
                        fitTrigger={fitTrigger}
                        selectedStations={selectedStations}
                        activeProfilePoints={activeProfilePoints}
                        isMeasuringMode={isMeasuringMode}
                        manualConnection={manualConnectionMemo}
                        lang={lang}
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
                        onSurfaceOffsetChange={handleSurfaceOffsetChange}
                        lang={lang}
                      />
                    )}
	                  </ErrorBoundary>
	                </Suspense>

                {lidarEditMode !== 'off' && isPlyLidar && cave.pointCount > 0 && (
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

                {/* Dedicated Measurement Panel (Distance or Polygon Mode) */}
                {measurementMode !== 'off' && (
                  <MeasurementPanel
                    mode={measurementMode}
                    stations={selectedStations}
                    onDeletePoint={(idx) => setSelectedStations(prev => prev.filter((_, i) => i !== idx))}
                    onClear={() => setSelectedStations([])}
                    onSwap={() => setSelectedStations(prev => [...prev].reverse())}
                    onModeChange={mode => { setMeasurementMode(mode); setSelectedStations([]); setOpts(p => ({ ...p, autoRotate: false })) }}
                    onClose={() => {
                      setMeasurementMode('off')
                      setSelectedStations([])
                    }}
                    onSetProfile={(sts) => {
                      setActiveProfilePoints([...sts])
                      setOpts(p => ({ ...p, showProfileClipping: true, profileClipOffset: 0 }))
                    }}
                    lang={lang}
                    baseAltitude={baseAltitude}
                    altitudeMode={opts.altitudeMode}
                  />
                )}

                {/* Station detail card overlay (Single Station Inspection) */}
                {measurementMode === 'off' && selectedStations.length > 0 && showStationCard && (
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
                      onDownloadDmr={handleDownloadDmr5}
                      t={t}
                      lang={lang}
                      baseAltitude={baseAltitude}
                      altitudeMode={opts.altitudeMode}
                    />
                )}

                {/* ─── Speleo Compass Rose (Severka & Azimuth) ─── */}
                <div style={{ position: 'absolute', top: isEmbedMode ? '50px' : '18px', left: '18px', zIndex: 30, transition: 'top 0.25s ease, left 0.25s ease' }}>
                  <CompassRose
                    cameraData={cameraData}
                    lang={lang}
                    size={54}
                    onResetNorth={() => window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))}
                  />
                </div>

                {/* ─── Floating Z-Slice Overlay Slider ─── */}
                <FloatingClippingSlider
                  cave={cave}
                  opts={opts}
                  setOpts={setOpts}
                  lang={lang}
                  onClose={() => setOpts(p => ({ ...p, showClipping: false }))}
                />
              </div>

              {/* Floating reopen button on right edge when sidebar is closed */}
              {(!isEmbedMode || embedAllowSidebar) && navigationBindings && (
    <NavigationSidebar lang={lang} sections={{
      project: <ProjectSection bindings={navigationBindings} />,
      view: <ViewSection bindings={navigationBindings} />,
      cave: <LayersSection bindings={navigationBindings} />,
      surface: <SurfaceSection bindings={navigationBindings} />,
      analysis: <AnalysisSection bindings={navigationBindings} />,
      system: <SystemSection bindings={navigationBindings} />,
    }} />
  )}
            <ScaleBar cameraData={cameraData} />
            <ColorScaleLegend 
              caveLegend={legendCave} 
              surfLegend={legendSurf} 
              lang={lang} 
              baseAltitude={baseAltitude}
              altitudeMode={opts.altitudeMode}
            />
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
              <button type="button" className={`switch${allowSidebarInEmbed ? ' on' : ''}`}
                onClick={() => setAllowSidebarInEmbed(p => !p)} role="switch"
                aria-checked={allowSidebarInEmbed} aria-label={lang === 'sk' ? 'Zobraziť sidebar návštevníkom' : 'Show sidebar to visitors'} />
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

      {/* ── HELP / USER GUIDE MODAL ── */}
      {helpDialogOpen && (
        <Suspense fallback={null}>
          <HelpModal
            isOpen={helpDialogOpen}
            onClose={() => setHelpDialogOpen(false)}
            initialLang={lang}
          />
        </Suspense>
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
        <div style={{ position: 'fixed', bottom: '10px', right: '12px', fontSize: '10px', opacity: 0.75, zIndex: 1000, pointerEvents: 'auto' }}>
          <a href="/privacy.html" style={{ color: '#e2e8f0', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      )}
    </>
  )
}
