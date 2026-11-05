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
// The short TV address: https://<site>/tv shows a 4-letter code to type on a phone.
export const isTvPairPage = () => /^\/tv\/?$/i.test(location.pathname);
export const isTvLink = () => new URLSearchParams(location.search).has('tv') || isTvPairPage();
export const tvPairAddress = () => `${location.host}/tv`;
// After pairing, show the normal TV link in the address bar (reloading keeps the room).
export function openTvLink({ code, token }) {
  history.replaceState(null, '', `/?tv=${encodeURIComponent(code)}#${token}`);
}
export function backToPairing() {
  history.replaceState(null, '', '/tv');
}
