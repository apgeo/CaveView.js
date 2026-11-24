
import type { Language } from '@shared/i18n';
import type { NavigationBindings } from './types';
import { SidebarAccordion } from './SidebarAccordion';

export function SystemSection({ bindings }: { bindings: Pick<NavigationBindings, 'toggleFullscreen' | 'lang' | 'applyTheme' | 'currentTheme' | 't' | 'setLang' | 'setHelpDialogOpen'> }) {
  const { toggleFullscreen, lang, applyTheme, currentTheme, t, setLang, setHelpDialogOpen } = bindings
  return <>
<button type="button" className="btn-back" onClick={toggleFullscreen}>{t('navigation.fullscreen')}</button>
      <SidebarAccordion infoTopic="system" lang={lang} heading={<h3>{t('navigation.appearance')}</h3>} detailsLabel={t('navigation.details')}><div className="" style={{ display: 'flex', gap: '2px', background: 'var(--cv-surface-low)', padding: '2px', borderRadius: '6px', border: '1px solid var(--cv-border)' }}>
                  {(['classic', 'precision', 'light'] as const).map(th => (
                    <button type="button" key={th} aria-pressed={currentTheme === th} onClick={() => applyTheme(th)}
                      style={{ flex: 1, padding: '3px 6px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: currentTheme === th ? 'var(--cv-surface-high)' : 'transparent',
                        color: currentTheme === th ? 'var(--cv-primary)' : 'var(--cv-text-muted)' }}>
                      {t(`themes.${th}`)}
                    </button>
                  ))}
                </div><SidebarAccordion heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">palette</span>
                          {t('legend.title')}
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>

                      {[
                        { color: '#4fc3f7', label: t('legend.cave') },
                        { color: '#78909c', label: t('legend.splay') },
                        { color: '#81c784', label: t('legend.surface') },
                      ].map(({ color, label }) => (
                        <div className="toggle-row" key={label} style={{ padding: '3px 0' }}>
                          <div className="toggle-label">
                            <div className="dot" style={{ background: color }} />
                            <span style={{ fontSize: '11px' }}>{label}</span>
                          </div>
                        </div>
                      ))}

</SidebarAccordion></SidebarAccordion>
      <div className="nav-language" role="group" aria-label={t('navigation.language')}><div className="" style={{ display: 'flex', gap: '2px', background: 'var(--cv-surface-low)', padding: '2px', borderRadius: '6px', border: '1px solid var(--cv-border)' }}>
                  {(['sk', 'en', 'fr', 'de'] as Language[]).map(l => (
                    <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l)}
                      style={{ padding: '3px 5px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: lang === l ? 'var(--cv-primary)' : 'transparent',
                        color: lang === l ? '#003543' : 'var(--cv-text-muted)' }}>
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div></div>
      <button type="button" className="btn-back" data-close-navigation onClick={() => setHelpDialogOpen(true)}>{t('ui.help')}</button>
      <SidebarAccordion infoTopic="system" lang={lang} heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">help_outline</span>
                          {t('ui.help')}
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>

                      <div className="cad-subcard" style={{ fontSize: '9.5px', color: 'var(--cv-text-muted)', lineHeight: '1.6' }}>
                        {t('ui.helpRotate')}<br />
                        {t('ui.helpPan')}<br />
                        {t('ui.helpZoom')}<br />
                        {t('ui.helpTouch')}
                      </div>

</SidebarAccordion>
  </>
}
