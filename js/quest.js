/* ==========================================================================
   Setpoint — Quest. A weekly adventure map driven by your real logs.

   The loop, in one line each:
   - Steps move you. Each day Mon–Sat has a monster on the route; hit your
     step goal that day and you beat it (gold, sometimes a chest).
   - Workouts hit the boss. Every working set you log this week chips the
     Sunday boss's HP. Each monster you beat adds +5% to that damage.
   - Food heals. Days on calorie and protein target heal you and power up
     your next session.
   - Sunday: if the boss's HP is at 0, it falls and drops a chest.
   - Soft penalty only: two idle days before your session target lets the
     boss recover a little and strike you. Nothing you own is ever taken.

   Design rules
   - Derived, not stored: gold, level, beaten monsters, pending chests and the
     boss fight are recomputed from the logs on every render. Stored state is
     S.game = { start, hero, eq, ach, fights, stepGoal, items[] }, synced as
     "g|<id>" item records plus an "s|game" section.
   - A finished boss fight is frozen with the gear worn at the time.
   - Items don't exist until a chest is opened: rarity is rolled then, and the
     AI on your Worker names it (local generator offline). Stats and skills
     come from fixed tables the AI can't change.
   - Art is plain images in assets/quest/. The hero is a paper doll: body,
     weapon, hand and head layers stacked on one canvas, so the equipped
     weapon and helm show on the character.

   Core (no DOM) is exported for Node tests; the view factory registers as
   window.SPQuest and app.js calls it with shared helpers.
   ========================================================================== */
(function (root) {
  "use strict";

  /* ================================================================ data */
  const RAR = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const RCOL = ["#9AA0A6", "#34A462", "#3B7CF0", "#9B5DE5", "#E2A91F"];
  const ODDS = [0.58, 0.27, 0.11, 0.035, 0.005];
  const PITY_RARE = 7, PITY_LEG = 40, CHEST_COST = 250, RETRO_DAYS = 7, RALLY = 5, DEFAULT_STEPS = 8000;
  const ART = "assets/quest/";
  const art = k => ART + k + ".webp";
  const SLOTS = ["weapon", "helm", "armor", "boots"];
  const SLOT_NAME = { weapon: "Weapon", helm: "Helm", armor: "Armour", boots: "Boots" };
  const SHAPES = {
    weapon: ["sword", "axe", "bow", "staff"],
    helm: ["kettle", "horned", "hood", "circlet"],
    armor: ["leather", "chain", "plate", "robe"],
    boots: ["leather", "greaves", "winged", "wraps"]
  };
  const NOUN = {
    weapon: ["Sword", "Axe", "Longbow", "Staff"],
    helm: ["Kettle Helm", "Horned Helm", "Ranger Hood", "Circlet"],
    armor: ["Leather Tunic", "Chainmail", "Breastplate", "Mage Robe"],
    boots: ["Boots", "Greaves", "Winged Boots", "Wraps"]
  };
  const ICON_PRE = { weapon: "w-", helm: "h-", armor: "a-", boots: "b-" };
  const RANKS = ["Novice", "Squire", "Adventurer", "Knight", "Champion", "Hero", "Legend", "Mythic", "Ascendant"];
  const CLASSES = {
    sword: { en: "Warrior", atk: 1.15, hp: 1.0, note: "Hits 15% harder. Every fifth set strikes twice.", outfit: "chain" },
    body: { en: "Guardian", atk: 1.0, hp: 1.3, note: "30% more HP. Sets with 0–1 reps left hit 20% harder.", outfit: "plate" },
    spell: { en: "Mage", atk: 1.0, hp: 1.0, note: "Interval rounds hit 50% harder. Weigh-in days hit 10% harder.", outfit: "robe" },
    alch: { en: "Cleric", atk: 1.0, hp: 1.1, note: "Food days heal twice as much, and a day on target powers up your next session.", outfit: null }
  };
  const MOBS = { slime: "Moss Slime", mushroom: "Capshroom", boar: "Bristleback Boar", bat: "Dusk Bat",
    goblin: "Goblin Scout", wolf: "Grey Wolf", skeleton: "Rattlebones", wisp: "Will-o'-wisp" };
  const MOB_KEYS = Object.keys(MOBS);
  const FLYING = { bat: 1, wisp: 1 };
  /* Size relative to the hero, so a slime is small, a goblin is about your height and bosses tower over you. */
  const MOB_SCALE = { slime: 0.8, mushroom: 0.85, boar: 1.05, bat: 0.85, goblin: 1.0, wolf: 1.05, skeleton: 1.0, wisp: 0.8 };
  const BOSSES = [{ art: "boss-golem", names: ["Mossback Golem", "Ironbark Golem", "Cragheart Golem", "Rune-scarred Golem", "Old Stoneface", "Thornroot Golem"] }];

  /* Skill effects the battle engine runs. p[] is potency by rarity (uncommon → legendary). */
  const SKILLS = {
    dawn: { p: [30, 45, 60, 80], n: "Early Riser", t: v => `Sessions finished before 9 AM hit ${v}% harder.` },
    heavy: { p: [15, 25, 35, 50], n: "Heavy Hand", t: v => `Sets with 0–1 reps left hit ${v}% harder.` },
    volume: { p: [15, 20, 30, 40], n: "Relentless", t: v => `Sessions of 20+ sets hit ${v}% harder.` },
    crit: { p: [8, 12, 16, 22], n: "Keen Edge", t: v => `${v}% of sets strike twice.` },
    ward: { p: [1, 1, 2, 2], n: "Ward", t: v => `Blocks the first ${v > 1 ? v + " boss strikes" : "boss strike"} each week.` },
    drain: { p: [10, 15, 20, 30], n: "Lifesteal", t: v => `Each session heals ${v}% of your HP.` },
    herb: { p: [50, 75, 100, 150], n: "Hearty", t: v => `Food days heal ${v}% more.` },
    storm: { p: [40, 60, 80, 120], n: "Stormstep", t: v => `Interval rounds hit ${v}% harder.` },
    momentum: { p: [5, 8, 10, 15], n: "Momentum", t: v => `+${v}% per day trained in a row (up to 3).` },
    seal: { p: [30, 45, 60, 80], n: "Binding", t: v => `The boss heals ${v}% less.` },
    scale: { p: [10, 15, 20, 30], n: "True Scales", t: v => `Weigh-in days hit ${v}% harder.` },
    focus: { p: [30, 45, 60, 90], n: "Focus", t: v => `The first 4 sets of a session hit ${v}% harder.` },
    stride: { p: [2, 3, 4, 6], n: "Long Stride", t: v => `Each monster beaten adds ${RALLY + v}% boss damage instead of ${RALLY}%.` }
  };
  const SKILL_KEYS = Object.keys(SKILLS);
  const SLOT_STAT = {
    weapon: r => ({ atk: [3, 6, 10, 16, 25][r], def: 0, hp: 0 }),
    armor: r => ({ atk: 0, def: [2, 4, 7, 11, 17][r], hp: [10, 20, 35, 55, 80][r] }),
    helm: r => ({ atk: [1, 2, 3, 5, 8][r], def: [1, 2, 4, 6, 9][r], hp: [5, 10, 18, 28, 40][r] }),
    boots: r => ({ atk: [1, 1, 2, 3, 5][r], def: [1, 2, 3, 5, 8][r], hp: [5, 10, 15, 25, 35][r] })
  };

  /* ================================================================ utils */
  function hashF(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) / 4294967296;
  }
  function seeded(seed) {
    let a = (seed * 4294967296) >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));

  function doneSets(s) {
    if (!s || !s.ex) return 0;
    let n = 0;
    for (const e of s.ex) for (const st of e.sets || []) if (st && st.done && st.reps > 0) n++;
    return n;
  }
  const counts = s => s && (s.type === "hiit" ? (s.rounds | 0) > 0 : doneSets(s) > 0);
  function weekTarget(S) { const p = S.train && S.train.profile; return Math.max(1, Math.min(6, (p && p.days) || 3)); }

  /* ================================================================ steps */
  const stepGoal = S => clampI((S.game && S.game.stepGoal) || DEFAULT_STEPS, 1000, 50000);
  function stepsOn(S, d) { const h = S.health && S.health[d]; return h && h.steps != null ? h.steps : null; }
  /* met / missed are only final for past days; today can still turn into met. */
  function dayStatus(S, d, td) {
    const goal = stepGoal(S), steps = stepsOn(S, d), met = steps != null && steps >= goal;
    return { d, steps, goal, met, today: d === td, future: d > td, missed: d < td && steps != null && !met, pending: d < td && steps == null,
      at: (S.health && S.health[d] && S.health[d].stepsAt) || null };
  }
  function mobsForWeek(ws) {
    const rnd = seeded(hashF("mobs|" + ws)), k = MOB_KEYS.slice();
    for (let i = k.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [k[i], k[j]] = [k[j], k[i]]; }
    return k.slice(0, 6);
  }
  /* The seven stops of a week: Mon–Sat monsters, Sunday boss. */
  function weekStops(S, E, ws, td) {
    const mobs = mobsForWeek(ws);
    return Array.from({ length: 7 }, (_, i) => {
      const d = E.addDays(ws, i);
      return Object.assign(dayStatus(S, d, td), { i, kind: i < 6 ? "mob" : "boss", mob: i < 6 ? mobs[i] : null });
    });
  }

  /* ================================================================ levels */
  const levelOf = earned => Math.floor(Math.sqrt(Math.max(0, earned) / 40)) + 1;
  function rankOf(lv) { const i = Math.min(RANKS.length - 1, Math.floor((lv - 1) / 5)); return { i, en: RANKS[i], tier: lv - i * 5 }; }
  /* Cosmetic look: hairstyle and colour show when the helmet is hidden. Stats never change. */
  const HAIRS = ["short", "spiky", "long", "twin", "moon"];
  const HAIR_NAME = { short: "Short", spiky: "Spiky", long: "Long", twin: "Twin tails", moon: "Moon bun" };
  const HAIR_COLORS = { brown: "#8a5a3a", black: "#34313f", blonde: "#deac4e", ash: "#d6cec8", auburn: "#aa3c28", teal: "#2c8e92", frost: "linear-gradient(160deg,#cfe6fa 35%,#c4a6ea)" };
  function lookOf(l) {
    l = l || {};
    return { hair: HAIRS.includes(l.hair) ? l.hair : "short", hc: HAIR_COLORS[l.hc] ? l.hc : "brown", helm: l.helm !== false };
  }
  function heroOf(S) {
    const h = (S.game && S.game.hero) || {};
    return { cls: CLASSES[h.cls] ? h.cls : "sword", name: typeof h.name === "string" ? h.name.slice(0, 24) : "", look: lookOf(h.look) };
  }
  function equipped(S) {
    const g = S.game || {}, byId = new Map((g.items || []).map(i => [i.id, i])), eq = {};
    for (const s of SLOTS) { const it = g.eq && byId.get(g.eq[s]); if (it && it.slot === s) eq[s] = it; }
    return eq;
  }
  function gearOf(eq) {
    const g = { atk: 0, def: 0, hp: 0, sk: {} };
    for (const s of SLOTS) {
      const it = eq[s]; if (!it) continue;
      const st = it.stat || {};
      g.atk += st.atk || 0; g.def += st.def || 0; g.hp += st.hp || 0;
      if (it.skill && SKILLS[it.skill.k]) g.sk[it.skill.k] = (g.sk[it.skill.k] || 0) + (it.skill.p || 0);
    }
    return g;
  }
  function statsAt(lv, cls, gear) {
    const c = CLASSES[cls] || CLASSES.sword;
    return { atk: Math.round((10 + 2 * lv + gear.atk) * c.atk), def: 5 + lv + gear.def, hp: Math.round((100 + 10 * lv + gear.hp) * c.hp) };
  }

  /* ================================================================ earning */
  function foodDay(S, E, d) {
    if (!(S.intake && S.intake[d] && S.intake[d].length) || (S.fasted && S.fasted[d])) return null;
    let tg = null; try { tg = E.targetsFor(S, d); } catch (e) { }
    if (!tg) return 0;
    const t = E.dayTotals(S, d), hp = t.p >= tg.p * 0.9, hk = Math.abs(t.kcal - tg.kcal) <= tg.kcal * 0.1;
    return hp && hk ? 2 : hp || hk ? 1 : 0;
  }
  function baseEvents(S, E, td) {
    const g = S.game || {}, log = (S.train && S.train.log) || [], out = [];
    const since = E.addDays(g.start || td, -RETRO_DAYS);
    const add = (id, date, kind, label, gold, chest, min) => out.push({ id, date, kind, label, gold, chest: !!chest, min: min || 0 });
    for (const s of log) {
      if (!s || !s.id || s.date < since || s.date > td) continue;
      if (s.type === "hiit") {
        const r = s.rounds | 0;
        if (r >= 6) add("t:" + s.id, s.date, "hiit", s.name || "Intervals", 25 + Math.min(r, 20), true);
        else if (r > 0) add("t:" + s.id, s.date, "hiit", s.name || "Intervals", 10, false);
      } else {
        const n = doneSets(s);
        if (n >= 6) add("t:" + s.id, s.date, "lift", s.name || "Workout", 30 + Math.min(n, 24) * 2, true);
        else if (n > 0) add("t:" + s.id, s.date, "lift", s.name || "Workout", 10 + n * 2, false);
      }
    }
    let nutri = 0, run = 0, bestRun = 0;
    for (let d = since; d <= td; d = E.addDays(d, 1)) {
      if (S.weights && S.weights[d]) add("w:" + d, d, "weigh", "Weigh-in", 5, false);
      const st = dayStatus(S, d, td);
      if (st.met) {
        run++; bestRun = Math.max(bestRun, run);
        const ws = E.weekStart(d), i = E.daysBetween(ws, d);
        if (i < 6) { const m = mobsForWeek(ws)[i]; add("m:" + d, d, "mob", `Beat the ${MOBS[m]}`, 15, hashF("m|" + d) < 0.3); }
        else add("m:" + d, d, "mob", "Reached the boss", 15, false);
      } else if (d < td) run = 0;
      if (d >= td) continue;
      const f = foodDay(S, E, d);
      if (f == null) continue;
      // an over-target day still pays: skipping the log must never be the better move
      if (f === 2) { nutri++; add("n:" + d, d, "food", "Calories and protein on target", 25, hashF("n|" + d) < 0.4); }
      else if (f === 1) add("n:" + d, d, "food", "Half on target", 10, false);
      else add("n:" + d, d, "food", "Logged food", 3, false);
    }
    return { list: out, since, nutri, stepRun: bestRun };
  }

  /* ================================================================ boss */
  function bossFor(ws, lv, target, gearAtk) {
    const rnd = seeded(hashF("boss|" + ws)), b = BOSSES[Math.floor(rnd() * BOSSES.length)];
    return { art: b.art, name: b.names[Math.floor(rnd() * b.names.length)], hp: Math.round(target * 16 * (10 + 2 * lv + 0.6 * (gearAtk || 0))) };
  }
  const RIR_F = [1.25, 1.25, 1.0, 0.8, 0.6];
  /* One week's fight, day by day, from the logs. The boss falls on Sunday if
     its HP is at 0 by then; until Sunday the bar shows the damage so far. */
  /* lv sets the boss (level at the start of the week); heroLv sets your own
     stats, so the live week matches the level shown on your hero card. */
  function battle(S, E, ws, td, lv, eq, heroLv) {
    const hero = heroOf(S), gear = gearOf(eq), sk = gear.sk, cls = hero.cls;
    const st = statsAt(heroLv || lv, cls, gear), target = weekTarget(S), sun = E.addDays(ws, 6);
    const start = (S.game && S.game.start) || ws;   // no penalties for days before you started
    const boss = bossFor(ws, lv, target, gear.atk);
    const log = ((S.train && S.train.log) || []).filter(s => counts(s) && s.date >= ws && s.date <= sun && s.date <= td)
      .slice().sort((a, b) => a.date.localeCompare(b.date) || (a.at || 0) - (b.at || 0));
    let bhp = boss.hp, php = st.hp, wards = sk.ward || 0, idle = 0, streakDays = 0, buff = 0, taken = 0, done = 0, dealt = 0, beaten = 0;
    const per = RALLY + (sk.stride || 0), days = [];
    const end = sun < td ? sun : td;
    for (let d = ws; d <= end; d = E.addDays(d, 1)) {
      const day = { d, hits: [], heal: 0, strike: 0, bossHeal: 0, food: null, weigh: !!(S.weights && S.weights[d]), ko: false };
      if (d < sun && dayStatus(S, d, td).met) { beaten++; day.beat = true; }
      day.rally = beaten * per;
      const f = d < td ? foodDay(S, E, d) : null;
      day.food = f;
      if (f != null) {
        const base = f === 2 ? 0.25 : f === 1 ? 0.12 : 0.04;
        let heal = st.hp * base * (1 + (sk.herb || 0) / 100) * (cls === "alch" ? 2 : 1);
        heal = Math.min(Math.round(heal), st.hp - php);
        if (heal > 0) { php += heal; day.heal += heal; }
        if (f === 2) buff = cls === "alch" ? 20 : 10;
      }
      const sess = log.filter(s => s.date === d);
      if (sess.length) { idle = 0; streakDays++; } else streakDays = 0;
      for (const s of sess) {
        let mult = 1 + buff / 100 + day.rally / 100; buff = 0;
        if (sk.dawn && s.at && new Date(s.at).getHours() < 9) mult += sk.dawn / 100;
        if (day.weigh) mult += ((sk.scale || 0) + (cls === "spell" ? 10 : 0)) / 100;
        if (sk.momentum) mult += Math.min(3, streakDays) * sk.momentum / 100;
        const ko = php <= 0; if (ko) mult *= 0.5;
        let dmg = 0, crits = 0, n = 0;
        if (s.type === "hiit") {
          n = s.rounds | 0;
          dmg = st.atk * 0.6 * (1 + (sk.storm || 0) / 100) * (cls === "spell" ? 1.5 : 1) * n;
        } else {
          const sets = []; for (const e of s.ex || []) for (const x of e.sets || []) if (x && x.done && x.reps > 0) sets.push(x);
          n = sets.length;
          const vol = n >= 20 && sk.volume ? sk.volume / 100 : 0;
          sets.forEach((x, i) => {
            const rir = x.rir == null ? null : Math.max(0, Math.min(4, x.rir | 0));
            let m = rir == null ? 0.9 : RIR_F[rir];
            if (rir != null && rir <= 1) m *= 1 + ((sk.heavy || 0) + (cls === "body" ? 20 : 0)) / 100;
            if (i < 4 && sk.focus) m *= 1 + sk.focus / 100;
            m *= 1 + vol;
            let hit = st.atk * m;
            if ((sk.crit && hashF(s.id + "|" + i) < sk.crit / 100) || (cls === "sword" && (done + i + 1) % 5 === 0)) { hit *= 2; crits++; }
            dmg += hit;
          });
          done += n;
        }
        dmg = Math.round(dmg * mult);
        bhp -= dmg; dealt += dmg;
        let heal = 0;
        if (sk.drain) { heal = Math.min(Math.round(st.hp * sk.drain / 100), st.hp - Math.max(0, php)); php = Math.max(0, php) + heal; }
        day.hits.push({ id: s.id, name: s.name || (s.type === "hiit" ? "Intervals" : "Workout"), type: s.type, n, dmg, crits, heal, ko });
      }
      if (!sess.length && d < td && d >= start) {
        idle++;
        const sessionsSoFar = log.filter(s => s.date <= d).length;
        if (idle >= 2 && sessionsSoFar < target && bhp > 0) {
          const bh = Math.round(boss.hp * 0.08 * (1 - (sk.seal || 0) / 100));
          const before = bhp; bhp = Math.min(boss.hp, bhp + bh); day.bossHeal = bhp - before;
          if (wards > 0) { wards--; day.warded = true; }
          else {
            const hit = Math.round(st.hp * 0.3 * (50 / (50 + st.def)));
            php = Math.max(0, php - hit); day.strike = hit; taken += hit;
            if (php === 0) day.ko = true;
          }
        }
      }
      day.bhp = Math.max(0, bhp); day.php = php;
      days.push(day);
    }
    const won = td >= sun && bhp <= 0;
    return { ws, sun, boss, hp: boss.hp, bhp: Math.max(0, bhp), dmg: dealt, stats: st, php, days, won, wonOn: won ? sun : null,
      broken: bhp <= 0, overkill: Math.max(0, -bhp), taken, beaten, rally: beaten * per,
      flawless: won && taken === 0, closed: sun < td, sessions: log.length, target, lv };
  }

  /* ================================================================ feats */
  const ACH = ["Rmlyc3QgQmxvb2R8TG9nZ2VkIHlvdXIgZmlyc3QgbGlmdGluZyBzZXNzaW9uLg==","SXJvbiBIYWJpdHxUZW4gbGlmdGluZyBzZXNzaW9ucy4=","RmlmdHkgRm9yZ2VkfEZpZnR5IGxpZnRpbmcgc2Vzc2lvbnMu","R2lhbnQgU2xheWVyfERlZmVhdGVkIHlvdXIgZmlyc3Qgd2Vla2x5IGJvc3Mu","Rm91ci1XZWVrIENydXNhZGV8Rm91ciBib3NzZXMgaW4gYSByb3cu","VW50b3VjaGVkfEJlYXQgYSBib3NzIHdpdGhvdXQgdGFraW5nIGEgaGl0Lg==","V2VsbCBGZWR8U2V2ZW4gZGF5cyBvbiBjYWxvcmllcyBhbmQgcHJvdGVpbi4=","VHJ1ZSBTY2FsZXN8VGhpcnR5IHdlaWdoLWlucy4=","V2luZCBSdW5uZXJ8Rml2ZSBpbnRlcnZhbCBzZXNzaW9ucy4=","T3ZlcmRyaXZlfEZpdmUgc2Vzc2lvbnMgaW4gb25lIHdlZWsu","SGFsZndheSBIb21lfEhhbGZ3YXkgdG8geW91ciBnb2FsIHdlaWdodC4=","Sm91cm5leSdzIEVuZHxSZWFjaGVkIHlvdXIgZ29hbCB3ZWlnaHQu","U3F1aXJlJ3MgT2F0aHxSZWFjaGVkIHRoZSByYW5rIG9mIFNxdWlyZS4=","RGF3biBQYXRyb2x8VHJhaW5lZCBiZWZvcmUgNyBBTS4=","TW91bnRhaW4gTW92ZXJ8MjUgd29ya2luZyBzZXRzIGluIG9uZSBzZXNzaW9uLg==","TGVnZW5kYXJ5IEZpbmR8Rm91bmQgYSBsZWdlbmRhcnkgaXRlbS4=","TG9uZyBNYXJjaHxIaXQgeW91ciBzdGVwIGdvYWwgc2V2ZW4gZGF5cyBpbiBhIHJvdy4=","UGF0aGZpbmRlcnxDbGVhcmVkIGV2ZXJ5IG1vYiBpbiBhIHdlZWsu"];
  const ACH_TEST = [
    s => s.lifts >= 1, s => s.lifts >= 10, s => s.lifts >= 50, s => s.wins >= 1, s => s.best >= 4, s => s.flawless,
    s => s.nutri >= 7, s => s.weighins >= 30, s => s.hiit >= 5, s => s.maxWeek >= 5, s => s.goal >= 0.5, s => s.goal >= 1,
    s => s.rank >= 1, s => s.early, s => s.big, s => s.legend, s => s.stepRun >= 7, s => s.fullWeek
  ];
  function b64(s) {
    try { return typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString("utf8"); }
    catch (e) { return "|"; }
  }
  const achText = i => { const [n, d] = b64(ACH[i]).split("|"); return { name: n, desc: d }; };

  /* ================================================================ summary */
  function summary(S, E, td) {
    td = td || E.today();
    const g = S.game || {}, items = g.items || [], fights = g.fights || {};
    const base = baseEvents(S, E, td), list = base.list.slice();
    const eq = equipped(S), hero = heroOf(S);
    const byId = new Map(items.map(i => [i.id, i]));
    const eqFrom = ids => { const o = {}; for (const k in ids || {}) { const it = byId.get(ids[k]); if (it && it.slot === k) o[k] = it; } return o; };
    const cur = E.weekStart(td), weeks = [];
    let streak = 0, shields = 0, toShield = 0, best = 0, wins = 0, flawless = false, maxWeek = 0, fullWeek = false;
    for (let ws = E.weekStart(base.since); ws <= cur; ws = E.addDays(ws, 7)) {
      const lv = levelOf(list.filter(e => e.date < ws).reduce((a, e) => a + e.gold, 0));
      const frozen = fights[ws];
      const b = battle(S, E, ws, td, frozen && frozen.lv ? frozen.lv : lv, frozen ? eqFrom(frozen.eq) : eq);
      const won = frozen ? !!frozen.won : b.won, fl = frozen ? !!frozen.flawless : b.flawless;
      maxWeek = Math.max(maxWeek, b.sessions);
      if (b.beaten >= 6) fullWeek = true;
      if (ws < cur) {
        if (won) { streak++; if (++toShield >= 4) { toShield = 0; shields = Math.min(2, shields + 1); } }
        else if (shields > 0) shields--;
        else { streak = 0; toShield = 0; }
      } else if (won) streak++;
      if (won) list.push({ id: "b:" + ws, date: b.sun, kind: "boss", label: `Defeated the ${b.boss.name}`, gold: 60 + 10 * Math.min(streak, 6) + Math.min(60, Math.round(b.overkill / 20)), chest: true, min: 1 });
      if (fl) flawless = true;
      best = Math.max(best, streak);
      weeks.push(Object.assign(b, { won, flawless: fl, frozen: !!frozen, streak }));
    }
    const log = (S.train && S.train.log) || [];
    let gp = null; try { gp = S.goal && S.goal.mode !== "maintain" ? E.goalProgress(S, td) : null; } catch (e) { }
    const pre = list.reduce((a, e) => a + e.gold, 0);
    const st = {
      lifts: log.filter(s => s.type !== "hiit" && doneSets(s) > 0).length, hiit: log.filter(s => s.type === "hiit" && (s.rounds | 0) > 0).length,
      nutri: base.nutri, weighins: Object.keys(S.weights || {}).length, wins, best, flawless, maxWeek, goal: gp ? gp.pct : 0,
      rank: rankOf(levelOf(pre)).i, early: log.some(s => s.at && counts(s) && new Date(s.at).getHours() < 7),
      big: log.some(s => doneSets(s) >= 25), legend: items.some(i => i.r >= 4), stepRun: base.stepRun, fullWeek
    };
    const when = g.ach || {};
    const ach = ACH_TEST.map(t => { try { return !!t(st); } catch (e) { return false; } });
    ach.forEach((ok, i) => { if (ok) list.push({ id: "a:" + i, date: when[i] || td, kind: "feat", label: "Hidden feat found", gold: 100, chest: true, min: 1 }); });
    let earned = list.reduce((a, e) => a + e.gold, 0);
    let lv = levelOf(earned);
    // second pass: the live week uses your current level for your own stats
    const live = weeks[weeks.length - 1];
    if (live && !live.frozen && live.stats.hp !== statsAt(lv, hero.cls, gearOf(eq)).hp) {
      const b2 = battle(S, E, live.ws, td, live.lv, eq, lv);
      if (b2.won && !live.won) {
        list.push({ id: "b:" + live.ws, date: b2.sun, kind: "boss", label: `Defeated the ${b2.boss.name}`, gold: 60 + 10 * Math.min(streak + 1, 6) + Math.min(60, Math.round(b2.overkill / 20)), chest: true, min: 1 });
        streak++; wins++; earned = list.reduce((a, e) => a + e.gold, 0); lv = levelOf(earned);
      }
      weeks[weeks.length - 1] = Object.assign(b2, { won: b2.won, flawless: b2.flawless, frozen: false, streak });
    }
    const spent = items.reduce((a, i) => a + (i.cost || 0), 0), have = new Set(items.map(i => i.id));
    return {
      events: list.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
      pending: list.filter(e => e.chest && !have.has(e.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      earned, spent, gold: earned - spent, level: lv, rank: rankOf(lv), lvFrom: 40 * (lv - 1) * (lv - 1), lvTo: 40 * lv * lv,
      hero, eq, gear: gearOf(eq), stats: statsAt(lv, hero.cls, gearOf(eq)), weeks, week: weeks[weeks.length - 1],
      stops: weekStops(S, E, cur, td), stepGoal: stepGoal(S), streak, shields, stat: st, ach
    };
  }

  /* ================================================================ items */
  function pityOf(items) {
    const s = (items || []).filter(i => !i.starter).sort((a, b) => (a.at || 0) - (b.at || 0));
    let rare = 0, leg = 0;
    for (const it of s) { rare = it.r >= 2 ? 0 : rare + 1; leg = it.r >= 4 ? 0 : leg + 1; }
    return { rare, leg };
  }
  function rollRarity(r, items, min) {
    let k = ODDS.length - 1, acc = 0;
    for (let i = 0; i < ODDS.length; i++) { acc += ODDS[i]; if (r < acc) { k = i; break; } }
    const p = pityOf(items);
    if (p.rare >= PITY_RARE - 1) k = Math.max(k, 2);
    if (p.leg >= PITY_LEG - 1) k = 4;
    return Math.max(k, min || 0);
  }
  const ADJ = [
    ["Plain", "Sturdy", "Worn", "Humble", "Everyday", "Trusty", "Scuffed", "Patched"],
    ["Bright", "Nimble", "Brisk", "Lucky", "Ranger's", "Steady", "Oiled", "Polished"],
    ["Gleaming", "Tempered", "Stormforged", "Swift", "Radiant", "Moonlit", "Wolfsbane", "Frosted"],
    ["Blazing", "Arcane", "Thunderous", "Phantom", "Starforged", "Dragonbone", "Eclipse", "Runic"],
    ["Mythic", "Eternal", "Celestial", "Sovereign", "Primordial", "Kingslayer's", "Worldforged", "Ascendant"]
  ];
  const FLAVOR = ["Smells faintly of victory.", "Earned one step at a time.", "Fits better every week.", "Rumoured to add +1 to discipline.",
    "Found at the bottom of a very sweaty chest.", "Warranty void if you skip leg day.", "Stitched from last week's excuses.",
    "Glows a little brighter after a good session.", "The innkeeper swears it once belonged to a dragon.", "Nobody knows where it came from. It knows you."];
  const THEME = ["moonlit forest", "frost", "ember", "thunderstorm", "old ruins", "dragon scale", "mountain pass", "tidepool", "autumn leaves",
    "lantern light", "starfall", "crystal cave", "wolf pack", "royal guard", "swamp", "desert sun", "ivy", "obsidian", "dawn", "wild boar",
    "owl feathers", "sea serpent", "harvest", "blacksmith's forge", "rune stones", "cherry blossom", "comet", "goblin market", "griffin", "storm clouds"];
  function makeSkill(rnd, r) { if (r < 1) return null; const k = SKILL_KEYS[Math.floor(rnd() * SKILL_KEYS.length)]; return { k, p: SKILLS[k].p[r - 1] }; }
  function localItem(rnd, slot, shape, r) {
    const pick = a => a[Math.floor(rnd() * a.length)];
    return { v: 3, slot, shape, r, name: `${pick(ADJ[r])} ${NOUN[slot][shape]}`, flavor: pick(FLAVOR),
      stat: SLOT_STAT[slot](r), skill: makeSkill(rnd, r), src: "local" };
  }
  const STARTER = [
    { id: "starter:weapon", v: 3, slot: "weapon", shape: 0, r: 0, name: "Traveller's Sword", flavor: "Not much, but it's sharp on one side.", stat: SLOT_STAT.weapon(0), skill: null, at: 0, starter: true },
    { id: "starter:helm", v: 3, slot: "helm", shape: 0, r: 0, name: "Traveller's Kettle Helm", flavor: "Dented in all the right places.", stat: SLOT_STAT.helm(0), skill: null, at: 0, starter: true }
  ];
  function aiPrompt(item, words) {
    const sk = item.skill ? `Its power: ${SKILLS[item.skill.k].t(item.skill.p)}` : "It has no special power.";
    return `You name one item for a cosy pixel-art fantasy RPG that rewards real-life exercise.
Item type: ${NOUN[item.slot][item.shape]} (${SLOT_NAME[item.slot]}). Rarity: ${RAR[item.r]} (${item.r + 1} of 5).
${sk}
Inspiration (blend, don't list): ${words.join(", ")}.
Reply with JSON only, no code fence:
{"name":"2 to 4 words, must include what the item is","flavor":"one playful sentence under 90 characters"}
Rules: higher rarity means a grander name. No brand names, real people, or characters or places from existing books, films or games.`;
  }
  function parseItem(text, base) {
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j; try { j = JSON.parse(m[0]); } catch (e) { return null; }
    const clean = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n) : "";
    const name = clean(j.name, 40), fl = clean(j.flavor, 120);
    if (!name) return null;
    return Object.assign({}, base, { name, flavor: fl || base.flavor, src: "ai" });
  }
  /* Items from earlier versions become v3 gear, keeping rarity and skill. */
  const MIG = { head: "helm", body: "armor", back: "boots", bg: "boots", weapon: "weapon", robe: "armor", charm: "boots", aura: "boots" };
  function migrateItem(it) {
    if (!it || it.v === 3) return it;
    const slot = MIG[it.slot] || "boots", r = clampI(it.r, 0, 4), rnd = seeded(hashF("mig|" + it.id));
    const name = String(it.name || "").split(" · ").pop() || `${ADJ[r][0]} ${NOUN[slot][0]}`;
    return Object.assign({}, it, { v: 3, slot, r, shape: Math.floor(rnd() * 4), name, stat: SLOT_STAT[slot](r),
      skill: it.skill && SKILLS[it.skill.k] ? it.skill : makeSkill(rnd, r) });
  }
  /* Rarity is shown by the item's own design, never by tinting. Each shape has a
     separate drawing per tier (Uncommon..Legendary: art key "<shape>-r<tier>").
     TIERED lists the drawings that have shipped; anything else uses the Common
     drawing until its art lands. Entries look like "weapon:sword:4". */
  const TIERED = new Set([
    ...["sword", "axe", "bow", "staff"].flatMap(w => [1, 2, 3, 4].map(r => `weapon:${w}:${r}`))
  ]);
  function artKey(slot, it) {
    const shape = SHAPES[slot][it.shape];
    return it.r > 0 && TIERED.has(`${slot}:${shape}:${it.r}`) ? `${shape}-r${it.r}` : shape;
  }
  const iconOf = it => art(ICON_PRE[it.slot] + artKey(it.slot, it));
  /* Paper-doll layers, back to front, as {k, src}. k "w" is the weapon (poses rotate it),
     "ft" the boots (stay planted while the rest breathes), "bl" the blink.
     Empty armour/boots show the starting tunic and boots. */
  // helmets that hide hair above their brim (a circlet sits on top of the hair)
  const HAIR_MASKED = new Set(["kettle", "horned", "hood"]);
  function heroLayers(eq, look, cls) {
    eq = eq || {}; look = lookOf(look);
    const key = s => eq[s] ? artKey(s, eq[s]) : null;
    // no armour equipped: you wear your class's outfit (Cleric keeps the white tunic)
    const classFit = (CLASSES[cls] || CLASSES.sword).outfit;
    const w = key("weapon") || "sword", hd = key("helm") || "kettle", bt = key("boots");
    const ar = key("armor") || classFit;
    const robe = eq.armor ? SHAPES.armor[eq.armor.shape] === "robe" : classFit === "robe";
    const L = robe ? [] : [["cape", "hero-cape"]];   // robes have no cape
    L.push(["b", "hero-body" + (ar ? "-" + ar : "")], ["ft", "hero-boots" + (bt ? "-" + bt : "")]);
    if (robe) L.push(["hem", "hero-hem-" + ar]);
    L.push(["w", "hero-wpn-" + w], ["hn", "hero-hand"], ["hd", "hero-face"], ["bl", "hero-blink-face"]);
    const hairL = ["hr", `hero-hair-${look.hair}-${look.hc}`];
    if (look.helm && HAIR_MASKED.has(hd.split("-")[0])) hairL.push("hero-hairmask-" + hd);
    L.push(hairL);
    if (look.helm) L.push(["hm", "hero-helm-" + hd]);
    return L.map(([k, f, m]) => m ? { k, src: art(f), mask: art(m) } : { k, src: art(f) });
  }

  /* ================================================================ route
     Smooth path through the stops, sampled so positions can be computed
     without the DOM. Stop coordinates are % of map width / height. */
  const STOPS_XY = [[50, 90], [72, 80], [32, 69.5], [66, 58.5], [34, 47.5], [66, 37], [50, 23.5]];
  const MAP_AR = 1365 / 768;
  function buildRoute(pts) {
    const P = pts.map(([x, y]) => ({ x, y: y * MAP_AR }));   // square units so lengths are true
    let d = `M${P[0].x},${P[0].y.toFixed(2)}`;
    const samples = [{ x: P[0].x, y: P[0].y, s: 0 }], at = [0];
    let len = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p2.x},${p2.y.toFixed(2)}`;
      let prev = p1;
      for (let k = 1; k <= 40; k++) {
        const t = k / 40, u = 1 - t;
        const q = { x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
          y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y };
        len += Math.hypot(q.x - prev.x, q.y - prev.y); samples.push({ x: q.x, y: q.y, s: len }); prev = q;
      }
      at.push(len);
    }
    function pointAt(s) {
      s = Math.max(0, Math.min(len, s));
      let lo = 0, hi = samples.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].s < s) lo = m; else hi = m; }
      const a = samples[lo], b = samples[hi], k = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
      return { x: a.x + (b.x - a.x) * k, y: (a.y + (b.y - a.y) * k) / MAP_AR };
    }
    return { d, len, at, pointAt, vbh: 100 * MAP_AR };
  }

  /* ================================================================ fallback chest art */
  function chestSVG(color) {
    const cells = new Map(), R = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) cells.set(y * 16 + x, c); };
    R(3, 4, 11, color); R(4, 3, 12, color); R(5, 3, 12, color); R(6, 3, 12, "#1B1B1F");
    for (let y = 7; y <= 12; y++) R(y, 3, 12, y === 9 ? "#7A4A22" : "#9A6232");
    R(7, 7, 8, "#F5C84C"); R(8, 7, 8, "#F5C84C"); R(4, 5, 5, "#FFFFFF");
    const edge = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      if (!cells.has(y * 16 + x) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && x + dx < 16 && cells.has((y + dy) * 16 + x + dx))) edge.push(y * 16 + x);
    edge.forEach(i => cells.set(i, "#1B1B1F"));
    let out = ""; cells.forEach((c, i) => { out += `<rect x="${i % 16}" y="${Math.floor(i / 16)}" width="1" height="1" fill="${c}"/>`; });
    return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
  }

  const Core = { RAR, RCOL, ODDS, PITY_RARE, PITY_LEG, CHEST_COST, RALLY, SLOTS, SLOT_NAME, SHAPES, NOUN, SKILLS, CLASSES, RANKS, MOBS, FLYING, MOB_SCALE, STARTER, THEME, STOPS_XY,
    art, doneSets, stepGoal, stepsOn, dayStatus, mobsForWeek, weekStops, levelOf, rankOf, statsAt, gearOf, equipped, heroOf, baseEvents, battle, bossFor, summary,
    pityOf, rollRarity, localItem, aiPrompt, parseItem, migrateItem, iconOf, heroLayers, TIERED, artKey, HAIR_MASKED, HAIRS, HAIR_NAME, HAIR_COLORS, lookOf, buildRoute, achText, ACH_COUNT: ACH.length, chestSVG, hashF, seeded };
  if (typeof module === "object" && module.exports) { module.exports = Core; return; }
  root.SPQuestCore = Core;

  /* ================================================================ view */
  root.SPQuest = function (X) {
    const { h, svg, E } = X;
    const C = Core;
    const S = () => X.S();
    const G = () => {
      const s = S();
      if (!s.game) s.game = {};
      const g = s.game;
      if (!Array.isArray(g.items)) g.items = [];
      if (!g.eq) g.eq = {};
      if (!g.ach) g.ach = {};
      if (!g.fights) g.fights = {};
      return g;
    };
    const QI = {
      coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5h3.8a1.7 1.7 0 010 3.4h-2.6a1.7 1.7 0 000 3.4h3.8"/>',
      flame: '<path d="M12.5 3c.4 3-2 4.3-3.3 6.3C8 11 7.5 12.4 7.5 14a4.5 4.5 0 009 0c0-2.4-1.3-3.6-2.1-5.2.9 2-1.6 3.4-1.6 3.4.6-3.3-.3-6.8-.3-9.2z"/>',
      shield: '<path d="M12 3l7 2.8v5.5c0 4.5-3 8-7 9.7-4-1.7-7-5.2-7-9.7V5.8z"/>',
      lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
      sword: '<path d="M14.5 4H20v5.5L9 20.5 3.5 15z"/><path d="M6 13l5 5M4 20l2-2"/>',
      heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
      boot: '<path d="M8 3v9l-4 4v4h16v-3c0-2-2-3-4-3h-2V3z"/>',
      food: '<path d="M7 3v7a2 2 0 002 2v9M11 3v7M7 3v4M15.5 21V3c2 1.5 3 4 3 7h-3"/>'
    };
    const ico = (k, cls) => h("span", { class: "q-ico " + (cls || ""), html: svg(QI[k]) });
    const rand = () => { const a = new Uint32Array(1); (self.crypto || crypto).getRandomValues(a); return a[0] / 4294967296; };
    const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sleep = ms => new Promise(r => setTimeout(r, reduce() ? Math.min(ms, 120) : ms));
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    const fmt = n => Math.round(n).toLocaleString("en-US");
    const DAYN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const ROUTE = C.buildRoute(C.STOPS_XY);
    const SEEN_KEY = "setpoint.quest.seen";
    let BUSY = false;

    function housekeep() {
      const g = G(); let dirty = false;
      if (!g.start) { g.start = E.today(); dirty = true; }
      for (let i = 0; i < g.items.length; i++) { const m = C.migrateItem(g.items[i]); if (m !== g.items[i]) { g.items[i] = m; dirty = true; } }
      for (const st of C.STARTER) if (!g.items.some(i => i.id === st.id)) { g.items.push(Object.assign({}, st)); dirty = true; }
      for (const k of Object.keys(g.eq)) if (!C.SLOTS.includes(k)) { const it = g.items.find(i => i.id === g.eq[k]); delete g.eq[k]; if (it && !g.eq[it.slot]) g.eq[it.slot] = it.id; dirty = true; }
      for (const s of C.SLOTS) { const it = g.eq[s] && g.items.find(i => i.id === g.eq[s]); if (g.eq[s] && (!it || it.slot !== s)) { g.eq[s] = null; dirty = true; } }
      for (const st of C.STARTER) if (!g.eq[st.slot]) { g.eq[st.slot] = st.id; dirty = true; }
      const sum = summary();
      sum.ach.forEach((ok, i) => { if (ok && !g.ach[i]) { g.ach[i] = E.today(); dirty = true; } });
      for (const w of sum.weeks) if (!w.frozen && (w.closed || w.won)) {
        const eq = {}; for (const k in sum.eq) eq[k] = sum.eq[k].id;
        g.fights[w.ws] = { won: w.won, on: w.wonOn, lv: w.lv, flawless: w.flawless, eq };
        dirty = true;
      }
      if (dirty) X.save();
      return dirty ? summary() : sum;
    }
    const summary = () => C.summary(S(), E);
    function pendingCount() { try { return summary().pending.length; } catch (e) { return 0; } }

    /* ---------------------------------------------------- the hero (paper doll) */
    // Weapon angles for poses, measured from how each weapon sits in the hand
    const POSE_ANGLE = { sword: { up: 72, rest: -63 }, axe: { up: -22, rest: 0 }, bow: { up: 125, rest: 0 }, staff: { up: -11, rest: 0 } };
    function doll(eq, cls, look, heroCls) {
      const wk = eq && eq.weapon ? C.SHAPES.weapon[eq.weapon.shape] : "sword", a = POSE_ANGLE[wk];
      // consecutive layers that breathe share one wrapper; the boots sit in a still one
      const groups = [];
      const me = C.heroOf(S());
      C.heroLayers(eq, look || me.look, heroCls || me.cls).forEach((l, i) => {
        const still = l.k === "ft", last = groups[groups.length - 1];
        const mk = l.mask ? `url("${l.mask}")` : null;
        const img = h("img", { class: l.k, src: l.src, alt: i === 0 ? "Your hero" : "", draggable: "false",
          style: mk ? { WebkitMaskImage: mk, maskImage: mk, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" } : null });
        if (last && last.still === still) last.el.append(img);
        else groups.push({ still, el: h("div", { class: still ? "q-st" : "q-up" }, img) });
      });
      return h("div", { class: "q-face" }, h("div", { class: "q-doll " + (cls || ""), style: { "--wv": a.up + "deg", "--wr": a.rest + "deg" } },
        groups.map(g => g.el)));
    }

    /* ---------------------------------------------------- setup */
    function viewSetup(existing) {
      const g = G(), d = Object.assign({ cls: "sword", name: "" }, existing ? g.hero : {});
      d.look = C.lookOf(d.look);
      const root = h("div", { class: "quest force-anim" });
      root.append(existing ? X.subhead("Your hero") : X.head("Quest"));
      const note = h("p", { class: "note" }, C.CLASSES[d.cls].note);
      const stage = h("div", { class: "q-setupstage", style: { backgroundImage: `url("${C.art("bg-forest")}")` } }, doll(C.equipped(S()), "idle", d.look, d.cls));
      const redraw = () => stage.replaceChildren(doll(C.equipped(S()), "idle", d.look, d.cls));
      // one radio group of chips; pick(k) runs on select
      const radios = (label, keys, isOn, text, pick, extra) => h("div", { class: "q-chips", role: "radiogroup", "aria-label": label }, keys.map(k => h("button", Object.assign({
        class: "chip" + (isOn(k) ? " on" : ""), role: "radio", "aria-checked": isOn(k) ? "true" : "false",
        onclick: e => {
          e.currentTarget.parentNode.querySelectorAll("button").forEach(b => { b.classList.remove("on"); b.setAttribute("aria-checked", "false"); });
          e.currentTarget.classList.add("on"); e.currentTarget.setAttribute("aria-checked", "true"); pick(k);
        }
      }, extra ? extra(k) : null), text(k))));
      const hairBox = h("div", { class: "q-hairopts" },
        h("h3", null, "Hair"),
        radios("Hairstyle", C.HAIRS, k => d.look.hair === k, k => C.HAIR_NAME[k], k => { d.look.hair = k; redraw(); }),
        radios("Hair colour", Object.keys(C.HAIR_COLORS), k => d.look.hc === k, () => "", k => { d.look.hc = k; redraw(); },
          k => ({ class: "chip q-swatch" + (d.look.hc === k ? " on" : ""), "aria-label": k, title: k, style: { "--sw": C.HAIR_COLORS[k] } })));
      root.append(h("div", { class: "card q-setup" },
        stage,
        existing ? null : h("p", { class: "q-lead" }, "Walk to reach each day's monster. Train to hit the Sunday boss. Eat on target to heal."),
        h("h3", null, "Class"),
        h("div", { class: "q-chips", role: "radiogroup", "aria-label": "Class" }, Object.keys(C.CLASSES).map(k => h("button", {
          class: "chip" + (d.cls === k ? " on" : ""), role: "radio", "aria-checked": d.cls === k ? "true" : "false",
          onclick: e => {
            d.cls = k; redraw();
            e.currentTarget.parentNode.querySelectorAll("button").forEach(b => { b.classList.remove("on"); b.setAttribute("aria-checked", "false"); });
            e.currentTarget.classList.add("on"); e.currentTarget.setAttribute("aria-checked", "true"); note.textContent = C.CLASSES[k].note;
          }
        }, C.CLASSES[k].en))), note,
        h("h3", null, "Look"),
        h("label", { class: "tgl" },
          h("input", { type: "checkbox", checked: d.look.helm ? true : null, onchange: e => { d.look.helm = e.target.checked; redraw(); } }),
          h("span", null, h("b", null, "Show helmet"), h("span", null, "Looks only. Your helm's stats count either way."))),
        hairBox,
        h("h3", null, "Name"),
        h("input", { class: "inp", id: "qName", maxlength: 24, value: d.name, placeholder: "Optional", oninput: e => { d.name = e.target.value; } }),
        h("button", { class: "btn primary block", style: { marginTop: "16px" }, onclick: () => { g.hero = { cls: d.cls, name: d.name.trim().slice(0, 24), look: d.look }; X.save(); existing ? X.back() : X.render(true); } },
          existing ? "Save" : "Start the adventure")));
      if (!existing) root.append(h("p", { class: "note" }, "Class changes how you fight, not what you train. You can change it later."));
      return root;
    }

    /* ---------------------------------------------------- map */
    function mapStage(sum) {
      const td = E.today(), ws = E.weekStart(td), stops = sum.stops, w = sum.week, t = E.daysBetween(ws, td);
      const stage = h("div", { class: "q-map", role: "group", "aria-label": "This week's adventure map" });
      stage.style.backgroundImage = `url("${C.art("bg-forest")}")`;
      stage.append(h("div", { class: "q-fog f1" }), h("div", { class: "q-fog f2" }));
      const NS = "http://www.w3.org/2000/svg", sv = document.createElementNS(NS, "svg");
      sv.setAttribute("viewBox", `0 0 100 ${ROUTE.vbh.toFixed(2)}`); sv.setAttribute("preserveAspectRatio", "none");
      sv.setAttribute("class", "q-route"); sv.setAttribute("aria-hidden", "true");
      const mk = attrs => { const p = document.createElementNS(NS, "path"); p.setAttribute("d", ROUTE.d); for (const k in attrs) p.setAttribute(k, attrs[k]); sv.appendChild(p); return p; };
      mk({ fill: "none", stroke: "rgba(255,220,140,.22)", "stroke-width": "2.4", "stroke-linecap": "round" });
      mk({ fill: "none", stroke: "#FFE7A8", "stroke-width": ".9", "stroke-linecap": "round", "stroke-dasharray": "0.1 2.6" });
      const walked = mk({ fill: "none", stroke: "#FFD36B", "stroke-width": "1.3", "stroke-linecap": "round" });
      walked.style.strokeDasharray = ROUTE.len; walked.style.strokeDashoffset = ROUTE.len;
      stage.append(sv);
      const at = (cls, x, y, ...kids) => { const d = h("div", { class: cls, style: { left: x + "%", top: y + "%" } }, ...kids); stage.append(d); return d; };
      const im = (k, alt) => h("img", { src: C.art(k), alt: alt || "", draggable: "false" });
      const bossPct = w.hp ? Math.max(0, w.bhp / w.hp) : 1;
      stage.append(h("div", { class: "q-bossbar" },
        h("div", { class: "q-bossrow" }, h("b", null, w.boss.name), h("span", null, w.won ? "Defeated" : `HP ${fmt(w.bhp)} / ${fmt(w.hp)}`)),
        h("div", { class: "q-bar" }, h("i", { style: { width: (bossPct * 100).toFixed(1) + "%" } }))));
      at("q-ent q-sign", 13, 84, im("signpost"));
      at("q-ent q-flag", 36, 91, im("flag", "Start"));
      const mobEls = [];
      stops.forEach((st, i) => {
        const [x, y] = C.STOPS_XY[i], boss = st.kind === "boss";
        at("q-ent q-plat" + (boss ? " boss" : ""), x, y + (boss ? 4.5 : 3), im(boss ? "platform-boss" : "platform"));
        if (!boss) {
          const cls = "q-ent q-mob" + (C.FLYING[st.mob] ? " fly" : "") + (st.met ? " dead" : "") + (st.missed ? " gone" : "");
          mobEls[i] = at(cls, x, y - (C.FLYING[st.mob] ? 5 : 0), h("div", { class: "body", style: { animationDelay: (-i * 0.37) + "s" } }, im(st.mob, C.MOBS[st.mob])));
          mobEls[i].style.width = (12 * (C.MOB_SCALE[st.mob] || 1)).toFixed(1) + "%";
        } else mobEls[i] = at("q-ent q-boss" + (w.won ? " dead" : ""), x, y + 1.5, h("div", { class: "body" }, im(w.boss.art, w.boss.name)));
        const state = boss ? (w.won ? "done" : i === t ? "now" : "boss") : st.met ? "done" : st.missed ? "miss" : st.pending ? "wait" : st.today ? "now" : "";
        const tag = boss ? (w.won ? "Defeated" : "Boss") : st.met ? "Beaten" : st.missed ? "Escaped" : st.pending ? "Waiting" : st.today ? `${Math.min(99, Math.floor((st.steps || 0) / st.goal * 100))}%` : "";
        const side = x >= 50 ? 1 : -1;   // labels on the outer side, away from where the hero stands
        at("q-stop", x + side * (boss ? 22 : 17), y - (boss ? 6 : 2), h("button", { class: "q-chip " + state, "aria-label": `${DAYN[i]}, ${boss ? w.boss.name : C.MOBS[st.mob]}${tag ? ", " + tag : ""}`, onclick: () => daySheet(i, sum) },
          h("b", null, DAYN[i]), tag ? h("span", null, tag) : null));
      });
      if (!reduce()) for (let i = 0; i < 12; i++) at("q-spark", 6 + rand() * 88, 30 + rand() * 62).style.animationDelay = (-rand() * 4).toFixed(2) + "s";
      const stopAt = i => ROUTE.at[i] - (i === 6 ? 17 : stops[i].met ? 0 : 11);   // stand off to fight, on the platform once it's beaten
      const heroS = stopAt(t);
      const hero = at("q-ent q-hero", 0, 0, h("div", { class: "q-shadow" }), doll(sum.eq));
      const place = (s, hop) => { const p = ROUTE.pointAt(s); hero.style.left = p.x + "%"; hero.style.top = (p.y - (hop || 0)) + "%"; walked.style.strokeDashoffset = ROUTE.len - s; };
      place(heroS);
      // What the hero is doing right now: fighting today's foe all day, resting once it's beaten,
      // celebrating a fallen boss, or knocked out at 0 HP.
      const foe = mobEls[t], ko = w.php <= 0 && !w.won;
      const pose = ko ? "ko" : t === 6 ? (w.won ? "victory" : "fight") : (stops[t].met ? "rest" : "fight");
      const faceFoe = () => hero.classList.toggle("flip", C.STOPS_XY[t][0] > ROUTE.pointAt(heroS).x + 0.5);
      const POSES = ["fight", "rest", "victory", "ko"];
      const setPose = p => { POSES.forEach(c => hero.classList.toggle(c, c === p)); if (foe) foe.classList.toggle("fighting", p === "fight"); if (p) faceFoe(); };
      hero.append(h("img", { class: "q-zz", src: C.art("fx-zz"), alt: "" }), h("img", { class: "q-dizzy", src: C.art("fx-dizzy"), alt: "" }), h("img", { class: "q-confetti", src: C.art("fx-confetti"), alt: "" }));
      hero.classList.toggle("ko-l", C.STOPS_XY[t][0] >= 50);   // fall away from the day label
      setPose(pose);
      if (pose === "fight" && t < 6) {
        const left = Math.max(0, 1 - (stops[t].steps || 0) / stops[t].goal), [mx, my] = C.STOPS_XY[t];
        at("q-mobhp", mx, my - (C.FLYING[stops[t].mob] ? 12.5 : 8), h("i", { style: { width: (left * 100).toFixed(1) + "%" } }));
      }
      const pop = (txt, x, y, cls) => { const p = at("q-pop" + (cls ? " " + cls : ""), x, y); p.textContent = txt; setTimeout(() => p.remove(), 950); };
      // one-shot effect sprites: dust, impact, coins
      const fx = (k, x, y, ms) => { const e = at("q-fx q-fx-" + k, x, y, im("fx-" + k)); setTimeout(() => e.remove(), ms || 800); };
      function walk(from, to, ms) {
        return new Promise(res => {
          const t0 = performance.now(), right = ROUTE.pointAt(to).x > ROUTE.pointAt(from).x; let lastDust = 0;
          hero.classList.toggle("flip", right);
          const f = now => {
            if (!hero.isConnected) return res();
            const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            place(from + (to - from) * e, Math.abs(Math.sin(k * Math.PI * 5)) * 1.4);
            if (now - lastDust > 260 && k < 0.95) { lastDust = now; const p = ROUTE.pointAt(from + (to - from) * e); fx("dust", p.x, p.y, 700); }
            if (k < 1) requestAnimationFrame(f); else res();
          };
          requestAnimationFrame(f);
        });
      }
      async function strike(el, xy, dmg) {
        const dx = hero.classList.contains("flip") ? "-38%" : "-62%";
        hero.animate([{ transform: "translate(-50%,-100%)" }, { transform: `translate(${dx},-104%)` }, { transform: "translate(-50%,-100%)" }], { duration: 300, easing: "ease-out" });
        await sleep(140);
        el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
        pop("−" + dmg, xy[0], xy[1] - 11); fx("impact", xy[0], xy[1] - 5, 450);
        await sleep(380);
      }
      // replay what happened since you last looked: walk to and strike each newly beaten monster
      stage._after = () => {
        let seen = null; try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "null"); } catch (e) { }
        const beaten = stops.filter(s => s.kind === "mob" && s.met).map(s => s.i);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ws, beaten })); } catch (e) { }
        const fresh = seen && seen.ws === ws ? beaten.filter(i => !seen.beaten.includes(i)) : [];
        if (!fresh.length || reduce()) return;
        fresh.forEach(i => mobEls[i].classList.remove("dead"));
        let s0 = ROUTE.at[Math.max(0, fresh[0] - 1)];
        setPose(null); place(s0);
        (async () => {
          for (const i of fresh) {
            await walk(s0, ROUTE.at[i] - 11, 1300);
            for (let k = 0; k < 2; k++) await strike(mobEls[i], C.STOPS_XY[i], 30 + Math.floor(rand() * 60));
            mobEls[i].classList.add("dead"); fx("coins", C.STOPS_XY[i][0], C.STOPS_XY[i][1] - 5, 900); pop("+15 gold", C.STOPS_XY[i][0], C.STOPS_XY[i][1] - 15, "gold");
            await sleep(350);
            await walk(ROUTE.at[i] - 11, ROUTE.at[i], 450); s0 = ROUTE.at[i];
          }
          if (Math.abs(s0 - heroS) > 0.5) await walk(s0, heroS, 900);
          if (pose === "rest") { setPose("victory"); await sleep(2600); }
          setPose(pose);
        })();
      };
      return stage;
    }

    /* ---------------------------------------------------- main view */
    function view() {
      const g = G();
      if (!g.hero) return viewSetup(false);
      const sum = housekeep(), td = E.today(), ws = E.weekStart(td), t = E.daysBetween(ws, td), w = sum.week;
      const root = h("div", { class: "quest force-anim" });
      root.append(X.head("Quest",
        h("div", { class: "q-goldchip", "aria-label": `${sum.gold} gold` }, h("img", { class: "q-coin", src: C.art("coin"), alt: "" }), h("b", null, fmt(sum.gold))),
        X.iconBtn("dots", "Quest options", () => X.openMenu([
          ["user", "Edit hero", () => X.push({ v: "qhero" })],
          ["target", `Daily step goal · ${fmt(sum.stepGoal)}`, () => stepGoalSheet()],
          ["clock", "Battle log", () => X.push({ v: "qbattle", ws: w.ws })]
        ]))));
      const map = mapStage(sum);
      root.append(map);
      root._after = () => map._after && map._after();

      /* today */
      const st = sum.stops[t], steps = st.steps || 0, pct = Math.min(1, steps / st.goal);
      const todayHits = (w.days.find(d => d.d === td) || { hits: [] }).hits;
      const yest = w.days.find(d => d.d === E.addDays(td, -1));
      const synced = st.at ? new Date(st.at) : null;
      const target = t < 6 ? "the " + C.MOBS[st.mob] : "the boss";
      const stepLine = st.steps == null
        ? "No steps from Apple Health yet today. They arrive when your Shortcut runs (More → Sync & Apple Health)."
        : st.met ? (t < 6 ? `Goal reached. The ${C.MOBS[st.mob]} is beaten.` : "Goal reached. You've made it to the boss.")
          : `${fmt(st.goal - steps)} more steps to reach ${target}${synced && !isNaN(synced) ? ` · as of ${synced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`;
      const setsToday = todayHits.reduce((a, x) => a + x.n, 0), dmgToday = todayHits.reduce((a, x) => a + x.dmg, 0);
      root.append(h("div", { class: "card q-today" },
        h("div", { class: "q-todayh" }, h("h3", null, "Today"), h("span", null, `${DAYN[t]} · day ${t + 1} of 7`)),
        h("div", { class: "q-steps" }, ico("boot"), h("b", null, fmt(steps)), h("span", null, `/ ${fmt(st.goal)} steps`)),
        h("div", { class: "q-xp steps", role: "progressbar", "aria-label": "Steps today", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct * 100) }, h("i", { style: { width: (pct * 100).toFixed(1) + "%" } })),
        h("p", { class: "note q-stepnote" }, stepLine),
        h("div", { class: "q-rows" },
          w.php <= 0 && !w.won ? h("div", { class: "q-row bad" }, ico("heart"), h("div", null, h("b", null, "Knocked out"),
            h("span", null, "You hit at half power until you heal. A day on calorie and protein target heals the most."))) : null,
          h("div", { class: "q-row" }, ico("sword"), h("div", null, h("b", null, "Train"),
            h("span", null, setsToday ? `${setsToday} sets today: ${fmt(dmgToday)} damage to the boss.` : `Every working set hits the boss. ${w.sessions} of ${w.target} sessions this week.`))),
          h("div", { class: "q-row" }, ico("food"), h("div", null, h("b", null, "Eat on target"),
            h("span", null, yest && yest.food != null ? (yest.food === 2 ? `Yesterday was on target: healed ${yest.heal} HP and powered up your next session.` : yest.food === 1 ? `Yesterday was half on target: healed ${yest.heal} HP.` : "Yesterday was logged but off target: a small heal.") : "On-target days heal you and power up your next session."))),
          h("div", { class: "q-row" }, ico("flame"), h("div", null, h("b", null, `Rally +${w.rally}%`),
            h("span", null, `${w.beaten} monster${w.beaten === 1 ? "" : "s"} beaten this week, each adding ${C.RALLY}% to your boss damage.`))))));

      /* hero */
      const pctL = Math.max(0, Math.min(1, (sum.earned - sum.lvFrom) / (sum.lvTo - sum.lvFrom)));
      const sts = sum.stats, cls = C.CLASSES[sum.hero.cls];
      root.append(X.section("Hero"));
      root.append(h("div", { class: "card q-herocard" },
        h("div", { class: "q-herorow" },
          h("button", { class: "q-heropic", "aria-label": "Edit hero", style: { backgroundImage: `url("${C.art("bg-forest")}")` }, onclick: () => X.push({ v: "qhero" }) }, doll(sum.eq, "idle")),
          h("div", { class: "q-heroinfo" },
            h("b", { class: "q-name" }, sum.hero.name || "Wandering hero"),
            h("span", { class: "q-cls" }, `${cls.en} · ${sum.rank.en} ${sum.rank.tier}`),
            h("div", { class: "q-xp", role: "progressbar", "aria-label": "Experience", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pctL * 100) }, h("i", { style: { width: (pctL * 100).toFixed(1) + "%" } })),
            h("span", { class: "q-xpn" }, `Level ${sum.level} · ${fmt(sum.earned - sum.lvFrom)} / ${fmt(sum.lvTo - sum.lvFrom)} XP`),
            h("div", { class: "q-stats" },
              h("span", null, ico("sword", "sm"), h("b", null, sts.atk), " ATK"),
              h("span", null, ico("shield", "sm"), h("b", null, sts.def), " DEF"),
              h("span", null, ico("heart", "sm"), h("b", null, `${Math.max(0, w.php)} / ${sts.hp}`), " HP")))),
        h("div", { class: "q-eqrow" }, C.SLOTS.map(slot => {
          const it = sum.eq[slot];
          return h("button", { class: "q-eq", style: { "--rc": it ? C.RCOL[it.r] : "var(--card3)" }, "aria-label": `${C.SLOT_NAME[slot]}: ${it ? it.name : "empty"}`, onclick: () => slotSheet(slot) },
            it ? h("img", { src: C.iconOf(it), alt: "" }) : h("span", { class: "q-eqempty" }, C.SLOT_NAME[slot]));
        }))));

      /* chests */
      const n = sum.pending.length;
      const chest = h("div", { class: "card q-chests" + (n ? " has" : "") },
        h("div", { class: "q-chestrow" },
          h("div", { class: "q-chestpic" + (n ? " wiggle" : " none") }, h("img", { src: C.art("chest"), alt: "" })),
          h("div", { class: "q-chesttxt" },
            h("b", null, n ? `${n} chest${n > 1 ? "s" : ""} waiting` : "No chests waiting"),
            h("span", null, n ? "What's inside is decided when you open it." : "Beat monsters, finish workouts of 6+ sets, eat on target, or slay the boss."))));
      const btns = h("div", { class: "btnrow", style: { marginTop: "12px" } });
      if (n) btns.append(h("button", { class: "btn primary", onclick: () => openChest(sum.pending[0]) }, n > 1 ? "Open one" : "Open it"));
      btns.append(h("button", { class: "btn" + (sum.gold < C.CHEST_COST ? " dim" : ""), onclick: () => buyChest() }, h("img", { class: "q-coin sm", src: C.art("coin"), alt: "" }), `Buy a chest · ${C.CHEST_COST}`));
      chest.append(btns);
      root.append(chest);

      /* streak, feats, recent, rules */
      root.append(h("div", { class: "card q-meta" },
        h("div", { class: "q-streak" },
          h("span", null, ico("flame"), h("b", null, sum.streak), sum.streak === 1 ? " boss in a row" : " bosses in a row"),
          h("span", null, ico("shield"), h("b", null, sum.shields), sum.shields === 1 ? " shield" : " shields")),
        h("button", { class: "btn sm", onclick: () => X.push({ v: "qbattle", ws: w.ws }) }, "Battle log")));
      const found = sum.ach.filter(Boolean).length;
      root.append(X.section(`Hidden feats · ${found} of ${C.ACH_COUNT}`));
      root.append(h("div", { class: "card" }, h("div", { class: "q-feats" }, sum.ach.map((ok, i) => {
        const tx = ok ? C.achText(i) : null;
        return h("div", { class: "q-feat" + (ok ? " on" : ""), "aria-label": ok ? tx.name : "Locked feat" }, ok ? ico("flame") : ico("lock"), ok ? h("b", null, tx.name) : null, ok ? h("span", null, tx.desc) : null);
      }))));
      if (sum.events.length) {
        root.append(X.section("Recent"));
        root.append(h("div", { class: "card q-recent" }, sum.events.slice(0, 8).map(e => h("div", { class: "q-ev" },
          h("div", null, h("b", null, e.label), h("span", null, X.dShort(e.date))),
          h("div", { class: "q-evr" }, e.chest ? h("img", { class: "q-minichest", src: C.art("chest"), alt: "Chest" }) : null, h("b", null, "+" + e.gold))))));
      }
      root.append(h("details", { class: "card q-rules" }, h("summary", null, "How it works"),
        h("ul", null,
          h("li", null, `Steps move you. Monday to Saturday each has a monster on the route. Reach your daily goal (${fmt(sum.stepGoal)} steps) to beat it for gold and sometimes a chest. A missed day's monster escapes; nothing else happens.`),
          h("li", null, "Steps come from Apple Health when your Shortcut runs. A day stays open until its total arrives, so a late sync never costs you."),
          h("li", null, `Workouts hit the boss. Every working set this week chips its HP: sets near failure hit hardest, and interval rounds count too. Each monster beaten adds ${C.RALLY}% to that damage.`),
          h("li", null, "On Sunday, if the boss's HP is at 0, it falls and drops a chest. Damage beyond 0 adds bonus gold."),
          h("li", null, "Food days on calorie and protein target heal you and power up your next session."),
          h("li", null, "Two days without a session, before you've hit your weekly target, let the boss recover a little and strike you. At 0 HP you hit at half power until you heal. Nothing you own is ever taken."),
          h("li", null, "Gear adds attack, defence and HP. From Uncommon up, each piece also has a skill that rewards a habit. Your weapon and helm show on your hero."))));
      return root;
    }

    /* ---------------------------------------------------- sheets */
    function daySheet(i, sum) {
      const st = sum.stops[i], w = sum.week, day = w.days.find(d => d.d === st.d), isBoss = st.kind === "boss";
      X.openSheet(sh => {
        sh.append(h("div", { class: "q-dayhead" },
          h("img", { src: C.art(isBoss ? w.boss.art : st.mob), alt: "" }),
          h("div", null, h("span", null, X.dLong(st.d)), h("h2", null, isBoss ? w.boss.name : C.MOBS[st.mob]))));
        const rows = h("div", { class: "q-rows" });
        const stepTxt = st.future ? `Reach ${fmt(st.goal)} steps that day.` : st.steps == null ? (st.today ? "No steps from Apple Health yet today." : "Waiting for that day's step total from your Shortcut.")
          : `${fmt(st.steps)} of ${fmt(st.goal)} steps.` + (st.met ? (isBoss ? " You reached the boss." : " Beaten: +15 gold.") : st.missed ? " It escaped. No penalty, just no reward." : "");
        rows.append(h("div", { class: "q-row" }, ico("boot"), h("div", null, h("b", null, "Steps"), h("span", null, stepTxt))));
        if (isBoss) rows.append(h("div", { class: "q-row" }, ico("sword"), h("div", null, h("b", null, w.won ? "Defeated" : `${fmt(w.bhp)} HP left`),
          h("span", null, w.won ? `It fell on Sunday.${w.overkill ? ` ${fmt(w.overkill)} extra damage earned bonus gold.` : ""}` : `You've dealt ${fmt(w.dmg)} of ${fmt(w.hp)}. It falls on Sunday if its HP is at 0. Rally from beaten monsters: +${w.rally}%.`))));
        if (day && day.hits.length) rows.append(h("div", { class: "q-row" }, ico("sword"), h("div", null, h("b", null, "Training"), h("span", null, day.hits.map(x => `${x.name}: ${x.type === "hiit" ? x.n + " rounds" : x.n + " sets"}, ${fmt(x.dmg)} damage`).join(". ") + "."))));
        if (day && day.food != null) rows.append(h("div", { class: "q-row" }, ico("food"), h("div", null, h("b", null, "Food"), h("span", null, (day.food === 2 ? "On target" : day.food === 1 ? "Half on target" : "Logged, off target") + (day.heal ? `: healed ${day.heal} HP.` : ".")))));
        if (day && day.strike) rows.append(h("div", { class: "q-row bad" }, ico("shield"), h("div", null, h("b", null, "The boss struck"), h("span", null, `After two idle days it ${day.bossHeal ? `recovered ${fmt(day.bossHeal)} HP and ` : ""}hit you for ${day.strike}.`))));
        sh.append(rows);
        if (isBoss) sh.append(h("button", { class: "btn block", style: { marginTop: "14px" }, onclick: () => { X.closeSheet(true); X.push({ v: "qbattle", ws: w.ws }); } }, "Battle log"));
      });
    }
    function stepGoalSheet() {
      const g = G(); let v = C.stepGoal(S());
      X.openSheet(sh => {
        const inp = h("input", { class: "inp", id: "qSteps", type: "number", inputmode: "numeric", min: 1000, max: 50000, step: 500, value: v, oninput: e => { v = +e.target.value; } });
        sh.append(h("h2", { class: "q-sheeth" }, "Daily step goal"),
          h("p", { class: "note" }, "Reaching it beats that day's monster. A new goal applies to every day this week, including days already past, so pick one you can hit on a normal day."),
          h("div", { class: "q-chips" }, [6000, 8000, 10000, 12000].map(p => h("button", { class: "chip", onclick: () => { v = p; inp.value = p; } }, fmt(p)))),
          h("div", { style: { marginTop: "12px" } }, X.field("Steps", inp)),
          h("button", { class: "btn primary block", style: { marginTop: "14px" }, onclick: () => { g.stepGoal = Math.max(1000, Math.min(50000, Math.round(v / 100) * 100 || 8000)); X.save(); X.closeSheet(); X.render(false); } }, "Save"));
      });
    }
    function slotSheet(slot) {
      const g = G(), list = g.items.filter(i => i.slot === slot).sort((a, b) => b.r - a.r || (b.at || 0) - (a.at || 0));
      X.openSheet(sh => {
        sh.append(h("h2", { class: "q-sheeth" }, C.SLOT_NAME[slot]));
        if (!list.length) { sh.append(h("p", { class: "note" }, "Nothing here yet. Chests can hold this kind of item.")); return; }
        sh.append(h("div", { class: "q-grid" }, list.map(it => h("button", { class: "q-tile" + (g.eq[slot] === it.id ? " on" : ""), style: { "--rc": C.RCOL[it.r] },
          "aria-label": `${it.name}, ${C.RAR[it.r]}${g.eq[slot] === it.id ? ", equipped" : ""}`, onclick: () => itemSheet(it) }, h("img", { src: C.iconOf(it), alt: "" }), h("i", { class: "rar" })))));
      });
    }
    function statLine(it) { const s = it.stat || {}, b = []; if (s.atk) b.push(`ATK +${s.atk}`); if (s.def) b.push(`DEF +${s.def}`); if (s.hp) b.push(`HP +${s.hp}`); return b.join(" · "); }
    function itemCard(it) {
      const eq = Object.assign({}, C.equipped(S()), { [it.slot]: it }), shows = it.slot === "weapon" || it.slot === "helm";
      return h("div", { class: "q-reveal", style: { "--rc": C.RCOL[it.r] } },
        h("div", { class: "q-rar" }, `${C.RAR[it.r]} · ${C.SLOT_NAME[it.slot]}`),
        h("div", { class: "q-revealrow" },
          h("div", { class: "q-bigicon" }, h("img", { src: C.iconOf(it), alt: "" })),
          shows ? h("div", { class: "q-revealdoll" }, doll(eq)) : null),
        h("h2", null, it.name),
        statLine(it) ? h("div", { class: "q-statl" }, statLine(it)) : null,
        it.skill ? h("div", { class: "q-skill" }, h("b", null, C.SKILLS[it.skill.k].n), " · ", C.SKILLS[it.skill.k].t(it.skill.p)) : null,
        h("p", { class: "note" }, it.flavor));
    }
    function itemSheet(it) {
      const g = G(), on = g.eq[it.slot] === it.id, starter = C.STARTER.find(s => s.slot === it.slot);
      X.openSheet(sh => sh.append(itemCard(it), on && it.starter ? h("p", { class: "note", style: { textAlign: "center" } }, "Equipped") : h("button", { class: "btn primary block", onclick: () => {
        g.eq[it.slot] = on ? (starter ? starter.id : null) : it.id; X.save(); X.closeSheet(); X.render(false);
      } }, on ? "Unequip" : "Equip")));
    }

    /* ---------------------------------------------------- chests */
    function buyChest() {
      const sum = summary();
      if (sum.gold < C.CHEST_COST) { X.toast(`${C.CHEST_COST - sum.gold} more gold needed`); return; }
      openChest({ id: "buy:" + X.uid(), cost: C.CHEST_COST, min: 0 });
    }
    async function openChest(ev) {
      if (BUSY) return;
      const g = G();
      if (g.items.some(i => i.id === ev.id)) return;
      BUSY = true;
      const r = C.rollRarity(rand(), g.items, ev.min || 0);
      const slot = C.SLOTS[Math.floor(rand() * C.SLOTS.length)], shape = Math.floor(rand() * 4);
      let item = C.localItem(rand, slot, shape, r);
      const box = h("div", { class: "q-reveal", style: { "--rc": C.RCOL[r] } },
        h("div", { class: "q-bigchest shake" }, h("img", { src: C.art("chest"), alt: "" })), h("p", { class: "note" }, "Opening…"));
      X.openSheet(sh => sh.append(box));
      const t0 = Date.now();
      if (X.aiReady && X.aiReady()) {
        const words = C.THEME.slice().sort(() => rand() - 0.5).slice(0, 2);
        try { const txt = await withTimeout(X.aiCall("loot", C.aiPrompt(item, words), null, 300), 14000); item = C.parseItem(txt, item) || item; } catch (e) { }
      }
      item.id = ev.id; item.at = Date.now();
      if (ev.cost) item.cost = ev.cost;
      g.items.push(item); X.save();
      await sleep(Math.max(0, 1300 - (Date.now() - t0)));
      BUSY = false;
      if (!box.isConnected) { X.render(false); return; }
      const left = summary().pending, card = itemCard(item);
      box.replaceWith(card);
      card.prepend(h("div", { class: "q-burst" }), h("img", { class: "q-openchest", src: C.art("chest-open"), alt: "" }));
      card.querySelector(".q-bigicon").classList.add("pop");
      card.append(h("div", { class: "btnrow", style: { justifyContent: "center", marginTop: "14px" } },
        h("button", { class: "btn primary", onclick: () => { g.eq[slot] = item.id; X.save(); X.closeSheet(); X.render(false); } }, "Equip"),
        left.length ? h("button", { class: "btn", onclick: () => { X.closeSheet(true); openChest(left[0]); } }, `Open next (${left.length})`)
          : h("button", { class: "btn", onclick: () => { X.closeSheet(); X.render(false); } }, "Keep it")));
    }

    /* ---------------------------------------------------- battle log */
    function viewBattle(top) {
      const sum = summary(), w = sum.weeks.find(x => x.ws === top.ws) || sum.week;
      const root = h("div", { class: "quest force-anim" });
      root.append(X.subhead("Battle log"));
      const endPose = w.won ? "victory" : w.php <= 0 ? "ko" : "";
      const heroPic = h("div", { class: "q-fighter hero " + endPose }, doll(sum.eq));
      const bossPic = h("div", { class: "q-fighter boss" + (w.won ? " dead" : "") }, h("img", { src: C.art(w.boss.art), alt: w.boss.name }));
      const pop = h("div", { class: "q-popwrap" });
      const hpBar = (cur, max, cls) => h("div", { class: "q-hp " + cls }, h("i", { style: { width: (Math.max(0, Math.min(1, cur / max)) * 100).toFixed(1) + "%" } }), h("span", null, `${fmt(Math.max(0, cur))} / ${fmt(max)}`));
      const bBox = h("div"), pBox = h("div");
      const setBars = (b, p) => { bBox.replaceChildren(hpBar(b, w.hp, "boss")); pBox.replaceChildren(hpBar(p, w.stats.hp, "you")); };
      setBars(w.bhp, w.php);
      root.append(h("div", { class: "q-arena" },
        h("div", { class: "q-arenarow", style: { backgroundImage: `url("${C.art("bg-forest")}")` } }, heroPic, bossPic, pop),
        h("div", { class: "q-arenabars" },
          h("div", null, h("div", { class: "q-hplbl" }, sum.hero.name || "You"), pBox),
          h("div", null, h("div", { class: "q-hplbl" }, w.boss.name), bBox))));
      const float = (txt, cls) => { const e = h("span", { class: "q-float " + cls }, txt); pop.append(e); setTimeout(() => e.remove(), 1100); };
      const burst = (k, side, ms) => { const e = h("img", { class: "q-bfx " + side + " q-fx-" + k, src: C.art("fx-" + k), alt: "" }); pop.append(e); setTimeout(() => e.remove(), ms || 600); };
      const kick = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
      let playing = false;
      const replay = h("button", { class: "btn primary", onclick: async () => {
        if (playing) return; playing = true; replay.disabled = true; bossPic.classList.remove("dead"); heroPic.classList.remove("victory", "ko");
        let b = w.hp, p = w.stats.hp; setBars(b, p);
        for (const d of w.days) {
          if (d.heal) { p = Math.min(w.stats.hp, p + d.heal); float("+" + d.heal, "heal"); burst("heal", "left", 900); setBars(b, p); await sleep(420); }
          for (const x of d.hits) {
            kick(heroPic, "lunge"); burst("slash", "right", 350); await sleep(200); kick(bossPic, "hurt"); burst("impact", "right", 450);
            b -= x.dmg; float("−" + fmt(x.dmg) + (x.crits ? " ✦" : ""), "dmg"); setBars(b, p);
            if (x.heal) p = Math.min(w.stats.hp, p + x.heal);
            await sleep(560);
          }
          if (d.bossHeal) { b = Math.min(w.hp, b + d.bossHeal); float("+" + fmt(d.bossHeal), "bheal"); setBars(b, p); await sleep(340); }
          if (d.strike) { kick(bossPic, "lunge-l"); await sleep(200); kick(heroPic, "hurt"); burst("impact", "left", 450); p = Math.max(0, p - d.strike); float("−" + d.strike, "hit"); setBars(b, p); await sleep(560); }
          else if (d.warded) { float("Blocked", "heal"); await sleep(380); }
        }
        if (w.won) { bossPic.classList.add("dead"); burst("confetti", "left", 1600); burst("coins", "right", 1200); }
        if (endPose) heroPic.classList.add(endPose);
        playing = false; replay.disabled = false;
      } }, "Replay the week");
      root.append(h("div", { class: "btnrow", style: { margin: "12px 0" } }, replay));
      const list = h("div", { class: "card q-days" });
      for (const d of w.days.slice().reverse()) {
        const lines = [];
        if (d.beat) lines.push(h("div", { class: "q-dl heal" }, ico("boot", "sm"), h("span", null, "Step goal hit: monster beaten"), h("b", null, `+${C.RALLY}% rally`)));
        d.hits.forEach(x => lines.push(h("div", { class: "q-dl" }, ico("sword", "sm"), h("span", null, `${x.name} · ${x.type === "hiit" ? x.n + " rounds" : x.n + " sets"}${x.crits ? ` · ${x.crits} double strike${x.crits > 1 ? "s" : ""}` : ""}${x.ko ? " · half power" : ""}`), h("b", null, "−" + fmt(x.dmg)))));
        if (d.heal) lines.push(h("div", { class: "q-dl heal" }, ico("heart", "sm"), h("span", null, d.food === 2 ? "Food on target" : d.food === 1 ? "Food half on target" : "Food logged"), h("b", null, "+" + d.heal)));
        if (d.bossHeal) lines.push(h("div", { class: "q-dl bad" }, ico("flame", "sm"), h("span", null, "Two idle days: the boss recovered"), h("b", null, "+" + fmt(d.bossHeal))));
        if (d.strike) lines.push(h("div", { class: "q-dl bad" }, ico("shield", "sm"), h("span", null, d.ko ? "It knocked you to 0 HP" : "It struck you"), h("b", null, "−" + d.strike)));
        if (d.warded) lines.push(h("div", { class: "q-dl heal" }, ico("shield", "sm"), h("span", null, "Your ward blocked its strike"), h("b", null, "")));
        if (!lines.length) lines.push(h("div", { class: "q-dl quiet" }, h("span", null, "Quiet day")));
        list.append(h("div", { class: "q-day" }, h("div", { class: "q-dayh" }, X.dLong(d.d), d.d === w.wonOn ? h("em", null, "Boss defeated") : null), lines));
      }
      root.append(list);
      root.append(h("p", { class: "note" }, `Your stats this week: ATK ${w.stats.atk}, DEF ${w.stats.def}, HP ${w.stats.hp}. Boss HP is set by your target of ${w.target} sessions.`));
      return root;
    }

    return { view, pendingCount, screens: { qbattle: viewBattle, qhero: () => viewSetup(true) } };
  };
})(typeof self !== "undefined" ? self : globalThis);
