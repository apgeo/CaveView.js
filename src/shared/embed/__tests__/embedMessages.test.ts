import { describe, it, expect, vi, afterEach } from 'vitest'
import { postToHost, readOpenMessage, resetEmbedHost } from '../embedMessages'

/** Makes this jsdom window look framed by `parent`. */
function framedBy(parent: Pick<Window, 'postMessage'>) {
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as Window)
}

function openMessage(source: unknown, origin: string, data: unknown = new ArrayBuffer(4)) {
  return new MessageEvent('message', {
    data: { type: 'lochviewer:open', name: 'cave.3d', data },
    origin,
    source: source as MessageEventSource,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  resetEmbedHost()
})

describe('embed messages', () => {
  it('opens a file only when the window that framed the viewer sends it', () => {
    const parent = { postMessage: vi.fn() }
    framedBy(parent)

    expect(readOpenMessage(openMessage({ postMessage: vi.fn() }, 'https://elsewhere.example'))).toBeNull()
    expect(readOpenMessage(openMessage(parent, 'https://host.example'))?.name).toBe('cave.3d')
  })

  it('refuses a message that is not an open request with bytes', () => {
    const parent = { postMessage: vi.fn() }
    framedBy(parent)

    expect(readOpenMessage(openMessage(parent, 'https://host.example', 'not bytes'))).toBeNull()
  })

  it('replies only to the origin that sent the file', () => {
    const parent = { postMessage: vi.fn() }
    framedBy(parent)

    postToHost({ type: 'lochviewer:error', message: 'nobody asked' })
    expect(parent.postMessage).not.toHaveBeenCalled()

    readOpenMessage(openMessage(parent, 'https://host.example'))
    postToHost({ type: 'lochviewer:station', name: 'a.1', x: 1, y: 2, z: 3 })
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'lochviewer:station', name: 'a.1', x: 1, y: 2, z: 3 },
      'https://host.example',
    )
  })

  it('ignores everything when nothing embeds the viewer', () => {
    // An unframed jsdom window is its own parent and has no opener.
    expect(readOpenMessage(openMessage(window, 'https://host.example'))).toBeNull()
  })
})
