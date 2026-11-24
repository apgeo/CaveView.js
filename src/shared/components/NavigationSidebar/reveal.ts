export type NavCategory = 'project' | 'view' | 'cave' | 'surface' | 'layers' | 'analysis' | 'system'
export const NAV_REVEAL_EVENT = 'cv-nav-reveal'
export interface NavRevealDetail { category: NavCategory; target?: string }

export function revealInSidebar(category: NavCategory, target?: string) {
  let resolved = category
  if (category === 'layers') {
    if (target === 'surface' || target === 'terrain' || target === 'wms' || target === 'mapbox' || target === 'dmr5' || target === 'texture' || target === 'calibration') {
      resolved = 'surface'
    } else {
      resolved = 'cave'
    }
  }
  window.dispatchEvent(new CustomEvent<NavRevealDetail>(NAV_REVEAL_EVENT, { detail: { category: resolved, target } }))
}
