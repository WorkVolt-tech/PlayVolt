import { HAND_STYLES, handPictures } from '../lib/handLook'
import './HandPicture.css'

// load every hand up front, so the first knock or slam isn't waiting on it
if (typeof Image !== 'undefined') {
  for (const h of Object.values(HAND_STYLES)) for (const src of [h.knock, h.slam]) { const img = new Image(); img.src = src }
}

// The knocking or slamming hand, in a player's chosen look (src/lib/handLook.js).
// The nail colour is a layer cut to the nails' shape and multiplied over them.
// className / onAnimationEnd go on the outer element, which the animations move.
export default function HandPicture({ kind, look, className = '', onAnimationEnd }) {
  const pic = handPictures(look, kind)
  return (
    <span className={`hand-pic ${className}`} onAnimationEnd={onAnimationEnd} aria-hidden="true">
      <img src={pic.src} alt="" draggable={false} />
      {pic.nails && (
        <span className="hand-pic-nails" style={{
          background: pic.color,
          WebkitMaskImage: `url(${pic.nails})`, maskImage: `url(${pic.nails})`,
        }} />
      )}
    </span>
  )
}
