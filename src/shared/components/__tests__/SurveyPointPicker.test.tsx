import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { OrthographicCamera, Vector3 } from 'three'
import { parsePlt } from '@v1/parsers/caveParser'
import type { ViewerOptions } from '@shared/types'
import { SurveyPointPicker } from '../SurveyPointPicker'

const scene = vi.hoisted(() => ({ current: {} }))
vi.mock('@react-three/fiber', () => ({ useThree: () => scene.current }))
afterEach(cleanup)

function setup(showStations = true) {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 800, 600))
  const camera = new OrthographicCamera(-40, 40, 30, -30, 0.1, 1000)
  camera.position.set(0, 100, 0)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  scene.current = { gl: { domElement: canvas }, camera }
  const cave = parsePlt('M 0 0 0\nD 10 10 10 station')
  const position = { x: 4, y: 8, z: 3 }
  cave.stations = [position]
  cave.stationLabels = [{ pos: position, name: '7', altitude: 103 }]
  cave.segments = []
  const options = { showStations, showSplay: false, caveCalibrationOffset: { x: 3, y: 2, z: 5 } } as ViewerOptions
  const clicked = vi.fn()
  const bubble = vi.fn()
  render(<SurveyPointPicker cave={cave} options={options} onStationClick={clicked} />)
  canvas.addEventListener('click', bubble)
  const ndc = new Vector3(7, 8, -10).project(camera)
  const x = 100 + (ndc.x + 1) * 400, y = 80 + (1 - ndc.y) * 300
  const event = (name: string, dx = 0) => canvas.dispatchEvent(new MouseEvent(name, { bubbles: true, clientX: x + dx, clientY: y, button: 0 }))
  return { clicked, bubble, event, canvas, position }
}

describe('survey click integration', () => {
  it('snaps a calibrated screen click to the original survey coordinate and consumes it once', () => {
    const { event, clicked, bubble, position, canvas } = setup()
    event('pointerdown', 3)
    event('click', 3)
    expect(clicked).toHaveBeenCalledOnce()
    expect(clicked.mock.calls[0][4]).toEqual(position)
    expect(clicked.mock.calls[0][0]).toBe(0)
    expect(bubble).not.toHaveBeenCalled()
    canvas.remove()
  })
  it('does not pick a station while dragging the camera or after unmount', () => {
    const { event, clicked, canvas } = setup()
    event('pointerdown')
    event('pointermove', 20)
    event('pointermove')
    event('click')
    expect(clicked).not.toHaveBeenCalled()
    cleanup()
    event('pointerdown')
    event('click')
    expect(clicked).not.toHaveBeenCalled()
    canvas.remove()
  })
  it('does not pick hidden stations or unrelated background', () => {
    const { event, clicked, canvas } = setup(false)
    event('pointerdown')
    event('click')
    expect(clicked).not.toHaveBeenCalled()
    canvas.remove()
  })
})
