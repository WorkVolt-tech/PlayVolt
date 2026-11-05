# Generates the eight logo-style ball SVGs in this folder: python3 generate.py .
import math, sys
out = sys.argv[1]
def f(x): return f'{x:.1f}'.rstrip('0').rstrip('.')

def waves(c):
    paths = []
    for y in range(4, 104, 15):
        d = f'M-20 {y}' + ''.join(f' Q{x+7.5} {y-9} {x+15} {y} T{x+30} {y}' for x in range(-20, 120, 30))
        paths.append(f'<path d="{d}"/>')
    return f'<g transform="rotate(-14 50 50)" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round">{"".join(paths)}</g>'

def spiral(c):
    pts = []
    cx, cy = 56, 57
    for i in range(0, 900):
        t = i / 40
        r = 2 + 4.6 * t
        if r > 70: break
        pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    d = 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="11" stroke-linecap="round"/>'

def honeycomb(c):
    s = 9.5  # hexagon radius
    w = math.sqrt(3) * s
    segs = []
    for row in range(-1, 9):
        for col in range(-1, 8):
            cx = col * w + (w / 2 if row % 2 else 0)
            cy = row * 1.5 * s
            pts = [(cx + s * math.cos(math.radians(60 * k + 30)), cy + s * math.sin(math.radians(60 * k + 30))) for k in range(6)]
            segs.append('M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z')
    return f'<path d="{" ".join(segs)}" fill="none" stroke="{c}" stroke-width="3.2" stroke-linejoin="round"/>'

def diamonds(c):
    rects = []
    size = 15
    for i in range(-6, 8):
        for j in range(-6, 8):
            if (i + j) % 2 == 0:
                rects.append(f'<rect x="{i*size}" y="{j*size}" width="{size}" height="{size}"/>')
    return f'<g transform="translate(50 50) rotate(45) scale(1 1.35) translate(-50 -50)" fill="{c}">{"".join(rects)}</g>'

def rays(c):
    wedges = []
    cx, cy, R = 50, 52, 90
    n = 14
    for k in range(0, n, 1):
        if k % 2: continue
        a1 = 2 * math.pi * k / n; a2 = 2 * math.pi * (k + 1) / n
        wedges.append(f'M{cx} {cy} L{f(cx+R*math.cos(a1))} {f(cy+R*math.sin(a1))} L{f(cx+R*math.cos(a2))} {f(cy+R*math.sin(a2))}Z')
    return f'<path d="{" ".join(wedges)}" fill="{c}"/>'

def dots(c):
    circles = []
    step = 17
    for row in range(-1, 8):
        for col in range(-1, 8):
            x = col * step + (step / 2 if row % 2 else 0); y = row * step * 0.9
            circles.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="4.6"/>')
    return f'<g fill="{c}">{"".join(circles)}</g>'

def stripes(c):
    bands = []
    for k in range(-8, 9):
        bands.append(f'<rect x="{k*16}" y="-60" width="8" height="220"/>')
    return f'<g transform="rotate(35 50 50)" fill="{c}">{"".join(bands)}</g>'

def rings(c):
    circles = []
    for r in range(8, 80, 12):
        circles.append(f'<circle cx="58" cy="60" r="{r}"/>')
    return f'<g fill="none" stroke="{c}" stroke-width="5">{"".join(circles)}</g>'

BALLS = [
    ('blue',   '#7cc6ff', '#1466f2', '#06248a', '#4fc0ff', .95, waves),
    ('red',    '#ff8478', '#ee1520', '#7a000e', '#a8000f', .7, spiral),
    ('green',  '#86f25a', '#17a512', '#07500c', '#a6ff3a', .95, honeycomb),
    ('yellow', '#fff3a0', '#ffc010', '#a86200', '#ffe55c', .85, rays),
    ('purple', '#d9a2ff', '#8a1ff0', '#350675', '#b663ff', .9, diamonds),
    ('white',  '#ffffff', '#e8e4f6', '#8e86b8', '#b9b1df', .95, dots),
    # Extra colors for story World 4 (8-color levels).
    ('orange', '#ffc48a', '#ff7a12', '#8a3200', '#ffb35c', .9, stripes),
    ('pink',   '#ffb3df', '#f2479f', '#7a0f4a', '#ff8ccb', .9, rings),
]
for i, (name, light, mid, dark, pat, op, fn) in enumerate(BALLS):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<radialGradient id="b" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="{light}"/><stop offset=".5" stop-color="{mid}"/><stop offset="1" stop-color="{dark}"/></radialGradient>
<radialGradient id="s" cx="42%" cy="36%" r="64%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
<clipPath id="c"><circle cx="50" cy="50" r="45.5"/></clipPath>
</defs>
<circle cx="50" cy="50" r="49.5" fill="#1a0f3f"/>
<circle cx="50" cy="50" r="45.5" fill="url(#b)"/>
<g clip-path="url(#c)" opacity="{op}">{fn(pat)}</g>
<circle cx="50" cy="50" r="45.5" fill="url(#s)"/>
<path d="M22 76 A36 36 0 0 0 82 70" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="35" cy="23" rx="15" ry="7.5" transform="rotate(-24 35 23)" fill="url(#h)"/>
<circle cx="50" cy="50" r="45.5" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>
</svg>'''
    open(f'{out}/ball-{i}-{name}.svg', 'w').write(svg)
    print(name, len(svg))
