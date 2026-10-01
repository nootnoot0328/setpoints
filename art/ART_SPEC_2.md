# Setpoint Quest — art spec, batch 2

This batch adds:

- regions, each with a day and a night map;
- more monsters and bosses;
- hero customisation: hairstyles, faces, outfits, boots and helmets that show on the character;
- items in four rarity tiers.

It builds on `ART_SPEC.md`. Use the same ChatGPT chat as batch 1 if you still have it. If you don't, start a new chat, paste **Part 1 (the style bible) from `ART_SPEC.md`** first, then attach 2–3 of your batch-1 images and say: *"Match this exact style for everything in this chat."*

---

## The one rule that makes customisation work

**Every hero image is an edit of `hero-mid.png`, changing exactly one thing.**

Attach `hero-mid.png` to each hero prompt. Keep the same pose, framing, size and position in the canvas, and change only what the prompt names.

This is what lets the app stack hair, face, outfit, boots, helmet and weapon on one character. Claude lines each edit up with the original and cuts out only the part that changed. If ChatGPT moves the character, tilts the pose or changes the face when you only asked for hair, regenerate. Don't keep "close enough".

**Decide your base hero before doing any hero edits.** Everything below derives from the current `hero-mid.png`. If you'd rather have a different base character, for example a male-presenting hero, regenerate `hero-mid.png` first. The 4 helm heads from batch 1 then need redoing too.

**You don't make colour variants.** The app recolours hair, skin and eyes in code, so draw each hairstyle once, in any colour.

---

## How the app will use this

| Thing | How it's chosen |
|---|---|
| Region | One region per week, rotating in the order listed in Part A. |
| Day or night map | From the time you open the app: day from 6 AM to 6 PM, night otherwise. The app tints dawn and dusk itself, so there's no need to draw them. |
| Monsters | Six per week, from that region's sheet plus a few from the forest. |
| Boss | That region's boss. |
| Hair, face, skin tone, eye and hair colour | Picked by you in **Edit hero**. |
| Outfit, boots, helmet, weapon | Whatever you have equipped. |
| Rarity | The icon shows the tier art. On the hero, weapons show their tier because the held weapon is made from the icon. Outfit, boots and helmets show the base look plus a glow for Epic and Legendary. |

---

## Waves, in priority order

Do one wave at a time and upload it. Each wave is usable on its own. ChatGPT limits how many images you can make in a few hours, so expect a wave to take a day or two.

| Wave | What you'll get | Images |
|---|---|---|
| **0. Fight effects and loot** | Slashes, hit sparks, heals, coins and a real chest, so the all-day fight on the map looks like a fight | 3 |
| **1. Make the hero yours** | Hairstyles, outfits and boots that show on the hero | 13 |
| **2. Day and night, two new regions** | Forest by day, plus snow and desert regions | 11 |
| **3. Loot with rarity** | Four-tier art for the current 12 items | 12 |
| **4. Four more regions** | Swamp, coast, volcano, haunted keep | 20 |
| **5. More variety** | More hair and faces, new item types, pets | ~30 |

**Sizes don't matter.** Draw each creature to fill its frame. The app sets sizes relative to the hero: a slime is small, a goblin is about your height, a boss towers over you. If a new monster should be unusually big or small, say so when you upload.

---

## Wave 0 — Fight effects and loot (3 images)

These play on top of the map and battle screens. They work with any gear, because they're separate from the hero. Square 2x2 sheets on a transparent background, no characters.

**`fx-a.png`**

```
2x2 sheet of pixel-art combat effects, same style as the attached sprites, transparent background, each centred in its quarter, no characters:
top-left: a white and pale-gold sword slash arc, curved, like a crescent swipe.
top-right: an impact burst: a jagged white star with small orange sparks flying outwards.
bottom-left: green healing sparkles: small plus signs and glowing dots rising in a column.
bottom-right: a burst of gold coins and small stars popping outwards.
```

**`fx-b.png`**

```
2x2 sheet of pixel-art status effects, same style, transparent background, each centred in its quarter, no characters:
top-left: a small puff of dust and grass, like a footstep kick-up.
top-right: a speech-bubble-free sleepy "zZ" made of soft blue cloud shapes (no letters, just the cloud-puffs shaped like a sleep bubble trail).
bottom-left: a ring of yellow dizzy stars, viewed slightly from above.
bottom-right: a victory burst: gold confetti, ribbons and sparkles exploding upwards.
```

**`loot.png`** (from batch 1, still missing)

```
2x2 sheet of loot icons:
top-left: a closed wooden treasure chest with gold trim and a lock.
top-right: the same chest open, with golden light and coins spilling out.
bottom-left: a single shiny gold coin, slightly tilted.
bottom-right: a single cut blue gem, sparkling.
```

---

## Wave 1 — Make the hero yours (13 images)

Attach `hero-mid.png` to **every** prompt in this wave. All are square with a transparent background.

**`hero-bald.png`** (the app uses this to separate hair from face; it never shows)

```
Edit the attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same clothes, same sword. Remove the helmet AND all of the hair, leaving a smooth bald head with ears showing. Change nothing else. Transparent background.
```

**Hairstyles.** Use this template and swap in each style:

```
Edit the attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same clothes, same sword. Remove the helmet and give the character this hairstyle: [STYLE]. Hair colour: medium brown. Change nothing else. Transparent background.
```

| File | [STYLE] |
|---|---|
| `hero-hair-short.png` | short messy hair with a side fringe |
| `hero-hair-long.png` | long straight hair past the shoulders |
| `hero-hair-twin.png` | twin tails tied with small ribbons |
| `hero-hair-spiky.png` | short spiky adventurer hair |

**Outfits.** These match the four armour icons you already made, so equipping armour now changes the hero.

```
Edit the attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same hair, same helmet, same sword, same boots. Change ONLY the clothing on the torso, arms and upper legs to: [OUTFIT]. Remove the red scarf only if the outfit covers the neck. Transparent background.
```

| File | [OUTFIT] |
|---|---|
| `hero-outfit-leather.png` | a brown leather tunic with buckles and a belt |
| `hero-outfit-chain.png` | a chainmail shirt over a padded gambeson |
| `hero-outfit-plate.png` | polished steel plate armour with pauldrons |
| `hero-outfit-robe.png` | a blue mage robe with gold trim, sleeves to the wrists |

**Boots.** These match the four boot icons.

```
Edit the attached character. Keep everything identical: same pose, same framing, same position and size in the image, same face, same hair, same helmet, same clothes, same sword. Change ONLY the footwear to: [BOOTS]. Transparent background.
```

| File | [BOOTS] |
|---|---|
| `hero-boots-leather.png` | tall brown leather boots with folded tops |
| `hero-boots-greaves.png` | steel greaves and armoured boots |
| `hero-boots-winged.png` | light cream boots with small white wings at the ankles |
| `hero-boots-wraps.png` | soft cloth shoes with leg wraps |

---

## Wave 2 — Day and night, two new regions (11 images)

### Maps

Maps are **portrait**, full scenes with no transparent areas. Follow the same composition as `bg-forest.png`:

- the region's landmark at the top centre;
- a calm, fairly open column down the middle from bottom to top;
- busier edges;
- **no path, platforms, characters or creatures.**

To make the second time of day, **edit the first image** so the layout stays identical:

```
Edit the attached map. Keep the exact same scene, composition and every object in the same place. Change only the time of day to [bright mid-morning sunlight, clear blue sky, soft clouds, warm light from the left, no moon or stars | deep night, large moon, stars, cool blue shadows, warm glowing windows and torches]. No path, platforms, characters or creatures.
```

| File | How to make it |
|---|---|
| `bg-forest-day.png` | Attach `bg-forest.png` (your existing night map) and use the edit prompt for daytime. |
| `bg-snow-night.png` | New prompt below. |
| `bg-snow-day.png` | Edit of `bg-snow-night.png`. |
| `bg-desert-day.png` | New prompt below. |
| `bg-desert-night.png` | Edit of `bg-desert-day.png`. |

**Prompt for a new region map**, with the region text filled in from Part A:

```
Portrait background scene for a vertical adventure map (taller than wide), viewed from slightly above, in the same style as the attached map. Region: [REGION DESCRIPTION]. At the very top centre: [LANDMARK]. Keep the middle third, from bottom to top, fairly calm and open, because a winding path and platforms will be drawn on top later. Do NOT draw any path, road, platforms, characters or creatures. Edges can be busier than the centre. Full-bleed, no transparent areas. Time: [night / bright day].
```

### Monsters, bosses and props

Attach one existing sprite, such as a monster cut from `mobs-a.png`, and say "match this style and scale".

**`mobs-<region>.png`** — square 2x2 sheet:

```
2x2 sheet of four small cute fantasy monsters from the [REGION NAME], all the same size, each in three-quarter view facing slightly to the left, full body, transparent background, each centred in its quarter and not touching the others:
top-left: [MOB 1]. top-right: [MOB 2]. bottom-left: [MOB 3]. bottom-right: [MOB 4].
```

**`boss-<region>.png`** — square:

```
A single large boss monster: [BOSS]. Three-quarter view facing to the left, full body, menacing but still in the chibi-friendly style. Transparent background, fully inside the frame.
```

**`props-<region>.png`** — square 2x2 sheet:

```
2x2 sheet of map props for the [REGION NAME], same scale as the attached platform, viewed from slightly above, transparent background:
top-left: a round [MATERIAL] platform, empty. top-right: a larger round [MATERIAL] platform with glowing runes around the rim, for a boss fight, empty. bottom-left: [START MARKER]. bottom-right: [DECORATION].
```

Wave 2 files: `mobs-snow.png`, `mobs-desert.png`, `boss-snow.png`, `boss-desert.png`, `props-snow.png`, `props-desert.png`.

---

## Part A — Regions

The forest is done. Snow and desert are Wave 2; the rest are Wave 4.

| Key | Name | [REGION DESCRIPTION] | [LANDMARK] | [MATERIAL] / [START MARKER] / [DECORATION] |
|---|---|---|---|---|
| `forest` | Mossback Highlands | (done) | castle on a crag | (done) |
| `snow` | Frostpeak Pass | a snowy mountain pass with pine trees, frozen waterfalls and ice cliffs | a frozen fortress | ice-crusted stone / a red banner in the snow / a snowy signpost with an icicle lantern |
| `desert` | Sunscar Dunes | golden dunes, sandstone canyon walls, a small palm oasis, ancient ruins half buried | a sandstone temple with a dome | sandstone / a striped cloth banner on a spear / a cactus beside a clay jar |
| `swamp` | Mirefen Marsh | a misty marsh with twisted trees, lily pads, wooden boardwalks and glowing mushrooms | a crooked witch's tower | mossy logs / a lantern on a post / a cluster of glowing mushrooms |
| `coast` | Saltwind Coast | rocky seaside cliffs, sandy coves, tide pools and a shipwreck | a lighthouse on a rock | weathered planks / a ship's flag on a mast / a barrel with a coiled rope |
| `volcano` | Ashen Caldera | black volcanic rock, glowing lava rivers, ash clouds and obsidian spires | an obsidian tower | basalt with lava cracks / an iron brazier / a cooling lava rock |
| `keep` | Hollow Keep | haunted castle grounds with crumbling walls, a graveyard, dead trees and floating candles | a ruined cathedral spire | cracked flagstone / a tattered purple banner / a candle stand with dripping wax |

### Monsters and bosses per region

| Region | [MOB 1] | [MOB 2] | [MOB 3] | [MOB 4] | [BOSS] |
|---|---|---|---|---|---|
| snow | a round penguin with a tiny wooden shield | a fluffy yeti cub | a small ice-crystal creature with glowing eyes | a white snow owl | a frost wyrm: a long icy serpent-dragon coiled, breathing cold mist |
| desert | a sand scorpion with a glowing tail | a walking cactus with a flower on top | a small bandaged mummy | a blue sand spirit swirling in a dust devil | a giant golden scarab beetle armoured in sandstone, gems on its shell |
| swamp | a frog warrior with a reed spear | a mud blob creature with stick arms | a giant firefly with a lantern belly | a small crocodile grunt with a club | a swamp troll with a tree-trunk club, mossy hide and glowing yellow eyes |
| coast | a hermit crab in a spiral shell | a pink jellyfish floating | a seagull bandit with an eyepatch | a fishfolk spearman | a giant kraken rising from the waves, tentacles raised (draw only the part above water, on transparency) |
| volcano | a fire imp with tiny horns | a lava slug leaving a glowing trail | a magma salamander | an obsidian beetle with glowing cracks | a molten titan of lava and black rock, fire in its chest |
| keep | a small floating ghost with a lantern | a stone gargoyle pup | an empty suit of living armour | a floating candle wisp | a lich king: a skeletal sorcerer in tattered purple robes with a glowing green staff and crown |

---

## Wave 3 — Loot with rarity (12 images)

Each file is a square 2x2 sheet showing **the same item in four tiers**. The app uses:

- top-left for Common and Uncommon;
- top-right for Rare;
- bottom-left for Epic;
- bottom-right for Legendary.

Attach the matching single icon from batch 1 (for example `w-sword` cut from `eq-weapon.png`) so the base design stays the same.

```
2x2 sheet of the SAME [ITEM] in four quality tiers, same angle, same size, same silhouette, each centred in its quarter on a transparent background:
top-left: plain and simple, basic materials.
top-right: finer, engraved metal or stitched leather, better materials.
bottom-left: enchanted, with glowing runes and one coloured gem.
bottom-right: legendary, gold and gems, the most elaborate, a soft radiant glow.
Keep the angle and silhouette of the attached icon.
```

| File | [ITEM] |
|---|---|
| `icon-weapon-sword.png` | short sword |
| `icon-weapon-axe.png` | one-handed axe |
| `icon-weapon-bow.png` | wooden longbow |
| `icon-weapon-staff.png` | wizard's staff with a crystal |
| `icon-helm-kettle.png` | steel kettle helm (helmet only, no head) |
| `icon-helm-horned.png` | horned helmet (helmet only, no head) |
| `icon-helm-hood.png` | ranger hood (hood only, no head) |
| `icon-helm-circlet.png` | thin circlet with a gem (circlet only, no head) |
| `icon-armor-leather.png` | leather tunic |
| `icon-armor-chain.png` | chainmail shirt |
| `icon-armor-plate.png` | steel breastplate |
| `icon-armor-robe.png` | mage robe |

> The batch-1 helm icons include the hero's head. These new ones should show only the headgear, which reads better in the inventory.

---

## Wave 4 — Four more regions (20 images)

For each of `swamp`, `coast`, `volcano` and `keep`, use the Wave 2 prompts with Part A:

- `bg-<region>-day.png` and `bg-<region>-night.png`. Make one, then edit it into the other.
- `mobs-<region>.png`, `boss-<region>.png`, `props-<region>.png`.

---

## Wave 5 — More variety (about 30 images, pick what you like)

**More hairstyles** (Wave 1 hair template): `hero-hair-ponytail` (high ponytail), `hero-hair-braid` (a single long side braid), `hero-hair-bob` (a neat bob cut), `hero-hair-curly` (big voluminous curls), `hero-hair-topknot` (a samurai-style top knot with shaved sides), `hero-hair-wild` (long wild mane).

**Faces.** Attach `hero-mid.png`:

```
Edit the attached character. Keep everything identical: same pose, same framing, same position and size, same hair, same helmet, same clothes, same sword. Change ONLY the eyes, eyebrows and mouth to: [FACE]. Keep the face the same size and position. Transparent background.
```

| File | [FACE] |
|---|---|
| `hero-face-sharp.png` | sharp, confident narrow eyes and a slight smirk |
| `hero-face-sleepy.png` | relaxed half-closed eyes and a small smile |
| `hero-face-cheer.png` | happy closed-eye smile, cheeks raised |
| `hero-face-fierce.png` | determined frown, furrowed brows, teeth gritted |
| `hero-face-freckles.png` | the same eyes, with freckles across the nose and a gap-toothed grin |
| `hero-face-masc.png` | a more masculine face: thicker brows, squarer jaw line, smaller eyes |

**New item types.** Each needs a rarity icon sheet (Wave 3 template). Helmets, outfits and boots also need a hero edit (Wave 1 templates) so they show on the hero. Weapons don't, because the held weapon is made from the icon.

| Kind | New items | Files |
|---|---|---|
| Weapons | dagger, warhammer, spear, magic wand | `icon-weapon-dagger`, `-hammer`, `-spear`, `-wand` |
| Helmets | wizard hat, winged helm, feathered cap, knight's great helm | `icon-helm-wizard` … plus `hero-helm-wizard` … (helm edit: "change ONLY the headgear to …") |
| Outfits | ranger cloak and leathers, martial artist's wrap top, noble's long coat, fur-lined winter coat | `icon-armor-ranger` … plus `hero-outfit-ranger` … |
| Boots | sandals, fur boots | `icon-boots-sandals`, `-fur` plus `hero-boots-sandals`, `-fur` |
| Boots rarity | the four existing boots | `icon-boots-leather`, `-greaves`, `-winged`, `-wraps` |

**Optional: drawn poses.** The app already makes fighting, resting, victory and knocked-out poses by moving the existing layers. Drawn poses look better (arms up for victory, a real slump when knocked out), but a pose image can't stack gear layers, so it shows whatever the pose image itself is wearing. The app would use them only for the 3-second victory cheer and the knocked-out moment. Make them only if that trade-off is worth it to you. Attach `hero-mid.png`:

```
Edit the attached character. Same character, same face, same hair, same helmet, same clothes, same sword, same size and position in the image. Change ONLY the pose to: [POSE]. Transparent background.
```

| File | [POSE] |
|---|---|
| `hero-pose-victory.png` | jumping with joy, sword raised high in the right hand, other fist pumped, big smile |
| `hero-pose-ko.png` | knocked out, slumped sitting on the ground, swirly dazed eyes, sword dropped beside her |
| `hero-pose-rest.png` | sitting cross-legged on the ground, relaxed smile, sword resting across the lap |

**Pets.** These sit beside your hero on the map. Use 2x2 sheets, sitting, three-quarter view facing right, same small size, transparent background:

- `pets-a.png`: white kitten, round brown owl, orange fox cub, baby green dragon with tiny wings.
- `pets-b.png`: tiny pink slime with a bow, baby griffin, grey bunny with a scarf, round hedgehog.

---

## Check before you keep an image

- [ ] **Hero edits:** the character is in the same spot and the same size as `hero-mid.png`. Flick between the two images: only the requested part should change. The face stays the same unless it's a face edit.
- [ ] **Day/night pairs:** every cliff, tree and landmark is in the same place in both.
- [ ] **Rarity sheets:** all four tiers have the same angle and outline; only the detail and materials change.
- [ ] No text, letters or numbers anywhere.
- [ ] Nothing cropped; sheets have four separate subjects.
- [ ] Monsters and bosses face left; the hero faces the same way as `hero-mid.png`; pets face right.
- [ ] Sprites have transparent (or flat magenta) backgrounds; maps are full scenes.

---

## Upload

Same as batch 1. Use either:

- the **`art-raw`** branch → `art/raw/` → **Add file → Upload files**, using the exact filenames above; or
- a ZIP sent to Claude in chat, like batch 1.

Then tell Claude which wave is up.

Claude will:

- line up and cut the hero edits into layers (hair, face, outfit, boots, helmet);
- slice the sheets;
- build the region, day/night, customisation and rarity features in the app;
- tell you which images to redo and why.

The code for all of this comes **after** the art arrives, wave by wave, so nothing changes in the app until you upload.
