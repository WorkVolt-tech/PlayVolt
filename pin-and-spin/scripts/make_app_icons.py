# Builds the installable-app icons (phone home screen) from the Pin & Spin logo.
#   python3 scripts/make_app_icons.py   (run from pin-and-spin/)
from PIL import Image, ImageDraw

LOGO = Image.open('public/pin-and-spin-logo.webp').convert('RGBA')

def background(size):
    bg = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(bg)
    for y in range(size):  # the game's deep purple
        t = y / max(1, size - 1)
        d.line([(0, y), (size, y)], fill=(int(42 - 26 * t), int(22 - 10 * t), int(78 - 46 * t), 255))
    return bg

def icon(size, path, fill):
    # fill: share of the square the logo may use (maskable icons keep a safe margin).
    bg = background(size)
    s = min(size * fill / LOGO.width, size * fill / LOGO.height)
    logo = LOGO.resize((round(LOGO.width * s), round(LOGO.height * s)), Image.LANCZOS)
    bg.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    bg.convert('RGB').save(path)

icon(192, 'public/icon-192.png', .96)
icon(512, 'public/icon-512.png', .96)
icon(192, 'public/icon-maskable-192.png', .74)
icon(512, 'public/icon-maskable-512.png', .74)
icon(180, 'public/apple-touch-icon.png', .94)
icon(32, 'public/favicon-32.png', 1)
print('done')
