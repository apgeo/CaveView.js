import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationSidebar } from '../NavigationSidebar'
import { SidebarAccordion } from '../SidebarAccordion'
import { revealInSidebar } from '../reveal'
import { act } from 'react'

let mobile = false
const sections = {
  project: <button>Import</button>,
  view: <button>Fit</button>,
  layers: <SidebarAccordion heading={<h3>Walls</h3>} detailsLabel="Details"><input aria-label="Opacity" defaultValue="75" /></SidebarAccordion>,
  analysis: <button data-nav-target="measurement">Measure</button>,
  system: <button data-close-navigation>Help</button>,
}

beforeEach(() => {
  mobile = false
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
})

afterEach(() => vi.unstubAllGlobals())

describe('NavigationSidebar', () => {
  it('reveals a toolbar target in its category without rendering the scene sibling', () => {
    const renderScene = vi.fn()
    function Scene() { renderScene(); return <canvas /> }
    render(<><Scene /><NavigationSidebar lang="en" sections={sections} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse to icons' }))
    act(() => revealInSidebar('analysis', 'measurement'))
    const target = screen.getByRole('button', { name: 'Measure' })
    expect(target).toBeVisible()
    expect(target).toHaveClass('nav-reveal')
    expect(renderScene).toHaveBeenCalledOnce()
  })

  it('keeps category, accordion and collapse changes local without rendering the scene sibling', () => {
    const renderScene = vi.fn()
    function Scene() { renderScene(); return <canvas data-testid="scene" /> }
    function App() { return <><Scene /><NavigationSidebar lang="en" sections={sections} /></> }
    render(<App />)
    const canvas = screen.getByTestId('scene')
    const details = screen.getByRole('button', { name: 'Walls Details' })
    expect(details).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(details)
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Files & projects' }))
    expect(screen.getByRole('button', { name: 'Import' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cave & Model' }))
    expect(screen.getByLabelText('Opacity')).toHaveValue('40')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse to icons' }))
    expect(screen.queryByRole('button', { name: 'Walls Details' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cave & Model' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cave & Model' }))
    expect(details).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('scene')).toBe(canvas)
    expect(renderScene).toHaveBeenCalledTimes(1)
  })

  it('traps focus in the mobile drawer, closes on Escape and restores its launcher', () => {
    mobile = true
    const rect = new DOMRect()
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(Object.assign([rect], { item: () => rect }))
    const { container } = render(<><div className="viewer-body"><div data-testid="scene" /><NavigationSidebar lang="en" sections={sections} /></div><a href="/privacy">Privacy</a></>)
    const launcher = screen.getByRole('button', { name: 'Open menu' })
    fireEvent.click(launcher)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('scene').inert).toBe(true)
    expect(screen.getByText('Privacy').inert).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Close menu' })).toHaveFocus()
    const last = within(dialog).getByRole('button', { name: 'Walls Details' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(within(dialog).getByRole('button', { name: 'Files & projects' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(launcher).toHaveFocus()
    expect(screen.getByTestId('scene').inert).not.toBe(true)
    expect(screen.getByText('Privacy').inert).not.toBe(true)
    expect(container.querySelector('.nav-panel')).not.toBeVisible()
    vi.restoreAllMocks()
  })

  it('dismisses the mobile drawer before handing focus to an external dialog action', () => {
    mobile = true
    render(<NavigationSidebar lang="en" sections={sections} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings & help' }))
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('updates category labels in all four languages without resetting navigation', () => {
    const { rerender } = render(<NavigationSidebar lang="sk" sections={sections} />)
    fireEvent.click(screen.getByRole('button', { name: 'Súbor & projekty' }))
    for (const [lang, label] of [['en', 'Files & projects'], ['fr', 'Fichiers & projets'], ['de', 'Dateien & Projekte']] as const) {
      rerender(<NavigationSidebar lang={lang} sections={sections} />)
      expect(screen.getByRole('heading', { name: label })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Import' })).toBeVisible()
    }
  })

  it('navigates between separate cave and surface categories', () => {
    const dualSections = {
      ...sections,
      cave: <div data-testid="cave-content">Cave Tools</div>,
      surface: <div data-testid="surface-content">Surface Tools</div>,
    }
    render(<NavigationSidebar lang="en" sections={dualSections} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cave & Model' }))
    expect(screen.getByTestId('cave-content')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Surface & Terrain' }))
    expect(screen.getByTestId('surface-content')).toBeVisible()
  })
})

describe('SidebarAccordion', () => {
  it('opens documentation popup when clicking info button', () => {
    render(
      <SidebarAccordion
        heading={<h3>Survey Line</h3>}
        detailsLabel="Details"
        infoTopic="survey"
        lang="en"
      >
        <div>Content</div>
      </SidebarAccordion>
    )
    const infoBtn = screen.getByRole('button', { name: /Info:/i })
    expect(infoBtn).toBeInTheDocument()
    fireEvent.click(infoBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Survey Network & Centerline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the primary switch available while disabled-layer details are hidden', () => {
    const props = {
      heading: <h3>SDF</h3>,
      detailsLabel: 'Details',
      primary: <button role="switch" aria-checked={false}>Show SDF</button>,
      children: <input aria-label="Voxel size" />,
    }
    const { rerender } = render(<SidebarAccordion {...props} enabled={false} />)
    expect(screen.getByRole('switch')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'SDF Details' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Voxel size')).not.toBeVisible()
    rerender(<SidebarAccordion {...props} enabled />)
    fireEvent.click(screen.getByRole('button', { name: 'SDF Details' }))
    expect(screen.getByLabelText('Voxel size')).toBeVisible()
    rerender(<SidebarAccordion {...props} enabled={false} />)
    expect(screen.getByLabelText('Voxel size')).not.toBeVisible()
  })
})
