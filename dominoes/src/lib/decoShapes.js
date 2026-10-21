// ── Deco tile shapes ─────────────────────────────────────────────────────────
// The six shaped skins in the black-marble-and-gold family: Hexa (notched hex),
// Oktav (long octagon), Fle (fleur), Lozanj (lozenge), Dyaman (twin diamonds),
// Triyang (two triangles meeting point to point)
// and Konkav (concave). Drawn sideways in a 200 × 100 grid, like Kapsil and Zo;
// components/ShapedTile.jsx turns them upright and handles the box.
//
// decoSvg(kind, a, b, back) returns one tile's SVG markup (our own drawing, no
// user text in it); decoDefs() the shared gradients and patterns it uses.

const SIDE ={0:[],1:[4],2:[2,6],3:[2,4,6],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,1,2,6,7,8]}
const DEFS=`<defs>
 <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f6dc9a"/><stop offset=".25" stop-color="#d6ad5a"/><stop offset=".55" stop-color="#9c7430"/><stop offset=".8" stop-color="#cfa456"/><stop offset="1" stop-color="#5e4316"/></linearGradient>
 <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#6e4f16"/><stop offset=".45" stop-color="#f3d68e"/><stop offset=".6" stop-color="#c79a45"/><stop offset="1" stop-color="#5e4316"/></linearGradient>
 <radialGradient id="face" cx=".45" cy=".35" r=".8">
  <stop offset="0" stop-color="#262320"/><stop offset=".7" stop-color="#121110"/><stop offset="1" stop-color="#080807"/></radialGradient>
 <radialGradient id="ivory" cx=".4" cy=".35" r=".7">
  <stop offset="0" stop-color="#fffdf3"/><stop offset=".6" stop-color="#f1e7cc"/><stop offset="1" stop-color="#c9b88e"/></radialGradient>
 <radialGradient id="stud" cx=".35" cy=".3" r=".75">
  <stop offset="0" stop-color="#fff0bd"/><stop offset=".45" stop-color="#d4a94a"/><stop offset="1" stop-color="#5e4316"/></radialGradient>
 <pattern id="veins" width="200" height="100" patternUnits="userSpaceOnUse">
  <path d="M-5 30 C30 22 45 48 80 40 S130 18 160 34 205 30 205 30" fill="none" stroke="#b8893a" stroke-width=".7" opacity=".35"/>
  <path d="M20 95 C40 70 70 78 95 60 S150 70 210 52" fill="none" stroke="#b8893a" stroke-width=".55" opacity=".28"/>
  <path d="M60 0 C66 20 52 34 62 52" fill="none" stroke="#b8893a" stroke-width=".45" opacity=".25"/>
  <path d="M140 100 C134 84 150 76 142 60" fill="none" stroke="#b8893a" stroke-width=".45" opacity=".25"/></pattern>
 <pattern id="quilt" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <path d="M0 0 H14 M0 0 V14" stroke="#c9a14a" stroke-width=".8" opacity=".28"/></pattern>
</defs>`

// ── outlines, sideways in a 200 x 100 grid ──
const OUT={
  hex:  'M6 30 L36 6 H80 L90 14 H110 L120 6 H164 L194 30 V70 L164 94 H120 L110 86 H90 L80 94 H36 L6 70 Z',
  oct:  'M24 5 H176 L196 25 V75 L176 95 H24 L4 75 V25 Z',
  fleur:'M100 4 Q60 14 22 12 Q26 40 2 50 Q26 60 22 88 Q60 86 100 96 Q140 86 178 88 Q174 60 198 50 Q174 40 178 12 Q140 14 100 4 Z',
  lozenge:'M100 4 L172 12 L198 50 L172 88 L100 96 L28 88 L2 50 L28 12 Z',
  diamonds:'M50 2 L98 50 L50 98 L2 50 Z M150 2 L198 50 L150 98 L102 50 Z',
  triangles:'M3 3 L97 50 L3 97 Z M197 3 L103 50 L197 97 Z',
  concave:'M4 4 Q100 22 196 4 Q182 50 196 96 Q100 78 4 96 Q18 50 4 4 Z',
}
// pip centres (cx for each half) and spacing / radius per shape
const PIP={hex:[52,148,19,7.8],oct:[54,146,19,7.8],fleur:[64,136,16.5,7],lozenge:[62,138,17,7.2],diamonds:[50,150,15,6.8],concave:[56,144,17.5,7.4],triangles:[28,172,11,4.6,12.5]}   // triangles: [cx1, cx2, across, radius, up-down]
// divider extent (y1,y2)
const BAR={hex:[22,78],oct:[16,84],fleur:[16,84],lozenge:[14,86],diamonds:null,concave:[22,78],triangles:null}

// pull a shape in by `t` units (non-uniform scale about its centre so the rim is even)
function inset(d,t,cx=100,cy=50,w=200,h=100){
  const sx=(w-2*t)/w, sy=(h-2*t)/h
  return `transform="translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})"`
}
// a triangle pulled in evenly by t on every side (so the rim is the same width at the points)
const TRI_L=[[3,3],[97,50],[3,97]], TRI_R=[[197,3],[103,50],[197,97]]
function insetTri(P,t){
  // centroid tells us which way is "in"
  const cx=(P[0][0]+P[1][0]+P[2][0])/3, cy=(P[0][1]+P[1][1]+P[2][1])/3
  const lines=P.map((a,i)=>{const b=P[(i+1)%3]; let nx=b[1]-a[1], ny=a[0]-b[0]; const L=Math.hypot(nx,ny); nx/=L; ny/=L
    if((cx-a[0])*nx+(cy-a[1])*ny<0){nx=-nx;ny=-ny}
    return {p:[a[0]+nx*t,a[1]+ny*t], d:[b[0]-a[0],b[1]-a[1]]}})
  const cross=(l1,l2)=>{const den=l1.d[0]*l2.d[1]-l1.d[1]*l2.d[0]
    const u=((l2.p[0]-l1.p[0])*l2.d[1]-(l2.p[1]-l1.p[1])*l2.d[0])/den
    return [l1.p[0]+u*l1.d[0], l1.p[1]+u*l1.d[1]]}
  const q=[cross(lines[2],lines[0]),cross(lines[0],lines[1]),cross(lines[1],lines[2])]
  return 'M'+q.map(v=>v[0].toFixed(2)+' '+v[1].toFixed(2)).join(' L')+' Z'
}
function layer(kind,t,attrs){
  if(kind==='triangles') return `<path d="${insetTri(TRI_L,t)} ${insetTri(TRI_R,t)}" ${attrs}/>`
  if(kind==='diamonds'){ // scale each diamond about its own centre
    const L='M50 2 L98 50 L50 98 L2 50 Z', R='M150 2 L198 50 L150 98 L102 50 Z'
    return `<path d="${L}" ${inset(L,t,50,50,100,100)} ${attrs}/><path d="${R}" ${inset(R,t,150,50,100,100)} ${attrs}/>`
  }
  return `<path d="${OUT[kind]}" ${inset(OUT[kind],t)} ${attrs}/>`
}
function pips(n,cx,cy,d,r,dy=d){
  return (SIDE[n]||[]).map(i=>{const x=cx+((i%3)-1)*d,y=cy+(Math.floor(i/3)-1)*dy
    return `<circle cx="${x}" cy="${y}" r="${r+.9}" fill="#9c7430"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#ivory)"/>`+
           `<circle cx="${x-r*.3}" cy="${y-r*.35}" r="${r*.3}" fill="rgba(255,255,255,.7)"/>`}).join('')
}
function fleurMark(x,dir){ // a fleur-de-lis lying on its side, pointing outward
  return `<g transform="translate(${x} 50) scale(${dir*1.25} 1.25)" fill="url(#gold)" stroke="#5e4312" stroke-width=".35">
   <path d="M13 0 C9 -2.4 6 -3 3.5 -2 C5 -1 5 1 3.5 2 C6 3 9 2.4 13 0 Z"/>
   <path d="M4 -1.6 C2 -7 -3 -9 -5 -5.5 C-2.5 -6.5 0 -5 1.5 -1.4 Z"/>
   <path d="M4 1.6 C2 7 -3 9 -5 5.5 C-2.5 6.5 0 5 1.5 1.4 Z"/>
   <rect x="0.6" y="-3.2" width="2.2" height="6.4" rx=".8"/>
   <path d="M0.6 0 C-1.5 -.6 -3 -1.4 -4 -.6 C-3 0 -3 0 -4 .6 C-3 1.4 -1.5 .6 0.6 0 Z"/></g>`
}
function fanMark(x,dir){ // an Art Deco fan opening outward
  let g=`<g transform="translate(${x} 50) scale(${dir*1.3} 1.3)" fill="url(#gold)" stroke="#5e4312" stroke-width=".3">`
  for(let k=-3;k<=3;k++){ g+=`<path d="M0 0 L11 -1.5 Q11.8 0 11 1.5 Z" transform="rotate(${k*17})"/>` }
  return g+`<circle cx="0" cy="0" r="2" /></g>`
}
function medallion(k,cx=100){const cy=50
  return `<path d="M${cx} ${cy-k} L${cx+k*1.35} ${cy} L${cx} ${cy+k} L${cx-k*1.35} ${cy} Z" fill="url(#gold)" stroke="#5e4312" stroke-width=".8"/>
  <path d="M${cx} ${cy-k*.62} L${cx+k*.84} ${cy} L${cx} ${cy+k*.62} L${cx-k*.84} ${cy} Z" fill="#0c0b09"/>
  <circle cx="${cx}" cy="${cy}" r="${k*.3}" fill="url(#ivory)"/>`
}
function art(kind,a,b,back){
  // rim, dark edge, face, fine inner line (the triangles get a slimmer rim: they narrow to a point)
  const [e1,e2,e3] = kind==='triangles' ? [4,5,7.5] : [5,6,9]
  // a soft shadow under the shape, and a gold outline the CSS fades in for the
  // playable / selected / just-played glow — drawn with the tile, so no CSS
  // filters are needed (those are costly on phones)
  let s=`<g transform="translate(0 2.6)">${layer(kind,0,'fill="rgba(0,0,0,.42)"')}</g>`
     + layer(kind,0,'class="st-glow" fill="none" stroke="#e8c96a" stroke-width="14" stroke-opacity=".3" stroke-linejoin="round"')
     + layer(kind,0,'class="st-glow" fill="none" stroke="#f3d27a" stroke-width="7" stroke-linejoin="round"')
     + layer(kind,0,'fill="url(#gold)" stroke="#4a3410" stroke-width="1"')
     + layer(kind,e1,'fill="#0a0907"') + layer(kind,e2,'fill="url(#face)"') + layer(kind,e2,`fill="url(#${back?'quilt':'veins'})"`)
     + layer(kind,e3,'fill="none" stroke="#c9a14a" stroke-width=".9" opacity=".8"')
  if(kind==='fleur'){ s+=fleurMark(30,-1)+fleurMark(170,1) }
  if(kind==='lozenge'){ s+=fanMark(24,-1)+fanMark(176,1) }
  if(back){
    if(kind==='diamonds') s+=`<circle cx="100" cy="50" r="5" fill="url(#stud)"/>`+medallion(13,50)+medallion(13,150)
    else if(kind==='triangles') s+=`<circle cx="100" cy="50" r="5" fill="url(#stud)"/>`+medallion(9,32)+medallion(9,168)
    else s+=medallion(kind==='oct'?20:17)
    return s
  }
  const [c1,c2,d,r,dy]=PIP[kind]
  if(BAR[kind]) s+=`<rect x="97.6" y="${BAR[kind][0]}" width="4.8" height="${BAR[kind][1]-BAR[kind][0]}" rx="2.2" fill="url(#bar)"/>`
  s+=`<circle cx="100" cy="50" r="5.2" fill="url(#stud)"/>`
  if(kind==='diamonds'){
    // pips sit square-on inside each diamond, like the reference
    s+=pips(a,c1,50,d,r)+pips(b,c2,50,d,r)
  } else s+=pips(a,c1,50,d,r,dy)+pips(b,c2,50,d,r,dy)
  return s
}

export const DECO_KINDS = ['hex', 'oct', 'fleur', 'lozenge', 'diamonds', 'concave', 'triangles']

// The colour definitions, once for the whole page (ShapedTile puts them in a
// shared, always-present <svg>); every tile refers to them by these ids.
export const DECO_PREFIX = 'sd-dk-'
export function decoDefs() {
  return DEFS.replace(/url\(#(\w+)\)/g, `url(#${DECO_PREFIX}$1)`).replace(/id="(\w+)"/g, `id="${DECO_PREFIX}$1"`)
}

// one tile's art (no definitions of its own)
export function decoSvg(kind, a, b, back) {
  return art(kind, a || 0, b || 0, !!back).replace(/url\(#(\w+)\)/g, `url(#${DECO_PREFIX}$1)`)
}
