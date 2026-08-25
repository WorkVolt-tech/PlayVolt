import './DominoTile.css'

export default function DominoTile({
  top, bottom, isVertical = true,
  playable = false, selected = false, notPlayable = false,
  onClick, style, className = '',
}) {
  let cls = 'domino-tile'
  if (isVertical) cls += ' vertical'
  else cls += ' horizontal'
  if (playable) cls += ' playable'
  if (selected) cls += ' selected'
  if (notPlayable) cls += ' not-playable'
  if (className) cls += ' ' + className

  return (
    <div className={cls} style={style} onClick={playable || onClick ? onClick : undefined}>
      <div className="pip-half">
        <img
          className="pip-img"
          src={`/tiles-white/${top}.png`}
          alt={String(top)}
          style={!isVertical && top === 6 ? { transform: 'rotate(90deg)' } : undefined}
        />
      </div>
      <div className="pip-half">
        <img
          className="pip-img"
          src={`/tiles-white/${bottom}.png`}
          alt={String(bottom)}
          style={!isVertical && bottom === 6 ? { transform: 'rotate(90deg)' } : undefined}
        />
      </div>
    </div>
  )
}
