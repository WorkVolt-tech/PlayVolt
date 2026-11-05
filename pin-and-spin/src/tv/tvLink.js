// TV links look like  https://<site>/?tv=A1B2C3#<display token>
// The token sits after "#", so it is never sent to the web server or kept in its logs.
export function tvUrl(code, displayToken) {
  return `${location.origin}${location.pathname}?tv=${encodeURIComponent(code)}#${displayToken}`;
}
export function readTvLink() {
  const code = new URLSearchParams(location.search).get('tv')?.toUpperCase() || '';
  const token = location.hash.replace(/^#/, '');
  return /^[A-F0-9]{6}$/.test(code) && /^[a-f0-9]{64}$/.test(token) ? { code, token } : null;
}
export const isTvLink = () => new URLSearchParams(location.search).has('tv');
