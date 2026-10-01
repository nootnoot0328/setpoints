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
| 2 | Helmets | 4 icon sheets + 16 hero edits | Icon and hero |
| 3 | Armour | 4 icon sheets + 16 hero edits | Icon and hero |
| 4 | Boots | 4 icon sheets + 16 hero edits | Icon and hero |

That's 60 images, plus the 6 in Part 0. Upload in batches: the app uses whatever has arrived and keeps the Common look for the rest. Weapons come first: 4 images, no hero edits.

**Secrecy.** You'll see each design while you generate it, so the looks won't be a surprise. What stays hidden is when an item drops, its stats, its skill and its name. The prompts below don't describe the designs, so you aren't reading a list of rewards; ChatGPT designs them inside the tier ladder.

---

## Part 0 — do these first (6 images)

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

Save as `hero-hair-moon.png`. In the app, pick the **Frost** colour to get the icy blue fading to lavender from your reference.

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

**Uncommon redo (1 image, `eq-weapon-uncommon.png`).** The first batch's Uncommon tiers came back as near-copies of the Common weapons. Attach **`eq-weapon.png`**:

```
2x2 sheet of equipment icons, transparent background, same style, angle and size as the attached sheet, handle at the bottom-left, tip at the top-right.
top-left: an Uncommon one-handed sword. top-right: an Uncommon one-handed axe. bottom-left: an Uncommon longbow. bottom-right: an Uncommon wizard's staff.
Each must be a clearly DIFFERENT design from the matching weapon in the attached sheet: a new silhouette and better materials, still plain and practical, no glow or magic. Do NOT redraw the attached weapons.
```

Check it against `eq-weapon.png` side by side. If any tile looks like the old weapon, regenerate it.

---

## 2. Helmets (4 icon sheets, then 16 hero edits)

Same pattern as armour: icons first, then each one worn by the bald hero, so it sits over any hairstyle.

**Step 1, icons.** Attach **`eq-helm.png`**.

```
2x2 sheet of headgear icons, transparent background, each helmet alone and centred in its quarter, front three-quarter view, no head or face.
Four tiers of [HELM]:
top-left Uncommon, top-right Rare, bottom-left Epic, bottom-right Legendary.
[paste TIER RULE]
```

| File | [HELM] |
|---|---|
| `eq-helm-kettle-tiers.png` | a kettle helm (brimmed open helmet) |
| `eq-helm-horned-tiers.png` | a horned helmet |
| `eq-helm-hood-tiers.png` | a ranger's hood |
| `eq-helm-circlet-tiers.png` | a circlet or crown-band |

**Step 2, worn.** For each tile, attach **`hero-bald.png`** and the sheet from step 1:

```
Edit the first attached character. Keep everything identical: same pose, same framing, same position and size in the image, same bald head, same face, same clothes, same sword. Put on the [POSITION] helmet from the second attached sheet, matching its design exactly. Keep the eyes fully visible. Change nothing else. Transparent background.
```

| Files | [POSITION] |
|---|---|
| `hero-helm-<shape>-r1.png` | top-left |
| `hero-helm-<shape>-r2.png` | top-right |
| `hero-helm-<shape>-r3.png` | bottom-left |
| `hero-helm-<shape>-r4.png` | bottom-right |

Check: the face and head haven't moved, and the eyes are visible.

---

## 3. Armour (4 icon sheets, then 16 hero edits)

**Step 1, icons.** Attach **`eq-armor.png`**.

```
2x2 sheet of body armour icons, transparent background, each shown on its own as if on an invisible mannequin, front view, like the attached sheet. No character.
Four tiers of [ARMOUR]:
top-left Uncommon, top-right Rare, bottom-left Epic, bottom-right Legendary.
[paste TIER RULE]
```

| File | [ARMOUR] |
|---|---|
| `eq-armor-leather-tiers.png` | a leather tunic |
| `eq-armor-chain-tiers.png` | a chainmail shirt |
| `eq-armor-plate-tiers.png` | plate armour |
| `eq-armor-robe-tiers.png` | a mage robe |

**Step 2, hero edits.** For each tile, attach **`hero-mid.png`** and the sheet from step 1:

```
Edit the first attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same hair, same helmet, same sword, same boots, same red scarf and cape. Change ONLY the clothing on the torso, arms and upper legs to the [POSITION] outfit from the second attached sheet, matching its design exactly. Transparent background.
```

For **robes only**, replace "same red scarf and cape" with "remove the red scarf and cape".

| Files | [POSITION] |
|---|---|
| `hero-outfit-<shape>-r1.png` | top-left |
| `hero-outfit-<shape>-r2.png` | top-right |
| `hero-outfit-<shape>-r3.png` | bottom-left |
| `hero-outfit-<shape>-r4.png` | bottom-right |

Here `<shape>` is `leather`, `chain`, `plate` or `robe`, so you'll have `hero-outfit-plate-r3.png`, for example.

Check: the hero hasn't moved (flick between it and `hero-mid.png`), the cape is the same, and the outfit matches its icon.

---

## 4. Boots (4 icon sheets, then 16 hero edits)

**Step 1, icons.** Attach **`eq-boots.png`**.

```
2x2 sheet of footwear icons, transparent background, each pair alone, side three-quarter view, like the attached sheet.
Four tiers of [BOOTS]:
top-left Uncommon, top-right Rare, bottom-left Epic, bottom-right Legendary.
[paste TIER RULE]
```

| File | [BOOTS] |
|---|---|
| `eq-boots-leather-tiers.png` | leather boots |
| `eq-boots-greaves-tiers.png` | steel greaves |
| `eq-boots-winged-tiers.png` | winged boots |
| `eq-boots-wraps-tiers.png` | cloth wraps and soft shoes |

**Step 2, hero edits.** Attach **`hero-mid.png`** and the sheet from step 1:

```
Edit the first attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same hair, same helmet, same clothes, same sword, same scarf and cape. Change ONLY the footwear, from the knees down, to the [POSITION] boots from the second attached sheet, matching their design exactly. The feet must stay planted in exactly the same place. Transparent background.
```

| Files | [POSITION] |
|---|---|
| `hero-boots-<shape>-r1.png` | top-left |
| `hero-boots-<shape>-r2.png` | top-right |
| `hero-boots-<shape>-r3.png` | bottom-left |
| `hero-boots-<shape>-r4.png` | bottom-right |

Here `<shape>` is `leather`, `greaves`, `winged` or `wraps`.

Check: the soles sit on the same line as in `hero-mid.png`, and nothing above the knee changed.

---

## Animation needs no extra art

The idle loop (breathing, cape sway, blink) is built from layers in code, so it works on every tier automatically. Don't make animated versions of any of these.

## Upload

Same as before: the **`art-raw`** branch, `art/raw` folder, exact filenames. Tell Claude which files are up. Claude cuts them, builds the hero layers and turns each tier on in the app. If a file won't line up, Claude will name it and say why.
