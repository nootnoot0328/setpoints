# Slices tier sheets into one image per item for tools/quest-doll.py.
# Usage: python3 tools/quest-tiers.py <dir> <slot> <sheet.png> [tier]
#   Without [tier]: the sheet holds all four shape sheets in a 2x2 (e.g. sword, axe /
#   bow, staff), each itself a 2x2 of tiers (Uncommon, Rare / Epic, Legendary).
#   With [tier]: one 2x2 of the four shapes, all of that tier (e.g. an Uncommon redo).
# Items are found as blobs (sparkles join their item), so they don't need to sit
# exactly in their quarter. Output: <dir>/art/tiers/<icon prefix><shape>-r<tier>.png
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as nd
SP, slot, path = sys.argv[1], sys.argv[2], sys.argv[3]
ONE_TIER = int(sys.argv[4]) if len(sys.argv) > 4 else None
SHAPES = {"weapon": ["sword", "axe", "bow", "staff"], "helm": ["kettle", "horned", "hood", "circlet"],
          "armor": ["leather", "chain", "plate", "robe"], "boots": ["leather", "greaves", "winged", "wraps"]}[slot]
PRE = {"weapon": "w-", "helm": "h-", "armor": "a-", "boots": "b-"}[slot]
a = np.array(Image.open(path).convert("RGBA"))
H, W = a.shape[:2]
# thin grey divider lines between the sheets: long straight runs, removed
ai = a.astype(int); grey = (ai[:, :, :3].max(2) - ai[:, :, :3].min(2)) < 30
op = a[:, :, 3] > 60
def longest(v):
    best = cur = 0
    for x in v: cur = cur + 1 if x else 0; best = max(best, cur)
    return best
for x in range(W):
    if longest(op[:, x]) > H * 0.25:
        for xx in range(max(0, x - 3), min(W, x + 4)): a[:, xx][grey[:, xx]] = 0
for y in range(H):
    if longest(op[y, :]) > W * 0.25:
        for yy in range(max(0, y - 3), min(H, y + 4)): a[yy][grey[yy]] = 0
m = a[:, :, 3] > 60
lab, n = nd.label(nd.binary_dilation(m, iterations=9))
sizes = nd.sum(m, lab, range(1, n + 1))
items = [i + 1 for i, s in enumerate(sizes) if s > 2500]
assert len(items) == (4 if ONE_TIER else 16), f"found {len(items)} items"
cent = {i: np.argwhere((lab == i) & m).mean(0) for i in items}          # (y, x)
os.makedirs(f"{SP}/art/tiers", exist_ok=True)
def save(i, name):
    keep = lab == i
    out = np.where(keep[..., None], a, 0).astype(np.uint8)
    ys, xs = np.nonzero(keep & (a[:, :, 3] > 0))
    Image.fromarray(out).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).save(f"{SP}/art/tiers/{name}.png")
if ONE_TIER:
    my = np.median([cent[i][0] for i in items]); mx = np.median([cent[i][1] for i in items])
    for i in items: save(i, f"{PRE}{SHAPES[2 * (cent[i][0] > my) + (cent[i][1] > mx)]}-r{ONE_TIER}")
    print("sliced", slot, "tier", ONE_TIER); sys.exit()
for q, shape in enumerate(SHAPES):
    qy, qx = divmod(q, 2)
    mine = [i for i in items if (cent[i][0] > H / 2) == qy and (cent[i][1] > W / 2) == qx]
    assert len(mine) == 4, f"{shape}: found {len(mine)} items"
    my = np.median([cent[i][0] for i in mine]); mx = np.median([cent[i][1] for i in mine])
    for i in mine:
        save(i, f"{PRE}{shape}-r{1 + 2 * (cent[i][0] > my) + (cent[i][1] > mx)}")
print("sliced", slot, "->", f"{SP}/art/tiers")
