// ── The Goud coin ────────────────────────────────────────────────────────────
// One picture for Goud everywhere (balance, shop prices, stakes, invites):
// public/goud-coin.webp. It sizes itself to the text around it.
export default function GoudCoin({ className = '' }) {
  return <img src="/goud-coin.webp" alt="" aria-hidden="true" className={`goud-coin ${className}`.trim()} draggable="false" />
}
