import { useEffect, useRef } from 'react'

/**
 * Messages between LochViewer and a page that embeds it in a frame or opens it in a window.
 *
 * A host page that already holds a model — because it needs a sign-in to fetch it, or because the
 * file never had a public address — hands over the bytes instead of a URL, so nothing secret ever
 * has to appear in the viewer's address, its server logs or its Referer headers:
 *
 *   viewer → host  { type: 'lochviewer:ready', protocol: 1 }        once listening (carries nothing)
 *   host → viewer  { type: 'lochviewer:open', name, data }          name picks the parser by extension;
 *                                                                   data is an ArrayBuffer (transfer it)
 *   viewer → host  { type: 'lochviewer:loaded', name, stations, segments }
 *   viewer → host  { type: 'lochviewer:error', message }
 *   viewer → host  { type: 'lochviewer:station', name, x, y, z }    a named station was clicked;
 *                                                                   coordinates as in the file
 *
 * Only the window that framed or opened the viewer is listened to, and replies go only to the
 * origin of the message that opened the file — so a page can receive events about a model only
 * if it supplied the model itself.
 */

export const EMBED_PROTOCOL = 1

export interface OpenMessage { type: 'lochviewer:open'; name: string; data: ArrayBuffer }

export type ViewerEvent =
  | { type: 'lochviewer:ready'; protocol: number }
  | { type: 'lochviewer:loaded'; name: string; stations: number; segments: number }
  | { type: 'lochviewer:error'; message: string }
  | { type: 'lochviewer:station'; name: string; x: number; y: number; z: number }

let host: { window: Window; origin: string } | null = null

/** The page that framed this one, or else the page that opened it in a window, if any. */
export function embeddingWindow(): Window | null {
  if (window.parent && window.parent !== window) return window.parent
  return window.opener ?? null
}

/** Reads a message as an `open` request, and remembers who sent it for the replies. */
export function readOpenMessage(event: MessageEvent): OpenMessage | null {
  const embedder = embeddingWindow()
  if (embedder === null || event.source !== embedder) return null
  const m = event.data as Partial<OpenMessage> | null
  if (m?.type !== 'lochviewer:open' || typeof m.name !== 'string' || !(m.data instanceof ArrayBuffer)) return null
  host = { window: embedder, origin: event.origin }
  return m as OpenMessage
}

/** Tells the host something, if a host opened the model on screen; does nothing otherwise. */
export function postToHost(event: ViewerEvent) {
  if (host === null) return
  // A sandboxed host has the opaque origin "null", which cannot be named as a target.
  host.window.postMessage(event, host.origin === 'null' ? '*' : host.origin)
}

/** Opens each file a host sends, and tells the host when it may start sending. */
export function useEmbedHost(open: (file: File) => void) {
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const embedder = embeddingWindow()
    if (embedder === null) return
    const onMessage = (event: MessageEvent) => {
      const m = readOpenMessage(event)
      if (m) openRef.current(new File([m.data], m.name))
    }
    window.addEventListener('message', onMessage)
    // Announced only once listening; it says nothing about this page, so any origin may hear it.
    const ready: ViewerEvent = { type: 'lochviewer:ready', protocol: EMBED_PROTOCOL }
    embedder.postMessage(ready, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])
}

/** For tests: forget the remembered host. */
export function resetEmbedHost() { host = null }
