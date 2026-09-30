/**
 * The InsForge SDK, loaded on demand. Code that runs on public pages (auth, telemetry) uses
 * this so first-time visitors don't download the SDK and its websocket client before first
 * paint. App code that only runs when signed in can import `./insforge` directly.
 */
export const sdk = () => import('./insforge').then((m) => m.insforge)
