# Builds the Fire TV launcher icon and banner from the Pin & Spin logo.
#   python3 firetv/make_art.py   (run from pin-and-spin/)
from PIL import Image, ImageDraw

LOGO = Image.open('public/pin-and-spin-logo.webp').convert('RGBA')
RES = 'firetv/app/src/main/res'

def background(w, h):
    bg = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(bg)
    for y in range(h):  # deep purple, like the game's backdrop
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=(int(42 - 26 * t), int(22 - 10 * t), int(78 - 46 * t), 255))
    return bg

def fit(img, w, h):
    s = min(w / img.width, h / img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)

def banner(w, h, path):
    bg = background(w, h)
    logo = fit(LOGO, w * 0.92, h * 0.94)
    bg.alpha_composite(logo, ((w - logo.width) // 2, (h - logo.height) // 2))
    bg.convert('RGB').save(path)

def icon(size, path):
    bg = background(size, size)
    logo = fit(LOGO, size * 0.98, size * 0.98)
    bg.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    bg.convert('RGB').save(path)

import os
for folder, size in [('mipmap-mdpi', 48), ('mipmap-hdpi', 72), ('mipmap-xhdpi', 96), ('mipmap-xxhdpi', 144), ('mipmap-xxxhdpi', 192)]:
    os.makedirs(f'{RES}/{folder}', exist_ok=True)
    icon(size, f'{RES}/{folder}/ic_launcher.png')
os.makedirs(f'{RES}/drawable-xhdpi', exist_ok=True)
banner(320, 180, f'{RES}/drawable-xhdpi/banner.png')
# Store artwork for the Amazon Appstore listing (uploaded by hand in the Developer Console).
os.makedirs('firetv/store-art', exist_ok=True)
banner(1280, 720, 'firetv/store-art/background-1280x720.png')
icon(512, 'firetv/store-art/icon-512.png')
icon(114, 'firetv/store-art/icon-114.png')
print('done')
