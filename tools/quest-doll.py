# Builds the paper-doll hero layers (assets/quest/hero-*.webp) from the raw
# ChatGPT art on the art-raw branch. Usage: python3 tools/quest-doll.py <dir>
# <dir>/art holds hero-mid.png, eq-helm.png, eq-weapon.png and the Wave 1 edits
# (hero-bald, hero-outfit-*, hero-boots-*, hero-hair-*). Output goes to <dir>/doll.
#
# Every Wave 1 edit is a redraw of hero-mid in the same pose and framing, so
# after scaling to 768 the pixels line up and parts are cut by diffing.
# Heads are aligned by eye position, weapons by grip point.
#
# Stack, back to front: cape, body, boots, hem, weapon, hand, head|face, blink, tail|hair
import sys, math, numpy as np
from PIL import Image
from scipy import ndimage as nd
SP = sys.argv[1]; OUT = f"{SP}/doll"
N = 768
def load(name, shift=0):
    im = Image.open(f"{SP}/art/{name}.png").convert("RGBA")
    if im.size != (N, N): im = im.resize((N, N), Image.LANCZOS)
    a = np.array(im)
    return np.roll(a, shift, 0) if shift else a
def diff(a, b, t=110): return (np.abs(a.astype(int) - b.astype(int)).sum(2) > t) & (a[:, :, 3] > 110)
def blobs(m, min_area):
    lab, n = nd.label(m); keep = np.zeros_like(m)
    for i, s in enumerate(nd.sum(m, lab, range(1, n + 1)), 1):
        if s >= min_area: keep |= lab == i
    return keep

base = load("hero-mid"); bald = load("hero-bald")
NECK = 412; KNEE = 600
# ---------- ponytail of the helmeted look: hangs below the neck over the cape
tail_m = blobs(diff(base, bald), 1500); tail_m[:NECK] = False
tail_m = nd.binary_dilation(tail_m, iterations=2) & (base[:, :, 3] > 0); tail_m[:NECK] = False
cape = (base[:, :, 0] > 140) & (base[:, :, 1] < 100) & (base[:, :, 0] - base[:, :, 2] > 60)
tail_m &= ~nd.binary_dilation(cape, iterations=1)
tail = np.zeros_like(base); tail[tail_m] = base[tail_m]

# ---------- cape: everything right of the arm in this box, taken from the bald edit
# (no ponytail over it). It sways by stretching out from x=CAPE_X, so the seam with
# the part that stays in the body never opens.
CAPE_X, CAPE_Y0, CAPE_Y1 = 505, 440, 596
cape_l = np.zeros_like(bald)
cape_l[CAPE_Y0:CAPE_Y1, CAPE_X:] = bald[CAPE_Y0:CAPE_Y1, CAPE_X:]
cape_l[:, :, 3] = np.where(cape_l[:, :, 3] > 110, 255, 0)

def body_from(src, robe=False):
    b = src.copy()
    b[:NECK] = 0; b[KNEE:] = 0
    # the ponytail lives in its own layer; patch the cape behind it from the bald edit
    b[tail_m] = 0 if robe else bald[tail_m]
    if not robe: b[CAPE_Y0:CAPE_Y1, CAPE_X:] = 0     # the cape is its own layer
    b[~blobs(b[:, :, 3] > 0, 150)] = 0                # loose specks left by the cuts
    b[495:640, :280] = 0                      # the baked-in sword
    for y in range(495, min(640, KNEE)):
        if b[y, 280, 3] > 0: b[y, 279] = [27, 27, 31, 255]
    return b
def boots_from(src):
    b = np.zeros_like(src); b[KNEE:] = src[KNEE:]; b[KNEE:640, :280] = 0
    return b

layers = {}
layers["body"] = body_from(base)
layers["boots"] = boots_from(base)
for o in ["leather", "chain", "plate", "robe"]:
    layers["body-" + o] = body_from(load("hero-outfit-" + o), robe=(o == "robe"))
for k in ["leather", "greaves", "winged", "wraps"]:
    b = boots_from(load("hero-boots-" + k))
    ys = np.nonzero(b[:, :, 3].max(1) > 40)[0]; bottom = ys.max() if len(ys) else 0
    if bottom > 703:                          # greaves came back taller: squash the lower leg to fit the box
        part = Image.fromarray(b[KNEE:bottom + 1]).resize((N, 703 - KNEE + 1), Image.LANCZOS)
        b = np.zeros_like(b); b[KNEE:704] = np.array(part)
    layers["boots-" + k] = b
# robe hem hangs below the knee line, over the boots
robe = load("hero-outfit-robe")
hem_m = blobs(diff(robe, base), 60); hem_m[:KNEE] = False; hem_m[660:] = False
hem_m = nd.binary_dilation(hem_m, iterations=1) & (robe[:, :, 3] > 110); hem_m[:KNEE] = False
hem = np.zeros_like(robe); hem[hem_m] = robe[hem_m]; layers["hem-robe"] = hem

layers["cape"] = cape_l
# ---------- blink: the closed-eye frame of the reference idle GIF (art/hero-idle.gif,
# 12 frames, blink on frame 7, upper body 6px lower on frames 4-9)
# hand layer: glove and grip, drawn over the weapon
hand = np.zeros_like(base); hand[503:563, 279:312] = layers["body"][503:563, 279:312]
layers["hand"] = hand
layers["tail"] = tail
# bare head (no helmet): the bald face, hair goes on top
face = bald.copy(); face[NECK + 14:] = 0; layers["face"] = face

# ---------- heads from the helm sheet, aligned by the eyes
BASE_EYES = ((317.4, 359.4), (395.0, 353.3))
sheet = load("eq-helm")
EYES = {"kettle": ((150.5, 285.9), (214.2, 282.3)), "horned": ((497.3, 291.7), (558.6, 288.3)),
        "hood": ((152.7, 608.8), (216.0, 605.1)), "circlet": ((502.9, 615.4), (564.3, 611.0))}
QUAD = {"kettle": (0, 0), "horned": (384, 0), "hood": (0, 384), "circlet": (384, 384)}
def place(src_rgba, src_pts, dst_pts):
    (a1, a2), (b1, b2) = src_pts, dst_pts
    sv = np.subtract(a2, a1); dv = np.subtract(b2, b1)
    s = np.hypot(*dv) / np.hypot(*sv); ang = math.atan2(dv[1], dv[0]) - math.atan2(sv[1], sv[0])
    c, si = math.cos(ang) * s, math.sin(ang) * s
    M = np.array([[c, -si], [si, c]]); sm = np.mean([a1, a2], axis=0); dm = np.mean([b1, b2], axis=0); t = dm - M @ sm
    Mi = np.linalg.inv(M); ti = -Mi @ t
    return np.array(Image.fromarray(src_rgba).transform((N, N), Image.AFFINE,
        (Mi[0, 0], Mi[0, 1], ti[0], Mi[1, 0], Mi[1, 1], ti[1]), resample=Image.BICUBIC))
for n, (qx, qy) in QUAD.items():
    q = sheet.copy(); keep = np.zeros(q.shape[:2], bool); keep[qy:qy + 384, qx:qx + 384] = True; q[~keep] = 0
    hd = place(q, EYES[n], BASE_EYES)
    hd[NECK + 14:] = 0
    hd[:, :, 3] = np.where(hd[:, :, 3] > 110, 255, 0)
    layers["head-" + n] = hd

# ---------- helmets on their own, so any hairstyle can go underneath.
# The helm heads have the old pale hair painted in, and steel highlights are the
# same cream as that hair, so colour can't separate them. Each helmet is cut along
# a hand-traced line instead: everything above it is helmet, hair may only show
# below it (the per-helmet hair mask). The circlet is a band drawn over the hair.
# Points are (x, y) in 768 space; the line is interpolated per column.
HELM_CUT = {
    "kettle": [(198, 302), (210, 296), (230, 286), (250, 270), (270, 255), (290, 242), (310, 236), (400, 236), (430, 241),
               (450, 250), (470, 262), (490, 292), (510, 305), (530, 318), (550, 330), (570, 342), (590, 352), (612, 362)],
    "horned": [(205, 270), (220, 268), (250, 262), (300, 252), (330, 264), (360, 268), (400, 270), (450, 284), (490, 298),
               (520, 308), (546, 314), (552, 240), (612, 240)],
    "hood":   [(198, 430), (212, 430), (216, 340), (226, 305), (240, 276), (260, 246), (280, 226), (300, 213), (330, 206),
               (360, 206), (400, 211), (440, 250), (470, 272), (490, 302), (510, 346), (526, 382), (540, 378), (612, 376)],
}
CIRCLET_BAND = ([(205, 236), (250, 226), (300, 220), (325, 196), (365, 196), (382, 216), (420, 226), (470, 246), (510, 260), (548, 266)],
                [(205, 262), (250, 252), (300, 247), (325, 266), (365, 268), (382, 248), (420, 257), (470, 274), (510, 290), (548, 302)])
def line_y(pts):
    xs = np.arange(N); px, py = zip(*pts)
    y = np.interp(xs, px, py); y[(xs < px[0]) | (xs > px[-1])] = -1   # no helmet in these columns
    return y
yy = np.mgrid[:N, :N][0]
for hn, pts in HELM_CUT.items():
    above = yy < line_y(pts)[None, :]
    hl = np.zeros_like(layers["head-" + hn]); hl[above] = layers["head-" + hn][above]
    layers["helm-" + hn] = hl
    mk = np.zeros((N, N, 4), np.uint8); mk[~above] = 255
    layers["hairmask-" + hn] = mk
top, bot = (line_y(p)[None, :] for p in CIRCLET_BAND)
band = (yy >= top) & (yy < bot) & (top >= 0)
hl = np.zeros_like(layers["head-circlet"]); hl[band] = layers["head-circlet"][band]; layers["helm-circlet"] = hl
for hn in list(HELM_CUT) + ["circlet"]: layers["helm-" + hn][:, :, 3] = np.where(layers["helm-" + hn][:, :, 3] > 110, 255, 0)

# ---------- blinks, one per head. Lashes come from the closed-eye frame of the reference
# idle GIF (art/hero-idle.gif: 12 frames, blink on frame 7, upper body 6px lower on 4-9).
# Each head's own eyes are found, painted over with its skin, and the lashes placed on them.
from PIL import ImageSequence
gif = [np.array(f.convert("RGBA").resize((N, N), Image.NEAREST)) for f in ImageSequence.Iterator(Image.open(f"{SP}/art/hero-idle.gif"))]
f6, f7 = np.roll(gif[6], -6, 0).astype(int), np.roll(gif[7], -6, 0)
EYE_BAND = (slice(318, 400), slice(280, 440))
def eyes_of(img):
    a = img.astype(int); m = np.zeros((N, N), bool)
    blue = (a[:, :, 2] > a[:, :, 0] + 30) & (a[:, :, 2] > 120) & (a[:, :, 3] > 0)
    m[EYE_BAND] = blue[EYE_BAND]
    m = blobs(m, 25)
    lab, n = nd.label(m); cs = sorted(nd.center_of_mass(m, lab, range(1, n + 1)), key=lambda c: c[1])
    l = [c for c in cs if c[1] < 357]; r = [c for c in cs if c[1] >= 357]
    pick = lambda g: (np.mean([c[1] for c in g]), np.mean([c[0] for c in g]))
    return m, (pick(l), pick(r))
lash_m = (np.abs(f7.astype(int) - f6).sum(2) > 60) & (f7[:, :, :3].astype(int).sum(2) < 200) & (f7[:, :, 3] > 0)
lash_m[:318] = False; lash_m[400:] = False
lash = np.zeros_like(f7); lash[lash_m] = f7[lash_m]
_, GIF_EYES = eyes_of(f6.astype(np.uint8))
def eye_cover(head):
    """Each eye: grow from the iris through eye-coloured pixels (blue, dark lines,
    grey-white sclera) up to 34px out, so lashes and whites are covered but hair is not."""
    m, (le, re) = eyes_of(head)
    a = head.astype(int); r, g, b_ = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    lum = a[:, :, :3].sum(2) / 3
    eyeish = ((b_ > r + 8) | (lum < 95) | ((np.abs(r - b_) < 22) & (lum > 110))) & (a[:, :, 3] > 0)
    near = np.zeros((N, N), bool)
    yy, xx = np.mgrid[:N, :N]
    for cx, cy in (le, re): near |= ((xx - cx) / 38) ** 2 + ((yy - cy) / 34) ** 2 <= 1
    cover = m.copy()
    for _ in range(40):
        grown = nd.binary_dilation(cover) & eyeish & near
        if (grown | cover).sum() == cover.sum(): break
        cover |= grown
    cover = nd.binary_dilation(cover, iterations=1) & near & (a[:, :, 3] > 0)
    cover = nd.binary_closing(cover, iterations=2) & near & (a[:, :, 3] > 0)
    return cover, (le, re)
def blink_for(head):
    cover, (le, re) = eye_cover(head)
    a = head.astype(int)
    skin = (a[:, :, 0] > 200) & (a[:, :, 1] > 170) & (a[:, :, 2] > 150) & (a[:, :, 0] - a[:, :, 2] < 60)
    ring = nd.binary_dilation(cover, iterations=4) & ~cover & skin
    sk = np.median(head[ring][:, :3], axis=0).astype(np.uint8)
    out = np.zeros_like(head); out[cover, :3] = sk; out[cover, 3] = 255
    ln = place(lash, GIF_EYES, (le, re)); ln[:, :, 3] = np.where(ln[:, :, 3] > 110, 255, 0)
    k = ln[:, :, 3] > 0; out[k] = ln[k]
    return out
for hn in ["kettle", "horned", "hood", "circlet"]:
    layers["blink-" + hn] = blink_for(layers["head-" + hn])
layers["blink-face"] = blink_for(layers["face"])
FACE_EYES = eye_cover(layers["face"])[0]

# ---------- weapons from the icon sheet, put in the hand
wsheet = load("eq-weapon")
GRIP = (285.0, 529.0)
WEAP = {"sword": (0.13, 215, 153), "axe": (0.2, 175, -118), "bow": (0.50, 230, 100), "staff": (0.30, 260, -124)}
WQ = {"sword": (0, 0), "axe": (384, 0), "bow": (0, 384), "staff": (384, 384)}
for n, (qx, qy) in WQ.items():
    q = wsheet[qy:qy + 384, qx:qx + 384].copy()
    ys, xs = np.nonzero(q[:, :, 3] > 40)
    proj = xs - ys
    tail_p = np.array([xs[np.argmin(proj)], ys[np.argmin(proj)]], float); tip = np.array([xs[np.argmax(proj)], ys[np.argmax(proj)]], float)
    g, L, deg = WEAP[n]
    gp = tail_p + (tip - tail_p) * g
    d = np.array([math.cos(math.radians(deg)), math.sin(math.radians(deg))])
    full = np.zeros((N, N, 4), np.uint8); full[qy:qy + 384, qx:qx + 384] = q
    w = place(full, (gp + [qx, qy], tip + [qx, qy]), (np.array(GRIP), np.array(GRIP) + d * L * (1 - g)))
    w[:, :, 3] = np.where(w[:, :, 3] > 110, 255, 0)
    layers["wpn-" + n] = w

# ---------- tier weapons (art/tiers/w-<shape>-r<tier>.png from tools/quest-tiers.py).
# Placed like the Common weapon; the length on the hero follows each item's size on its
# sheet relative to the sheet's Uncommon, so bigger tiers are bigger in hand (capped).
import glob, os
ICONS = {}
def strip_fringe(img):
    # AI matting leaves a red rim on soft edges; only touch pixels next to transparency
    x = img.astype(int); edge = nd.binary_dilation(x[:, :, 3] < 60, iterations=2) & (x[:, :, 3] > 0)
    red = (x[:, :, 0] > 140) & (x[:, :, 1] < 120) & (x[:, :, 2] < 110) & (x[:, :, 0] - x[:, :, 1] > 70)
    img = img.copy(); img[edge & red] = 0
    return img
def ends(img):
    body = img[:, :, 3] > 110
    lab, k = nd.label(body); big = lab == (np.argmax(nd.sum(body, lab, range(1, k + 1))) + 1)
    ys, xs = np.nonzero(big); proj = xs - ys
    return np.array([xs[proj.argmin()], ys[proj.argmin()]], float), np.array([xs[proj.argmax()], ys[proj.argmax()]], float)
for n in WEAP:
    files = sorted(glob.glob(f"{SP}/art/tiers/w-{n}-r[0-9].png"))
    if not files: continue
    crops = {int(f.rsplit("-r", 1)[1][0]): strip_fringe(np.array(Image.open(f).convert("RGBA"))) for f in files}
    # size reference: the Common-sized weapon on the Rare..Legendary sheet (w-<shape>-ref.png,
    # the first batch's rejected Uncommon). Uncommon itself is always Common length.
    rf = f"{SP}/art/tiers/w-{n}-ref.png"
    ref = np.array(Image.open(rf).convert("RGBA")) if os.path.exists(rf) else crops.get(1, next(iter(crops.values())))
    t0, p0 = ends(ref); ref_len = np.hypot(*(p0 - t0))
    for r, c in crops.items():
        ICONS[f"w-{n}-r{r}"] = c
        g, L, deg = WEAP[n]
        tl, tp = ends(c); scale = 1.0 if r == 1 else min(1.3, max(0.85, np.hypot(*(tp - tl)) / ref_len))
        gp = tl + (tp - tl) * g
        d = np.array([math.cos(math.radians(deg)), math.sin(math.radians(deg))])
        full = np.zeros((N, N, 4), np.uint8); hh, ww = c.shape[:2]
        if hh > N or ww > N: continue
        full[:hh, :ww] = c
        w = place(full, (gp, tp), (np.array(GRIP), np.array(GRIP) + d * L * scale * (1 - g)))
        w[:, :, 3] = np.where(w[:, :, 3] > 110, 255, 0)
        layers[f"wpn-{n}-r{r}"] = w

# ---------- hair: diff against the bald edit, cleaned, then recoloured
HAIR_SHIFT = {"short": 1}            # that edit came back 1px high
HAIR_COLORS = {                       # dark, mid, light
    "brown": None,
    "black": ((24, 22, 34), (52, 48, 66), (96, 92, 116)),
    "blonde": ((150, 98, 40), (222, 172, 78), (250, 226, 150)),
    "ash": ((150, 128, 128), (214, 198, 194), (246, 234, 226)),
    "auburn": ((104, 32, 26), (170, 60, 40), (222, 112, 76)),
    "teal": ((28, 78, 92), (44, 142, 146), (118, 212, 196)),
    # icy blue at the roots fading to lavender at the tips (two ramps, blended down the hair)
    "frost": (((92, 120, 176), (178, 212, 240), (238, 248, 255)), ((118, 92, 176), (196, 164, 232), (242, 226, 255))),
}
def recolour(px, ramp, fade=None, ys=None):
    rgb = px[:, :3].astype(float); lum = rgb @ [0.3, 0.59, 0.11]
    mx = rgb.max(1); mn = rgb.min(1); sat = (mx - mn) / np.maximum(mx, 1)
    hue = np.degrees(np.arctan2(np.sqrt(3) * (rgb[:, 1] - rgb[:, 2]), 2 * rgb[:, 0] - rgb[:, 1] - rgb[:, 2])) % 360
    skin = (rgb[:, 0] > 205) & (rgb[:, 1] > 160) & (rgb[:, 0] - rgb[:, 2] < 90)
    if ys is not None: skin &= ys >= 290          # skin starts at the eyes; pale bands above are hair shine
    ribbon = (rgb[:, 0] > 140) & (rgb[:, 1] < 80) & (sat > 0.55)
    is_hair = (lum > 30) & ((hue < 60) | (hue > 330)) & (sat > 0.15) & ~skin & ~ribbon   # leaves outlines, ribbons, skin
    lo, hi = np.percentile(lum[is_hair], [3, 97]); t = np.clip((lum - lo) / (hi - lo), 0, 1)
    def ramp_col(r):
        r = np.array(r, float)
        return np.where(t[:, None] < 0.5, r[0] + (r[1] - r[0]) * (t[:, None] * 2), r[1] + (r[2] - r[1]) * (t[:, None] * 2 - 1))
    if fade is None: col = ramp_col(ramp)
    else: col = ramp_col(ramp[0]) * (1 - fade[:, None]) + ramp_col(ramp[1]) * fade[:, None]
    out = px.copy(); out[is_hair, :3] = np.clip(col[is_hair], 0, 255).astype(np.uint8)
    return out
for s in ["short", "spiky", "long", "twin", "moon"]:
    a = load("hero-hair-" + s, HAIR_SHIFT.get(s, 0))
    m = diff(a, bald)
    m = nd.binary_opening(m, structure=np.ones((3, 3)))
    m = blobs(m, 400)
    m = nd.binary_dilation(m, iterations=2) & diff(a, bald, 50)
    m[580:] = False
    aa = a.astype(int); browny = (aa[:, :, 0] - aa[:, :, 2] > 40) & (aa[:, :, 0] > 70)
    m &= ~(FACE_EYES & ~browny)               # eyes belong to the face, bangs stay
    m &= ~((aa[:, :, 2] > aa[:, :, 0] + 10) & (aa[:, :, 2] > 90))   # source hair is brown: blue is a stray eye pixel
    hair = np.zeros_like(a); hair[m] = a[m]
    for c, ramp in HAIR_COLORS.items():
        hh = hair.copy()
        if ramp and c == "frost":
            ys = np.nonzero(m)[0]; y0, y1 = ys.min(), ys.max()
            fade = np.clip(((ys - y0) / max(1, y1 - y0) - 0.35) / 0.6, 0, 1)   # tips, not roots, go lavender
            hh[m] = recolour(hair[m], ramp, fade, ys)
        elif ramp: hh[m] = recolour(hair[m], ramp, ys=np.nonzero(m)[0])
        layers[f"hair-{s}-{c}"] = hh

# ---------- one crop box for every layer so they stack exactly
BOX = (114, 59, 653, 706)
ys, xs = np.nonzero(np.max([l[:, :, 3] for l in layers.values()], axis=0) > 0)
# the old whole heads (with the pale hair) and ponytail are only inputs now
for n in [k for k in layers if k.startswith("head-") or k == "tail" or (k.startswith("blink-") and k != "blink-face")]:
    del layers[n]
for n, l in layers.items():
    if n.startswith("hairmask"): continue
    ys, xs = np.nonzero(l[:, :, 3] > 0)
    if len(xs) and (xs.min() < BOX[0] or ys.min() < BOX[1] or xs.max() >= BOX[2] or ys.max() >= BOX[3]):
        out = ((xs < BOX[0]) | (ys < BOX[1]) | (xs >= BOX[2]) | (ys >= BOX[3])).sum()
        print("outside box:", n, out, "px", xs.min(), ys.min(), xs.max(), ys.max())
W = BOX[2] - BOX[0]; H = BOX[3] - BOX[1]; k = 400 / max(W, H); tw, th = round(W * k), round(H * k)
for n, l in layers.items():
    Image.fromarray(l).crop(BOX).resize((tw, th), Image.BOX if n.startswith("blink") else Image.LANCZOS).save(f"{OUT}/hero-{n}.webp", "WEBP", quality=92, method=6)
print(len(layers), "layers", tw, th)
# inventory icons for tier items: trimmed, square, 128px like the batch-1 icons
for k, c in ICONS.items():
    ys, xs = np.nonzero(c[:, :, 3] > 20); c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    side = int(max(c.shape[:2]) * 1.08); sq = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - c.shape[0]) // 2, (side - c.shape[1]) // 2; sq[oy:oy + c.shape[0], ox:ox + c.shape[1]] = c
    Image.fromarray(sq).resize((128, 128), Image.LANCZOS).save(f"{OUT}/{k}.webp", "WEBP", quality=90, method=6)
print(len(ICONS), "tier icons")

# ---------- previews
def stack(names):
    c = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    for f in names: c.alpha_composite(Image.open(f"{OUT}/hero-{f}.webp").convert("RGBA"))
    return c
def grid(rows, path):
    P = Image.new("RGBA", (tw * len(rows[0]), th * len(rows)), (60, 62, 78, 255))
    for i, r in enumerate(rows):
        for j, names in enumerate(r): P.alpha_composite(stack(names), (j * tw, i * th))
    P.save(path)
outfits = ["body", "body-leather", "body-chain", "body-plate", "body-robe"]
boots = ["boots", "boots-leather", "boots-greaves", "boots-winged", "boots-wraps"]
def stack_m(names, mask=None):
    c = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    for f in names:
        im = Image.open(f"{OUT}/hero-{f}.webp").convert("RGBA")
        if mask and f.startswith("hair-"):
            m = Image.open(f"{OUT}/hero-{mask}.webp").convert("RGBA").getchannel("A")
            im.putalpha(Image.fromarray(np.minimum(np.array(im.getchannel("A")), np.array(m))))
        c.alpha_composite(im)
    return c
P = Image.new("RGBA", (tw * 5, th * 4), (60, 62, 78, 255))
for i, hs in enumerate(["short-brown", "spiky-black", "long-ash", "twin-blonde"]):
    for j, hn in enumerate(["kettle", "horned", "hood", "circlet", None]):
        names = ["cape", "body", "boots", "wpn-sword", "hand", "face", "blink-face", "hair-" + hs] + ([f"helm-{hn}"] if hn else [])
        P.alpha_composite(stack_m(names, f"hairmask-{hn}" if hn in HELM_CUT else None), (j * tw, i * th))
P.save(f"{OUT}/prev-helmhair.png")
grid([[["cape", "body", "boots", "wpn-sword", "hand", "face", f"hair-{s}-{c}"] for c in HAIR_COLORS] for s in ["short", "spiky", "long", "twin", "moon"]], f"{OUT}/prev-hair.png")
