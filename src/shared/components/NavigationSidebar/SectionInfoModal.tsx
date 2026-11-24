import React, { useEffect } from 'react';
import type { SectionDoc } from './sectionDocRegistry';
import type { Language } from '@shared/i18n';

interface SectionInfoModalProps {
  doc: SectionDoc;
  lang: Language;
  onClose: () => void;
  onOpenHelp?: (tab: string) => void;
}

export function SectionInfoModal({ doc, lang, onClose, onOpenHelp }: SectionInfoModalProps) {
  const isSk = lang === 'sk';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="share-overlay"
      style={{
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        className="plan-map-dialog"
        style={{
          maxWidth: '520px',
          width: '100%',
          background: 'var(--cv-surface-card, #111827)',
          border: '1px solid #f59e0b',
          borderRadius: '12px',
          boxShadow: '0 20px 45px rgba(0,0,0,0.65), 0 0 25px rgba(245, 158, 11, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-info-title"
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
            background: 'rgba(245, 158, 11, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '20px', color: '#f59e0b' }}
              aria-hidden="true"
            >
              info
            </span>
            <span
              id="section-info-title"
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: '#f59e0b',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {doc.title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {doc.badge && (
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--cv-font-mono)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#fbbf24',
                  fontWeight: 600,
                }}
              >
                {doc.badge}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--cv-text-muted)',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
              title={isSk ? 'Zavrieť' : 'Close'}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          <p
            style={{
              fontSize: '11.5px',
              color: 'var(--cv-text)',
              lineHeight: 1.5,
              margin: '0 0 14px 0',
            }}
          >
            {doc.desc}
          </p>

          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--cv-primary)',
              marginBottom: '8px',
            }}
          >
            {isSk ? 'Dostupné funkcie a nástroje:' : 'Key functions & options:'}
          </div>

          <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {doc.bullets.map((b, i) => (
              <li
                key={i}
                style={{
                  fontSize: '11px',
                  color: 'var(--cv-text)',
                  lineHeight: 1.45,
                }}
              >
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--cv-border)',
            background: 'var(--cv-surface-low, #0b0f17)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          {doc.helpTab && onOpenHelp ? (
            <button
              type="button"
              className="btn-mini"
              onClick={() => {
                onClose();
                onOpenHelp(doc.helpTab!);
              }}
              style={{
                padding: '5px 10px',
                fontSize: '10.5px',
                color: 'var(--cv-primary)',
                borderColor: 'var(--cv-primary)',
                background: 'rgba(0, 210, 255, 0.1)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                menu_book
              </span>
              <span>{isSk ? 'Kompletný návod' : 'Full User Guide'}</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            className="btn-mini"
            onClick={onClose}
            style={{
              padding: '5px 12px',
              fontSize: '10.5px',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.15)',
              borderColor: '#f59e0b',
              color: '#f59e0b',
            }}
          >
            {isSk ? 'Rozumiem' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
