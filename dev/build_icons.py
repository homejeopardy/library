"""Renders the PNG icons from icons/*.svg.

Home screens need PNG: iOS ignores an SVG apple-touch-icon, and Android's
manifest wants fixed sizes. The SVGs stay the source of truth — edit those and
run this. Needs Google Chrome, which is already how the card sheets are checked.

    python3 dev/build_icons.py
"""
import os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'icons')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# (source svg, output png, pixels)
JOBS = [
    ('icon.svg',          'icon-192.png',          192),
    ('icon.svg',          'icon-512.png',          512),
    ('icon-maskable.svg', 'icon-maskable-512.png', 512),
    # iOS puts its own rounded mask over this one, so it is the full-bleed art.
    ('icon.svg',          'apple-touch-icon.png',  180),
    ('favicon.svg',       'favicon-32.png',        32),
]


def render(svg, png, size, work):
    page = os.path.join(work, 'page.html')
    with open(page, 'w') as f:
        f.write('<!doctype html><meta charset="utf-8">'
                '<style>html,body{margin:0;padding:0;overflow:hidden}'
                f'img{{display:block;width:{size}px;height:{size}px}}</style>'
                f'<img src="{svg}">')
    shutil.copy(os.path.join(ICONS, svg), os.path.join(work, svg))
    out = os.path.join(work, 'shot.png')
    # Chrome started again straight after a previous headless run sometimes
    # exits 2 without writing anything. Trying again a moment later always
    # works, so the retry is here rather than in whoever runs this.
    for attempt in range(4):
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                        f'--screenshot={out}', f'--window-size={size},{size}',
                        '--virtual-time-budget=3000', 'file://' + page],
                       capture_output=True)
        if os.path.exists(out):
            break
        time.sleep(1.5)
    else:
        raise SystemExit('Chrome would not render ' + svg)
    shutil.move(out, os.path.join(ICONS, png))
    return os.path.getsize(os.path.join(ICONS, png))


if __name__ == '__main__':
    if not os.path.exists(CHROME):
        sys.exit('Google Chrome not found at ' + CHROME)
    with tempfile.TemporaryDirectory() as work:
        for svg, png, size in JOBS:
            n = render(svg, png, size, work)
            print(f'{png:<24} {size}x{size}  {n:,} bytes')
