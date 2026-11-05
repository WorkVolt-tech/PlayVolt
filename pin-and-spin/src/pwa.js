// Installable app (like Dekabess): registers the service worker and keeps Android's
// "install" prompt so the home screen can offer an Install button. iPhones have no such
// prompt: the home screen shows Share → Add to Home Screen instead.
import { isTvLink } from './tv/tvLink.js';

let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad reports as a Mac
export const canPromptInstall = () => Boolean(deferred);
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export async function promptInstall() {
  if (!deferred) return false;
  const prompt = deferred;
  deferred = null;
  emit();
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  return choice?.outcome === 'accepted';
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
  // The TV screen and TV app don't need it.
  if ('serviceWorker' in navigator && !isTvLink()) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
}
