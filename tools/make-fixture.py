"""Génère tests/fixtures/padel-ia.jpg : un FAUX pixel art synthétique.

Image de remplacement fabriquée pour reproduire les défauts typiques d'une
image d'IA : sprite de 94x121 cases agrandi à ~6 px par case, bords flous,
bruit, compression JPEG, fond magenta foncé (167, 0, 132), 1408x768.

À remplacer par la vraie image de référence si on l'a ; il faut ensuite
régénérer padel-ia.png (version décodée sans perte lue par les tests) :
    python3 tools/make-fixture.py --png-only

Dépendances (outil de dev uniquement, pas l'appli) : Pillow, numpy.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

FIX = 'tests/fixtures/'
W, H = 94, 121          # taille native du sprite, en cases
P = 6                   # taille d'une case en pixels
BG = (167, 0, 132)


def sprite():
    rng = np.random.default_rng(7)
    rgb = np.zeros((H, W, 3), np.float64)
    a = np.zeros((H, W), bool)
    yy, xx = np.mgrid[0:H, 0:W]

    def fill(mask, base, shade=0.0):
        # dégradé vertical par paliers : beaucoup de nuances, comme une IA
        base = np.array(base, np.float64)
        steps = np.clip(((yy - yy[mask].min()) / max(1, np.ptp(yy[mask])) * 4).astype(int), 0, 3)
        col = base[None, None, :] * (1 - shade * steps[..., None] / 3)
        rgb[mask] = col[mask]
        a[mask] = True

    ell = lambda cx, cy, rx, ry: ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    rect = lambda x0, y0, x1, y1: (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)

    fill(rect(38, 60, 44, 112) | rect(50, 60, 56, 112), (226, 178, 140), 0.25)   # jambes
    fill(rect(34, 108, 46, 120) | rect(48, 108, 62, 120), (250, 250, 250), 0.3) # chaussures
    fill(rect(36, 112, 46, 114) | rect(48, 112, 62, 114), (30, 90, 200))        # bandes
    fill(rect(32, 58, 60, 78), (40, 40, 60), 0.4)                               # short
    fill(rect(28, 26, 64, 60), (245, 245, 240), 0.35)                           # maillot
    fill(rect(40, 32, 50, 40), (20, 80, 210), 0.2)                              # logo bleu
    fill(rect(14, 28, 30, 34) | rect(62, 26, 76, 32), (226, 178, 140), 0.2)    # bras
    fill(ell(46, 14, 10, 12), (226, 178, 140), 0.3)                             # tête
    fill(ell(46, 7, 11, 6), (70, 40, 20), 0.3)                                  # cheveux
    fill(rect(41, 13, 42, 14) | rect(49, 13, 50, 14), (20, 20, 20))             # yeux
    fill(ell(83, 12, 10, 12), (230, 60, 40), 0.3)                               # raquette
    fill(ell(83, 12, 6, 8), (250, 200, 60), 0.2)
    fill(rect(74, 22, 78, 30), (20, 20, 20))                                    # manche
    fill(ell(4, 60, 4, 4), (210, 230, 40), 0.2)                                 # balle
    fill(rect(8, 30, 14, 33), (226, 178, 140))                                  # main

    # contour sombre d'un pixel, comme en pixel art
    pad = np.pad(a, 1)
    inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    edge = a & ~inner
    rgb[edge] = rgb[edge] * 0.35
    rgb += rng.normal(0, 1.5, rgb.shape)
    return np.clip(rgb, 0, 255), a


def render():
    rgb, a = sprite()
    img = np.empty((768, 1408, 3), np.float64)
    img[:] = BG
    ox, oy = 423, 21                      # coin du sprite (décalage non multiple de 6)
    big_rgb = rgb.repeat(P, 0).repeat(P, 1)
    big_a = a.repeat(P, 0).repeat(P, 1)
    region = img[oy:oy + H * P, ox:ox + W * P]
    region[big_a] = big_rgb[big_a]
    rng = np.random.default_rng(1)
    img += rng.normal(0, 4, img.shape)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(0.9))
    im.save(FIX + 'padel-ia.jpg', quality=82)


def to_png():
    Image.open(FIX + 'padel-ia.jpg').convert('RGBA').save(FIX + 'padel-ia.png', optimize=True)


if __name__ == '__main__':
    if '--png-only' not in sys.argv:
        render()
    to_png()
