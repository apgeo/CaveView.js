/**
 * Google Identity Services, loaded only when somebody is about to upload to Google Drive.
 *
 * Loaded from index.html, the script was fetched from accounts.google.com on every visit — by
 * readers who never upload anything, and on installations that never configured a client id. It is
 * started when the share dialog opens (where the upload button is) rather than on the click itself,
 * because a click that first waits for a script loses its user gesture, and the sign-in popup it
 * then opens is blocked.
 */
const SRC = 'https://accounts.google.com/gsi/client'

let loading: Promise<void> | null = null

export function loadGoogleIdentity(): Promise<void> {
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null // let a later attempt try again
      reject(new Error('Google sign-in could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return loading
}
