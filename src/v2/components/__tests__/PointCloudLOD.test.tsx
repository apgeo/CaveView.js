import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PointCloudLOD } from '../PointCloudLOD'

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: {} }),
  useFrame: vi.fn(),
}))

describe('PointCloudLOD request lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('aborts the active download when the URL changes and on unmount', async () => {
    const signals: AbortSignal[] = []
    const consoleErrors: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation(message => {
      if (!String(message).includes('unrecognized in this browser')) consoleErrors.push(message)
    })
    vi.stubGlobal('Worker', class {
      onmessage: ((event: MessageEvent) => void) | null = null
      terminate = vi.fn()
      postMessage = vi.fn()
    })
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      signals.push(signal)
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        }, { once: true })
      })
    }))

    const view = render(<PointCloudLOD url="/first.ply" />)
    view.rerender(<PointCloudLOD url="/second.ply" />)

    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)

    view.unmount()
    expect(signals[1].aborted).toBe(true)
    await Promise.resolve()
    expect(consoleErrors).toEqual([])
  })
})
