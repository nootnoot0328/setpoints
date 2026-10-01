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
| 2 | Helmets | 4 sheets | Icon and hero (each head is cut from the sheet) |
| 3 | Armour | 4 icon sheets + 16 hero edits | Icon and hero |
| 4 | Boots | 4 icon sheets + 16 hero edits | Icon and hero |

That's 48 images. Upload in batches: the app uses whatever has arrived and keeps the Common look for the rest. Weapons and helmets come first because they're 8 images for most of the visible change.

**Secrecy.** You'll see each design while you generate it, so the looks won't be a surprise. What stays hidden is when an item drops, its stats, its skill and its name. The prompts below don't describe the designs, so you aren't reading a list of rewards; ChatGPT designs them inside the tier ladder.

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

---

## 2. Helmets (4 sheets)

Attach **`eq-helm.png`** (batch 1, the sheet with the hero's head wearing each helm). The app lines each head up by the eyes, so it must be the same face.

```
2x2 sheet, transparent background. Each quarter shows the SAME chibi head as the attached sheet (same face, same eyes, same pale hair, same angle and size) wearing a different helmet, cropped at the neck like the attached sheet.
Four tiers of [HELM]:
top-left Uncommon, top-right Rare, bottom-left Epic, bottom-right Legendary.
Keep the eyes fully visible on every tile.
[paste TIER RULE]
```

| File | [HELM] |
|---|---|
| `eq-helm-kettle-tiers.png` | a kettle helm (brimmed open helmet) |
| `eq-helm-horned-tiers.png` | a horned helmet |
| `eq-helm-hood-tiers.png` | a ranger's hood |
| `eq-helm-circlet-tiers.png` | a circlet or crown-band |

Check: the face is identical to the attached one on all four tiles, and nothing covers the eyes. The blink and head placement depend on both.

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
