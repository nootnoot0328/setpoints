# Setpoint Quest — art spec for ChatGPT

How to use this:

1. Open a **new** ChatGPT chat and paste **Part 1** once.
2. Then paste the prompts in **Part 2**, **one per message**, in order. Save each image with the exact filename shown.
3. Check each image against **Part 3** before you keep it. Regenerate anything that fails.
4. Upload the files to GitHub as described in **Part 4**, then tell Claude "art is up".

You don't need to get sizes or backgrounds perfect. Claude cuts, trims, removes backgrounds, resizes and compresses everything after upload. Your job is to get the **look** right and **name the files exactly**.

---

## Part 1 — paste this first (style bible)

```
You are making game art for a small personal fitness RPG. Every image in this chat must share ONE consistent style. Follow these rules for every image I ask for, without exception:

STYLE
- 16-bit era JRPG pixel art: crisp visible pixels, clean 1-pixel dark outlines, limited palette, no blur, no painterly brush strokes, no photorealism, no 3D render look.
- Cosy night-time fantasy mood: deep navy and indigo shadows, moonlight from the top-left, warm lantern and torch highlights, teal and emerald foliage.
- Characters and creatures are chibi: big head (about one third of total height), small body, friendly readable silhouettes, expressive eyes.
- Base palette anchors: night navy #0E1630, indigo #2A2F6B, moss #3E7D4F, teal #2FA39A, stone grey #7C8597, lantern gold #F4C35A, ember red #D9534F.

OUTPUT RULES
- No text, letters, numbers, logos, watermarks, signatures, UI frames or speech bubbles anywhere in the image.
- Sprites (characters, creatures, items, props): TRANSPARENT background. If you cannot make it transparent, use a flat solid pure magenta #FF00FF background with no shadow, gradient or texture on it, and don't use that magenta anywhere on the subject.
- Sprites are centred, fully inside the frame with a clear margin on every side. Nothing cropped.
- When I ask for a 2x2 sheet: four separate subjects, one centred in each quarter of a square image, same scale and same lighting, not touching each other or the edges.
- Original designs only. Do not imitate any specific existing game, film, anime or brand character.

Reply "Ready" and wait for my first request.
```

### Your hero (fill this in once)

Edit the line in brackets, then keep it. You'll paste this description into every hero prompt below so the hero stays the same person.

```
HERO: a young adventurer, [gender], [hair colour and style], [eye colour], wearing a simple steel kettle helm, a red scarf, a light grey padded tunic with a brown belt, brown boots, holding a short steel sword in the right hand.
```

The hero's equipment won't change on the sprite. In the app, gear shows as icons next to the hero. That's deliberate: an image AI can't redraw the same hero consistently in every gear combination.

---

## Part 2 — prompts (one per message)

The tiers are in priority order. **Tier 1 is enough to ship.** Tiers 2 and 3 add variety later.

### Tier 1 — needed to ship (12 images)

**1. `bg-forest.png`** — portrait

```
Portrait background scene for a vertical adventure map (taller than wide). A misty night-time fantasy highland seen from slightly above: dense pine forest, mossy cliffs, two or three small waterfalls, a few drifting clouds, stars and a large pale moon. At the very top centre, a dark castle on a crag with a few warm windows. Keep the middle third of the image, from bottom to top, fairly calm and open (grassy clearings, low bushes) because a winding path and platforms will be drawn on top later. Do NOT draw any path, road, platforms, characters or creatures. Edges can be busier than the centre. Full-bleed, no transparent areas.
```

**2. `props.png`** — square, 2x2 sheet

```
2x2 sheet of map props, same scale, viewed from slightly above:
top-left: a round stone platform (like a short stone pillar top) with moss on the edges, empty.
top-right: a larger round stone platform with glowing gold runes around the rim, for a boss fight, empty.
bottom-left: a blue banner flag on a wooden pole planted in a small rock, a start marker.
bottom-right: a wooden signpost with a small hanging lantern, glowing warm.
```

**3. `mobs-a.png`** — square, 2x2 sheet

```
2x2 sheet of small cute fantasy monsters, all the same size, each standing in three-quarter view facing slightly to the left, full body:
top-left: a green jelly slime with a little leaf on top.
top-right: a red-capped mushroom creature with white spots and stubby feet.
bottom-left: a stocky brown wild boar with small tusks.
bottom-right: a purple bat with wings spread, hovering.
```

**4. `mobs-b.png`** — square, 2x2 sheet

```
2x2 sheet of small cute fantasy monsters, all the same size, each in three-quarter view facing slightly to the left, full body:
top-left: a small green goblin with a wooden club.
top-right: a grey wolf pup, snarling but cute.
bottom-left: a little skeleton warrior with a rusty shield.
bottom-right: a floating blue will-o'-wisp spirit with a flame tail.
```

**5. `boss-golem.png`** — square

```
A single large boss monster: a hulking stone golem made of mossy grey boulders, glowing blue eyes and blue cracks of light in its chest, fists raised. Three-quarter view facing to the left, full body, menacing but still in the chibi-friendly style. Transparent background.
```

**6. `hero-mid.png`** — square

```
[paste your HERO line here]
Full-body chibi sprite, average build, standing in a ready pose, three-quarter view facing to the right, sword held low and ready. Transparent background.
```

**7. `eq-weapon.png`** — square, 2x2 sheet

```
2x2 sheet of equipment icons, each item alone, centred, angled diagonally like an inventory icon, plain steel and wood with no glow (colour variants will be added later):
top-left: a short sword. top-right: a one-handed axe. bottom-left: a wooden longbow. bottom-right: a wizard's staff with a crystal.
```

**8. `eq-helm.png`** — square, 2x2 sheet

```
2x2 sheet of headgear icons, each alone, centred, front three-quarter view, plain materials with no glow:
top-left: a steel kettle helm. top-right: a horned viking-style helmet. bottom-left: a green ranger hood. bottom-right: a thin silver circlet with a small gem.
```

**9. `eq-armor.png`** — square, 2x2 sheet

```
2x2 sheet of body armour icons, each shown on its own as if laid flat or on an invisible mannequin, front view, no character:
top-left: a brown leather tunic. top-right: a chainmail shirt. bottom-left: a steel breastplate. bottom-right: a blue mage robe with a gold trim.
```

**10. `eq-boots.png`** — square, 2x2 sheet

```
2x2 sheet of footwear icons, each pair alone, side three-quarter view:
top-left: brown leather boots. top-right: steel greaves. bottom-left: light boots with small white wings at the ankles. bottom-right: soft cloth shoes with wraps.
```

**11. `eq-pet.png`** — square, 2x2 sheet

```
2x2 sheet of tiny companion pets, same small size, each sitting, three-quarter view facing slightly to the right:
top-left: a white kitten. top-right: a round brown owl. bottom-left: an orange fox cub. bottom-right: a baby green dragon with tiny wings.
```

**12. `loot.png`** — square, 2x2 sheet

```
2x2 sheet of loot icons:
top-left: a closed wooden treasure chest with gold trim and a lock.
top-right: the same chest open, with golden light and coins spilling out.
bottom-left: a single shiny gold coin, slightly tilted.
bottom-right: a single cut blue gem, sparkling.
```

### Tier 2 — the hero changes with your weight trend (2 images)

Do these **in the same chat as `hero-mid.png`**. Attach `hero-mid.png` back into the chat so it's used as the reference.

**13. `hero-heavy.png`**

```
Using the attached hero as the exact reference, same character, same face, same outfit and colours, same pose, same direction and same framing, but with a sturdier, broader and heavier build. Keep it friendly and dignified, not a joke. Transparent background.
```

**14. `hero-lean.png`**

```
Using the attached hero as the exact reference, same character, same face, same outfit and colours, same pose, same direction and same framing, but with a leaner, fitter, more athletic build with slightly broader shoulders. Transparent background.
```

### Tier 3 — weekly variety (any you like)

Use the same rules as above. Bosses face left; backgrounds have no path and a calm centre column.

- `boss-troll.png` — a swamp troll with a tree-trunk club, mossy hide, glowing yellow eyes.
- `boss-wyrm.png` — a frost wyrm (a long icy serpent-dragon) coiled, breath of cold mist.
- `boss-lich.png` — a skeletal sorcerer king in tattered purple robes with a glowing green staff.
- `bg-snow.png` — the same map composition as `bg-forest.png`, but snowy mountain pass at night, ice falls, a frozen fortress at the top.
- `bg-desert.png` — the same composition, desert canyon ruins at night, palm oasis, a sandstone temple at the top.
- `bg-volcano.png` — the same composition, volcanic badlands, lava rivers glowing, an obsidian tower at the top.

---

## Part 3 — check before you keep an image

Regenerate the image ("Same request, fix: …") if any of these fail:

- [ ] No text, letters or numbers anywhere, including on flags, signs or chests.
- [ ] Nothing cropped at the edges. Every 2x2 sheet has four clearly separate subjects.
- [ ] The background is transparent or flat magenta (except `bg-*` files, which are full scenes).
- [ ] It matches the other images: same pixel size feel, outline thickness and night lighting.
- [ ] Facing direction is right: hero faces right, mobs and bosses face left.
- [ ] Hero images all show the same person in the same outfit.
- [ ] Map backgrounds have no path or platforms drawn in.

Don't worry about exact size, whether the pixels are "true" pixel art, or file size. Claude handles all of that.

---

## Part 4 — upload to GitHub

Files go on the **`art-raw`** branch, not `main`, so the big originals never get downloaded to your phone.

1. On a computer, or in iPhone Safari with **aA → Request Desktop Website**, open `github.com/nootnoot0328/setpoints`.
2. Switch the branch dropdown from `main` to **`art-raw`**.
3. Open the `art/raw` folder → **Add file → Upload files** → drag in the images → **Commit changes**.
4. Filenames must match this sheet exactly: lowercase, hyphens, `.png` (`.jpg` is fine for `bg-*` only).
5. Tell Claude "art is up".

Then Claude will:

- cut the sheets into pieces and remove the backgrounds;
- size the sprites (hero and boss 384 px, mobs 192 px, icons 128 px, platforms 256 px);
- compress the backgrounds to WebP;
- put everything in `assets/quest/` on `main` and wire it into the map.

The target is a total art download under about 3 MB, cached for offline use after the first load. If an image won't process cleanly, Claude will tell you which one to redo and why.

Until a file exists, the app uses its built-in pixel art for that piece, so you can upload in batches.
