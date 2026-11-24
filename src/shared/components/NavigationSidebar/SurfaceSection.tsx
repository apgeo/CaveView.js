

import type { NavigationBindings } from './types';
import type { ViewerOptions } from '@shared/types';
import { SidebarAccordion } from './SidebarAccordion';
import { ColorPicker, isRemoteTextureSource, TextureDownloadInspectorPanel } from './controls';
import { Dmr5DownloadPanel } from './Dmr5DownloadPanel';

export function SurfaceSection({ bindings }: { bindings: Pick<NavigationBindings, 't' | 'cave' | 'lang' | 'opts' | 'setOpts' | 'toggleOpt' | 'contourLevels' | 'trackObjectUrl' | 'clearSurfaceTextureUrl' | 'textureDownloadInfo' | 'handleClearTileCache' | 'textureFileInputRef' | 'shiftTexture' | 'calibFileInputRef' | 'handleCalibFile' | 'handleTextureFile' | 'shiftCave' | 'tiffFileInputRef' | 'handleTiffFile' | 'tfwFileInputRef' | 'handleDownloadDmr5' | 'isDmrDownloading' | 'lastDownloadedDmr' | 'handleSaveDmrFiles'> }) {
  const { t, cave, lang, opts, setOpts, toggleOpt, contourLevels, trackObjectUrl, clearSurfaceTextureUrl, textureDownloadInfo, handleClearTileCache, textureFileInputRef, shiftTexture, calibFileInputRef, handleCalibFile, handleTextureFile, shiftCave, tiffFileInputRef, handleTiffFile, tfwFileInputRef, handleDownloadDmr5, isDmrDownloading, lastDownloadedDmr, handleSaveDmrFiles } = bindings
  return <>
      <SidebarAccordion navTarget="surface" infoTopic="surface" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">landscape</span>
                          <span>{t('terrain.title')}</span>
                        </div>
                        {!cave.hasSurface && (
                          <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>
                            ({lang === 'sk' ? 'žiadny' : 'none'})
                          </span>
                        )}
                      </div>} detailsLabel={t('navigation.details')} primary={cave.hasSurface ? <><div className="toggle-row">
                            <label className="toggle-label">
                              <div className="dot" style={{ background: opts.surfaceColor }} />
                              {t('terrain.shaded')}

                            </label>
                            <button type="button" className={`switch${opts.showSurfaceMesh ? ' on' : ''}`}
                              onClick={() => setOpts(p => ({
                                ...p,
                                showSurfaceMesh: !p.showSurfaceMesh,
                                showSurfaceNetwork: false,
                                showSurfaceTexture: false
                              }))} role="switch"
                              aria-checked={opts.showSurfaceMesh} aria-label={t('terrain.shaded')} />
                          </div>
<div className="toggle-row">
                            <label className="toggle-label">
                              <div className="dot" style={{ background: opts.colorTerrainWire, border: '1px solid #4a7c3f' }} />
                              {t('terrain.wire')}

                            </label>
                            <button type="button" className={`switch${opts.showSurfaceMeshWire ? ' on' : ''}`}
                              onClick={() => toggleOpt('showSurfaceMeshWire')} role="switch"
                              aria-checked={opts.showSurfaceMeshWire} aria-label={t('terrain.wire')} />
                          </div>
<div className="toggle-row">
                            <label className="toggle-label">
                              <div className="dot" style={{ background: 'linear-gradient(180deg,#e53935 0%,#f9a825 33%,#43a047 66%,#1565c0 100%)', border: 'none' }} />
                              {t('terrain.network')}
                            </label>
                            <button type="button" className={`switch${opts.showSurfaceNetwork ? ' on' : ''}`}
                              onClick={() => setOpts(p => ({
                                ...p,
                                showSurfaceMesh: false,
                                showSurfaceNetwork: !p.showSurfaceNetwork,
                                showSurfaceTexture: false
                              }))} role="switch"
                              aria-checked={opts.showSurfaceNetwork} aria-label={t('terrain.network')} />
                          </div>
<div className="toggle-row">
                            <div className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div className="dot" style={{ background: opts.contourColor, border: '1px solid #4a7c3f' }} />
                              <span>{t('terrain.contours')}</span>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>
                                ({contourLevels.major}m)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title={`${t('terrain.contourBase')} (${lang === 'sk' ? 'tenké čiary' : 'thin lines'})`}>
                                <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)' }}>{lang === 'sk' ? 'Tenké' : 'Thin'}</span>
                                <ColorPicker
                                  t={t}
                                  style={{ marginLeft: 2 }}
                                  label={`${t('terrain.contourBase')} (${lang === 'sk' ? 'tenké' : 'thin'})`}
                                  value={opts.contourColor}
                                  onChange={(c) => setOpts(p => ({ ...p, contourColor: c }))}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title={`${t('terrain.contourMajor')} (${lang === 'sk' ? 'hrubé čiary' : 'thick lines'})`}>
                                <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)' }}>{lang === 'sk' ? 'Hrubé' : 'Thick'}</span>
                                <ColorPicker
                                  t={t}
                                  style={{ marginLeft: 2 }}
                                  label={`${t('terrain.contourMajor')} (${lang === 'sk' ? 'hrubé' : 'thick'})`}
                                  value={opts.contourColor10}
                                  onChange={(c) => setOpts(p => ({ ...p, contourColor10: c }))}
                                />
                              </div>
                              <button type="button" className={`switch${opts.showContours ? ' on' : ''}`}
                                onClick={() => toggleOpt('showContours')} role="switch"
                                aria-checked={opts.showContours} aria-label={t('terrain.contours')} />
                            </div>
                          </div>
<div className="toggle-row" style={{ borderBottom: opts.showSurfaceTexture ? 'none' : '1px solid var(--cv-border)' }}>
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
                                  inp.onchange = () => {
                                    const file = inp.files?.[0];
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
                                className="btn-mini"
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
                              <button type="button" className={`switch${opts.showSurfaceTexture ? ' on' : ''}`}
                                onClick={() => setOpts(p => ({
                                  ...p,
                                  showSurfaceMesh: false,
                                  showSurfaceNetwork: false,
                                  showSurfaceTexture: !p.showSurfaceTexture
                                }))} role="switch"
                                aria-checked={opts.showSurfaceTexture} aria-label={t('terrain.texture')} />
                            </div>
                          </div></> : null}>
{opts.showSurfaceMesh && <div className="toggle-row"><span>{t('terrain.shaded')}</span><ColorPicker t={t} value={opts.surfaceColor} onChange={(c) => setOpts(p => ({ ...p, surfaceColor: c }))} /></div>}

{opts.showSurfaceMeshWire && <div className="toggle-row"><span>{t('terrain.wire')}</span><ColorPicker t={t} value={opts.colorTerrainWire} onChange={(c) => setOpts(p => ({ ...p, colorTerrainWire: c }))} /></div>}

                      {cave.hasSurface ? (
                        <>

                          {(opts.showSurfaceMesh || opts.showSurfaceNetwork) && (
                            <div className="cad-subcard" style={{ marginTop: '6px', marginBottom: '6px' }}>
                              <div className="cad-control-row">
                                <span className="cad-control-label">
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--cv-primary)' }} aria-hidden="true">opacity</span>
                                  <span>{lang === 'sk' ? 'Priehľadnosť povrchu' : 'Surface opacity'}</span>
                                </span>
                                <span className="cad-control-value">{Math.round(opts.surfaceOpacity * 100)}%</span>
                              </div>
                              <input
                                type="range" min="0.05" max="1" step="0.05"
                                value={opts.surfaceOpacity}
                                onChange={(e) => setOpts(p => ({ ...p, surfaceOpacity: parseFloat(e.target.value) }))}
                                className="cad-slider w-full"
                                title={lang === 'sk' ? 'Priehľadnosť tieňovaného povrchu alebo siete (0.05 – 1.0)' : 'Surface opacity (0.05 – 1.0)'}
                              />
                            </div>
                          )}

                          {opts.showContours && (
                            <div className="toggle-row" style={{ paddingLeft: '16px', borderTop: 'none', opacity: 0.85 }}>
                              <label className="toggle-label" style={{ fontSize: '10px', color: 'var(--cv-text-muted)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">label</span>
                                {lang === 'sk' ? 'Zobraziť výšky' : 'Show altitudes'}
                              </label>
                              <button type="button" className={`switch${opts.showContourLabels ? ' on' : ''}`}
                                onClick={() => toggleOpt('showContourLabels')} role="switch"
                                aria-checked={opts.showContourLabels} aria-label={lang === 'sk' ? 'Zobraziť výšky' : 'Show altitudes'} />
                            </div>
                          )}

                          {opts.showSurfaceTexture && (
                            <div className="cad-subcard" style={{ marginTop: '6px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div className="cad-control-label">
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--cv-primary)' }} aria-hidden="true">map</span>
                                    <span>{lang === 'sk' ? 'Zdroj textúry' : 'Texture source'}</span>
                                  </div>
                                  <select
                                    value={opts.surfaceTextureSource}
                                    onChange={(e) => setOpts(p => ({ ...p, surfaceTextureSource: e.target.value as ViewerOptions['surfaceTextureSource'] }))}
                                    className="cad-select"
                                    style={{ maxWidth: '175px' }}
                                  >
                                    <option value="custom">{lang === 'sk' ? 'Súbor (JPG/PNG/Lox)' : 'Custom File (JPG/PNG/Lox)'}</option>
                                    <option value="wms-orto">WMS: Ortofotomapa (ZBGIS GKÚ)</option>
                                    <option value="wms-orto-freemap">XYZ: Ortofotomapa (Freemap)</option>
                                    <option value="wms-shadow">WMS: DMR5 Tieňovaný reliéf (ZBGIS GKÚ)</option>
                                    <option value="wms-geology">WMS: Geologická mapa (ŠGÚDŠ)</option>
                                    <option value="none">{lang === 'sk' ? 'Vypnutá' : 'None'}</option>
                                  </select>
                                </div>

                                <div className="cad-control-row">
                                  <span>{lang === 'sk' ? 'Priehľadnosť' : 'Opacity'}</span>
                                  <span className="cad-control-value">{Math.round(opts.surfaceTextureOpacity * 100)}%</span>
                                </div>
                                <input
                                  type="range" min="0" max="1" step="0.05"
                                  value={opts.surfaceTextureOpacity}
                                  onChange={(e) => setOpts(p => ({ ...p, surfaceTextureOpacity: parseFloat(e.target.value) }))}
                                  className="cad-slider w-full"
                                />

                                {isRemoteTextureSource(opts.surfaceTextureSource) && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--cv-text-muted)' }}>{lang === 'sk' ? 'Rozlíšenie / zoom' : 'Resolution / zoom'}</span>
                                    <select
                                      value={opts.surfaceWmsResolution}
                                      onChange={(e) => setOpts(p => ({ ...p, surfaceWmsResolution: parseInt(e.target.value) }))}
                                      className="cad-select"
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
                                      className="btn-mini"
                                      style={{ flex: 1 }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }} aria-hidden="true">upload</span>
                                      <span>{lang === 'sk' ? 'Nahrať JPG/PNG' : 'Upload JPG/PNG'}</span>
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

                              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--cv-border)' }}>
                                <div className="cad-control-label" style={{ marginBottom: '6px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--cv-primary)' }} aria-hidden="true">tune</span>
                                  <span>{lang === 'sk' ? 'Kalibrácia textúry' : 'Texture calibration'}</span>
                                </div>

                                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                                  <button onClick={() => shiftTexture(-0.5, 0)} className="btn-mini" title="Vľavo">←</button>
                                  <div style={{ flex: 1, textAlign: 'center', fontSize: '10.5px', color: 'var(--cv-primary)', fontFamily: 'var(--cv-font-mono)', fontWeight: 700 }}>
                                    {opts.surfaceTextureOffset.x > 0 ? '+' : ''}{opts.surfaceTextureOffset.x.toFixed(1)} / {opts.surfaceTextureOffset.y > 0 ? '+' : ''}{opts.surfaceTextureOffset.y.toFixed(1)}m
                                  </div>
                                  <button onClick={() => shiftTexture(0.5, 0)} className="btn-mini" title="Vpravo">→</button>
                                  <button onClick={() => shiftTexture(0, 0.5)} className="btn-mini" title="Hore">↑</button>
                                  <button onClick={() => shiftTexture(0, -0.5)} className="btn-mini" title="Dole">↓</button>
                                </div>

                                <button
                                  onClick={() => setOpts(p => ({ ...p, surfaceTextureOffset: { x: 0, y: 0 } }))}
                                  className="btn-mini"
                                  style={{ width: '100%', marginBottom: '8px' }}
                                >
                                  {lang === 'sk' ? 'Reset posunu textúry' : 'Reset texture offset'}
                                </button>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '10px', color: 'var(--cv-text-muted)' }}>{lang === 'sk' ? 'Súbor .txt (Therion/S-JTSK)' : 'Therion/S-JTSK .txt calib'}</span>
                                  <button onClick={() => calibFileInputRef.current?.click()} className="btn-mini" style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}>
                                    {lang === 'sk' ? 'Nahrať' : 'Load'}
                                  </button>
                                </div>
                                {opts.surfaceTextureCalibration && (
                                  <div style={{ fontSize: '9px', color: '#10b981', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }} aria-hidden="true">check_circle</span>
                                    {lang === 'sk' ? 'Kalibrácia aktívna' : 'Calibration active'}
                                    <button onClick={() => setOpts(p => ({ ...p, surfaceTextureCalibration: null }))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', padding: 0, cursor: 'pointer' }}>✕</button>
                                  </div>
                                )}
                                <input type="file" ref={calibFileInputRef} onChange={handleCalibFile} accept=".txt" style={{ display: 'none' }} aria-label={lang === 'sk' ? 'Kalibračný súbor' : 'Calibration file'} />
                                <input type="file" ref={textureFileInputRef} onChange={handleTextureFile} accept="image/*" style={{ display: 'none' }} aria-label={lang === 'sk' ? 'Textúra povrchu' : 'Surface texture image'} />
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Dmr5DownloadPanel
                            cave={cave}
                            lang={lang}
                            onDownload={handleDownloadDmr5}
                            isDownloading={isDmrDownloading}
                            lastDownloadedDmr={lastDownloadedDmr}
                            onSaveFiles={handleSaveDmrFiles}
                          />
                        </div>
                      )}

</SidebarAccordion><SidebarAccordion infoTopic="calibration" lang={lang} heading={<div className="cad-card-header">
                          <div className="cad-card-title">
                            <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
                            <span>{lang === 'sk' ? 'Kalibrácia modelu (X, Y, Z)' : 'Cave calibration (X, Y, Z)'}</span>
                          </div>
                        </div>} detailsLabel={t('navigation.details')}>

                        <div className="cad-subcard">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>X</span>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                <button onClick={() => shiftCave(-0.5, 0, 0)} className="btn-mini" style={{ flex: 1 }} title="-0.5m">-</button>
                                <button onClick={() => shiftCave(0.5, 0, 0)} className="btn-mini" style={{ flex: 1 }} title="+0.5m">+</button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>Y</span>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                <button onClick={() => shiftCave(0, -0.5, 0)} className="btn-mini" style={{ flex: 1 }} title="-0.5m">-</button>
                                <button onClick={() => shiftCave(0, 0.5, 0)} className="btn-mini" style={{ flex: 1 }} title="+0.5m">+</button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>Z (alt)</span>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                <button onClick={() => shiftCave(0, 0, -0.5)} className="btn-mini" style={{ flex: 1 }} title="-0.5m">-</button>
                                <button onClick={() => shiftCave(0, 0, 0.5)} className="btn-mini" style={{ flex: 1 }} title="+0.5m">+</button>
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '10.5px', color: 'var(--cv-primary)', fontFamily: 'var(--cv-font-mono)', fontWeight: 700 }}>
                            [{opts.caveCalibrationOffset.x > 0 ? '+' : ''}{opts.caveCalibrationOffset.x.toFixed(1)},
                             {opts.caveCalibrationOffset.y > 0 ? '+' : ''}{opts.caveCalibrationOffset.y.toFixed(1)},
                             {opts.caveCalibrationOffset.z > 0 ? '+' : ''}{opts.caveCalibrationOffset.z.toFixed(1)}] m
                          </div>

                          <button
                            onClick={() => setOpts(p => ({ ...p, caveCalibrationOffset: { x: 0, y: 0, z: 0 } }))}
                            className="btn-mini"
                            style={{ width: '100%', marginTop: '8px' }}
                          >
                            {lang === 'sk' ? 'Resetovať polohu' : 'Reset position'}
                          </button>
                        </div>

</SidebarAccordion><SidebarAccordion infoTopic="calibration" lang={lang} heading={<div className="cad-card-header">
                          <div className="cad-card-title">
                            <span className="material-symbols-outlined" aria-hidden="true">terrain</span>
                            <span>{lang === 'sk' ? 'Kalibrácia povrchu (X, Y, Z)' : 'Surface calibration (X, Y, Z)'}</span>
                          </div>
                        </div>} detailsLabel={t('navigation.details')}>

                        <div className="cad-subcard">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>X</span>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, x: p.surfaceOffset.x - 0.5 } }))} className="btn-mini" style={{ flex: 1 }}>-</button>
                                <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, x: p.surfaceOffset.x + 0.5 } }))} className="btn-mini" style={{ flex: 1 }}>+</button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>Y</span>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, y: p.surfaceOffset.y - 0.5 } }))} className="btn-mini" style={{ flex: 1 }}>-</button>
                                <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, y: p.surfaceOffset.y + 0.5 } }))} className="btn-mini" style={{ flex: 1 }}>+</button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>Z (alt)</span>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, z: p.surfaceOffset.z - 0.5 } }))} className="btn-mini" style={{ flex: 1 }}>-</button>
                                <button onClick={() => setOpts(p => ({ ...p, surfaceOffset: { ...p.surfaceOffset, z: p.surfaceOffset.z + 0.5 } }))} className="btn-mini" style={{ flex: 1 }}>+</button>
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '10.5px', color: 'var(--cv-primary)', fontFamily: 'var(--cv-font-mono)', fontWeight: 700 }}>
                            {opts.surfaceOffset.x.toFixed(1)}, {opts.surfaceOffset.y.toFixed(1)}, {opts.surfaceOffset.z.toFixed(1)} m
                          </div>

                          <button
                            onClick={() => setOpts(p => ({ ...p, surfaceOffset: { x: 0, y: 0, z: 0 } }))}
                            className="btn-mini"
                            style={{ width: '100%', marginTop: '8px' }}
                          >
                            {lang === 'sk' ? 'Reset kalibrácie povrchu' : 'Reset surface calibration'}
                          </button>
                        </div>

</SidebarAccordion><SidebarAccordion infoTopic="calibration" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">open_with</span>
                          {lang === 'sk' ? '3D kalibračné gizmo terénu' : '3D Terrain Gizmo'}
                        </div>
                        <button type="button" className={`switch${opts.terrainCalibrationMode ? ' on' : ''}`}
                          onClick={() => setOpts(p => ({ ...p, terrainCalibrationMode: !p.terrainCalibrationMode }))}
                          role="switch"
                          aria-checked={opts.terrainCalibrationMode}
                          aria-label={lang === 'sk' ? '3D kalibračné gizmo terénu' : '3D Terrain Gizmo'}
                        />
                      </div>} detailsLabel={t('navigation.details')}>

                      <p style={{ fontSize: '9px', color: 'var(--cv-text-muted)', margin: '0 0 8px 0', lineHeight: '1.3' }}>
                        {lang === 'sk' ? 'Aktivuje 3D manipulačné šípky priamo nad terénom v scéne pre real-time doladenie pozície.' : 'Activates 3D transformation arrows directly above the terrain in the scene for real-time alignment.'}
                      </p>
                      {opts.surfaceOffset && (
                        <div className="cad-subcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: 'var(--cv-text-muted)', fontFamily: 'var(--cv-font-mono)' }}>
                          <span>Offset:</span>
                          <span style={{ color: 'var(--cv-text)', fontWeight: 600 }}>X: {opts.surfaceOffset.x} | Y: {opts.surfaceOffset.y} | Z: {opts.surfaceOffset.z}m</span>
                        </div>
                      )}

</SidebarAccordion><SidebarAccordion infoTopic="surface" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">upload_file</span>
                          <span>{lang === 'sk' ? 'Pridať TIFF povrch' : 'Add TIFF surface'}</span>
                        </div>
                        <button
                          onClick={() => tiffFileInputRef.current?.click()}
                          className="btn-mini"
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
                      </div>} detailsLabel={t('navigation.details')}>

                      <div className="cad-subcard" style={{ fontSize: '9px', color: 'var(--cv-text-muted)', lineHeight: '1.4' }}>
                        {lang === 'sk'
                          ? 'Tip: Ak máš aj .tfw (World file), načítaj ho pre presné umiestnenie.'
                          : 'Tip: If you have a .tfw file, load it for precise positioning.'}
                        <button
                          onClick={() => tfwFileInputRef.current?.click()}
                          className="btn-mini"
                          style={{ display: 'block', marginTop: '6px', color: 'var(--cv-primary)' }}
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

</SidebarAccordion><SidebarAccordion navTarget="dmr5" infoTopic="dmr5" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" style={{ color: '#f59e0b' }} aria-hidden="true">cloud_download</span>
                          <span>{lang === 'sk' ? 'Stiahnuť DMR 5.0 (GKÚ LiDAR SR)' : 'Download DMR 5.0 (GKÚ LiDAR)'}</span>
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>
                        <Dmr5DownloadPanel
                          cave={cave}
                          lang={lang}
                          onDownload={handleDownloadDmr5}
                          isDownloading={isDmrDownloading}
                          lastDownloadedDmr={lastDownloadedDmr}
                          onSaveFiles={handleSaveDmrFiles}
                        />
</SidebarAccordion>
      {opts.engine === 'v2' && (
        <SidebarAccordion infoTopic="mapbox" lang={lang} heading={<div className="cad-card-header">
          <div className="cad-card-title">
            <span className="material-symbols-outlined" aria-hidden="true">public</span>
            <span>{t('navigation.mapbox')}</span>
          </div>
          <button type="button" className={`switch${opts.showMapboxTerrain ? ' on' : ''}`} role="switch" aria-label={t('navigation.mapbox')} aria-checked={opts.showMapboxTerrain} onClick={() => toggleOpt('showMapboxTerrain')} />
        </div>} detailsLabel={t('navigation.details')}>
          <div className="cad-subcard" style={{ fontSize: '9px', color: 'var(--cv-text-muted)', lineHeight: '1.4' }}>
            {lang === 'sk'
              ? 'Dynamický 3D terén a satelitné snímky generované zo služby Mapbox pre Engine v2.'
              : 'Dynamic 3D surface mesh and satellite imagery streamed from Mapbox for Engine v2.'}
          </div>
        </SidebarAccordion>
      )}
  </>
}
