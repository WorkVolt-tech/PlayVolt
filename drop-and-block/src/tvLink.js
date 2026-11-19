// Put the read-only TV capability in a URL fragment, not in query strings,
// so servers and access logs never receive it with the page request.
export function buildTvDisplayUrl(location, code, token) {
  const url = new URL(location.pathname || '/', location.origin);
  url.searchParams.set('tv', code);
  url.hash = token;
  return url.toString();
}
export function isTvPage(location) {
  return new URLSearchParams(location.search).has('tv');
}
export function readTvLink(location) {
  const code = new URLSearchParams(location.search).get('tv')?.toUpperCase() || '';
  const token = location.hash.replace(/^#/, '');
  if (!/^[A-F0-9]{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(token)) return null;
  return { code, token };
}
export function buildJoinUrl(location, code) {
  const url = new URL(location.pathname || '/', location.origin);
  url.searchParams.set('room', code);
  return url.toString();
}
