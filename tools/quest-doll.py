# Builds the paper-doll hero layers (assets/quest/hero-*.webp) from the raw
# ChatGPT art on the art-raw branch. Usage: python3 tools/quest-doll.py <dir>
# <dir>/art holds hero-mid.png, eq-helm.png, eq-weapon.png and the Wave 1 edits
# (hero-bald, hero-outfit-*, hero-boots-*, hero-hair-*). Output goes to <dir>/doll.
#
# Every Wave 1 edit is a redraw of hero-mid in the same pose and framing, so
# after scaling to 768 the pixels line up and parts are cut by diffing.
# Heads are aligned by eye position, weapons by grip point.
#
# Stack, back to front: body, boots, hem, weapon, hand, head|face, tail|hair
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

def body_from(src, robe=False):
    b = src.copy()
    b[:NECK] = 0; b[KNEE:] = 0
    # the ponytail lives in its own layer; patch the cape behind it from the bald edit
    b[tail_m] = 0 if robe else bald[tail_m]
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

# ---------- hair: diff against the bald edit, cleaned, then recoloured
HAIR_SHIFT = {"short": 1}            # that edit came back 1px high
HAIR_COLORS = {                       # dark, mid, light
    "brown": None,
    "black": ((24, 22, 34), (52, 48, 66), (96, 92, 116)),
    "blonde": ((150, 98, 40), (222, 172, 78), (250, 226, 150)),
    "ash": ((150, 128, 128), (214, 198, 194), (246, 234, 226)),
    "auburn": ((104, 32, 26), (170, 60, 40), (222, 112, 76)),
    "teal": ((28, 78, 92), (44, 142, 146), (118, 212, 196)),
}
def recolour(px, ramp):
    rgb = px[:, :3].astype(float); lum = rgb @ [0.3, 0.59, 0.11]
    mx = rgb.max(1); mn = rgb.min(1); sat = (mx - mn) / np.maximum(mx, 1)
    hue = np.degrees(np.arctan2(np.sqrt(3) * (rgb[:, 1] - rgb[:, 2]), 2 * rgb[:, 0] - rgb[:, 1] - rgb[:, 2])) % 360
    skin = (rgb[:, 0] > 205) & (rgb[:, 1] > 160) & (rgb[:, 0] - rgb[:, 2] < 90)
    ribbon = (rgb[:, 0] > 140) & (rgb[:, 1] < 80) & (sat > 0.55)
    is_hair = (lum > 30) & ((hue < 60) | (hue > 330)) & (sat > 0.15) & ~skin & ~ribbon   # leaves outlines, ribbons, skin
    lo, hi = np.percentile(lum[is_hair], [3, 97]); t = np.clip((lum - lo) / (hi - lo), 0, 1)
    r = np.array(ramp, float)
    col = np.where(t[:, None] < 0.5, r[0] + (r[1] - r[0]) * (t[:, None] * 2), r[1] + (r[2] - r[1]) * (t[:, None] * 2 - 1))
    out = px.copy(); out[is_hair, :3] = np.clip(col[is_hair], 0, 255).astype(np.uint8)
    return out
for s in ["short", "spiky", "long", "twin"]:
    a = load("hero-hair-" + s, HAIR_SHIFT.get(s, 0))
    m = diff(a, bald)
    m = nd.binary_opening(m, structure=np.ones((3, 3)))
    m = blobs(m, 400)
    m = nd.binary_dilation(m, iterations=2) & diff(a, bald, 50)
    m[580:] = False
    hair = np.zeros_like(a); hair[m] = a[m]
    for c, ramp in HAIR_COLORS.items():
        hh = hair.copy()
        if ramp: hh[m] = recolour(hair[m], ramp)
        layers[f"hair-{s}-{c}"] = hh

# ---------- one crop box for every layer so they stack exactly
BOX = (114, 59, 653, 706)
ys, xs = np.nonzero(np.max([l[:, :, 3] for l in layers.values()], axis=0) > 0)
for n, l in layers.items():
    ys, xs = np.nonzero(l[:, :, 3] > 0)
    if len(xs) and (xs.min() < BOX[0] or ys.min() < BOX[1] or xs.max() >= BOX[2] or ys.max() >= BOX[3]):
        out = ((xs < BOX[0]) | (ys < BOX[1]) | (xs >= BOX[2]) | (ys >= BOX[3])).sum()
        print("outside box:", n, out, "px", xs.min(), ys.min(), xs.max(), ys.max())
W = BOX[2] - BOX[0]; H = BOX[3] - BOX[1]; k = 400 / max(W, H); tw, th = round(W * k), round(H * k)
for n, l in layers.items():
    Image.fromarray(l).crop(BOX).resize((tw, th), Image.LANCZOS).save(f"{OUT}/hero-{n}.webp", "WEBP", quality=92, method=6)
print(len(layers), "layers", tw, th)

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
grid([[[o, b] + (["hem-robe"] if o == "body-robe" else []) + ["wpn-sword", "hand", "head-kettle", "tail"] for b in boots] for o in outfits], f"{OUT}/prev-gear.png")
grid([[["body", "boots", "wpn-sword", "hand", "face", f"hair-{s}-{c}"] for c in HAIR_COLORS] for s in ["short", "spiky", "long", "twin"]], f"{OUT}/prev-hair.png")
