

import type { NavigationBindings } from './types';
import { SidebarAccordion } from './SidebarAccordion';
import { ColorPicker, POINT_CLOUD_SHAPE_ICONS, POINT_CLOUD_SHAPE_LABELS_SK, POINT_CLOUD_SHAPE_LABELS_EN } from './controls';
import { CheckCircle2 as CheckCircleIcon, Eraser as EraserIcon, MousePointer2 as MousePointerIcon, X as XIcon, Undo2 as UndoIcon, RotateCcw as RotateCcwIcon } from 'lucide-react';
import { DEFAULT_POINT_CLOUD_SHAPE, POINT_CLOUD_SHAPE_OPTIONS } from '@v2/components/pointCloudShape';

export function LayersSection({ bindings }: { bindings: NavigationBindings }) {
  const { t, opts, setOpts, toggleOpt, cave, splayCount, lang, appStatus, setAppStatus, isPlyLidar, lidarEditMode, setLidarEditMode, lidarEditBusy, lidarBrushSize, setLidarBrushSize, lidarKeepSelectionCount, applyLidarKeepSelection, clearLidarKeepSelection, undoLidarEdit, lidarUndoCaveRef, resetLidarEdits, lidarOriginalCaveRef, lidarEditRemovedCount, loadedFile } = bindings
  // LOX: legacy accurateScraps (e.g. from shared URL) renders the same wire overlay.
  const wireOn = opts.scrapsWireframe || (!isPlyLidar && opts.accurateScraps)
  return <>
<SidebarAccordion navTarget="survey" infoTopic="survey" lang={lang} heading={<div className="cad-card-header">
                    <div className="cad-card-title">
                      <span className="material-symbols-outlined" aria-hidden="true">polyline</span>
                      <span>{t('survey.title')}</span>
                    </div>
                  </div>} detailsLabel={t('navigation.details')} primary={<>
                  <div className="toggle-row">
                    <span className="toggle-label">{t('toolbar.centerline')}</span>
                    <button type="button" className={`switch${opts.showCenterline !== false ? ' on' : ''}`} role="switch"
                      aria-checked={opts.showCenterline !== false} aria-label={t('toolbar.centerline')} data-nav-target="centerline"
                      onClick={() => setOpts(p => ({ ...p, showCenterline: p.showCenterline === false }))} />
                  </div>
                  {splayCount > 0 && (<div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: opts.colorSplay }} />
                      {t('survey.splay')}

                    </label>
                    <button type="button" className={`switch${opts.showSplay ? ' on' : ''}`}
                      onClick={() => toggleOpt('showSplay')} role="switch" data-nav-target="splays"
                      aria-checked={opts.showSplay} aria-label={t('survey.splay')} />
                  </div>)}
<div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: opts.colorTraverse }} />
                      {t('survey.tubes')}

                    </label>
                    <button type="button" className={`switch${opts.showTraverse ? ' on' : ''}`}
                      onClick={() => toggleOpt('showTraverse')} role="switch"
                      aria-checked={opts.showTraverse} aria-label={t('survey.tubes')} />
                  </div>
<div className="toggle-row">
                    <label className="toggle-label">
                      <div className="dot" style={{ background: opts.colorGrid }} />
                      {t('survey.grid')}

                    </label>
                    <button type="button" className={`switch${opts.showGrid ? ' on' : ''}`}
                      onClick={() => toggleOpt('showGrid')} role="switch"
                      aria-checked={opts.showGrid} aria-label={t('survey.grid')} />
                  </div>
<div className="toggle-row">
                    <label className="toggle-label">{t('survey.gizmo')}</label>
                    <button type="button" className={`switch${opts.showGizmo ? ' on' : ''}`}
                      onClick={() => toggleOpt('showGizmo')} role="switch"
                      aria-checked={opts.showGizmo} aria-label={t('survey.gizmo')} />
                  </div>
<div className="toggle-row">
                    <label className="toggle-label">{t('survey.bbox')}</label>
                    <button type="button" className={`switch${opts.showBoundingBox ? ' on' : ''}`}
                      onClick={() => toggleOpt('showBoundingBox')} role="switch"
                      aria-checked={opts.showBoundingBox} aria-label={t('survey.bbox')} />
                  </div>
                  <div className="toggle-row">
                    <label className="toggle-label">{t('survey.altitude')}</label>
                    <button type="button" className={`switch${opts.traverseAltitude ? ' on' : ''}`}
                      onClick={() => toggleOpt('traverseAltitude')} role="switch"
                      aria-checked={opts.traverseAltitude} aria-label={t('survey.altitude')} />
                  </div></>}>
{opts.showGrid && <div className="toggle-row"><span>{t('survey.grid')}</span><ColorPicker t={t} value={opts.colorGrid} onChange={(c) => setOpts(p => ({ ...p, colorGrid: c }))} /></div>}

{opts.showTraverse && <div className="toggle-row"><span>{t('survey.tubes')}</span><ColorPicker t={t} value={opts.colorTraverse} onChange={(c) => setOpts(p => ({ ...p, colorTraverse: c }))} /></div>}

{opts.showSplay && <div className="toggle-row"><span>{t('survey.splay')}</span><ColorPicker t={t} value={opts.colorSplay} onChange={(c) => setOpts(p => ({ ...p, colorSplay: c }))} /></div>}

                  {opts.showTraverse && (
                    <div className="cad-subcard">
                      <div className="cad-control-row">
                        <span>{t('survey.tubes')} - {t('terrain.wire').toLowerCase()}</span>
                        <span className="cad-control-value">{(opts.traverseRadius * 100).toFixed(0)} cm</span>
                      </div>
                      <input type="range" min={0.01} max={1.5} step={0.01}
                        value={opts.traverseRadius}
                        onChange={e => setOpts(p => ({ ...p, traverseRadius: Number(e.target.value) }))}
                        className="cad-slider w-full" />
                    </div>
                  )}

</SidebarAccordion>{cave && splayCount > 0 && (
                  <SidebarAccordion infoTopic="splay_walls" lang={lang} heading={<div className="cad-card-header">
                      <div className="cad-card-title">
                        <span className="material-symbols-outlined" aria-hidden="true">polyline</span>
                        <span>{lang === 'sk' ? 'Splay SDF steny (2D/3D)' : 'Splay SDF Walls (2D/3D)'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {appStatus?.type === 'progress' && appStatus.msg.includes('Splay SDF') && (
                          <span className="material-symbols-outlined text-cyan-400" style={{ fontSize: '13px', animation: 'spin 1.5s linear infinite' }} title={appStatus.msg} aria-hidden="true">
                            sync
                          </span>
                        )}
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: splayCount > 0 ? 'rgba(0,210,255,0.15)' : 'var(--cv-surface-high)', color: splayCount > 0 ? 'var(--cv-primary)' : 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>
                          {splayCount > 0 ? `${splayCount} ${lang === 'sk' ? 'lúčov' : 'rays'}` : (lang === 'sk' ? 'bez splays' : 'no splays')}
                        </span>
                        <button type="button" className={`switch${opts.enableSplayWalls ? ' on' : ''}`}
                          onClick={() => {
                            if (!opts.enableSplayWalls && splayCount === 0) {
                              setAppStatus({
                                msg: lang === 'sk' ? 'Tento model neobsahuje pomocné splay zámery (lúče na steny) pre 2D SDF rekonštrukciu.' : 'This model does not contain radial splay measurements for 2D SDF reconstruction.',
                                type: 'info'
                              });
                              setTimeout(() => setAppStatus(null), 4000);
                            }
                            toggleOpt('enableSplayWalls');
                          }} role="switch"
                          aria-checked={opts.enableSplayWalls} aria-label={lang === 'sk' ? 'Splay SDF steny' : 'Splay SDF walls'} />
                      </div>
                    </div>} detailsLabel={t('navigation.details')} enabled={opts.enableSplayWalls}
                    primary={
                      <div className="toggle-row">
                        <label className="toggle-label">{t('cave.altitude')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {!(opts.splayAltitude ?? true) && (
                            <ColorPicker t={t} value={opts.colorScraps} onChange={c => setOpts(p => ({ ...p, colorScraps: c }))} />
                          )}
                          <button
                            type="button"
                            className={`switch${(opts.splayAltitude ?? true) ? ' on' : ''}`}
                            onClick={() => toggleOpt('splayAltitude')}
                            role="switch"
                            aria-checked={opts.splayAltitude ?? true}
                            aria-label={t('cave.altitude')}
                          />
                        </div>
                      </div>
                    }>

                    {/* Prominently visible Hranatosť / Ostré steny */}
                    <div className="cad-subcard">
                      <div className="cad-control-row">
                        <span className="cad-control-label">
                          <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--cv-primary)' }} aria-hidden="true">square_foot</span>
                          {lang === 'sk' ? 'Hranatosť / Ostré steny' : 'Angular / Sharpness'}
                        </span>
                        <span className="cad-control-value">{opts.splaySmoothK ?? 0.06}</span>
                      </div>
                      <input
                        type="range"
                        min="0.02"
                        max="0.25"
                        step="0.01"
                        value={opts.splaySmoothK ?? 0.06}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setOpts(p => ({ ...p, splaySmoothK: val, enableSplayWalls: true }));
                        }}
                        className="cad-slider w-full"
                        title={lang === 'sk' ? 'Nižšia hodnota = ostrejšie, hranatejšie steny podľa lúčov' : 'Lower value = sharper, more angular walls'}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: 'var(--cv-text-muted)', marginTop: '4px' }}>
                        <span>{lang === 'sk' ? 'Ostré hrany (0.02)' : 'Sharp facets (0.02)'}</span>
                        <span>{lang === 'sk' ? 'Oblé steny (0.25)' : 'Smooth rounded (0.25)'}</span>
                      </div>

                      {opts.enableSplayWalls && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--cv-border)' }}>
                          <div className="cad-control-row">
                            <span>{lang === 'sk' ? 'Rádius chodby' : 'Corridor radius'}</span>
                            <span className="cad-control-value">{(opts.splayCapsuleRadius ?? 0.10).toFixed(2)}m</span>
                          </div>
                          <input
                            type="range"
                            min="0.04"
                            max="0.30"
                            step="0.01"
                            value={opts.splayCapsuleRadius ?? 0.10}
                            onChange={e => setOpts(p => ({ ...p, splayCapsuleRadius: Number(e.target.value) }))}
                            className="cad-slider w-full"
                            title={lang === 'sk' ? 'Hrúbka prechodového koridoru medzi meračskými bodmi' : 'Passage corridor thickness'}
                          />

                          <div className="cad-control-row" style={{ marginTop: '8px' }}>
                            <span>{lang === 'sk' ? 'Detail mriežky (Voxel)' : 'Voxel grid size'}</span>
                            <span className="cad-control-value">{(opts.splayVoxelSize ?? 0.22).toFixed(2)}m</span>
                          </div>
                          <input
                            type="range"
                            min="0.10"
                            max="0.45"
                            step="0.02"
                            value={opts.splayVoxelSize ?? 0.22}
                            onChange={e => setOpts(p => ({ ...p, splayVoxelSize: Number(e.target.value) }))}
                            className="cad-slider w-full"
                            title={lang === 'sk' ? 'Menší voxel = jemnejšie detaily a ostrejšie lomové hrany' : 'Smaller voxel = finer details and sharper fracture edges'}
                          />
                        </div>
                      )}
                    </div>

</SidebarAccordion>
                )}{(cave.scrapCount > 0 || isPlyLidar) && (
                  <SidebarAccordion navTarget="walls" infoTopic={isPlyLidar ? 'lidar' : 'walls'} lang={lang} heading={<div className="cad-card-header">
                      <div className="cad-card-title">
                        <div className="dot" style={{ background: opts.colorScraps }} />
                        <span>{isPlyLidar ? 'LiDAR' : t('cave.title')}</span>
                      </div>
                    </div>} detailsLabel={t('navigation.details')} enabled={isPlyLidar || opts.showScraps || opts.smoothScraps || opts.accurateScraps || opts.showRenderCave || opts.scrapsWireframe || opts.scrapsAltitude} primary={<>{!(isPlyLidar && opts.engine === 'v2') && <><div className="toggle-row">
                          <label className="toggle-label">{t('cave.show')}</label>
                          <button type="button" className={`switch${opts.showScraps ? ' on' : ''}`}
                            onClick={() => toggleOpt('showScraps')} role="switch"
                            aria-checked={opts.showScraps} aria-label={t('cave.show')} />
                        </div>
<div className="toggle-row">
                          <label className="toggle-label">{t('cave.organic')}</label>
                          <button type="button" className={`switch${opts.smoothScraps ? ' on' : ''}`}
                            onClick={() => {
                              const newVal = !opts.smoothScraps;
                              setOpts(p => ({ ...p, smoothScraps: newVal, accurateScraps: newVal ? false : p.accurateScraps }));
                            }} role="switch"
                            aria-checked={opts.smoothScraps} aria-label={t('cave.organic')} />
                        </div>
{/* On LOX the triangle mesh only drew the same wire overlay; it changes reconstruction only for LiDAR. */}
{isPlyLidar && <div className="toggle-row">
                          <label className="toggle-label">{t('cave.accurateMesh')}</label>
                          <button type="button" className={`switch${opts.accurateScraps ? ' on' : ''}`}
                            onClick={() => {
                              const newVal = !opts.accurateScraps;
                              setOpts(p => ({ ...p, accurateScraps: newVal, smoothScraps: newVal ? false : p.smoothScraps }));
                            }} role="switch"
                            aria-checked={opts.accurateScraps} aria-label={t('cave.accurateMesh')} />
                        </div>}
<div className="toggle-row">
                          <label className="toggle-label">{t('cave.render3d')}</label>
                          <button type="button" className={`switch${opts.showRenderCave ? ' on' : ''}`}
                            onClick={() => toggleOpt('showRenderCave')} role="switch"
                            aria-checked={opts.showRenderCave} aria-label={t('cave.render3d')} />
                        </div>
<div className="toggle-row">
                          <label className="toggle-label">{t('cave.wire') || 'Drôtený model'}</label>
                          <button type="button" className={`switch${wireOn ? ' on' : ''}`}
                            onClick={() => isPlyLidar ? toggleOpt('scrapsWireframe') : setOpts(p => ({ ...p, scrapsWireframe: !wireOn, accurateScraps: false }))} role="switch"
                            aria-checked={wireOn} aria-label={t('cave.wire')} />
                        </div>
                        <div className="toggle-row">
                          <label className="toggle-label">{t('cave.altitude')}</label>
                          <button type="button" className={`switch${opts.scrapsAltitude ? ' on' : ''}`}
                            onClick={() => toggleOpt('scrapsAltitude')} role="switch"
                            aria-checked={opts.scrapsAltitude} aria-label={t('cave.altitude')} />
                        </div></>}</>}>

                    <div className="toggle-row">
                      <span>{t('cave.title')}</span>
                      <ColorPicker t={t} value={opts.colorScraps} onChange={colorScraps => setOpts(p => ({ ...p, colorScraps }))} />
                    </div>
                    {/* MAIN NEXTGEN SWITCH - only for point-cloud models */}
                    {isPlyLidar && (
                      <div className="toggle-row" style={{ background: 'rgba(0,210,255,0.08)', padding: '6px 8px', borderRadius: '6px', marginBottom: '10px', border: '1px solid rgba(0,210,255,0.2)' }}>
                        <label className="toggle-label" style={{ color: 'var(--cv-primary)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">blur_on</span>
                          {lang === 'sk' ? 'LIDAR NEXTGEN' : 'LiDAR NEXTGEN'}
                        </label>
                        <button type="button" className={`switch${opts.engine === 'v2' ? ' on' : ''}`}
                          onClick={() => setOpts(p => ({ ...p, engine: p.engine === 'v2' ? 'v1' : 'v2' }))} role="switch"
                          aria-checked={opts.engine === 'v2'} aria-label={lang === 'sk' ? 'LiDAR NextGen' : 'LiDAR NextGen'} />
                      </div>
                    )}

                    {isPlyLidar && (
                      <div className={`lidar-edit-panel${lidarEditMode !== 'off' ? ' active' : ''}`} style={{ background: 'var(--cv-surface-low)', borderColor: 'var(--cv-border)' }}>
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
                            className="cad-slider flex-1"
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
                    {opts.engine === 'v2' && isPlyLidar ? (
                      <div className="cad-subcard">
                        <div style={{ marginBottom: 10 }}>
                          <div className="cad-control-row">
                            <span>{lang === 'sk' ? 'Veľkosť bodov' : 'Point Size'}</span>
                            <span className="cad-control-value">{opts.pointCloudSize.toFixed(2)}</span>
                          </div>
                          <input type="range" min={0.0} max={2.0} step={0.05}
                            value={opts.pointCloudSize}
                            onChange={e => setOpts(p => ({ ...p, pointCloudSize: Number(e.target.value) }))}
                            className="cad-slider w-full" />
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <div className="cad-control-row">
                            <span>{lang === 'sk' ? 'Jas modelu' : 'Brightness'}</span>
                            <span className="cad-control-value">{opts.pointCloudBrightness.toFixed(2)}</span>
                          </div>
                          <input type="range" min={0.1} max={3.0} step={0.1}
                            value={opts.pointCloudBrightness}
                            onChange={e => setOpts(p => ({ ...p, pointCloudBrightness: Number(e.target.value) }))}
                            className="cad-slider w-full" />
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <div className="cad-control-row">
                            <span>{lang === 'sk' ? 'Plasticita' : 'Plasticity'}</span>
                            <span className="cad-control-value">{opts.pointCloudPlasticity.toFixed(1)}</span>
                          </div>
                          <input type="range" min={0.5} max={2.5} step={0.1}
                            value={opts.pointCloudPlasticity}
                            onChange={e => setOpts(p => ({ ...p, pointCloudPlasticity: Number(e.target.value) }))}
                            className="cad-slider w-full" />
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <label className="cad-control-label" style={{ marginBottom: 6 }}>
                            {lang === 'sk' ? 'Tvar bodov' : 'Point Shape'}
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                            {POINT_CLOUD_SHAPE_OPTIONS.map(option => {
                              const shape = option.id;
                              const ShapeIcon = POINT_CLOUD_SHAPE_ICONS[shape];
                              const active = (opts.pointCloudShape ?? DEFAULT_POINT_CLOUD_SHAPE) === shape;
                              const label = lang === 'sk' ? POINT_CLOUD_SHAPE_LABELS_SK[shape] : POINT_CLOUD_SHAPE_LABELS_EN[shape];
                              return (
                                <button key={shape} onClick={() => setOpts(p => ({ ...p, pointCloudShape: shape }))}
                                  title={label}
                                  className={`cad-tool-btn ${active ? 'active' : ''}`}>
                                  <ShapeIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                                  <span>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <label className="cad-control-label" style={{ marginBottom: 6 }}>
                            {lang === 'sk' ? 'Režim farieb' : 'Color Mode'}
                          </label>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {([
                              { id: 'original',  label: lang === 'sk' ? 'PLY' : 'Original' },
                              { id: 'elevation', label: lang === 'sk' ? 'Výška' : 'Elevation' },
                              { id: 'natural',   label: lang === 'sk' ? 'Vlastná' : 'Custom' },
                            ] as const).map(mode => (
                              <button key={mode.id} onClick={() => setOpts(p => ({ ...p, pointCloudColorMode: mode.id }))}
                                className={`cad-tool-btn flex-1 ${opts.pointCloudColorMode === mode.id ? 'active' : ''}`}>
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {opts.pointCloudColorMode === 'natural' && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="dot" style={{ background: opts.pointCloudCustomColor, width: '12px', height: '12px' }} />
                              <label className="cad-control-label">{lang === 'sk' ? 'Farba jaskyne' : 'Cave Color'}</label>
                              <div style={{ marginLeft: 'auto' }}>
                                <ColorPicker t={t} value={opts.pointCloudCustomColor} onChange={(c) => setOpts(p => ({ ...p, pointCloudCustomColor: c }))} />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Selektívne zobrazenie LiDAR Point Cloudu */}
                        <div style={{ marginBottom: 10 }}>
                          <label className="cad-control-label" style={{ marginBottom: 6 }}>
                            {lang === 'sk' ? 'Selektívne zobrazenie' : 'Selective View'}
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                            {([
                              { id: 'all',     label: lang === 'sk' ? 'Všetko' : 'All' },
                              { id: 'floor',   label: lang === 'sk' ? 'Podlaha' : 'Floor' },
                              { id: 'ceiling', label: lang === 'sk' ? 'Strop' : 'Ceiling' },
                              { id: 'contour', label: lang === 'sk' ? 'Vrstevnice' : 'Contours' },
                              { id: 'heatmap', label: lang === 'sk' ? 'Heatmapa' : 'Heatmap' },
                            ] as const).map(mode => (
                              <button key={mode.id} onClick={() => setOpts(p => ({ ...p, pointCloudViewMode: mode.id }))}
                                className={`cad-tool-btn ${opts.pointCloudViewMode === mode.id ? 'active' : ''}`}>
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Interaktívne posuvníky prahových hodnôt segmentácie */}
                        {opts.pointCloudViewMode !== 'all' && (
                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--cv-border)' }}>
                            <div style={{ marginBottom: 8 }}>
                              <div className="cad-control-row">
                                <span>{lang === 'sk' ? 'Hraničná výška rezu' : 'Height Threshold'}</span>
                                <span className="cad-control-value">{(opts.pointCloudHeightThreshold ?? 0.1).toFixed(2)}</span>
                              </div>
                              <input type="range" min="-0.8" max="0.8" step="0.05"
                                value={opts.pointCloudHeightThreshold ?? 0.1}
                                onChange={e => setOpts(p => ({ ...p, pointCloudHeightThreshold: Number(e.target.value) }))}
                                className="cad-slider w-full" />
                            </div>

                            <div style={{ marginBottom: 8 }}>
                              <div className="cad-control-row">
                                <span>{lang === 'sk' ? 'Uhol sklonu plochy' : 'Angle Threshold'}</span>
                                <span className="cad-control-value">{(opts.pointCloudAngleThreshold ?? 0.3).toFixed(2)}</span>
                              </div>
                              <input type="range" min="0.0" max="0.9" step="0.05"
                                value={opts.pointCloudAngleThreshold ?? 0.3}
                                onChange={e => setOpts(p => ({ ...p, pointCloudAngleThreshold: Number(e.target.value) }))}
                                className="cad-slider w-full" />
                            </div>
                          </div>
                        )}

                        {/* Eye-Dome Lighting (EDL) Toggle */}
                        <div className="toggle-row" style={{ borderBottom: 'none', paddingTop: '6px' }}>
                          <label className="toggle-label">{lang === 'sk' ? 'Eye-Dome Lighting (EDL)' : 'Eye-Dome Lighting'}</label>
                          <button type="button" className={`switch${opts.enableEDL !== false ? ' on' : ''}`}
                            onClick={() => toggleOpt('enableEDL')} role="switch"
                            aria-checked={opts.enableEDL !== false} aria-label={lang === 'sk' ? 'Eye-Dome Lighting (EDL)' : 'Eye-Dome Lighting'} />
                        </div>
                      </div>
                    ) : (
                      /* CASE B: NEXTGEN IS OFF (Standard Mesh - v1) */
                      <>

                        {/* Zlúčenie stien (Scrap Batching) */}
                        <div className="toggle-row">
                          <label className="toggle-label">{lang === 'sk' ? 'Zlúčenie stien (Batching)' : 'Merge Scraps'}</label>
                          <button type="button" className={`switch${opts.enableScrapsBatching !== false ? ' on' : ''}`}
                            onClick={() => toggleOpt('enableScrapsBatching')} role="switch"
                            aria-checked={opts.enableScrapsBatching !== false} aria-label={lang === 'sk' ? 'Zlúčenie stien (Batching)' : 'Merge Scraps'} />
                        </div>

                        <div className="cad-subcard" style={{ marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--cv-text-muted)', marginBottom: '6px' }}>
                            <span>{lang === 'sk' ? 'Materiál stien' : 'Wall material'}</span>
                            <span style={{ color: 'var(--cv-primary)' }}>{opts.showRenderCave ? (lang === 'sk' ? '3D aktívny' : '3D active') : (lang === 'sk' ? 'zapne 3D' : 'enables 3D')}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}>
                            {([
                              { id: 'limestone', label: lang === 'sk' ? 'Vápenec' : 'Limestone', swatch: '#d8d2bf' },
                              { id: 'dolomite', label: 'Dolomit', swatch: '#e8dccb' },
                              { id: 'grey_limestone', label: lang === 'sk' ? 'Sivý' : 'Grey', swatch: '#dbeafe' },
                              { id: 'technical', label: lang === 'sk' ? 'Tech' : 'Tech', swatch: '#7dd3fc' },
                            ] as const).map(preset => (
                              <button
                                key={preset.id}
                                onClick={() => setOpts(p => ({ ...p, caveTexture: preset.id, showRenderCave: true }))}
                                className={`cad-tool-btn ${opts.caveTexture === preset.id ? 'active' : ''}`}
                                style={{
                                  minHeight: '34px',
                                  flexDirection: 'column',
                                  gap: '3px',
                                  fontSize: '8px',
                                  padding: '5px 2px',
                                }}
                              >
                                <span style={{ width: 13, height: 13, borderRadius: '50%', background: preset.swatch, boxShadow: '0 0 0 1px rgba(255,255,255,0.18) inset' }} />
                                <span>{preset.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="cad-subcard" style={{ marginTop: '8px' }}>
                          <div className="cad-control-row">
                            <span>{t('cave.opacity')}</span>
                            <span className="cad-control-value">{Math.round(opts.scrapsOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range" min="0.1" max="1" step="0.05"
                            value={opts.scrapsOpacity}
                            onChange={(e) => setOpts(p => ({ ...p, scrapsOpacity: parseFloat(e.target.value) }))}
                            className="cad-slider w-full"
                            title={lang === 'sk' ? 'Priehľadnosť stien jaskyne (0.1 – 1.0)' : 'Cave wall opacity (0.1 – 1.0)'}
                          />
                        </div>

                        {loadedFile?.ext === '.stl' && (
                          <div className="cad-subcard" style={{ marginTop: '8px' }}>
                            <label className="cad-control-label" style={{ marginBottom: 6 }}>
                              {lang === 'sk' ? 'Selektívne zobrazenie STL' : 'STL Selective View'}
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}>
                              {([
                                { id: 'all', label: lang === 'sk' ? 'Všetko' : 'All' },
                                { id: 'floor', label: lang === 'sk' ? 'Podlaha' : 'Floor' },
                                { id: 'ceiling', label: lang === 'sk' ? 'Strop' : 'Ceiling' },
                                { id: 'section', label: lang === 'sk' ? 'Rez' : 'Cut' },
                              ] as const).map(mode => (
                                <button key={mode.id} onClick={() => setOpts(p => ({ ...p, scrapsViewMode: mode.id }))}
                                  className={`cad-tool-btn ${opts.scrapsViewMode === mode.id ? 'active' : ''}`}>
                                  {mode.label}
                                </button>
                              ))}
                            </div>

                            {opts.scrapsViewMode !== 'all' && (
                              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--cv-border)' }}>
                                <div style={{ marginBottom: 8 }}>
                                  <div className="cad-control-row">
                                    <span>{lang === 'sk' ? 'Hranica rezu' : 'Cut threshold'}</span>
                                    <span className="cad-control-value">{opts.scrapsHeightThreshold.toFixed(2)}</span>
                                  </div>
                                  <input type="range" min={-0.8} max={0.8} step={0.05}
                                    value={opts.scrapsHeightThreshold}
                                    onChange={e => setOpts(p => ({ ...p, scrapsHeightThreshold: Number(e.target.value) }))}
                                    className="cad-slider w-full" />
                                </div>

                                {opts.scrapsViewMode !== 'section' && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div className="cad-control-row">
                                      <span>{lang === 'sk' ? 'Rovinnosť plochy' : 'Surface flatness'}</span>
                                      <span className="cad-control-value">{opts.scrapsAngleThreshold.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min={0} max={0.9} step={0.05}
                                      value={opts.scrapsAngleThreshold}
                                      onChange={e => setOpts(p => ({ ...p, scrapsAngleThreshold: Number(e.target.value) }))}
                                      className="cad-slider w-full" />
                                  </div>
                                )}

                                {opts.scrapsViewMode === 'section' && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div className="cad-control-row">
                                      <span>{lang === 'sk' ? 'Hrúbka rezu' : 'Cut thickness'}</span>
                                      <span className="cad-control-value">{opts.scrapsSectionWidth.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min={0.02} max={0.3} step={0.01}
                                      value={opts.scrapsSectionWidth}
                                      onChange={e => setOpts(p => ({ ...p, scrapsSectionWidth: Number(e.target.value) }))}
                                      className="cad-slider w-full" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="cad-subcard" style={{ marginTop: '8px' }}>
                          <div className="cad-control-row">
                            <span>{lang === 'sk' ? 'Plasticita stien' : 'Wall relief'}</span>
                            <span className="cad-control-value">{opts.scrapsRelief.toFixed(2)}</span>
                          </div>
                          <input type="range" min={0} max={1} step={0.05}
                            value={opts.scrapsRelief}
                            onChange={e => setOpts(p => ({ ...p, scrapsRelief: Number(e.target.value) }))}
                            className="cad-slider w-full" />
                        </div>
                      </>
                    )}

</SidebarAccordion>
                )}<SidebarAccordion navTarget="stations" infoTopic="stations" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">radio_button_checked</span>
                          {t('stations.title')}
                        </div>
                      </div>} detailsLabel={t('navigation.details')} primary={<><div className="toggle-row">
                        <label className="toggle-label">
                          <div className="dot" style={{ background: opts.colorStations, border: '1px solid rgba(255,255,255,.2)' }} />
                          {t('stations.show')}

                        </label>
                        <button type="button" className={`switch${opts.showStations ? ' on' : ''}`}
                          onClick={() => toggleOpt('showStations')} role="switch"
                          aria-checked={opts.showStations} aria-label={t('stations.show')} />
                      </div></>}>
{opts.showStations && <div className="toggle-row"><span>{t('stations.show')}</span><ColorPicker t={t} value={opts.colorStations} onChange={(c) => setOpts(p => ({ ...p, colorStations: c }))} /></div>}

                      <div className="toggle-row">
                        <label className="toggle-label">
                          <div className="dot" style={{ background: opts.colorStationNames }} />
                          {t('stations.names')}
                          <ColorPicker t={t} value={opts.colorStationNames} onChange={(c) => setOpts(p => ({ ...p, colorStationNames: c }))} />
                        </label>
                        <button type="button" className={`switch${opts.showStationNames ? ' on' : ''}`}
                          onClick={() => toggleOpt('showStationNames')} role="switch"
                          aria-checked={opts.showStationNames} aria-label={t('stations.names')} />
                      </div>
                      <div className="toggle-row">
                        <label className="toggle-label">
                          <div className="dot" style={{ background: opts.colorStationAlt }} />
                          {t('stations.altitude')}
                          <ColorPicker t={t} value={opts.colorStationAlt} onChange={(c) => setOpts(p => ({ ...p, colorStationAlt: c }))} />
                        </label>
                        <button type="button" className={`switch${opts.showStationAlt ? ' on' : ''}`}
                          onClick={() => toggleOpt('showStationAlt')} role="switch"
                          aria-checked={opts.showStationAlt} aria-label={t('stations.altitude')} />
                      </div>
                      <div className="toggle-row">
                        <label className="toggle-label">
                          <div className="dot" style={{ background: '#fb8c00', border: '1px solid white' }} />
                          {t('stations.entrances')}
                        </label>
                        <button type="button" className={`switch${opts.showEntrances ? ' on' : ''}`}
                          onClick={() => toggleOpt('showEntrances')} role="switch"
                          aria-checked={opts.showEntrances} aria-label={t('stations.entrances')} />
                      </div>
                      <div className="toggle-row" style={{ borderBottom: 'none' }}>
                        <label className="toggle-label">{t('stations.entranceLabels')}</label>
                        <button type="button" className={`switch${opts.showEntranceLabels ? ' on' : ''}`}
                          onClick={() => toggleOpt('showEntranceLabels')} role="switch"
                          aria-checked={opts.showEntranceLabels} aria-label={t('stations.entranceLabels')} />
                      </div>

</SidebarAccordion>
  </>
}

export { LayersSection as CaveSection };
