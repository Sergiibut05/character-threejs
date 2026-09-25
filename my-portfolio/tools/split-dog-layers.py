"""
Split media-src/art/Dog.png into the four layers the start screen animates:

    static/images/dog/tail.webp   wags, pivoting where it meets the haunch
    static/images/dog/body.webp   never moves (except breathing, on the parent)
    static/images/dog/head.webp   turns a few degrees, pivoting at the neck
    static/images/dog/eye.webp    blinks, painted out of the head layer

All four share one canvas (420 x 451, the dog's own alpha bounds), so the page
stacks them with `inset: 0` and nothing has to be lined up by hand.

The cuts are the part worth knowing about before touching the angles in CSS:

  * The tail is found, not drawn. The artwork's outline is one dark orange and
    the fills are separate regions inside it, so the tail is whatever fill is
    connected to a seed point on it. The outline it shares with the body stays
    in the BODY layer, and the tail's colours are smeared ~40px underneath the
    body, so a wag uncovers more tail rather than a gap. Keep the wag under
    about 7 degrees or the smear runs out.

  * The head has no outline at the neck to cut along, so the seam is a
    feathered line across the neck, and the body keeps a strip of the head
    above it. Up to ~4 degrees of turn the two overlap and the seam is
    invisible; past that the throat starts to notch.

  * The eye is separated by how far each pixel is between black and the face
    orange, so its anti-aliased edge comes with it, and the head layer gets
    plain orange where the eye was.

Run from my-portfolio/:  python3 tools/split-dog-layers.py
Needs numpy, scipy and Pillow. The 800-wide coordinates below are positions
on the artwork scaled to 800px wide, which is where they were measured.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'media-src/art/Dog.png'
OUT_DIR = ROOT / 'static/images/dog'
OUT_W = 420

art = Image.open(SRC).convert('RGBA')
art = art.crop(art.getbbox())

WK = 1200  # work at ~3x the output so the cuts are clean after downscaling
H0 = round(art.size[1] * WK / art.size[0])
im = np.asarray(art.resize((WK, H0), Image.LANCZOS)).astype(np.float32)
rgb, a = im[..., :3], im[..., 3] / 255.0
S = WK / 800.0  # 800-grid -> work pixels

ORANGE = np.array([240, 137, 42.])
CREAM = np.array([250, 236, 213.])
DARK = np.array([210, 110, 37.])   # outline, and the far ear / far legs
BLACK = np.array([43, 42, 37.])

dist = lambda c: np.linalg.norm(rgb - c, axis=-1)
dO, dC, dD, dB = dist(ORANGE), dist(CREAM), dist(DARK), dist(BLACK)
opaque = a > 0.5
barrier = ((dD < dO) & (dD < dC)) | (dB < 80)
fill = opaque & ~barrier

# ---- tail -------------------------------------------------------------------
lab, _ = nd.label(fill)
at = lambda x, y: lab[int(y * S), int(x * S)]
tail_ids = {at(700, 650), at(740, 720), at(760, 780)} - {0}
body_ids = {at(300, 500), at(160, 450), at(400, 700)} - {0}
assert tail_ids and not (tail_ids & body_ids), 'the tail region leaks into the body'
tail_fill = np.isin(lab, list(tail_ids))

d_tail = nd.distance_transform_edt(~tail_fill)
d_other = nd.distance_transform_edt(~(fill & ~tail_fill))
outline = 14 * S / 1.5
tail_region = (a > 0.02) & (d_tail < d_other) & (d_other > outline)

idx = nd.distance_transform_edt(~tail_fill, return_indices=True)[1]
near_tail_rgb = rgb[idx[0], idx[1]]
d_edge = nd.distance_transform_edt(opaque)
under = (d_tail < 40 * S / 1.5) & opaque & ~tail_region & (d_edge > 22 * S / 1.5)

# ---- head / body seam ---------------------------------------------------------
p1 = np.array([118, 348.]) * S
p2 = np.array([424, 268.]) * S
yy, xx = np.mgrid[0:H0, 0:WK].astype(np.float32)
nx, ny = p2[1] - p1[1], -(p2[0] - p1[0])
nl = np.hypot(nx, ny)
s = (xx - p1[0]) * nx / nl + (yy - p1[1]) * ny / nl
if s[int(100 * S), int(300 * S)] < 0:
    s = -s  # head side positive
F = 9 * S / 1.5
head_alpha = np.clip((s + F) / (2 * F), 0, 1)
body_keep = (s < F * 4).astype(np.float32)

# ---- eye --------------------------------------------------------------------
eye_zone = np.hypot(xx - 167 * S, yy - 167 * S) < 30 * S
v = ORANGE - BLACK
t = np.clip(((rgb - BLACK) @ v) / (v @ v), 0, 1)
eye_alpha = np.where(eye_zone, 1 - t, 0) * a
eye_alpha[eye_alpha < 0.04] = 0


def layer(alpha, color):
    out = np.zeros_like(im)
    out[..., :3] = color
    out[..., 3] = np.clip(alpha, 0, 1) * 255
    return out


layers = {
    'tail': layer(np.where(tail_region, a, 0) + np.where(under, 1, 0),
                  np.where(tail_region[..., None], rgb, near_tail_rgb)),
    'body': layer(a * body_keep * ~tail_region, rgb),
    'head': layer(np.where(eye_alpha > 0, np.maximum(a * head_alpha, (eye_zone & opaque) * 1.0), a * head_alpha),
                  np.where((eye_alpha > 0)[..., None], ORANGE, rgb)),
    'eye': layer(eye_alpha, BLACK),
}

OUT_DIR.mkdir(parents=True, exist_ok=True)
out_h = round(H0 * OUT_W / WK)
for name, arr in layers.items():
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').resize((OUT_W, out_h), Image.LANCZOS)
    img.save(OUT_DIR / f'{name}.webp', 'WEBP', quality=90, method=6)

h800 = 800 * H0 / WK
print(f'{OUT_W} x {out_h} written to {OUT_DIR.relative_to(ROOT)}')
print(f'transform-origin  tail {655 / 8:.1f}% {680 / h800 * 100:.1f}%   '
      f'head {271 / 8:.1f}% {308 / h800 * 100:.1f}%   eye {167 / 8:.1f}% {167 / h800 * 100:.1f}%')
