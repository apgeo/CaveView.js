

import type { NavigationBindings } from './types';
import { SidebarAccordion } from './SidebarAccordion';

import { calculateTectonics } from '@shared/utils/tectonics';

export function AnalysisSection({ bindings }: { bindings: Pick<NavigationBindings, 't' | 'opts' | 'toggleOpt' | 'setOpts' | 'cave' | 'activeProfilePoints' | 'profilePicking' | 'startProfilePick' | 'setProfileClipping' | 'lang' | 'measurementMode' | 'cycleMeasurementMode' | 'selectedStations' | 'setSelectedStations' | 'isPlyLidar' | 'isLiDARAnalyzing' | 'cancelLiDARAnalysis' | 'runLiDARAnalysis' | 'isLidarMapGenerating' | 'cancelLidarPlanMap' | 'generateLidarPlanMap' | 'anomalies' | 'setActiveAnomalyId' | 'activeAnomalyId' | 'selectedSegmentProfile'> }) {
  const { t, opts, toggleOpt, setOpts, cave, activeProfilePoints, profilePicking, startProfilePick, setProfileClipping, lang, measurementMode, cycleMeasurementMode, selectedStations, setSelectedStations, isPlyLidar, isLiDARAnalyzing, cancelLiDARAnalysis, runLiDARAnalysis, isLidarMapGenerating, cancelLidarPlanMap, generateLidarPlanMap, anomalies, setActiveAnomalyId, activeAnomalyId, selectedSegmentProfile } = bindings
  return <>
<button type="button" className="btn-back" data-nav-target="measurement" onClick={cycleMeasurementMode} aria-pressed={measurementMode !== 'off'}>{t('navigation.measurement')}: {measurementMode === 'off' ? t('navigation.off') : measurementMode === 'distance' ? t('navigation.distance') : t('navigation.area')}</button>
      <SidebarAccordion navTarget="clipping" infoTopic="clipping" lang={lang} heading={<div className="cad-card-header">
                    <div className="cad-card-title">
                      <span className="material-symbols-outlined" aria-hidden="true">content_cut</span>
                      <span>{t('clipping.title')}</span>
                    </div>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: (opts.showClipping || opts.showProfileClipping) ? 'var(--cv-primary)' : 'var(--cv-border)' }} />
                  </div>} detailsLabel={t('navigation.details')} primary={<><div className="toggle-row" style={{ marginBottom: '8px' }}>
                    <span className="cad-control-label">{t('clipping.horiz')}</span>
                    <button type="button" className={`switch${opts.showClipping ? ' on' : ''}`}
                      onClick={() => toggleOpt('showClipping')} role="switch"
                      aria-checked={opts.showClipping} aria-label={t('clipping.horiz')}
                    />
                  </div>
<div className="toggle-row" style={{ marginBottom: opts.showProfileClipping ? '8px' : '0' }}>
                    <span className="cad-control-label">{t('clipping.vert')}</span>
                    <button type="button" className={`switch${opts.showProfileClipping ? ' on' : ''}`}
                      onClick={() => setProfileClipping(!opts.showProfileClipping)} role="switch" data-nav-target="profile"
                      aria-checked={opts.showProfileClipping} aria-label={t('clipping.vert')}
                    />
                  </div>
                  {opts.showProfileClipping && (
                    <div className="cad-subcard" role="status" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', color: 'var(--cv-text-muted)' }}>
                      {profilePicking && <span>{t('clipping.pickHint')}</span>}
                      <button type="button" className="cad-tool-btn" onClick={startProfilePick} aria-pressed={profilePicking} style={{ width: '100%' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">timeline</span>
                        <span>{t('clipping.create')}</span>
                      </button>
                    </div>
                  )}
                  {opts.showProfileClipping && activeProfilePoints && (
                    <div className="cad-subcard" style={{ marginTop: '8px', marginBottom: '8px' }}>
                      <div className="cad-control-row">
                        <span>{t('clipping.offset')}</span>
                        <span className="cad-control-value">{opts.profileClipOffset.toFixed(1)} m</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <button onClick={() => setOpts(p => ({ ...p, profileClipOffset: p.profileClipOffset - 0.5 }))}
                          className="cad-tool-btn" style={{ width: '26px', height: '26px', padding: 0 }}>-</button>
                        <input type="range" className="cad-slider flex-1"
                          min={-50} max={50} step={0.1} value={opts.profileClipOffset}
                          onChange={(e) => setOpts(p => ({ ...p, profileClipOffset: parseFloat(e.target.value) }))} />
                        <button onClick={() => setOpts(p => ({ ...p, profileClipOffset: p.profileClipOffset + 0.5 }))}
                          className="cad-tool-btn" style={{ width: '26px', height: '26px', padding: 0 }}>+</button>
                      </div>

                      <button
                        onClick={() => toggleOpt('profileClipFlip')}
                        className="cad-tool-btn"
                        style={{ width: '100%' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">swap_horiz</span>
                        <span>{t('clipping.flip')}</span>
                      </button>
                    </div>
                  )}</>}>

                  {opts.showClipping && (
                    <div className="cad-subcard" style={{ marginBottom: '10px' }}>
                      <div className="cad-control-row">
                        <span>{t('clipping.height')}</span>
                        <span className="cad-control-value">{opts.clippingHeight.toFixed(1)} m</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setOpts(p => ({ ...p, clippingHeight: p.clippingHeight - 1 }))}
                          className="cad-tool-btn" style={{ width: '26px', height: '26px', padding: 0 }}>-</button>
                        <input type="range" className="cad-slider flex-1"
                          min={(cave.bounds.min.z + (cave.centerOffset?.z || 0)) - 10} max={(cave.bounds.max.z + (cave.centerOffset?.z || 0)) + 10}
                          step={0.1} value={opts.clippingHeight} onChange={(e) => setOpts(p => ({ ...p, clippingHeight: parseFloat(e.target.value) }))} />
                        <button onClick={() => setOpts(p => ({ ...p, clippingHeight: p.clippingHeight + 1 }))}
                          className="cad-tool-btn" style={{ width: '26px', height: '26px', padding: 0 }}>+</button>
                      </div>
                    </div>
                  )}


                  {(opts.showClipping || opts.showProfileClipping) && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--cv-border)' }}>
                      <div className="toggle-row" style={{ marginBottom: '6px' }}>
                        <label className="toggle-label" style={{ fontSize: '10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">border_outer</span>
                          {lang === 'sk' ? 'Hrana rezu jaskyne' : 'Cave clipping edge'}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="color" value={opts.colorClippingEdges}
                            onChange={(e) => setOpts(p => ({ ...p, colorClippingEdges: e.target.value }))}
                            style={{ width: '20px', height: '20px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                          <button type="button" className={`switch${opts.showClippingEdges ? ' on' : ''}`}
                            onClick={() => toggleOpt('showClippingEdges')} role="switch"
                            aria-checked={opts.showClippingEdges} aria-label={lang === 'sk' ? 'Hrana rezu jaskyne' : 'Cave clipping edge'} />
                        </div>
                      </div>

                      <div className="toggle-row" style={{ marginBottom: '6px' }}>
                        <label className="toggle-label" style={{ fontSize: '10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">landscape</span>
                          {lang === 'sk' ? 'Hrana rezu povrchu' : 'Surface clipping edge'}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="color" value={opts.colorSurfaceClippingEdges}
                            onChange={(e) => setOpts(p => ({ ...p, colorSurfaceClippingEdges: e.target.value }))}
                            style={{ width: '20px', height: '20px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                          <button type="button" className={`switch${opts.showSurfaceClippingEdges ? ' on' : ''}`}
                            onClick={() => toggleOpt('showSurfaceClippingEdges')} role="switch"
                            aria-checked={opts.showSurfaceClippingEdges} aria-label={lang === 'sk' ? 'Hrana rezu povrchu' : 'Surface clipping edge'} />
                        </div>
                      </div>

                      <div className="toggle-row">
                        <label className="toggle-label" style={{ fontSize: '10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">visibility_off</span>
                          {lang === 'sk' ? 'Vynechať jaskyňu z rezu' : 'Exclude cave from clip'}
                        </label>
                        <button type="button" className={`switch${opts.excludeModelFromClipping ? ' on' : ''}`}
                          onClick={() => toggleOpt('excludeModelFromClipping')} role="switch"
                          aria-checked={opts.excludeModelFromClipping} aria-label={lang === 'sk' ? 'Vynechať jaskyňu z rezu' : 'Exclude cave from clip'} />
                      </div>
                    </div>
                  )}

</SidebarAccordion><SidebarAccordion infoTopic="tectonics" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">architecture</span>
                          {lang === 'sk' ? 'Tektonické meranie (3 body: Sklon & Spádnica)' : 'Tectonic Plane (Dip & Dip Direction)'}
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>

                      <p style={{ fontSize: '9px', color: 'var(--cv-text-muted)', margin: '0 0 8px 0', lineHeight: '1.35' }}>
                        {lang === 'sk'
                          ? 'Vyberte 3 body na stene jaskyne, vrstve alebo v teréne. Systém automaticky vypočíta normálu, sklon po spádnici a azimut.'
                          : 'Pick 3 points on cave wall, bedding plane or terrain to calculate dip, dip direction and strike.'}
                      </p>

                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        <button
                          onClick={cycleMeasurementMode}
                          className={`cad-tool-btn ${measurementMode !== 'off' ? 'active' : ''}`}
                          style={{ flex: 1, padding: '6px 8px' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }} aria-hidden="true">
                            {measurementMode === 'polygon' ? 'square_foot' : 'straighten'}
                          </span>
                          <span>
                            {measurementMode === 'off'
                              ? (lang === 'sk' ? 'Aktivovať meranie' : 'Enable measurement')
                              : measurementMode === 'distance'
                              ? (lang === 'sk' ? 'Vzdialenosť (2 body)' : 'Distance mode')
                              : (lang === 'sk' ? 'Plocha / Polygón (3+ bodov)' : 'Area / Polygon mode')}
                          </span>
                        </button>

                        {selectedStations.length > 0 && (
                          <button
                            onClick={() => setSelectedStations([])}
                            className="btn-mini"
                            style={{ color: '#f87171', padding: '6px 8px' }}
                            title={lang === 'sk' ? 'Resetovať vybrané body' : 'Reset points'}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '15px' }} aria-hidden="true">restart_alt</span>
                          </button>
                        )}
                      </div>

                      {/* Stav výberu bodov */}
                      <div className="cad-subcard" style={{
                        fontSize: '9px',
                        padding: '6px 8px',
                        borderColor: selectedStations.length === 3 ? 'rgba(16,185,129,0.4)' : selectedStations.length > 0 ? 'rgba(245,158,11,0.4)' : undefined,
                        background: selectedStations.length === 3 ? 'rgba(16,185,129,0.1)' : selectedStations.length > 0 ? 'rgba(245,158,11,0.1)' : undefined,
                        color: selectedStations.length === 3 ? '#10b981' : selectedStations.length > 0 ? '#f59e0b' : 'var(--cv-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '4px'
                      }}>
                        <span>
                          {selectedStations.length === 0 && (lang === 'sk' ? 'Kliknite na 1. bod v 3D scéne' : 'Click 1st point in 3D scene')}
                          {selectedStations.length === 1 && (lang === 'sk' ? 'Vybraný 1. bod. Kliknite na 2. bod' : 'Point 1 selected. Click 2nd point')}
                          {selectedStations.length === 2 && (lang === 'sk' ? 'Vybrané 2 body. Kliknite na 3. bod' : 'Points 1 & 2 selected. Click 3rd point')}
                          {selectedStations.length === 3 && (lang === 'sk' ? 'Rovina kompletne zameraná' : 'Plane fully measured')}
                        </span>
                        <span style={{ fontWeight: 'bold', fontFamily: 'var(--cv-font-mono)' }}>
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
                              <div className="sidebar-stat-card">
                                <span className="sidebar-stat-label">{t('tectonics.dip')}</span>
                                <span className="sidebar-stat-val accent">
                                  {tect.dipAngle.toFixed(1)}°
                                </span>
                              </div>
                              <div className="sidebar-stat-card">
                                <span className="sidebar-stat-label">{t('tectonics.dipDirection')}</span>
                                <span className="sidebar-stat-val" style={{ color: '#10b981' }}>
                                  {tect.dipDirection.toFixed(1)}° <span style={{ fontSize: '9px', opacity: 0.8 }}>({tect.cardinalDirection})</span>
                                </span>
                              </div>
                            </div>

                            <div className="cad-subcard" style={{ fontSize: '9px', color: 'var(--cv-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{t('tectonics.strike')}:</span>
                                <strong style={{ color: 'var(--cv-text)', fontFamily: 'var(--cv-font-mono)' }}>{`${tect.strike[0].toFixed(0)}° - ${tect.strike[1].toFixed(0)}°`}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{t('tectonics.triangleArea')}:</span>
                                <strong style={{ color: 'var(--cv-text)', fontFamily: 'var(--cv-font-mono)' }}>{tect.area.toFixed(2)} m²</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Geol. zápis:</span>
                                <strong style={{ color: 'var(--cv-primary)', fontFamily: 'var(--cv-font-mono)' }}>{tect.notation}</strong>
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                const strikeStr = `${tect.strike[0].toFixed(0)}° - ${tect.strike[1].toFixed(0)}°`;
                                const text = `Tektonika / Geológia:\nSklon po spádnici: ${tect.dipAngle.toFixed(1)}°\nAzimut spádnice: ${tect.dipDirection.toFixed(1)}° (${tect.cardinalDirection})\nSmer vrstvy (Strike): ${strikeStr}\nPlocha: ${tect.area.toFixed(2)} m²\nGeol. zápis: ${tect.notation}`;
                                navigator.clipboard.writeText(text);
                              }}
                              className="btn-mini"
                              style={{
                                width: '100%',
                                marginTop: '4px',
                                color: 'var(--cv-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '5px'
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">content_copy</span>
                              <span>{t('tectonics.copyData')}</span>
                            </button>
                          </div>
                        );
                      })()}

</SidebarAccordion>{isPlyLidar && (
                      <SidebarAccordion infoTopic="lidar" lang={lang} heading={<div className="cad-card-header">
                          <div className="cad-card-title">
                            <span className="material-symbols-outlined" aria-hidden="true">analytics</span>
                            {lang === 'sk' ? 'LiDAR detektor komínov' : 'LiDAR Anomaly Detector'}
                          </div>
                        </div>} detailsLabel={t('navigation.details')}>

                        <button
                          onClick={isLiDARAnalyzing ? cancelLiDARAnalysis : runLiDARAnalysis}
                          className="btn-mini"
                          style={{ width: '100%', marginBottom: '6px', padding: '6px', color: 'var(--cv-primary)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }} aria-hidden="true">youtube_searched_for</span>
                          <span>{isLiDARAnalyzing ? (lang === 'sk' ? 'Zrušiť LiDAR analýzu' : 'Cancel LiDAR analysis') : (lang === 'sk' ? 'Detegovať komíny a okná' : 'Detect Chimneys & Windows')}</span>
                        </button>

                        <button
                          onClick={isLidarMapGenerating ? cancelLidarPlanMap : generateLidarPlanMap}
                          className="btn-mini"
                          disabled={!cave.points || cave.pointCount === 0}
                          style={{
                            width: '100%',
                            marginBottom: '8px',
                            padding: '6px',
                            color: '#10b981',
                            opacity: (!cave.points || cave.pointCount === 0) ? 0.45 : 1
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }} aria-hidden="true">map</span>
                          <span>{isLidarMapGenerating ? (lang === 'sk' ? 'Zrušiť kreslenie mapy' : 'Cancel map drawing') : (lang === 'sk' ? 'Nakresliť 2D mapu z LiDARu' : 'Draw 2D LiDAR map')}</span>
                        </button>

                        {anomalies.length > 0 ? (
                          <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
                            {anomalies.map((a) => (
                              <div
                                key={a.id}
                                onClick={() => setActiveAnomalyId(activeAnomalyId === a.id ? null : a.id)}
                                className="cad-subcard"
                                style={{
                                  cursor: 'pointer',
                                  borderColor: activeAnomalyId === a.id ? 'var(--cv-primary)' : undefined,
                                  background: activeAnomalyId === a.id ? 'rgba(0,210,255,0.12)' : undefined,
                                  marginTop: '2px',
                                  padding: '6px'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
                                  <span style={{
                                    fontWeight: 'bold',
                                    color: a.type === 'chimney' ? '#f97316' : a.type === 'window' ? '#06b6d4' : 'var(--cv-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }} aria-hidden="true">
                                      {a.type === 'chimney' ? 'vertical_align_top' : a.type === 'window' ? 'open_in_new' : 'splitscreen'}
                                    </span>
                                    {a.type === 'chimney' ? (lang === 'sk' ? 'Komín / Dóm' : 'Chimney') : a.type === 'window' ? (lang === 'sk' ? 'Okno / Puklina' : 'Window') : (lang === 'sk' ? 'Geologická anomália' : 'Anomaly')}
                                  </span>
                                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>{a.confidence.toFixed(0)}% spoľ.</span>
                                </div>
                                <div style={{ fontSize: '8px', color: 'var(--cv-text-muted)', lineHeight: '1.2' }}>
                                  {a.description} (Veľkosť: {a.size.toFixed(1)}m)
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '9px', color: 'var(--cv-text-muted)', textAlign: 'center', padding: '6px 0' }}>
                            {lang === 'sk' ? 'Žiadne zistené anomálie. Spusťte analýzu.' : 'No anomalies detected yet. Click scan.'}
                          </div>
                        )}

</SidebarAccordion>
                    )}<SidebarAccordion infoTopic="speleo_analysis" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">layers</span>
                          {lang === 'sk' ? '2D rez chodbou a objem' : '2D Cross-section & Volume'}
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>

                      {selectedSegmentProfile ? (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{lang === 'sk' ? 'Prierezová plocha' : 'Cross-section area'}</span>
                              <span className="sidebar-stat-val accent">{(selectedSegmentProfile.area ?? 0).toFixed(1)} m²</span>
                            </div>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{lang === 'sk' ? 'Odhadovaný objem' : 'Cave segment volume'}</span>
                              <span className="sidebar-stat-val" style={{ color: '#10b981' }}>{(selectedSegmentProfile.volume ?? 0).toFixed(1)} m³</span>
                            </div>
                          </div>

                          <div className="cad-subcard" style={{ marginBottom: '6px', fontSize: '9px', color: 'var(--cv-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Dĺžka úseku: <strong style={{ color: 'var(--cv-text)' }}>{(selectedSegmentProfile.length ?? 0).toFixed(1)} m</strong></span>
                            <span>LRUD: <strong style={{ color: 'var(--cv-text)' }}>{(selectedSegmentProfile.lrud?.l ?? 0).toFixed(1)}/{(selectedSegmentProfile.lrud?.r ?? 0).toFixed(1)}/{(selectedSegmentProfile.lrud?.u ?? 0).toFixed(1)}/{(selectedSegmentProfile.lrud?.d ?? 0).toFixed(1)}</strong></span>
                          </div>

                          {/* Textový výpis profilu chodby */}
                          <div className="cad-subcard" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '8.5px', color: 'var(--cv-primary)', fontWeight: 'bold' }}>
                              {lang === 'sk' ? 'Tvar profilu chodby' : 'Passage shape'}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '9px', color: 'var(--cv-text-muted)' }}>
                              <div>Strop: <strong style={{ color: 'var(--cv-text)' }}>{(selectedSegmentProfile.lrud?.u ?? 0).toFixed(1)}m</strong></div>
                              <div>Dno: <strong style={{ color: 'var(--cv-text)' }}>{(selectedSegmentProfile.lrud?.d ?? 0).toFixed(1)}m</strong></div>
                              <div>Ľavá: <strong style={{ color: 'var(--cv-text)' }}>{(selectedSegmentProfile.lrud?.l ?? 0).toFixed(1)}m</strong></div>
                              <div>Pravá: <strong style={{ color: 'var(--cv-text)' }}>{(selectedSegmentProfile.lrud?.r ?? 0).toFixed(1)}m</strong></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '9px', color: 'var(--cv-text-muted)', textAlign: 'center', padding: '8px 0', lineHeight: '1.4' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', display: 'block', marginBottom: '4px', opacity: 0.6 }} aria-hidden="true">query_stats</span>
                          {lang === 'sk' ? 'Pre výpočet objemu a 2D prierezu chodby zapnite režim merania a kliknite na 2 po sebe nasledujúce stanice.' : 'To compute volume & 2D cross-section, turn on measurement tool and select two connected stations.'}
                        </div>
                      )}

</SidebarAccordion>
  </>
}
