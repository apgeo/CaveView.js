import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { getTranslation, type Language } from '@shared/i18n';
import './NavigationSidebar.css'
import { NAV_REVEAL_EVENT, type NavRevealDetail } from './reveal'

const categories = [
  { id: 'project', icon: 'folder_open' },
  { id: 'view', icon: 'view_in_ar' },
  { id: 'cave', icon: 'layers' },
  { id: 'surface', icon: 'terrain' },
  { id: 'analysis', icon: 'straighten' },
  { id: 'system', icon: 'settings' },
] as const

export type Category = typeof categories[number]['id']
const mobileQuery = '(max-width: 768px)'
const focusableSelector = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

export function NavigationSidebar({
  lang,
  sections,
}: {
  lang: Language
  sections: Partial<Record<Category | 'layers', ReactNode>>
}) {
  const [activeCategory, setActiveCategory] = useState<Category>('cave')
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia(mobileQuery).matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const categoryRefs = useRef<Partial<Record<Category, HTMLButtonElement>>>({})
  const id = useId()
  const visible = mobile ? mobileOpen : !collapsed
  const t = (key: string) => getTranslation(lang, `navigation.${key}`)
  const pendingReveal = useRef<string | null>(null)
  const [revealTick, setRevealTick] = useState(0)

  useEffect(() => {
    const onReveal = (event: Event) => {
      const { category, target } = (event as CustomEvent<NavRevealDetail>).detail
      let resolvedCategory: Category = (category === 'layers' ? 'cave' : category) as Category
      if (category === 'layers' && (target === 'surface' || target === 'terrain' || target === 'wms' || target === 'mapbox' || target === 'dmr5' || target === 'texture' || target === 'calibration')) {
        resolvedCategory = 'surface'
      }
      setActiveCategory(resolvedCategory)
      if (!mobile) setCollapsed(false)
      pendingReveal.current = target ?? null
      setRevealTick(n => n + 1)
    }
    window.addEventListener(NAV_REVEAL_EVENT, onReveal)
    return () => window.removeEventListener(NAV_REVEAL_EVENT, onReveal)
  }, [mobile])

  useEffect(() => {
    const target = pendingReveal.current
    pendingReveal.current = null
    if (!target) return
    const node = rootRef.current?.querySelector<HTMLElement>(`[data-nav-target="${target}"]`)
    const box = node?.closest<HTMLElement>('.toggle-row') ?? node
    if (!box || box.closest('[hidden]')) return
    // Scroll only the panel: scrollIntoView would also scroll ancestors and resize the 3D canvas.
    const panel = box.closest<HTMLElement>('.nav-panel-content')
    if (panel) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const area = panel.getBoundingClientRect()
      const rect = box.getBoundingClientRect()
      const delta = rect.top < area.top ? rect.top - area.top - 8 : rect.bottom > area.bottom ? rect.bottom - area.bottom + 8 : 0
      if (delta) panel.scrollBy({ top: delta, behavior: reduced ? 'auto' : 'smooth' })
    }
    box.classList.remove('nav-reveal')
    void box.offsetWidth
    box.classList.add('nav-reveal')
    const timer = window.setTimeout(() => box.classList.remove('nav-reveal'), 1400)
    return () => window.clearTimeout(timer)
  }, [revealTick])

  useEffect(() => {
    const media = window.matchMedia(mobileQuery)
    const update = () => {
      setMobile(media.matches)
      setMobileOpen(false)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!mobile || !mobileOpen) return
    const root = rootRef.current
    if (!root) return
    const previousFocus = launcherRef.current
    const siblings: HTMLElement[] = []
    let branch: HTMLElement = root
    while (branch.parentElement && branch.parentElement !== document.documentElement) {
      siblings.push(...Array.from(branch.parentElement.children)
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== branch))
      branch = branch.parentElement
    }
    const previousInert = siblings.map(node => node.inert)
    siblings.forEach(node => { node.inert = true })
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMobileOpen(false)
      }
      if (event.key === 'Tab') {
        const controls = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
          .filter(node => !node.closest('[hidden]') && node.getClientRects().length > 0)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      siblings.forEach((node, index) => { node.inert = previousInert[index] })
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [mobile, mobileOpen])

  function collapse() {
    if (mobile) {
      setMobileOpen(false)
    } else {
      setCollapsed(true)
      categoryRefs.current[activeCategory]?.focus()
    }
  }

  return (
    <aside
      ref={rootRef}
      className={`navigation-sidebar${visible ? ' is-expanded' : ' is-collapsed'}${mobileOpen ? ' is-mobile-open' : ''}`}
      role={mobile && mobileOpen ? 'dialog' : undefined}
      aria-modal={mobile && mobileOpen ? true : undefined}
      aria-label={t('menu')}
      onClick={event => {
        if (mobile && event.target instanceof Element && event.target.closest('[data-close-navigation]')) setMobileOpen(false)
      }}
    >
      <button
        ref={launcherRef}
        type="button"
        className="nav-mobile-launcher"
        aria-label={t('open')}
        aria-expanded={mobileOpen}
        aria-controls={`${id}-panel`}
        hidden={!mobile || mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">menu</span>
      </button>
      {mobile && mobileOpen && <button type="button" tabIndex={-1} className="nav-backdrop" aria-hidden="true" onClick={collapse} />}
      <nav className="nav-rail" aria-label={t('categories')} hidden={mobile && !mobileOpen}>
        {categories.map(({ id: category, icon }) => (
          <button
            key={category}
            ref={node => { categoryRefs.current[category] = node ?? undefined }}
            type="button"
            className={`nav-category${category === activeCategory ? ' is-active' : ''}`}
            aria-current={category === activeCategory ? 'true' : undefined}
            aria-expanded={category === activeCategory && visible}
            aria-controls={`${id}-${category}`}
            aria-label={t(category)}
            title={t(category)}
            onClick={() => { setActiveCategory(category); setCollapsed(false) }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
            <span className="nav-category-label">{t(category)}</span>
          </button>
        ))}
      </nav>
      <div id={`${id}-panel`} className="nav-panel" hidden={!visible}>
        <header className="nav-panel-header">
          <h2>{t(activeCategory)}</h2>
          <button ref={closeRef} type="button" aria-label={t(mobile ? 'close' : 'collapse')} onClick={collapse}>
            <span className="material-symbols-outlined" aria-hidden="true">{mobile ? 'close' : 'chevron_right'}</span>
          </button>
        </header>
        <div className="nav-panel-content">
          {categories.map(({ id: category }) => (
            <section key={category} id={`${id}-${category}`} aria-label={t(category)} hidden={category !== activeCategory}>
              {category === 'cave' ? (sections.cave ?? sections.layers) : sections[category]}
            </section>
          ))}
        </div>
      </div>
    </aside>
  )
}
