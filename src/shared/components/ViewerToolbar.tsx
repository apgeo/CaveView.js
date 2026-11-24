import { memo, useRef } from 'react'
import {
  FolderOpen, RotateCw, Camera, Orbit, Box, Map, PanelTop, Scan, DoorOpen,
  MapPin, CircleDot, Tags, Waypoints, Mountain, Layers, ImagePlus, Maximize, Ruler, Radio, Scissors,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NavigationBindings } from './NavigationSidebar/types'
import type { ViewPreset } from '@shared/types'
import { revealInSidebar, type NavCategory } from './NavigationSidebar/reveal'
import './ViewerToolbar.css'

type Bindings = Pick<NavigationBindings,
  't' | 'cave' | 'opts' | 'setOpts' | 'toggleOpt' | 'setActiveViewPreset' |
  'activeViewPreset' | 'handleExportScreenshot' | 'toggleFullscreen' |
  'measurementMode' | 'cycleMeasurementMode' | 'textureFileInputRef' | 'calibFileInputRef' |
  'profilePicking' | 'startProfilePick' | 'setProfileClipping' | 'lang' | 'setLang'>

function Tool({ label, icon: Icon, action, active, disabled, badge, reveal }: {
  label: string; icon: LucideIcon; action: () => void; active?: boolean; disabled?: boolean; badge?: string
  reveal?: [NavCategory, string]
}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active}
    disabled={disabled} onClick={() => { action(); if (reveal) revealInSidebar(...reveal) }} className="viewer-tool">
    <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
    {badge && <span className="viewer-tool-badge" aria-hidden="true">{badge}</span>}
  </button>
}

export const ViewerToolbar = memo(function ViewerToolbar({ bindings: b, onOpen, onReload, canReload }: {
  bindings: Bindings; onOpen: () => void; onReload: () => void; canReload: boolean
}) {
  const { t, opts, cave, setOpts, toggleOpt } = b
  const surfaceMenu = useRef<HTMLDialogElement>(null)
  const surfaceModes = {
    showSurfaceMesh: opts.showSurfaceMesh, showSurfaceNetwork: opts.showSurfaceNetwork,
    showSurfaceTexture: opts.showSurfaceTexture, showMapboxTerrain: opts.showMapboxTerrain,
    showContours: opts.showContours, showSurfaceMeshWire: opts.showSurfaceMeshWire,
  }
  const wallModes = {
    showScraps: opts.showScraps, accurateScraps: opts.accurateScraps, scrapsWireframe: opts.scrapsWireframe,
    enableSplayWalls: opts.enableSplayWalls, smoothScraps: opts.smoothScraps, showRenderCave: opts.showRenderCave,
  }
  const savedSurface = useRef<typeof surfaceModes | null>(null)
  const savedWalls = useRef<typeof wallModes | null>(null)
  const surfaceActive = Object.values(surfaceModes).some(Boolean)
  const wallsActive = opts.showScraps || opts.accurateScraps || opts.scrapsWireframe || opts.enableSplayWalls || (Boolean(cave.isLiDAR) && opts.smoothScraps)
  const toggleSurface = () => {
    if (surfaceActive) {
      savedSurface.current = surfaceModes
      setOpts(p => ({ ...p, showSurfaceMesh: false, showSurfaceNetwork: false, showSurfaceTexture: false, showMapboxTerrain: false, showContours: false, showSurfaceMeshWire: false }))
    } else {
      setOpts(p => ({ ...p, ...(savedSurface.current ?? (cave.hasSurface ? { showSurfaceMesh: true } : { showMapboxTerrain: true })) }))
    }
  }
  const toggleWalls = () => {
    if (wallsActive) {
      savedWalls.current = wallModes
      setOpts(p => ({ ...p, showScraps: false, accurateScraps: false, scrapsWireframe: false, enableSplayWalls: false, smoothScraps: false, showRenderCave: false }))
    } else {
      setOpts(p => ({ ...p, ...(savedWalls.current ?? { showScraps: true }) }))
    }
  }
  const labelMode = opts.stationLabelMode ?? (opts.showStationNames ? 'full' : opts.showStationAlt ? 'altitude' : 'off')
  const hasGps = cave.stationLabels.some(s => s.gps && Number.isFinite(s.gps.lat) && Number.isFinite(s.gps.lon))
  const modes: NonNullable<typeof opts.stationLabelMode>[] = hasGps
    ? ['off', 'short', 'full', 'altitude', 'gps'] : ['off', 'short', 'full', 'altitude']
  const cycleLabels = () => {
    const mode = modes[(modes.indexOf(labelMode) + 1) % modes.length]
    setOpts(p => ({ ...p, stationLabelMode: mode, showStationNames: ['short', 'full', 'gps'].includes(mode), showStationAlt: mode === 'altitude' }))
  }
  const nextIn = (cycle: ViewPreset[]) => {
    const i = cycle.indexOf(b.activeViewPreset as ViewPreset)
    return cycle[(i + 1) % cycle.length]
  }
  const planCycle: ViewPreset[] = ['top', 'bottom']
  const elevationCycle: ViewPreset[] = ['front', 'east', 'back', 'side']
  const isPlan = planCycle.includes(b.activeViewPreset as ViewPreset)
  const isElevation = elevationCycle.includes(b.activeViewPreset as ViewPreset)
  const viewLabel = (base: string, active: boolean) =>
    active ? `${base}: ${t(`toolbar.view_${b.activeViewPreset}`)}` : base
  const preset = (view: ViewPreset | 'fit') => {
    if (view !== 'fit') setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
    b.setActiveViewPreset(view === 'fit' ? null : view)
    window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view } }))
  }
  const chooseImage = (action: () => void) => { surfaceMenu.current?.close(); action() }
  return <div className="viewer-quick-tools" role="group" aria-label={t('toolbar.title')}>
    <div className="viewer-tool-group">
      <Tool icon={FolderOpen} label={t('navigation.openFile')} action={onOpen} />
      <Tool icon={RotateCw} label={t('toolbar.reload')} action={onReload} disabled={!canReload} />
      <Tool icon={Camera} label={t('navigation.screenshot')} action={b.handleExportScreenshot} />
    </div>
    <div className="viewer-tool-group">
      <Tool icon={Orbit} label={t('navigation.rotation')} active={opts.autoRotate} action={() => toggleOpt('autoRotate')} reveal={['view', 'rotation']} />
      <Tool icon={Box} label={t('toolbar.orthographic')} active={opts.cameraProjection === 'orthographic'}
        action={() => setOpts(p => ({ ...p, cameraProjection: p.cameraProjection === 'orthographic' ? 'perspective' : 'orthographic' }))} reveal={['view', 'views']} />
      <Tool icon={Map} label={viewLabel(t('toolbar.plan'), isPlan)} active={isPlan} action={() => preset(nextIn(planCycle))} reveal={['view', 'views']} />
      <Tool icon={PanelTop} label={viewLabel(t('toolbar.elevation'), isElevation)} active={isElevation} action={() => preset(nextIn(elevationCycle))} reveal={['view', 'views']} />
      <Tool icon={Scan} label={t('navigation.fit')} action={() => preset('fit')} />
    </div>
    <div className="viewer-tool-group">
      <Tool icon={DoorOpen} label={t('stations.entrances')} active={opts.showEntrances}
        disabled={!cave.stationLabels.some(s => s.isEntrance)} action={() => toggleOpt('showEntrances')} reveal={['cave', 'stations']} />
      <Tool icon={MapPin} label={t('toolbar.fixed')} active={opts.showFixedStations ?? false}
        disabled={!cave.stationLabels.some(s => s.isFixed)} action={() => toggleOpt('showFixedStations')} reveal={['cave', 'stations']} />
      <Tool icon={CircleDot} label={t('toolbar.stations')} active={opts.showStations}
        disabled={!cave.stationLabels.some(s => s.name)} action={() => toggleOpt('showStations')} reveal={['cave', 'stations']} />
      <Tool icon={Tags} label={`${t('toolbar.labels')}: ${t(`toolbar.${labelMode}`)}`} active={labelMode !== 'off'}
        disabled={!cave.stationLabels.some(s => s.name)} action={cycleLabels} reveal={['cave', 'stations']}
        badge={labelMode === 'off' ? undefined : ({ short: '1', full: '@', altitude: 'Z', gps: 'G' }[labelMode])} />
    </div>
    <div className="viewer-tool-group">
      <Tool icon={Waypoints} label={t('toolbar.centerline')} active={opts.showCenterline !== false} disabled={!cave.segments.some(s => s.type === 'cave')} action={() => setOpts(p => ({ ...p, showCenterline: p.showCenterline === false }))} reveal={['cave', 'centerline']} />
      <Tool icon={Radio} label={t('toolbar.splays')} active={opts.showSplay} disabled={!cave.segments.some(s => s.type === 'splay')} action={() => toggleOpt('showSplay')} reveal={['cave', 'splays']} />
      <Tool icon={Layers} label={t('toolbar.walls')} active={wallsActive} action={toggleWalls} reveal={['cave', 'walls']} />
      <Tool icon={Mountain} label={t('toolbar.surface')} active={surfaceActive} disabled={!cave.hasSurface && opts.engine !== 'v2'}
        action={toggleSurface} reveal={['surface', 'surface']} />
      <Tool icon={ImagePlus} label={t('toolbar.image')} disabled={!cave.hasSurface}
        action={() => surfaceMenu.current?.showModal()} reveal={['surface', 'surface']} />
    </div>
    <div className="viewer-tool-group">
      <Tool icon={Ruler} label={`${t('navigation.measurement')}: ${t(`navigation.${b.measurementMode === 'polygon' ? 'area' : b.measurementMode}`)}`}
        active={b.measurementMode !== 'off' && !b.profilePicking} action={b.cycleMeasurementMode} reveal={['analysis', 'measurement']} />
      <Tool icon={Scissors} label={t('toolbar.profile')} active={opts.showProfileClipping}
        action={() => opts.showProfileClipping ? b.setProfileClipping(false) : b.startProfilePick()} reveal={['analysis', 'profile']} />
      <Tool icon={Maximize} label={t('navigation.fullscreen')} action={b.toggleFullscreen} />
    </div>
    <div className="viewer-tool-group viewer-language-bar" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px', paddingLeft: '8px' }}>
      {(['sk', 'en', 'de', 'fr'] as const).map(l => (
        <button
          key={l}
          type="button"
          onClick={() => {
            b.setLang(l);
            try { localStorage.setItem('cv-language', l); } catch {}
          }}
          className={`viewer-lang-btn ${b.lang === l ? 'active' : ''}`}
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: b.lang === l ? 700 : 500,
            fontFamily: 'var(--cv-font-mono)',
            borderRadius: '4px',
            border: b.lang === l ? '1px solid var(--cv-primary)' : '1px solid transparent',
            background: b.lang === l ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
            color: b.lang === l ? 'var(--cv-primary)' : 'var(--cv-text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={l === 'sk' ? 'Slovenčina' : l === 'en' ? 'English' : l === 'de' ? 'Deutsch' : 'Français'}
          aria-pressed={b.lang === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
    <dialog ref={surfaceMenu} className="viewer-surface-menu" aria-label={t('toolbar.image')} onClick={e => {
      if (e.target === e.currentTarget) surfaceMenu.current?.close()
    }}>
      <h3>{t('toolbar.image')}</h3>
      <button type="button" onClick={() => chooseImage(() => b.textureFileInputRef.current?.click())}>{t('toolbar.localImage')}</button>
      <button type="button" onClick={() => chooseImage(() => b.calibFileInputRef.current?.click())}>{t('toolbar.calibration')}</button>
      <button type="button" onClick={() => chooseImage(() => setOpts(p => ({ ...p, showSurfaceTexture: true, surfaceTextureSource: 'wms-orto' })))}>{t('toolbar.mapImage')} · ZBGIS</button>
      <button type="button" onClick={() => chooseImage(() => revealInSidebar('surface', 'dmr5'))}>🏔️ {t('terrain.dmr5Title')}</button>
      <button type="button" onClick={() => surfaceMenu.current?.close()}>{t('ui.close')}</button>
    </dialog>
  </div>
})
