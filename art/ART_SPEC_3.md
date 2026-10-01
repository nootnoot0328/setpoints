# Setpoint Quest — art spec, batch 3: every rarity is its own design

This replaces **Wave 3** in `ART_SPEC_2.md`.

Rarity is never a recolour. An Epic sword is a different sword from a Common one: a different silhouette, different materials, different details. When a better item drops, your hero visibly changes.

Use the same ChatGPT chat as before. In a new chat, paste **Part 1 (the style bible) from `ART_SPEC.md`** first, then attach 2–3 of your earlier images and say: *"Match this exact style for everything in this chat."*

---

## What you're making

There are 4 slots with 4 shapes each, and each shape gets 4 new tiers. Common is the art you already have.

| Order | Slot | Images | Shows on |
|---|---|---|---|
| 1 | Weapons | 4 sheets | Icon and hero (the held weapon is cut from the icon) |
| 2 | Helmets | 4 sheets | Icon and hero |
| 3 | Armour | 4 sheets | Icon and hero |
| 4 | Boots | 4 sheets | Icon and hero |

That's 16 images, plus Part 0. Upload in batches: the app uses whatever has arrived and keeps the Common look for the rest. Weapons come first: 4 images, no hero edits.

**Secrecy.** You'll see each design while you generate it, so the looks won't be a surprise. What stays hidden is when an item drops, its stats, its skill and its name. The prompts below don't describe the designs, so you aren't reading a list of rewards; ChatGPT designs them inside the tier ladder.

---

## Part 0 — do these first. Done (one heads sheet: `hero-heads-sheet.png`)

These fix the helmets properly and add the face and hair from your reference picture. All are edits, so the app can line them up with the existing hero.

**Helmets on the bald hero (4).** The app currently cuts helmets out of the old heads along hand-traced lines. It works, but the hood can't wrap the hair properly. These give clean helmets that sit over any hairstyle.

Attach **`hero-bald.png`** and **`eq-helm.png`**:

```
Edit the first attached character. Keep everything identical: same pose, same framing, same position and size in the image, same bald head, same face, same clothes, same sword. Put on the [HELM] from the second attached sheet, matching its design, sitting on the bald head. Change nothing else. Transparent background.
```

| File | [HELM] |
|---|---|
| `hero-helm-kettle.png` | kettle helm (top-left of the sheet) |
| `hero-helm-horned.png` | horned helmet (top-right) |
| `hero-helm-hood.png` | green ranger hood (bottom-left) |
| `hero-helm-circlet.png` | silver circlet (bottom-right) |

**The hairstyle from your reference (1).** Attach **`hero-mid.png`** and your reference picture:

```
Edit the first attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same clothes, same sword. Remove the helmet and give the character the hairstyle from the second attached picture: long straight hair to the waist with blunt straight-cut bangs, a small bun on one side, and a crescent-moon flower hair clip on the bun. Hair colour: medium brown (the app recolours it). Keep the hair clip its own colours. Match the first picture's pixel-art style, not the second's. Transparent background.
```

Save as `hero-hair-moon.png`. **Done.** In the app, pick the **Frost** colour to get the icy blue fading to lavender from your reference.

**The face from your reference (1).** Attach **`hero-bald.png`** and your reference picture:

```
Edit the first attached character. Keep everything identical: same pose, same framing, same position and size in the image, same bald head shape, same ears, same clothes, same sword. Change ONLY the face to match the second attached picture: big round sparkling blue eyes with large white highlights, soft pink blush on the cheeks, and a small cat-like "w" mouth. Keep the eyes in the same place and at the same height as the original face. Match the first picture's pixel-art style. Transparent background.
```

Save as `hero-face-moon.png`. The blink is made from it automatically.

---

## The tier ladder (use for every slot)

Every sheet uses this layout:

| Position | Tier | Design brief |
|---|---|---|
| top-left | Uncommon | a better-made version: better materials and one added feature; still plainly practical |
| top-right | Rare | a knightly, crafted piece: a new silhouette, engraving and a distinctive decorative motif |
| bottom-left | Epic | a heroic, magical piece: a dramatic new silhouette and a strong unique motif; small glowing inlays are fine as a detail |
| bottom-right | Legendary | a mythic artifact: an unmistakably one-of-a-kind silhouette and materials |

Paste this line into **every** prompt in this batch:

```
TIER RULE: each of the four must be a DIFFERENT object with its own silhouette, materials and details, clearly more impressive from top-left to bottom-right. Do NOT make recolours or palette swaps of one design. Keep the same pixel-art style, outline weight and lighting as the attached images.
```

---

## 1. Weapons (4 sheets)

Attach **`eq-weapon.png`** (batch 1). The app cuts the weapon from the icon and places it in the hero's hand by the handle, so the angle must match.

```
2x2 sheet of equipment icons, transparent background, each item alone and centred in its quarter, not touching the edges. Draw each exactly like the attached sheet: angled diagonally with the handle at the bottom-left and the tip at the top-right, at the same size.
Four tiers of [WEAPON]:
top-left Uncommon, top-right Rare, bottom-left Epic, bottom-right Legendary.
[paste TIER RULE]
```

| File | [WEAPON] |
|---|---|
| `eq-weapon-sword-tiers.png` | a one-handed sword |
| `eq-weapon-axe-tiers.png` | a one-handed axe |
| `eq-weapon-bow-tiers.png` | a longbow |
| `eq-weapon-staff-tiers.png` | a wizard's staff |

Check: the handle is at the bottom-left on every tile, the blade or head points to the top-right, and the weapons are roughly the size of the attached sheet's.

One image holding all four sheets is fine; Claude slices it.

**Uncommon redo (1 image, `eq-weapon-uncommon.png`). Done.** The first batch's Uncommon tiers came back as near-copies of the Common weapons; this prompt fixed it. Reuse it for any slot whose Uncommon row repeats this problem. Attach **`eq-weapon.png`**:

```
2x2 sheet of equipment icons, transparent background, same style, angle and size as the attached sheet, handle at the bottom-left, tip at the top-right.
top-left: an Uncommon one-handed sword. top-right: an Uncommon one-handed axe. bottom-left: an Uncommon longbow. bottom-right: an Uncommon wizard's staff.
Each must be a clearly DIFFERENT design from the matching weapon in the attached sheet: a new silhouette and better materials, still plain and practical, no glow or magic. Do NOT redraw the attached weapons.
```

Check it against `eq-weapon.png` side by side. If any tile looks like the old weapon, regenerate it.

---

## 2. Helmets (4 sheets)

Same format as the heads sheet that worked for Part 0. Each sheet gives one helmet in all four tiers on the bald head. The app lines the heads up by the eyes, cuts the helmets out against the plain tile, and uses the tiles as icons too, so no separate icon sheets are needed.

Attach **`hero-bald.png`** and **`eq-helm.png`**:

```
Make ONE image: a 3x2 sheet of head portraits, transparent background, no text, no frames, no dividing lines, no glow behind the heads.

Every tile shows the SAME bald head from the first attached character: same pixel-art style, same face and eyes, same three-quarter angle facing right, same size, same position in its tile, cropped just below the chin. Heads must not touch each other or the edges.

top-left: the bald head unchanged, no helmet.
top-middle: wearing an Uncommon [HELM].
top-right: wearing a Rare [HELM].
bottom-left: wearing an Epic [HELM].
bottom-right: wearing a Legendary [HELM].
bottom-middle: leave empty.

Base the design on the [HELM] in the second attached sheet. TIER RULE: each tier must be a DIFFERENT helmet with its own silhouette, materials and details, clearly more impressive from Uncommon to Legendary. Do NOT make recolours. Keep the eyes fully visible and the face unchanged in every tile.
```

| File | [HELM] |
|---|---|
| `heads-kettle-tiers.png` | kettle helm |
| `heads-horned-tiers.png` | horned helmet |
| `heads-hood-tiers.png` | ranger's hood |
| `heads-circlet-tiers.png` | circlet |

Check: all heads are the same size, and the eyes sit at the same height in every tile. The Uncommon must not look like the attached Common helmet.

---

## 3 & 4. Armour and boots (4 sheets each)

Same idea as the helmets, but full-body and in portrait: one sheet per shape, 3 columns x 2 rows, with the plain bald hero top-left. The app lines the tiles up by the eyes and cuts out what changed. If a tile's pose drifts, only that tile needs a redo. Inventory icons are cropped from the tiles.

| Files | Shapes |
|---|---|
| `bodies-armor-<shape>-tiers.png` | leather, chain, plate, robe |
| `bodies-boots-<shape>-tiers.png` | leather, greaves, winged, wraps |

The prompt is in the "everything left" block below.

---

## Everything left in one ChatGPT request

See the chat reply from 2 Oct 2026; the same text is kept in `art/PROMPT_ALL_LEFT.md`.

---

## Animation needs no extra art

The idle loop (breathing, cape sway, blink) is built from layers in code, so it works on every tier automatically. Don't make animated versions of any of these.

## Upload

Same as before: the **`art-raw`** branch, `art/raw` folder, exact filenames. Tell Claude which files are up. Claude cuts them, builds the hero layers and turns each tier on in the app. If a file won't line up, Claude will name it and say why.
