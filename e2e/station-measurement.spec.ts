import { test, expect, type Page } from '@playwright/test'
import type { ParsedCave, ViewerOptions } from '../src/shared/types'

async function projectedTargets(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/node_modules/.vite/deps/@react-three_fiber.js'
    const { _roots } = await import(modulePath)
    const canvas = document.querySelector('#main-cave-canvas canvas')
    const root = _roots.get(canvas)
    if (!root) return null
    type Fiber = { type?: { name?: string }; memoizedProps: { cave: ParsedCave; options: ViewerOptions }; child: Fiber | null; sibling: Fiber | null }
    function find(f: Fiber | null): Fiber['memoizedProps'] | null {
      if (!f) return null
      if (f.type?.name === 'SurveyPointPicker') return f.memoizedProps
      return find(f.child) || find(f.sibling)
    }
    const props = find(root.fiber.current)
    if (!props || !canvas) return null
    const { cave, options } = props, { camera } = root.store.getState()
    const station = cave.stationLabels.find(s => s.name === '1')!
    const splay = cave.segments.filter(s => s.type === 'splay')[1].to
    const rect = canvas.getBoundingClientRect()
    const project = (s: typeof splay) => {
      const offset = options.caveCalibrationOffset
      const v = camera.position.clone().set(s.x + offset.x, s.z + offset.z, -s.y - offset.y).project(camera)
      return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 }
    }
    return {
      station: project(station.pos), splay: project(splay), name: station.qualifiedName || station.name,
      altitude: station.altitude.toFixed(2),
      distance: Math.hypot(splay.x - station.pos.x, splay.y - station.pos.y, splay.z - station.pos.z).toFixed(2),
    }
  })
}

test.use({ locale: 'en-US' })

test('station inspection and station-to-splay measurement stay on the model', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Precise canvas picking is covered on desktop; mobile layout is checked separately.')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?model=test_model2.lox')
  await expect(page.locator('#main-cave-canvas canvas')).toBeVisible()
  await expect.poll(async () => (await projectedTargets(page))?.name, { timeout: 15000 }).toBeTruthy()
  const target = (await projectedTargets(page))!
  await page.mouse.click(target.station.x, target.station.y)
  const card = page.locator('.station-detail-card')
  await expect(card).toContainText(target.name)
  await expect(card).toContainText(target.altitude)
  await expect(card).toContainText('GPS')
  await expect(card).toContainText('Depth below surface')
  await page.getByRole('button', { name: 'Splay rays and points', exact: true }).click()
  await page.getByRole('button', { name: 'Measurement: Off', exact: true }).click()
  const panel = page.locator('.measurement-panel')
  await expect(panel).toBeVisible()
  await page.mouse.click(target.station.x, target.station.y)
  await expect(panel).toContainText(target.name)
  await page.mouse.click(target.splay.x, target.splay.y)
  await expect(panel).toContainText(`${target.distance} m`)
  await expect(panel).toContainText('Splay')
  for (const [label, point] of [['A', target.station], ['B', target.splay]] as const) {
    const marker = page.locator('#main-cave-canvas span').filter({ hasText: new RegExp(`^${label}$`) })
    const rect = await marker.boundingBox()
    expect(rect).not.toBeNull()
    expect(Math.abs(rect!.x + rect!.width / 2 - point.x)).toBeLessThan(3)
    expect(Math.abs(rect!.y + rect!.height / 2 - point.y)).toBeLessThan(3)
  }
  await page.getByRole('button', { name: 'Swap A / B' }).click()
  await expect(panel).toContainText(`${target.distance} m`)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  const labels = page.getByRole('button', { name: /^Station labels:/ })
  for (const mode of ['Station number', 'Full name', 'Elevation', 'GPS', 'Off']) {
    await labels.click()
    await expect(labels).toHaveAttribute('aria-label', `Station labels: ${mode}`)
  }
  await page.getByRole('button', { name: 'Add image to surface', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Add image to surface' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Add image to surface' })).toBeHidden()
  expect(errors).toEqual([])
})

test('shared view restores centerline, fixed stations and label mode', async ({ page }) => {
  await page.goto('/?model=test_model2.lox&terrain=none&cline=0&fixed=1&labels=full')
  await expect(page.getByRole('button', { name: 'Centerline', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Fixed stations', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Station labels: Full name', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('mobile toolbar keeps image dialog and measurement panel accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?model=test_model2.lox')
  await expect(page.locator('#main-cave-canvas canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Measurement: Off', exact: true }).click()
  const panel = page.locator('.measurement-panel')
  await expect(panel).toBeVisible()
  const bounds = await panel.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  const image = page.getByRole('button', { name: 'Add image to surface', exact: true })
  await image.click()
  const dialog = page.getByRole('dialog', { name: 'Add image to surface' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(image).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const model of ['test_model2.lox', 'vetrna_dira.ply']) {
  test(`plan and elevation presets cycle the active camera: ${model}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'Camera orientation is independent of viewport size.')
    await page.goto(`/?model=${model}`)
    await expect(page.locator('#main-cave-canvas canvas, #nextgen-cave-canvas canvas')).toBeVisible()
    const direction = () => page.evaluate(async () => {
      const modulePath = '/node_modules/.vite/deps/@react-three_fiber.js'
      const { _roots } = await import(modulePath)
      const canvas = document.querySelector('#main-cave-canvas canvas, #nextgen-cave-canvas canvas')
      const state = _roots.get(canvas)?.store.getState()
      if (!state?.controls) return null
      const d = state.camera.position.clone().sub(state.controls.target).normalize()
      return { type: state.camera.type, x: d.x, y: d.y, z: d.z }
    })
    await expect.poll(direction, { timeout: 15000 }).not.toBeNull()
    const expectDir = async (x: number, y: number, z: number) => expect.poll(async () => {
      const d = await direction()
      const ok = Boolean(d?.type === 'OrthographicCamera' && Math.abs(d.x - x) < 0.001 && Math.abs(d.y - y) < 0.001 && Math.abs(d.z - z) < 0.001)
      return ok ? 'ok' : JSON.stringify({ want: [x, y, z], d })
    }, { timeout: 20000 }).toBe('ok')
    const plan = page.getByRole('button', { name: /^Plan view/ })
    const elevation = page.getByRole('button', { name: /^Elevation view/ })
    await plan.click(); await expectDir(0, 1, 0)
    await plan.click(); await expectDir(0, -1, 0)
    await expect(plan).toHaveAttribute('aria-label', 'Plan view: from below')
    for (const [x, z] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { await elevation.click(); await expectDir(x, 0, z) }
    await expect(elevation).toHaveAttribute('aria-label', 'Elevation view: from west')
  })
}

test('LOX walls offer one wireframe switch; legacy triangle-mesh links map onto it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Sidebar content is identical on mobile.')
  await page.goto('/?model=test_model2.lox&scraps=1&acc=1')
  await expect(page.locator('#main-cave-canvas canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Layers & data' }).click()
  await expect(page.getByRole('switch', { name: 'Triangle mesh' })).toHaveCount(0)
  const wire = page.getByRole('switch', { name: 'Wireframe model' })
  await expect(wire).toHaveAttribute('aria-checked', 'true')
  await wire.click()
  await expect(wire).toHaveAttribute('aria-checked', 'false')
  await wire.click()
  await expect(wire).toHaveAttribute('aria-checked', 'true')
  const heightSwitches = page.getByRole('switch', { name: 'Color by height' })
  await expect(heightSwitches).toHaveCount(2)
  await expect(heightSwitches.first()).toBeVisible()
  await expect(heightSwitches.last()).toBeVisible()
  await expect(page.getByText('Scale (Caver)')).toHaveCount(0)
})

test('vertical profile switch picks two model points directly and applies the section', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Precise canvas picking is covered on desktop.')
  await page.goto('/?model=test_model2.lox')
  await expect(page.locator('#main-cave-canvas canvas')).toBeVisible()
  await expect.poll(async () => (await projectedTargets(page))?.name, { timeout: 15000 }).toBeTruthy()
  const target = (await projectedTargets(page))!
  await page.getByRole('button', { name: 'Splay rays and points', exact: true }).click()
  await page.getByRole('button', { name: 'Tools & analysis' }).click()
  const profile = page.getByRole('switch', { name: 'Vertical Profile (Line)' })
  await profile.click()
  await expect(profile).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Click 2 points in the model to draw the section line.')).toBeVisible()
  await page.mouse.click(target.station.x, target.station.y)
  await page.mouse.click(target.splay.x, target.splay.y)
  await expect(page.getByText('Click 2 points in the model to draw the section line.')).toBeHidden()
  await expect(page.locator('.measurement-panel')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Flip' })).toBeVisible()
  await profile.click()
  await expect(profile).toHaveAttribute('aria-checked', 'false')
  await profile.click()
  await expect(page.getByRole('button', { name: 'Flip' })).toBeVisible()
})

test('toolbar scissors cut a section from two clicks and toolbar actions reveal sidebar controls', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Precise canvas picking is covered on desktop.')
  await page.goto('/?model=test_model2.lox')
  await expect(page.locator('#main-cave-canvas canvas')).toBeVisible()
  await expect.poll(async () => (await projectedTargets(page))?.name, { timeout: 15000 }).toBeTruthy()
  const target = (await projectedTargets(page))!
  await page.getByRole('button', { name: 'Splay rays and points', exact: true }).click()
  await expect(page.locator('[data-nav-target="splays"]')).toBeInViewport()
  await page.getByRole('button', { name: 'Vertical section (2 points)' }).click()
  await expect(page.getByRole('switch', { name: 'Vertical Profile (Line)' })).toBeInViewport()
  await expect(page.getByText('Click 2 points in the model to draw the section line.')).toBeVisible()
  await page.mouse.click(target.station.x, target.station.y)
  await page.mouse.click(target.splay.x, target.splay.y)
  await expect(page.getByRole('button', { name: 'Flip' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vertical section (2 points)' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Walls', exact: true }).click()
  await expect(page.locator('[data-nav-target="walls"]')).toBeInViewport()
})
