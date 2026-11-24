

import type { NavigationBindings } from './types';
import { SidebarAccordion } from './SidebarAccordion';

export function ViewSection({ bindings }: { bindings: Pick<NavigationBindings, 't' | 'setOpts' | 'opts' | 'setActiveViewPreset' | 'activeViewPreset' | 'setFitTrigger' | 'lang' | 'toggleOpt'> }) {
  const { t, setOpts, opts, setActiveViewPreset, activeViewPreset, setFitTrigger, lang, toggleOpt } = bindings
  return <>
      <SidebarAccordion navTarget="views" infoTopic="views" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">videocam</span>
                          <span>{t('projection.title')}</span>
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                        <button
                          onClick={() => setOpts(p => ({ ...p, cameraProjection: 'perspective' }))}
                          className={`cad-tool-btn ${opts.cameraProjection === 'perspective' ? 'active' : ''}`}
                        >
                          {t('projection.perspective')}
                        </button>
                        <button
                          onClick={() => setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))}
                          className={`cad-tool-btn ${opts.cameraProjection === 'orthographic' ? 'active' : ''}`}
                        >
                          {t('projection.orthographic')}
                        </button>
                      </div>

                      <p style={{ fontSize: '8.5px', color: 'var(--cv-text-muted)', margin: '0 0 8px 0', lineHeight: '1.35' }}>
                        {opts.cameraProjection === 'orthographic' ? t('projection.orthographicDesc') : t('projection.perspectiveDesc')}
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                        <button
                          onClick={() => {
                            setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                            setActiveViewPreset('top')
                            window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'top' } }))
                          }}
                          className={`cad-tool-btn ${opts.cameraProjection === 'orthographic' && activeViewPreset === 'top' ? 'active' : ''}`}
                        >
                          <span>📐</span> {t('projection.planView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>1</span>
                        </button>

                        <button
                          onClick={() => {
                            setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                            setActiveViewPreset('front')
                            window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'front' } }))
                          }}
                          className={`cad-tool-btn ${opts.cameraProjection === 'orthographic' && activeViewPreset === 'front' ? 'active' : ''}`}
                        >
                          <span>↔️</span> {t('projection.profileView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>2</span>
                        </button>

                        <button
                          onClick={() => {
                            setOpts(p => ({ ...p, cameraProjection: 'orthographic' }))
                            setActiveViewPreset('side')
                            window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'side' } }))
                          }}
                          className={`cad-tool-btn ${opts.cameraProjection === 'orthographic' && activeViewPreset === 'side' ? 'active' : ''}`}
                        >
                          <span>↕️</span> {t('projection.sectionView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>3</span>
                        </button>

                        <button
                          onClick={() => {
                            setActiveViewPreset('iso')
                            window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'iso' } }))
                          }}
                          className={`cad-tool-btn ${activeViewPreset === 'iso' ? 'active' : ''}`}
                        >
                          <span>🧊</span> {t('projection.isoView')} <span style={{ fontSize: '7.5px', opacity: 0.7, background: 'rgba(255,255,255,0.15)', padding: '1px 3px', borderRadius: '3px' }}>4</span>
                        </button>
                      </div>

      </SidebarAccordion>
      <button type="button" className="btn-back" onClick={() => { setFitTrigger(p => p + 1); window.dispatchEvent(new CustomEvent('cave-set-view', { detail: { view: 'fit' } })) }}>{t('navigation.fit')}</button>
      <button type="button" className="btn-back" onClick={() => setOpts(p => ({ ...p, altitudeMode: p.altitudeMode === 'relative' ? 'absolute' : 'relative' }))}>{t('navigation.altitude')}: {opts.altitudeMode === 'relative' ? 'REL' : 'ASL'}</button>
      <SidebarAccordion navTarget="rotation" heading={<h3>{t('navigation.rotation')}</h3>} detailsLabel={t('navigation.details')}>
        <div className="toggle-row">
                        <label className="toggle-label">{lang === 'sk' ? 'Auto-rotácia' : 'Auto-rotate'}</label>
                        <button type="button" className={`switch${opts.autoRotate ? ' on' : ''}`}
                          onClick={() => toggleOpt('autoRotate')} role="switch"
                          aria-checked={opts.autoRotate} aria-label={lang === 'sk' ? 'Auto-rotácia' : 'Auto-rotate'} />
                      </div>{opts.autoRotate && (
                        <div className="cad-subcard" style={{ marginTop: '6px' }}>
                          <div className="cad-control-row">
                            <span className="cad-control-label">{lang === 'sk' ? 'Rýchlosť rotácie' : 'Rotate speed'}</span>
                            <span className="cad-control-value">{opts.autoRotateSpeed.toFixed(1)}x</span>
                          </div>
                          <input type="range" min={0.1} max={10} step={0.1}
                            value={opts.autoRotateSpeed}
                            onChange={e => setOpts(p => ({ ...p, autoRotateSpeed: Number(e.target.value) }))}
                            className="cad-slider" />
                        </div>
                      )}
      </SidebarAccordion>
  </>
}
