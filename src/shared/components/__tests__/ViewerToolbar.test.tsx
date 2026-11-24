import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePlt } from '@v1/parsers/caveParser'
import { getTranslation } from '@shared/i18n'
import type { ViewerOptions, ViewPreset } from '@shared/types'
import { ViewerToolbar } from '../ViewerToolbar'

afterEach(cleanup)

const startProfilePick = vi.fn()

function setup(gps = false) {
  const cave = parsePlt('M 0 0 0\nD 10 10 10 station')
  cave.hasSurface = true
  if (gps) cave.stationLabels[0].gps = { lat: 48, lon: 20 }
  let latest: ViewerOptions
  function Harness() {
    const [opts, setOpts] = useState({
      showSurfaceMesh: false, showSurfaceNetwork: true, showContours: true, showSurfaceTexture: false,
      showSurfaceMeshWire: false, showMapboxTerrain: false,
      showScraps: true, accurateScraps: true, scrapsWireframe: true, enableSplayWalls: true,
      smoothScraps: false, showRenderCave: false, showStationNames: false, showStationAlt: false,
    } as ViewerOptions)
    const [activeViewPreset, setActiveViewPreset] = useState<ViewPreset | null>(null)
    latest = opts
    return <ViewerToolbar canReload onOpen={vi.fn()} onReload={vi.fn()} bindings={{
      t: key => getTranslation('en', key), cave, opts, setOpts, toggleOpt: vi.fn(),
      setActiveViewPreset, activeViewPreset,
      handleExportScreenshot: vi.fn(), toggleFullscreen: vi.fn(), measurementMode: 'off', cycleMeasurementMode: vi.fn(),
      textureFileInputRef: useRef<HTMLInputElement>(null), calibFileInputRef: useRef<HTMLInputElement>(null),
      profilePicking: false, startProfilePick, setProfileClipping: vi.fn(),
      lang: 'en', setLang: vi.fn(),
    }} />
  }
  render(<Harness />)
  return () => latest
}

describe('viewer quick actions', () => {
  it('hides complete surface/wall layers and restores their previous representations', () => {
    const latest = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Surface' }))
    expect(latest()).toMatchObject({ showSurfaceNetwork: false, showContours: false })
    fireEvent.click(screen.getByRole('button', { name: 'Surface' }))
    expect(latest()).toMatchObject({ showSurfaceNetwork: true, showContours: true, showSurfaceMesh: false })
    fireEvent.click(screen.getByRole('button', { name: 'Walls' }))
    expect(latest()).toMatchObject({ showScraps: false, accurateScraps: false, scrapsWireframe: false, enableSplayWalls: false })
    fireEvent.click(screen.getByRole('button', { name: 'Walls' }))
    expect(latest()).toMatchObject({ showScraps: true, accurateScraps: true, scrapsWireframe: true, enableSplayWalls: true })
  })
  it.each([false, true])('cycles labels and includes GPS only when available (%s)', gps => {
    const latest = setup(gps)
    const expected = gps ? ['short', 'full', 'altitude', 'gps', 'off'] : ['short', 'full', 'altitude', 'off']
    for (const mode of expected) {
      fireEvent.click(screen.getByRole('button', { name: /^Station labels:/ }))
      expect(latest().stationLabelMode).toBe(mode)
    }
    expect(latest()).toMatchObject({ showStationNames: false, showStationAlt: false })
  })
  it('cycles plan views top/bottom and elevation views around all four sides', () => {
    setup()
    const views: string[] = []
    const onView = (e: Event) => views.push((e as CustomEvent).detail.view)
    window.addEventListener('cave-set-view', onView)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: /^Plan view/ }))
    expect(screen.getByRole('button', { name: 'Plan view: from above' })).toHaveAttribute('aria-pressed', 'true')
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: /^Elevation view/ }))
    window.removeEventListener('cave-set-view', onView)
    expect(views).toEqual(['top', 'bottom', 'top', 'front', 'east', 'back', 'side', 'front'])
    expect(screen.getByRole('button', { name: /^Plan view$/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals the matching sidebar control and starts the section tool', () => {
    setup()
    const reveals: unknown[] = []
    const listen = (e: Event) => reveals.push((e as CustomEvent).detail)
    window.addEventListener('cv-nav-reveal', listen)
    fireEvent.click(screen.getByRole('button', { name: 'Walls' }))
    fireEvent.click(screen.getByRole('button', { name: /^Measurement:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vertical section (2 points)' }))
    window.removeEventListener('cv-nav-reveal', listen)
    expect(reveals).toEqual([
      { category: 'cave', target: 'walls' },
      { category: 'analysis', target: 'measurement' },
      { category: 'analysis', target: 'profile' },
    ])
    expect(startProfilePick).toHaveBeenCalledOnce()
  })
})
