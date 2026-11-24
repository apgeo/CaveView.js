import { useId, useState, type ReactNode } from 'react';
import type { Language } from '@shared/i18n';
import { getSectionDoc } from './sectionDocRegistry';
import { SectionInfoModal } from './SectionInfoModal';

export function SidebarAccordion({
  heading,
  detailsLabel,
  children,
  primary,
  enabled = true,
  navTarget,
  infoTopic,
  badge,
  lang = 'sk',
  onOpenHelp,
}: {
  heading: ReactNode
  detailsLabel: string
  children: ReactNode
  primary?: ReactNode
  enabled?: boolean
  navTarget?: string
  infoTopic?: string
  badge?: string
  lang?: Language
  onOpenHelp?: (tab: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const id = useId()
  const open = enabled && expanded
  const doc = infoTopic ? getSectionDoc(infoTopic, lang) : null

  return (
    <section className="cad-card nav-accordion" data-nav-target={navTarget}>
      <div className="nav-accordion-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div id={`${id}-heading`} className="nav-accordion-heading" style={{ flex: 1, minWidth: 0 }}>
          {heading}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {badge && <span className="cad-badge">{badge}</span>}
          {doc && (
            <button
              type="button"
              className="cad-info-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowInfo(true);
              }}
              title={lang === 'sk' ? `Informácie a návod: ${doc.title}` : `Information and guide: ${doc.title}`}
              aria-label={lang === 'sk' ? `Informácie: ${doc.title}` : `Info: ${doc.title}`}
            >
              i
            </button>
          )}
        </div>
      </div>
      {primary}
      {enabled && (
        <button
          type="button"
          className="nav-details-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          aria-labelledby={`${id}-heading ${id}-label`}
          onClick={() => setExpanded(value => !value)}
        >
          <span id={`${id}-label`}>{detailsLabel}</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      )}
      <div id={`${id}-body`} hidden={!open} className="nav-accordion-body">{children}</div>

      {showInfo && doc && (
        <SectionInfoModal
          doc={doc}
          lang={lang}
          onClose={() => setShowInfo(false)}
          onOpenHelp={onOpenHelp}
        />
      )}
    </section>
  )
}
