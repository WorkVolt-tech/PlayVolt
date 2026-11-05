// TV links look like  https://<site>/?tv=A1B2C3#<display token>
// The token sits after "#", so it is never sent to the web server or kept in its logs.
export function tvUrl(code, displayToken) {
  return `${location.origin}/?tv=${encodeURIComponent(code)}#${displayToken}`;
}
export function readTvLink() {
  const code = new URLSearchParams(location.search).get('tv')?.toUpperCase() || '';
  const token = location.hash.replace(/^#/, '');
  return /^[A-F0-9]{6}$/.test(code) && /^[a-f0-9]{64}$/.test(token) ? { code, token } : null;
}
// The TV code screen is /?tv=pair (any ?tv without a valid room link). The short address
// <site>/tv redirects there (public/_redirects); the path check is a fallback.
export const isTvPairPage = () => /^\/tv\/?$/i.test(location.pathname);
export const isTvLink = () => new URLSearchParams(location.search).has('tv') || isTvPairPage();
// True inside the Pin & Spin TV app (Fire TV / Android TV), which adds this to its user agent.
export const inTvApp = () => /\bPlayVoltTV\//.test(navigator.userAgent);
export const tvPairAddress = () => `${location.host}/tv`;
// After pairing, show the normal TV link in the address bar (reloading keeps the room).
export function openTvLink({ code, token }) {
  history.replaceState(null, '', `/?tv=${encodeURIComponent(code)}#${token}`);
}
export function backToPairing() {
  history.replaceState(null, '', '/?tv=pair');
}
