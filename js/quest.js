/* ==========================================================================
   Setpoint — Quest (修仙). You are a cultivator. Your real training is the
   fighting: every working set you log is a strike on this week's boss, food
   days heal you, weigh-ins sharpen you, and days off let the boss recover.
   Nothing is played by tapping; the game only resolves what you logged.

   Design rules
   - Derived, not stored: spirit stones earned, cultivation level, pending
     chests and battles are recomputed from the logs on every render.
     Stored state is S.game = { start, hero, eq, ach, fights, items[] },
     synced as "g|<id>" item records plus an "s|game" section.
   - A week's battle result is frozen once the week closes or the boss
     falls, so changing gear later never rewrites history.
   - Soft penalty: a missed stretch lets the boss heal and strike you. Your
     HP only matters inside that week's fight (at 0 you hit at half power);
     nothing you own is ever taken.
   - Items don't exist until a chest is opened: rarity is rolled then, the
     name, colours and look are invented by the AI on your Worker (or a
     local generator offline). Skills come from a fixed set of effects the
     battle engine knows how to run.

   Core (no DOM) is exported for Node tests; the view factory registers as
   window.SPQuest and app.js calls it with shared helpers.
   ========================================================================== */
(function (root) {
  "use strict";

  /* ================================================================ data */
  const RAR = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const RAR_ZH = ["凡品", "灵品", "宝品", "仙品", "神品"];
  const RCOL = ["#9AA0A6", "#34A462", "#3B7CF0", "#9B5DE5", "#E2A91F"];
  const ODDS = [0.58, 0.27, 0.11, 0.035, 0.005];
  const PITY_RARE = 7, PITY_LEG = 40, CHEST_COST = 250, RETRO_DAYS = 7;
  const SLOTS = ["weapon", "robe", "head", "charm", "aura"];
  const SLOT_NAME = { weapon: "Weapon", robe: "Robe", head: "Headwear", charm: "Charm", aura: "Aura" };
  const SLOT_ZH = { weapon: "法宝", robe: "法袍", head: "冠饰", charm: "灵佩", aura: "灵韵" };
  const SHAPES = {
    weapon: ["sword", "saber", "fan", "flute", "gourd", "whisk", "spear", "mirror"],
    robe: ["plain", "cloud", "crane", "flame", "wave", "star"],
    head: ["guan", "bamboo hat", "hairpin", "headband", "lotus crown", "horns", "halo", "fox ears"],
    charm: ["jade", "bell", "talisman", "pearl"],
    aura: ["clouds", "mountains", "moon", "lotus", "lightning", "petals", "stars", "mist"]
  };
  const PATTERNS = ["solid", "stripe", "dots", "check", "gradient"];
  const FX = ["none", "sparkle", "glow"];
  const REALMS = [["炼气", "Qi Refining"], ["筑基", "Foundation Establishment"], ["金丹", "Golden Core"], ["元婴", "Nascent Soul"],
    ["化神", "Spirit Transformation"], ["炼虚", "Void Refining"], ["合体", "Integration"], ["大乘", "Great Ascension"], ["渡劫", "Tribulation"]];
  const CLASSES = {
    sword: { zh: "剑修", en: "Sword Cultivator", atk: 1.15, hp: 1.0, note: "Hits 15% harder. Every fifth set strikes twice." },
    body: { zh: "体修", en: "Body Cultivator", atk: 1.0, hp: 1.3, note: "30% more HP. Sets with 0–1 reps left hit 20% harder." },
    spell: { zh: "法修", en: "Spell Cultivator", atk: 1.0, hp: 1.0, note: "Interval rounds hit 50% harder. Weigh-in days hit 10% harder." },
    alch: { zh: "丹修", en: "Alchemist", atk: 1.0, hp: 1.1, note: "Food days heal twice as much, and a day on target powers up your next session." }
  };
  const HAIR = ["bun", "ponytail", "long", "short"];
  const HAIR_COL = ["#23232B", "#5A3A26", "#C9CCD6", "#9E2B35", "#34407A"];
  const SKIN = ["#FCE3CF", "#F2C9A5", "#D9A47C", "#A8714E"];
  const CLASS_ROBE = { sword: ["#DDE4EE", "#A9B6C8", "#5B7FB5"], body: ["#EADFCF", "#BFA88A", "#8A5A2B"], spell: ["#E6DFF2", "#B3A5CF", "#7B5EA7"], alch: ["#DCEBDD", "#A8C6AA", "#3F8A5A"] };
  const INK = "#1B1B1F", BLUSH = "#F4A7A0", SHOE = "#3A3A44";

  /* Skill effects the battle engine runs. p[] is potency by rarity (uncommon → legendary). */
  const SKILLS = {
    dawn: { p: [30, 45, 60, 80], zh: "晨曦", t: v => `Sessions finished before 9 AM hit ${v}% harder.` },
    heavy: { p: [15, 25, 35, 50], zh: "千钧", t: v => `Sets with 0–1 reps left hit ${v}% harder.` },
    volume: { p: [15, 20, 30, 40], zh: "连环", t: v => `Sessions of 20+ sets hit ${v}% harder.` },
    crit: { p: [8, 12, 16, 22], zh: "破绽", t: v => `${v}% of sets strike twice.` },
    ward: { p: [1, 1, 2, 2], zh: "护体", t: v => `Blocks the first ${v > 1 ? v + " boss strikes" : "boss strike"} each week.` },
    drain: { p: [10, 15, 20, 30], zh: "吸灵", t: v => `Each session heals ${v}% of your HP.` },
    herb: { p: [50, 75, 100, 150], zh: "灵药", t: v => `Food days heal ${v}% more.` },
    storm: { p: [40, 60, 80, 120], zh: "风雷", t: v => `Interval rounds hit ${v}% harder.` },
    momentum: { p: [5, 8, 10, 15], zh: "势如破竹", t: v => `+${v}% per day trained in a row (up to 3).` },
    seal: { p: [30, 45, 60, 80], zh: "封印", t: v => `The boss heals ${v}% less.` },
    scale: { p: [10, 15, 20, 30], zh: "明镜", t: v => `Weigh-in days hit ${v}% harder.` },
    focus: { p: [30, 45, 60, 90], zh: "凝神", t: v => `The first 4 sets of a session hit ${v}% harder.` }
  };
  const SKILL_KEYS = Object.keys(SKILLS);
  const SLOT_STAT = {
    weapon: r => ({ atk: [3, 6, 10, 16, 25][r], def: 0, hp: 0 }),
    robe: r => ({ atk: 0, def: [2, 4, 7, 11, 17][r], hp: [10, 20, 35, 55, 80][r] }),
    head: r => ({ atk: [1, 2, 3, 5, 8][r], def: [1, 2, 4, 6, 9][r], hp: [5, 10, 18, 28, 40][r] }),
    charm: r => ({ atk: [1, 2, 4, 6, 9][r], def: [1, 1, 2, 3, 5][r], hp: [5, 10, 15, 25, 35][r] }),
    aura: () => ({ atk: 0, def: 0, hp: 0 })
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
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
    return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  /* Working sets that count: ticked done with reps (or seconds) logged. */
  function doneSets(s) {
    if (!s || !s.ex) return 0;
    let n = 0;
    for (const e of s.ex) for (const st of e.sets || []) if (st && st.done && st.reps > 0) n++;
    return n;
  }
  const counts = s => s && (s.type === "hiit" ? (s.rounds | 0) > 0 : doneSets(s) > 0);
  function weekTarget(S) { const p = S.train && S.train.profile; return Math.max(1, Math.min(6, (p && p.days) || 3)); }

  /* ================================================================ levels */
  const levelOf = earned => Math.floor(Math.sqrt(Math.max(0, earned) / 40)) + 1;
  function realmOf(lv) {
    const i = Math.min(REALMS.length - 1, Math.floor((lv - 1) / 5));
    return { i, zh: REALMS[i][0], en: REALMS[i][1], layer: lv - i * 5 };
  }
  function heroOf(S) { const h = (S.game && S.game.hero) || {}; return { cls: CLASSES[h.cls] ? h.cls : "sword", hair: HAIR.includes(h.hair) ? h.hair : "bun", hc: clampI(h.hc, 0, HAIR_COL.length - 1), skin: clampI(h.skin, 0, SKIN.length - 1), name: typeof h.name === "string" ? h.name.slice(0, 24) : "" }; }
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
    let nutri = 0;
    for (let d = since; d <= td; d = E.addDays(d, 1)) {
      if (S.weights && S.weights[d]) add("w:" + d, d, "weigh", "Weigh-in", 5, false);
      if (d >= td) continue;
      const f = foodDay(S, E, d);
      if (f == null) continue;
      // an over-target day still pays: skipping the log must never be the better move
      if (f === 2) { nutri++; add("n:" + d, d, "food", "Calories and protein on target", 25, hashF("n|" + d) < 0.4); }
      else if (f === 1) add("n:" + d, d, "food", "Half on target", 10, false);
      else add("n:" + d, d, "food", "Logged food", 3, false);
    }
    return { list: out, since, nutri };
  }
  /* 0 = logged, off target · 1 = protein or calories on target · 2 = both · null = not logged */
  function foodDay(S, E, d) {
    if (!(S.intake && S.intake[d] && S.intake[d].length) || (S.fasted && S.fasted[d])) return null;
    let tg = null; try { tg = E.targetsFor(S, d); } catch (e) { }
    if (!tg) return 0;
    const t = E.dayTotals(S, d), hp = t.p >= tg.p * 0.9, hk = Math.abs(t.kcal - tg.kcal) <= tg.kcal * 0.1;
    return hp && hk ? 2 : hp || hk ? 1 : 0;
  }

  /* ================================================================ bosses */
  const BOSS_PRE = [["赤焰", "Crimson Flame"], ["玄冰", "Black Ice"], ["九幽", "Nine Depths"], ["紫电", "Violet Lightning"], ["血月", "Blood Moon"], ["青鳞", "Azure Scale"],
    ["枯骨", "Withered Bone"], ["雷鸣", "Thunderclap"], ["噬魂", "Soul-Eater"], ["迷雾", "Mist-Veiled"], ["金睛", "Golden-Eyed"], ["幽冥", "Shadow"], ["焚天", "Sky-Burning"], ["寒潭", "Cold Pool"]];
  const BOSS_KIND = [
    [["狼王", "Wolf King"], ["虎妖", "Tiger Demon"], ["狐妖", "Fox Demon"]],
    [["蛟", "Flood Dragon"], ["蟒妖", "Python Demon"]],
    [["怨灵", "Vengeful Spirit"], ["鬼王", "Ghost King"]],
    [["石傀", "Stone Puppet"], ["铁尸", "Iron Corpse"]],
    [["妖鹏", "Demon Roc"], ["血鸦", "Blood Crow"]]
  ];
  function bossFor(ws, lv, target, gearAtk) {
    const rnd = seeded(hashF("boss|" + ws)), pick = a => a[Math.floor(rnd() * a.length)];
    const tpl = Math.floor(rnd() * BOSS_KIND.length), pre = pick(BOSS_PRE), kind = pick(BOSS_KIND[tpl]);
    const hue = rnd() * 360;
    return {
      tpl, zh: pre[0] + kind[0], en: pre[1] + " " + kind[1],
      pal: [hsl2hex(hue, 42, 46), hsl2hex(hue, 42, 28), hsl2hex(hue + 180, 95, 62)],
      hp: Math.round(target * 16 * (10 + 2 * lv + 0.6 * (gearAtk || 0))), atk: 1
    };
  }

  const RIR_F = [1.25, 1.25, 1.0, 0.8, 0.6];
  /* One week's fight, day by day, from the logs. */
  function battle(S, E, ws, td, lv, eq) {
    const hero = heroOf(S), gear = gearOf(eq), sk = gear.sk, cls = hero.cls;
    const st = statsAt(lv, cls, gear), target = weekTarget(S);
    const boss = bossFor(ws, lv, target, gear.atk);   // gear keeps ~40% of its attack as a real edge
    const log = ((S.train && S.train.log) || []).filter(s => counts(s) && s.date >= ws && s.date <= E.addDays(ws, 6) && s.date <= td)
      .slice().sort((a, b) => a.date.localeCompare(b.date) || (a.at || 0) - (b.at || 0));
    let bhp = boss.hp, php = st.hp, wards = sk.ward || 0, idle = 0, streakDays = 0, buff = 0, taken = 0, done = 0, dealt = 0;
    const days = [];
    let wonOn = null;
    const end = E.addDays(ws, 6) < td ? E.addDays(ws, 6) : td;
    for (let d = ws; d <= end; d = E.addDays(d, 1)) {
      const day = { d, hits: [], heal: 0, strike: 0, bossHeal: 0, food: null, weigh: !!(S.weights && S.weights[d]), ko: false };
      const f = d < td ? foodDay(S, E, d) : null;
      day.food = f;
      if (f != null) {
        const base = f === 2 ? 0.25 : f === 1 ? 0.12 : 0.04;
        let heal = st.hp * base * (1 + (sk.herb || 0) / 100) * (cls === "alch" ? 2 : 1);
        heal = Math.min(Math.round(heal), st.hp - php);
        if (heal > 0) { php += heal; day.heal += heal; }
        if (f === 2 && cls === "alch") buff = 10;
      }
      const sess = log.filter(s => s.date === d);
      if (sess.length) { idle = 0; streakDays++; } else streakDays = 0;
      for (const s of sess) {
        let mult = 1 + buff / 100; buff = 0;
        if (sk.dawn && s.at && new Date(s.at).getHours() < 9) mult += sk.dawn / 100;
        if (day.weigh) mult += ((sk.scale || 0) + (cls === "spell" ? 10 : 0)) / 100;
        if (sk.momentum) mult += Math.min(3, streakDays) * sk.momentum / 100;
        const ko = php <= 0; if (ko) mult *= 0.5;
        let dmg = 0, crits = 0, n = 0;
        if (s.type === "hiit") {
          n = s.rounds | 0;
          const per = st.atk * 0.6 * (1 + (sk.storm || 0) / 100) * (cls === "spell" ? 1.5 : 1);
          dmg = per * n * mult;
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
            const critP = (sk.crit || 0) / 100;
            if ((critP && hashF(s.id + "|" + i) < critP) || (cls === "sword" && (done + i + 1) % 5 === 0)) { hit *= 2; crits++; }
            dmg += hit;
          });
          done += n;
        }
        dmg = Math.round(dmg * mult);
        bhp -= dmg; dealt += dmg;
        let heal = 0;
        if (sk.drain) { heal = Math.min(Math.round(st.hp * sk.drain / 100), st.hp - Math.max(0, php)); php = Math.max(0, php) + heal; }
        day.hits.push({ id: s.id, name: s.name || (s.type === "hiit" ? "Intervals" : "Workout"), type: s.type, n, dmg, crits, heal, ko });
        if (bhp <= 0 && !wonOn) wonOn = d;
      }
      if (!sess.length && d < td) {
        idle++;
        const sessionsSoFar = log.filter(s => s.date <= d).length;
        if (idle >= 2 && sessionsSoFar < target && !wonOn) {
          // soft penalty: the boss recovers and lashes out; it only matters inside this week's fight
          const bh = Math.round(boss.hp * 0.08 * (1 - (sk.seal || 0) / 100));
          bhp = Math.min(boss.hp, bhp + bh); day.bossHeal = bh;
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
    const closed = E.addDays(ws, 6) < td;
    return { ws, boss, hp: boss.hp, bhp: Math.max(0, bhp), dmg: dealt, stats: st, php, days, won: !!wonOn, wonOn, taken,
      flawless: !!wonOn && taken === 0, closed, sessions: log.length, target, lv };
  }

  /* ================================================================ feats */
  const ACH = ["5Yid5YWl5LuZ6YCUIMK3IEZpcnN0IFN0ZXB8TG9nZ2VkIHlvdXIgZmlyc3QgbGlmdGluZyBzZXNzaW9uLg==","55m+54K85oiQ6ZKiIMK3IFRlbXBlcmVkIFN0ZWVsfFRlbiBsaWZ0aW5nIHNlc3Npb25zLg==","6ZOB6aqo6ZOu6ZOuIMK3IElyb24gQm9uZXN8RmlmdHkgbGlmdGluZyBzZXNzaW9ucy4=","5pap5aaW6Zmk6a2UIMK3IEZpcnN0IFNsYXlpbmd8RGVmZWF0ZWQgeW91ciBmaXJzdCB3ZWVrbHkgYm9zcy4=","5Zub5a2j5LiN6L6NIMK3IFVuYnJva2VufEZvdXIgYm9zc2VzIGluIGEgcm93Lg==","5q+r5Y+R5peg5LykIMK3IFVudG91Y2hlZHxCZWF0IGEgYm9zcyB3aXRob3V0IHRha2luZyBhIGhpdC4=","6byO5Lit5pyJ6YGTIMK3IE1hc3RlciBvZiB0aGUgQ2F1bGRyb258U2V2ZW4gZGF5cyBvbiBjYWxvcmllcyBhbmQgcHJvdGVpbi4=","5piO6ZWc5q2i5rC0IMK3IFN0aWxsIFdhdGVyfFRoaXJ0eSB3ZWlnaC1pbnMu","5b6h6aOO6ICM6KGMIMK3IFJpZGluZyB0aGUgV2luZHxGaXZlIGludGVydmFsIHNlc3Npb25zLg==","6Zet5YWz6Ium5L+uIMK3IFNlY2x1ZGVkIEN1bHRpdmF0aW9ufEZpdmUgc2Vzc2lvbnMgaW4gb25lIHdlZWsu","6ISx6IOO5o2i6aqoIMK3IFJlZm9yZ2VkIEJvZHl8SGFsZndheSB0byB5b3VyIGdvYWwgd2VpZ2h0Lg==","5Yqf5b635ZyG5ruhIMK3IFBlcmZlY3QgQ29tcGxldGlvbnxSZWFjaGVkIHlvdXIgZ29hbCB3ZWlnaHQu","562R5Z+65oiQ5YqfIMK3IEZvdW5kYXRpb24gTGFpZHxCcm9rZSB0aHJvdWdoIHRvIEZvdW5kYXRpb24gRXN0YWJsaXNobWVudC4=","57Sr5rCU5Lic5p2lIMK3IFB1cnBsZSBEYXdufFRyYWluZWQgYmVmb3JlIDcgQU0u","5Yqb5ouU5bGx5YWuIMK3IE1vdW50YWluIExpZnRlcnwyNSB3b3JraW5nIHNldHMgaW4gb25lIHNlc3Npb24u","5aSp6ZmN5byC5a6dIMK3IEhlYXZlbi1TZW50IFRyZWFzdXJlfEZvdW5kIGEgbGVnZW5kYXJ5IGl0ZW0u"];
  const ACH_TEST = [
    s => s.lifts >= 1, s => s.lifts >= 10, s => s.lifts >= 50, s => s.wins >= 1, s => s.best >= 4, s => s.flawless,
    s => s.nutri >= 7, s => s.weighins >= 30, s => s.hiit >= 5, s => s.maxWeek >= 5, s => s.goal >= 0.5, s => s.goal >= 1,
    s => s.realm >= 1, s => s.early, s => s.big, s => s.legend
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
    // weeks in order; level for each week's boss comes from what was earned before it
    const cur = E.weekStart(td), weeks = [];
    let streak = 0, shields = 0, toShield = 0, best = 0, wins = 0, flawless = false, maxWeek = 0;
    const byId = new Map(items.map(i => [i.id, i]));
    const eqFrom = ids => { const o = {}; for (const k in ids || {}) { const it = byId.get(ids[k]); if (it && it.slot === k) o[k] = it; } return o; };
    for (let ws = E.weekStart(base.since); ws <= cur; ws = E.addDays(ws, 7)) {
      const before = list.filter(e => e.date < ws).reduce((a, e) => a + e.gold, 0);
      const lv = levelOf(before);
      const frozen = fights[ws];
      const b = battle(S, E, ws, td, frozen && frozen.lv ? frozen.lv : lv, frozen ? eqFrom(frozen.eq) : eq);
      const won = frozen ? !!frozen.won : b.won, on = frozen ? frozen.on : b.wonOn;
      const fl = frozen ? !!frozen.flawless : b.flawless;
      maxWeek = Math.max(maxWeek, b.sessions);
      if (ws < cur) {
        if (won) { streak++; if (++toShield >= 4) { toShield = 0; shields = Math.min(2, shields + 1); } }
        else if (shields > 0) shields--;
        else { streak = 0; toShield = 0; }
      } else if (won) streak++;
      if (won) { wins++; list.push({ id: "b:" + ws, date: on || E.addDays(ws, 6), kind: "boss", label: `Defeated ${b.boss.zh} · ${b.boss.en}`, gold: 60 + 10 * Math.min(streak, 6), chest: true, min: 1 }); }
      if (fl) flawless = true;
      best = Math.max(best, streak);
      weeks.push(Object.assign(b, { won, wonOn: on, flawless: fl, frozen: !!frozen, streak }));
    }
    const log = (S.train && S.train.log) || [];
    let gp = null; try { gp = S.goal && S.goal.mode !== "maintain" ? E.goalProgress(S, td) : null; } catch (e) { }
    const pre = list.reduce((a, e) => a + e.gold, 0);
    const st = {
      lifts: log.filter(s => s.type !== "hiit" && doneSets(s) > 0).length, hiit: log.filter(s => s.type === "hiit" && (s.rounds | 0) > 0).length,
      nutri: base.nutri, weighins: Object.keys(S.weights || {}).length, wins, best, flawless, maxWeek, goal: gp ? gp.pct : 0,
      realm: realmOf(levelOf(pre)).i, early: log.some(s => s.at && counts(s) && new Date(s.at).getHours() < 7),
      big: log.some(s => doneSets(s) >= 25), legend: items.some(i => i.r >= 4)
    };
    const when = g.ach || {};
    const ach = ACH_TEST.map(t => { try { return !!t(st); } catch (e) { return false; } });
    ach.forEach((ok, i) => { if (ok) list.push({ id: "a:" + i, date: when[i] || td, kind: "feat", label: "Hidden feat found", gold: 100, chest: true, min: 1 }); });
    const earned = list.reduce((a, e) => a + e.gold, 0), spent = items.reduce((a, i) => a + (i.cost || 0), 0);
    const lv = levelOf(earned), have = new Set(items.map(i => i.id));
    const now = weeks[weeks.length - 1];
    return {
      events: list.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
      pending: list.filter(e => e.chest && !have.has(e.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      earned, spent, stones: earned - spent, level: lv, realm: realmOf(lv), lvFrom: 40 * (lv - 1) * (lv - 1), lvTo: 40 * lv * lv,
      hero, eq, gear: gearOf(eq), stats: statsAt(lv, hero.cls, gearOf(eq)), weeks, week: now, streak, shields, stat: st, ach
    };
  }

  /* ================================================================ rolls & items */
  function pityOf(items) {
    const s = (items || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
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
  const ADJ = [["凡铁", "Plain Iron"], ["青竹", "Green Bamboo"], ["流云", "Drifting Cloud"], ["寒霜", "Cold Frost"], ["赤霞", "Red Dawn"], ["碧落", "Jade Sky"],
    ["紫电", "Violet Lightning"], ["玄冥", "Dark Abyss"], ["金乌", "Golden Crow"], ["太虚", "Great Void"], ["九霄", "Nine Heavens"], ["星河", "Star River"],
    ["幽兰", "Hidden Orchid"], ["烈阳", "Blazing Sun"], ["沧海", "Boundless Sea"], ["鸿蒙", "Primordial"]];
  const NOUN = {
    weapon: [["剑", "Sword"], ["刀", "Saber"], ["扇", "Fan"], ["笛", "Flute"], ["葫芦", "Gourd"], ["拂尘", "Whisk"], ["枪", "Spear"], ["镜", "Mirror"]],
    robe: [["布衣", "Robe"], ["云纹袍", "Cloud Robe"], ["鹤氅", "Crane Mantle"], ["火纹袍", "Flame Robe"], ["水纹袍", "Wave Robe"], ["星袍", "Star Robe"]],
    head: [["冠", "Crown"], ["斗笠", "Bamboo Hat"], ["簪", "Hairpin"], ["抹额", "Headband"], ["莲冠", "Lotus Crown"], ["角", "Horns"], ["光环", "Halo"], ["狐耳", "Fox Ears"]],
    charm: [["玉佩", "Jade Pendant"], ["铃", "Bell"], ["符", "Talisman"], ["珠", "Pearl"]],
    aura: [["云韵", "Cloud Aura"], ["山韵", "Mountain Aura"], ["月韵", "Moon Aura"], ["莲韵", "Lotus Aura"], ["雷韵", "Thunder Aura"], ["花韵", "Petal Aura"], ["星韵", "Star Aura"], ["雾韵", "Mist Aura"]]
  };
  const FLAVOR = ["Still warm from the forge of a thousand reps.", "Said to hum when you skip a session.", "Its previous owner never missed leg day.",
    "Smells faintly of incense and effort.", "Grows heavier every time you make an excuse.", "Carved from a mountain you haven't climbed yet.",
    "Whispers the count of your next set.", "The sect elders pretend not to envy it.", "Refined over forty-nine days in a pill furnace.", "Nobody remembers who made it. It remembers you."];
  const THEME = ["monsoon", "orchid", "lantern", "typhoon", "jade", "ember", "glacier", "comet", "tide", "volcano", "bamboo", "koi", "nebula",
    "crane", "harbour", "rainforest", "origami", "dragonfly", "lighthouse", "aurora", "firefly", "sandstorm", "moss", "obsidian", "pagoda",
    "starlight", "snowfall", "kite", "reef", "quartz", "hibiscus", "tempest", "peony", "cinder", "lotus", "geyser", "fern", "sunrise",
    "ink wash", "incense", "thunderstorm", "mist", "plum blossom", "tortoise", "phoenix feather", "spring rain", "autumn maple", "moonlit lake"];

  function makeSkill(rnd, slot, r) {
    if (r < 1 && slot !== "charm") return null;
    const k = SKILL_KEYS[Math.floor(rnd() * SKILL_KEYS.length)];
    return { k, p: SKILLS[k].p[Math.max(0, r - 1)] };
  }
  function localItem(rnd, slot, shape, r) {
    const pick = a => a[Math.floor(rnd() * a.length)];
    const hue = rnd() * 360, sat = 38 + r * 12, adj = pick(ADJ), noun = NOUN[slot][shape] || NOUN[slot][0];
    const fx = r >= 4 ? "sparkle" : r === 3 ? pick(["sparkle", "glow"]) : r === 2 && rnd() < 0.3 ? "glow" : "none";
    return {
      v: 2, slot, shape, r, name: `${adj[0]}${noun[0]} · ${adj[1]} ${noun[1]}`, flavor: pick(FLAVOR),
      pal: [hsl2hex(hue, sat, 56), hsl2hex(hue, sat, 36), hsl2hex(hue + (rnd() < 0.5 ? 150 : 40), Math.min(95, sat + 12), 64)],
      pat: pick(PATTERNS), fx, stat: SLOT_STAT[slot](r), skill: makeSkill(rnd, slot, r), src: "local"
    };
  }
  function aiPrompt(item, words) {
    const sk = item.skill ? `Its power: ${SKILLS[item.skill.k].t(item.skill.p)}` : "It has no special power.";
    return `You name one item for a pixel-art xianxia (修仙 cultivation) fitness game.
Slot: ${SLOT_NAME[item.slot]} (${SLOT_ZH[item.slot]}). Base shape: ${SHAPES[item.slot][item.shape]}. Rarity: ${RAR[item.r]} (${RAR_ZH[item.r]}), ${item.r + 1} of 5.
${sk}
Inspiration (blend, don't list): ${words.join(", ")}.
Reply with JSON only, no code fence:
{"name":"Chinese name · English name","flavor":"one playful sentence under 90 characters","palette":["#RRGGBB","#RRGGBB","#RRGGBB"],"pattern":"solid|stripe|dots|check|gradient","fx":"none|sparkle|glow"}
Rules: the Chinese name is 2 to 5 characters in classic cultivation-novel style and fits the shape and power; the English name is 2 to 4 words. Palette is main colour, a darker shade of it, then a contrasting accent. Higher rarity means bolder colours and a grander name. Common and Uncommon use fx "none". No brand names, real people, or characters from existing novels, films or games.`;
  }
  function parseItem(text, base) {
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j; try { j = JSON.parse(m[0]); } catch (e) { return null; }
    const hex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : null;
    const clean = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n) : "";
    const it = Object.assign({}, base), name = clean(j.name, 48), fl = clean(j.flavor, 120);
    if (!name) return null;
    it.name = name; if (fl) it.flavor = fl;
    const pal = Array.isArray(j.palette) ? j.palette.slice(0, 3).map(hex) : [];
    if (pal.length === 3 && pal.every(Boolean)) it.pal = pal;
    if (PATTERNS.includes(j.pattern)) it.pat = j.pattern;
    let fx = FX.includes(j.fx) ? j.fx : it.fx;
    if (it.r <= 1) fx = "none"; else if (it.r >= 4 && fx === "none") fx = "sparkle";
    it.fx = fx; it.src = "ai";
    return it;
  }
  /* Items from the first version (head/body/back/bg) become v2 gear, keeping look and rarity. */
  function migrateItem(it) {
    if (!it || it.v === 2) return it;
    const map = { head: "head", body: "robe", back: "charm", bg: "aura" };
    const slot = map[it.slot] || "charm", r = clampI(it.r, 0, 4), rnd = seeded(hashF("mig|" + it.id));
    const out = Object.assign({}, it, { v: 2, slot, r, shape: Math.floor(rnd() * SHAPES[slot].length), stat: SLOT_STAT[slot](r), skill: makeSkill(rnd, slot, r) });
    if (!Array.isArray(out.pal) || out.pal.length < 3) out.pal = ["#9AA0A6", "#6B7280", "#E2A91F"];
    return out;
  }

  /* ================================================================ pixels */
  function canvas(N) { return { N, c: new Array(N * N).fill(null), k: new Uint8Array(N * N) }; }
  function put(cv, x, y, col, ink) { if (x < 0 || y < 0 || x >= cv.N || y >= cv.N || !col) return; const i = y * cv.N + x; cv.c[i] = col; cv.k[i] = ink ? 1 : 0; }
  function span(cv, y, x0, x1, col, ink) { for (let x = x0; x <= x1; x++) put(cv, x, y, col, ink); }
  function outline(cv) {
    const N = cv.N, add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (cv.c[y * N + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const j = Y * N + X;
        if (cv.c[j] && !cv.k[j]) { add.push(y * N + x); break; }
      }
    }
    for (const i of add) { cv.c[i] = INK; cv.k[i] = 1; }
  }
  function runs(get, N, extra) {
    let out = "";
    for (let y = 0; y < N; y++) {
      let x = 0;
      while (x < N) {
        const c = get(x, y);
        if (!c) { x++; continue; }
        let w = 1; while (x + w < N && get(x + w, y) === c) w++;
        out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"${extra || ""}/>`;
        x += w;
      }
    }
    return out;
  }
  const cvRuns = cv => runs((x, y) => cv.c[y * cv.N + x], cv.N);
  function patColor(pal, pat, x, y, role, midY) {
    if (role === 1) return pal[1];
    if (role === 2) return pal[2];
    if (role === 3) return INK;
    switch (pat) {
      case "stripe": return y % 2 ? pal[1] : pal[0];
      case "dots": return (x + y * 2) % 4 === 0 ? pal[2] : pal[0];
      case "check": return ((x >> 1) + (y >> 1)) % 2 ? pal[0] : pal[1];
      case "gradient": return y > midY ? pal[1] : pal[0];
      default: return pal[0];
    }
  }
  function ellipse(out, cx, cy, rx, ry, role) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) out.push([x, y, role]);
  }
  function rect(out, x0, y0, x1, y1, role) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y, role]); }

  /* ---------------------------------------------------- the cultivator (48 × 48) */
  const HEAD = ["....########....", "..############..", ".##############.", "################", "################", "################", "################",
    "################", "################", "################", "################", ".##############.", "..############..", "....########...."];
  function heroShape(sp) {
    const g = clampI(sp.girth, 0, 4), sh = clampI(sp.sh, 0, 2), arm = clampI(sp.arm, 0, 2);
    const Ws = 14 + 2 * sh, Wb = 12 + 2 * g, even = v => Math.round(v / 2) * 2;
    const rowW = { 21: Ws - 4, 22: Ws - 2, 23: Ws, 24: Ws, 25: Ws, 26: even((Ws + Wb) / 2) };
    for (let y = 27; y <= 33; y++) rowW[y] = Wb;
    for (let y = 34; y <= 41; y++) rowW[y] = Math.max(Wb, 14) + 2 * Math.floor((y - 33) / 2) + 2;
    let half = 0; for (let y = 22; y <= 33; y++) half = Math.max(half, rowW[y] / 2);
    const sw = 4 + arm;
    const L = [24 - half - 1 - sw, 24 - half - 2], R = [23 + half + 2, 23 + half + 1 + sw];
    return { g, sh, arm, rowW, half, sw, L, R, hy: 33, hl: Math.floor((L[0] + L[1]) / 2), hr: Math.floor((R[0] + R[1]) / 2) + 1 };
  }
  function robeCells(H) {
    const o = [];
    for (let y = 21; y <= 41; y++) { const w = H.rowW[y]; for (let x = 24 - w / 2; x <= 23 + w / 2; x++) o.push([x, y, y === 41 ? 1 : 0]); }
    for (let y = 22; y <= 32; y++) {
      const fl = y >= 29 ? 1 : 0;
      for (let x = H.L[0] - fl; x <= H.L[1]; x++) o.push([x, y, y === 32 ? 1 : 0]);
      for (let x = H.R[0]; x <= H.R[1] + fl; x++) o.push([x, y, y === 32 ? 1 : 0]);
    }
    for (let x = H.L[1] + 1; x < 24 - H.rowW[22] / 2; x++) o.push([x, 22, 0]);
    for (let x = 23 + H.rowW[22] / 2 + 1; x < H.R[0]; x++) o.push([x, 22, 0]);
    return o;
  }
  function robeMotif(shape, H, rnd) {
    const o = [], w = H.rowW[37] / 2;
    switch (SHAPES.robe[shape]) {
      case "cloud": for (const cx of [24 - w + 3, 24 + w - 4]) { ellipse(o, cx, 38, 2.2, 1.2, 2); } break;
      case "crane": o.push([19, 36, 2], [20, 35, 2], [21, 35, 2], [22, 36, 2], [21, 37, 2], [28, 25, 2], [29, 24, 2]); break;
      case "flame": for (let x = 24 - w + 1; x <= 23 + w - 1; x += 3) { o.push([x, 40, 2], [x, 39, 2], [x + 1, 40, 2], [x, 38, 2]); } break;
      case "wave": for (let x = 24 - w + 1; x <= 23 + w - 1; x++) o.push([x, 38 + ((x >> 1) % 2), 2]); break;
      case "star": for (let i = 0; i < 6; i++) o.push([Math.round(24 - w + 2 + rnd() * (2 * w - 4)), 25 + Math.floor(rnd() * 15), 2]); break;
      default: break;
    }
    return o;
  }
  function weaponCells(shape, H) {
    const o = [], wx = H.hr + 1, hy = H.hy;
    switch (SHAPES.weapon[shape]) {
      case "saber": for (let y = hy - 15; y <= hy - 3; y++) { const dx = Math.floor((hy - 3 - y) / 5); o.push([wx + dx, y, 0], [wx + dx + 1, y, y % 3 ? 0 : 1]); }
        o.push([wx - 1, hy - 2, 2], [wx, hy - 2, 2], [wx + 1, hy - 2, 2], [wx + 2, hy - 2, 2]); rect(o, wx, hy - 1, wx + 1, hy + 2, 1); break;
      case "fan": for (let r = 1; r <= 7; r++) for (let a = -3; a <= 3; a++) { const x = wx + Math.round(Math.sin(a / 4) * r) + 1, y = hy - 1 - Math.round(Math.cos(a / 4) * r); o.push([x, y, r > 5 ? 2 : (a + 3) % 2 ? 0 : 1]); } break;
      case "flute": for (let t = 0; t <= 13; t++) o.push([wx - 3 + Math.round(t * 0.55), hy + 3 - t, t % 3 === 1 ? 2 : 0]); break;
      case "gourd": ellipse(o, wx + 1, hy + 3, 1.2, 1.4, 0); ellipse(o, wx + 1, hy + 7, 2.4, 2.4, 0); o.push([wx + 1, hy + 1, 2], [wx, hy + 7, 1]); break;
      case "whisk": rect(o, wx, hy - 6, wx, hy + 2, 1); ellipse(o, wx, hy - 10, 1.6, 3.4, 0); o.push([wx - 1, hy - 7, 2], [wx + 1, hy - 7, 2]); break;
      case "spear": rect(o, wx, 5, wx, 44, 1); o.push([wx, 1, 0], [wx - 1, 2, 0], [wx, 2, 0], [wx + 1, 2, 0], [wx - 1, 3, 0], [wx, 3, 0], [wx + 1, 3, 0], [wx, 4, 0], [wx - 1, 5, 2], [wx + 1, 5, 2], [wx - 1, 6, 2], [wx + 1, 6, 2], [wx - 2, 7, 2], [wx + 2, 7, 2]); break;
      case "mirror": { const cx = wx + 1, cy = hy - 11; ellipse(o, cx, cy, 4.2, 4.2, 0); ellipse(o, cx, cy, 2.6, 2.6, 2); o.push([cx - 1, cy - 1, 1]); rect(o, cx, cy + 5, cx, hy - 1, 1); break; }
      default: // sword
        for (let y = hy - 16; y <= hy - 3; y++) { o.push([wx, y, 0]); if (y > hy - 16) o.push([wx + 1, y, 1]); }
        rect(o, wx - 1, hy - 2, wx + 2, hy - 2, 2); rect(o, wx, hy - 1, wx + 1, hy + 2, 1); o.push([wx, hy + 3, 2], [wx - 1, hy + 4, 2], [wx, hy + 5, 2]);
    }
    return o;
  }
  function headCells(shape) {
    const o = [], R = (y, x0, x1, role) => { for (let x = x0; x <= x1; x++) o.push([x, y, role || 0]); };
    switch (SHAPES.head[shape]) {
      case "bamboo hat": R(1, 23, 24); R(2, 21, 26); R(3, 19, 28); R(4, 17, 30); R(5, 14, 33); R(6, 11, 36, 1); R(3, 23, 24, 2); break;
      case "hairpin": R(4, 17, 30, 1); o.push([30, 3, 2], [31, 3, 2], [30, 4, 2], [31, 4, 2], [32, 5, 2], [32, 6, 0], [32, 7, 0]); break;
      case "headband": R(10, 16, 31); R(10, 23, 24, 2); o.push([32, 10, 0], [33, 11, 0], [33, 12, 0], [34, 13, 1]); break;
      case "lotus crown": R(5, 18, 29, 1); R(4, 18, 20); R(4, 23, 24); R(4, 27, 29); R(3, 19, 19, 2); R(3, 23, 24, 2); R(3, 28, 28, 2); R(2, 23, 24, 2); break;
      case "horns": o.push([19, 5, 0], [18, 4, 0], [18, 3, 0], [17, 2, 0], [17, 1, 2], [28, 5, 0], [29, 4, 0], [29, 3, 0], [30, 2, 0], [30, 1, 2]); break;
      case "halo": R(0, 19, 28, 2); o.push([18, 1, 2], [29, 1, 2]); R(2, 19, 28, 2); break;
      case "fox ears": R(2, 17, 17); R(3, 16, 18); R(4, 16, 19); R(5, 16, 20); R(2, 30, 30); R(3, 29, 31); R(4, 28, 31); R(5, 27, 31); o.push([17, 4, 2], [30, 4, 2], [17, 3, 2], [30, 3, 2]); break;
      default: // guan
        R(5, 21, 26); R(4, 21, 26); R(3, 22, 25); R(2, 23, 24, 2); R(4, 18, 29, 1);
    }
    return o;
  }
  function charmCells(shape, H) {
    const x = 21, y = 31, o = [];
    switch (SHAPES.charm[shape]) {
      case "bell": o.push([x, y, 2], [x - 1, y + 1, 0], [x, y + 1, 0], [x + 1, y + 1, 0], [x - 1, y + 2, 0], [x, y + 2, 0], [x + 1, y + 2, 0], [x, y + 3, 1]); break;
      case "talisman": o.push([x, y, 2]); rect(o, x - 1, y + 1, x + 1, y + 4, 0); o.push([x, y + 2, 2], [x, y + 3, 1]); break;
      case "pearl": o.push([x, y, 1]); ellipse(o, x, y + 2, 1.3, 1.3, 0); o.push([x - 1, y + 1, 2]); break;
      default: o.push([x, y, 1], [x - 1, y + 1, 0], [x, y + 1, 0], [x - 1, y + 2, 0], [x, y + 2, 2], [x - 1, y + 3, 1]);
    }
    void H;
    return o;
  }
  function auraCells(item) {
    const o = [], sh = SHAPES.aura[item.shape], rnd = seeded(hashF(String(item.id || item.name)));
    switch (sh) {
      case "mountains":
        for (let x = 0; x < 48; x++) {
          const far = Math.round(26 + 6 * Math.sin(x / 7 + 1) + 3 * Math.sin(x / 3)), near = Math.round(34 + 4 * Math.sin(x / 5 + 2));
          for (let y = far; y < 48; y++) o.push([x, y, y >= near ? 1 : 0]);
        } break;
      case "moon": ellipse(o, 37, 10, 6.5, 6.5, 2); ellipse(o, 12, 16, 7, 2, 0); ellipse(o, 30, 22, 8, 2, 0); break;
      case "lotus": rect(o, 0, 38, 47, 47, 1); for (let i = 0; i < 4; i++) ellipse(o, 5 + i * 12 + rnd() * 4, 41 + rnd() * 4, 3.5, 1.4, 0); o.push([9, 36, 2], [8, 37, 2], [10, 37, 2], [9, 37, 2], [36, 35, 2], [35, 36, 2], [37, 36, 2], [36, 36, 2]); break;
      case "lightning": for (let b = 0; b < 3; b++) { let x = 6 + b * 16 + Math.floor(rnd() * 6); for (let y = 0; y < 22; y++) { o.push([x, y, 2]); if (y % 4 === 3) x += rnd() < 0.5 ? -2 : 2; } } break;
      case "petals": for (let i = 0; i < 26; i++) { const x = Math.floor(rnd() * 46), y = Math.floor(rnd() * 46); o.push([x, y, i % 3 ? 0 : 2], [x + 1, y, i % 3 ? 0 : 2]); } break;
      case "stars": for (let i = 0; i < 12; i++) { const x = Math.floor(rnd() * 44) + 2, y = Math.floor(rnd() * 44) + 2, r = i % 3 ? 0 : 2; o.push([x, y, r], [x - 1, y, r], [x + 1, y, r], [x, y - 1, r], [x, y + 1, r]); } break;
      case "mist": for (let k = 0; k < 6; k++) for (let x = 0; x < 48; x++) { const y = Math.round(5 + k * 8 + 1.5 * Math.sin(x / 4 + k)); o.push([x, y, k % 2]); o.push([x, y + 1, k % 2]); } break;
      default: for (let i = 0; i < 6; i++) { const cx = rnd() * 44 + 2, cy = rnd() * 40 + 3; ellipse(o, cx, cy, 5 + rnd() * 3, 2 + rnd(), 0); ellipse(o, cx + 2, cy + 1.5, 4, 1.2, 1); }
    }
    return o;
  }

  let SVG_N = 0;
  const HOLD = [[5, 8], [41, 6], [4, 26], [43, 24], [7, 42], [40, 43], [12, 3], [35, 2], [44, 36], [3, 36]];
  /* spec: { hero, girth 0-4, sh 0-2, arm 0-2, mood, eq: { weapon, robe, head, charm, aura } } */
  function heroSVG(spec, opts) {
    opts = opts || {};
    const N = 48, cv = canvas(N), hero = spec.hero || heroOf({}), eq = spec.eq || {}, H = heroShape(spec);
    const skin = SKIN[hero.skin], hair = HAIR_COL[hero.hc], hairS = shade(hair, hero.hc === 2 ? -0.25 : 0.25);
    const robe = eq.robe || { pal: CLASS_ROBE[hero.cls], pat: "solid", shape: 0 };
    const paint = (it, cells) => {
      const ys = cells.map(c => c[1]), midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      for (const [x, y, role] of cells) put(cv, x, y, patColor(it.pal, it.pat, x, y, role, midY), role === 3);
    };
    // back hair
    if (hero.hair === "long") for (let y = 10; y <= 30; y++) { span(cv, y, 13, 15, y > 27 ? hairS : hair); span(cv, y, 32, 34, y > 27 ? hairS : hair); }
    if (hero.hair === "ponytail") for (let y = 8; y <= 24; y++) span(cv, y, 32 + (y > 14 ? 1 : 0), 34 + (y > 14 ? 1 : 0) - (y > 21 ? 1 : 0), y > 21 ? hairS : hair);
    // robe, collar, sash
    paint(robe, robeCells(H));
    if (eq.robe) paint(robe, robeMotif(robe.shape, H, seeded(hashF(String(robe.id || "r")))));
    const collar = shade(robe.pal[0], 0.6);
    for (let i = 0; i <= 5; i++) { put(cv, 20 + i, 21 + i, INK, 1); if (i < 4) put(cv, 21 + i, 21 + i, collar); }
    for (let i = 0; i <= 2; i++) put(cv, 27 - i, 21 + i, INK, 1);
    const w29 = H.rowW[29] / 2;
    span(cv, 29, 24 - w29, 23 + w29, robe.pal[2]); span(cv, 30, 24 - w29, 23 + w29, shade(robe.pal[2], -0.25));
    put(cv, 24, 29, INK, 1); put(cv, 25, 31, robe.pal[2]); put(cv, 25, 32, robe.pal[2]); put(cv, 26, 33, shade(robe.pal[2], -0.25));
    // feet
    span(cv, 42, 19, 22, SHOE); span(cv, 43, 18, 22, SHOE); span(cv, 42, 25, 28, SHOE); span(cv, 43, 25, 29, SHOE);
    // neck and head
    span(cv, 20, 22, 25, skin);
    HEAD.forEach((row, r) => { for (let c = 0; c < 16; c++) if (row[c] === "#") put(cv, 16 + c, 6 + r, skin); });
    // hair cap
    span(cv, 5, 20, 27, hair); span(cv, 6, 18, 29, hair); span(cv, 7, 17, 30, hair); span(cv, 8, 16, 31, hair); span(cv, 9, 16, 31, hair);
    span(cv, 10, 16, 19, hair); span(cv, 10, 23, 24, hair); span(cv, 10, 28, 31, hair);
    for (let y = 11; y <= 16; y++) { put(cv, 16, y, hair); put(cv, 31, y, hair); }
    span(cv, 6, 21, 23, hairS);
    if (hero.hair === "bun") { span(cv, 1, 22, 25, hair); span(cv, 2, 21, 26, hair); span(cv, 3, 21, 26, hair); span(cv, 4, 22, 25, hairS); }
    if (hero.hair === "short") { [18, 19, 22, 23, 26, 27].forEach(x => put(cv, x, 4, hair)); span(cv, 5, 17, 30, hair); }
    if (hero.hair === "ponytail") { put(cv, 32, 8, robe.pal[2]); put(cv, 32, 9, robe.pal[2]); }
    // face
    const eye = (x) => { if (spec.mood === "sleepy") { span(cv, 14, x - 1, x + 1, INK, 1); return; } for (let y = 12; y <= 14; y++) { put(cv, x, y, INK, 1); put(cv, x + 1, y, INK, 1); } put(cv, x, 12, "#FFFFFF", 1); };
    eye(19); eye(27);
    span(cv, 11, 19, 20, shade(hair, -0.1), 1); span(cv, 11, 27, 28, shade(hair, -0.1), 1);
    if (spec.mood === "happy") { put(cv, 22, 16, INK, 1); span(cv, 17, 23, 24, INK, 1); put(cv, 25, 16, INK, 1); span(cv, 16, 18, 19, BLUSH); span(cv, 16, 28, 29, BLUSH); }
    else if (spec.mood === "sleepy") { put(cv, 23, 17, INK, 1); put(cv, 24, 17, INK, 1); put(cv, 30, 8, "#9DB4FF"); put(cv, 32, 6, "#9DB4FF"); }
    else span(cv, 17, 23, 24, INK, 1);
    if (eq.head) paint(eq.head, headCells(eq.head.shape));
    if (eq.charm) paint(eq.charm, charmCells(eq.charm.shape, H));
    if (eq.weapon) paint(eq.weapon, weaponCells(eq.weapon.shape, H));
    // hands on top so they grip the weapon
    for (const hx of [H.hl, H.hr]) { span(cv, 33, hx - 1, hx, skin); span(cv, 34, hx - 1, hx, skin); }
    outline(cv);
    let bg = "";
    if (eq.aura) {
      const a = eq.aura;
      bg = `<rect width="48" height="48" fill="${a.pal[0]}" fill-opacity=".16"/>`;
      const m = new Map(); for (const [x, y, role] of auraCells(a)) if (x >= 0 && y >= 0 && x < 48 && y < 48) m.set(y * 48 + x, role === 1 ? a.pal[1] : role === 2 ? a.pal[2] : a.pal[0]);
      bg += runs((x, y) => m.get(y * 48 + x), 48, ' fill-opacity=".45"');
    }
    if (opts.focus) opts = Object.assign({}, opts, { vb: focusBox(opts.focus, H) });
    return wrapSVG(48, bg, cvRuns(cv), [eq.weapon, eq.robe, eq.head, eq.charm, eq.aura].filter(Boolean), opts);
  }
  /* Close-up framing for gear icons, so a small item isn't lost in a full-body picture. */
  function focusBox(slot, H) {
    if (slot === "head") return "10 -1 28 28";
    if (slot === "charm") return "16 28 10 10";
    if (slot === "weapon") return `${Math.max(0, Math.min(24, H.hr - 11))} 14 24 24`;
    return "0 0 48 48";
  }
  function wrapSVG(N, bg, fig, items, opts) {
    const glow = items.find(i => i.fx === "glow"), spark = items.filter(i => i.fx === "sparkle");
    const id = "qg" + (++SVG_N);
    const defs = glow ? `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="${glow.pal[2]}" flood-opacity=".95"/></filter></defs>` : "";
    let sp = "";
    spark.forEach((it, k) => {
      const rnd = seeded(hashF(String(it.id || it.name) + k));
      HOLD.slice().sort(() => rnd() - 0.5).slice(0, 5).forEach(([x, y]) => {
        sp += `<rect class="q-tw" style="animation-delay:${(rnd() * 1.6).toFixed(2)}s" x="${x}" y="${y}" width="1" height="1" fill="${it.pal[2]}"/>`;
      });
    });
    return `<svg viewBox="${opts.vb || `0 0 ${N} ${N}`}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" class="q-svg${opts.cls ? " " + opts.cls : ""}"${opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"'}>${defs}<g>${bg}</g><g class="q-fig"${glow ? ` filter="url(#${id})"` : ""}>${fig}</g>${sp}</svg>`;
  }

  /* ---------------------------------------------------- bosses (48 × 48, facing left) */
  function bossCells(tpl, seed) {
    const o = [], rnd = seeded(seed);
    switch (tpl) {
      case 1: // serpent
        ellipse(o, 26, 41, 17, 5, 0); ellipse(o, 28, 34, 12, 4.5, 0); ellipse(o, 24, 27, 8, 3.8, 0);
        for (const [cy, rx] of [[43, 14], [36, 10], [29, 6]]) for (let x = 26 - rx; x <= 26 + rx; x += 2) o.push([x, cy, 1]);
        rect(o, 16, 14, 21, 25, 0); rect(o, 20, 16, 21, 25, 1);
        ellipse(o, 15, 12, 8, 5, 0); ellipse(o, 13, 15, 6, 2, 1);
        o.push([11, 10, 2], [12, 10, 2], [16, 10, 2], [20, 7, 1], [21, 6, 1], [22, 5, 1], [17, 7, 1], [17, 6, 1], [6, 15, 3], [5, 16, 2], [4, 15, 2], [4, 17, 2]);
        break;
      case 2: // wraith
        ellipse(o, 24, 15, 10, 10, 0);
        for (let y = 22; y <= 41; y++) { const w = 8 + Math.round((y - 22) * 0.6); rect(o, 24 - w, y, 23 + w, y, y % 3 ? 0 : 1); }
        for (let x = 12; x <= 35; x++) if ((x >> 1) % 2) o.push([x, 42, 1], [x, 43, 1]);
        ellipse(o, 24, 17, 6, 6, 3);
        o.push([21, 16, 2], [22, 16, 2], [26, 16, 2], [27, 16, 2], [21, 17, 2], [27, 17, 2]);
        ellipse(o, 10, 29, 5, 2.5, 1); ellipse(o, 38, 29, 5, 2.5, 1); o.push([4, 29, 2], [5, 30, 2], [44, 29, 2], [43, 30, 2]);
        break;
      case 3: // golem
        rect(o, 17, 5, 31, 15, 0); rect(o, 10, 16, 38, 34, 0); rect(o, 3, 17, 9, 36, 1); rect(o, 39, 17, 45, 36, 1);
        rect(o, 13, 35, 21, 44, 1); rect(o, 27, 35, 35, 44, 1);
        rect(o, 20, 9, 22, 10, 2); rect(o, 26, 9, 28, 10, 2);
        for (let dy = -3; dy <= 3; dy++) { const dx = 3 - Math.abs(dy); o.push([24 - dx, 25 + dy, 2], [24 + dx, 25 + dy, 2]); }
        for (let i = 0; i < 4; i++) { let x = 12 + Math.floor(rnd() * 24), y = 17 + Math.floor(rnd() * 14); for (let k = 0; k < 4; k++) { o.push([x, y, 3]); x += rnd() < 0.5 ? 1 : -1; y++; } }
        break;
      case 4: // bird
        ellipse(o, 13, 13, 12, 7, 1); ellipse(o, 35, 12, 12, 7, 1);
        for (let x = 2; x <= 22; x += 3) o.push([x, 17, 0], [x, 18, 0]);
        ellipse(o, 26, 27, 9, 8, 0); ellipse(o, 14, 20, 6, 5, 0);
        o.push([7, 20, 2], [6, 20, 2], [5, 21, 2], [6, 21, 2], [7, 21, 2], [8, 21, 2], [12, 18, 2], [12, 14, 2], [13, 13, 2], [14, 14, 2]);
        for (let y = 34; y <= 43; y++) for (let x = 27 + Math.floor((y - 34) / 2); x <= 34 + Math.floor((y - 34) / 2); x++) o.push([x, y, (x + y) % 3 ? 0 : 1]);
        rect(o, 21, 35, 22, 38, 2); rect(o, 26, 35, 27, 37, 2);
        break;
      default: // beast
        ellipse(o, 20, 24, 6, 8, 1);
        ellipse(o, 29, 29, 12, 7, 0); ellipse(o, 29, 32, 9, 3, 1);
        ellipse(o, 14, 22, 7, 6, 0); ellipse(o, 8, 25, 4, 2.5, 0);
        o.push([4, 24, 3], [5, 24, 3]);
        for (const ex of [10, 16]) { o.push([ex + 1, 12, 0]); rect(o, ex, 13, ex + 2, 13, 0); rect(o, ex, 14, ex + 3, 15, 0); o.push([ex + 1, 14, 1]); }
        o.push([11, 20, 2], [12, 20, 2], [11, 21, 2]);
        for (const lx of [16, 21, 32, 37]) { rect(o, lx, 35, lx + 3, 41, 0); rect(o, lx, 42, lx + 3, 42, 1); }
        for (let t = 0; t <= 10; t++) { const x = 40 + Math.round(t * 0.5), y = 27 - Math.round(t * 1.3); o.push([x, y, 0], [x + 1, y, t > 7 ? 2 : 0], [x + 1, y + 1, 0]); }
    }
    return o;
  }
  function bossSVG(boss, opts) {
    const cv = canvas(48);
    for (const [x, y, role] of bossCells(boss.tpl, hashF(boss.en))) put(cv, x, y, role === 3 ? "#241A2E" : boss.pal[Math.min(2, role)], role === 3);
    outline(cv);
    return wrapSVG(48, "", cvRuns(cv), [], opts || {});
  }
  function chestSVG(color) {
    const cv = canvas(16);
    for (let y = 3; y <= 5; y++) span(cv, y, y === 3 ? 4 : 3, y === 3 ? 11 : 12, color);
    span(cv, 6, 3, 12, INK, 1);
    for (let y = 7; y <= 12; y++) span(cv, y, 3, 12, y === 9 ? "#7A4A22" : "#9A6232");
    span(cv, 7, 7, 8, "#F5C84C"); span(cv, 8, 7, 8, "#F5C84C"); put(cv, 5, 4, "#FFFFFF");
    outline(cv);
    return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" class="q-chest-svg" aria-hidden="true">${cvRuns(cv)}</svg>`;
  }

  /* What the cultivator looks like right now. */
  function heroSpec(S, E, td) {
    td = td || E.today();
    const log = (S.train && S.train.log) || [], goal = S.goal || {}, g = S.game || {};
    const from = E.addDays(td, -27);
    const sets28 = log.filter(s => s.date >= from && s.date <= td).reduce((a, s) => a + doneSets(s), 0);
    const arm = sets28 >= 60 ? 2 : sets28 >= 20 ? 1 : 0;
    let gp = null; try { gp = goal.mode !== "maintain" ? E.goalProgress(S, td) : null; } catch (e) { }
    let girth = 2, sh = arm;
    if (gp && goal.mode === "loss") girth = Math.round((1 - gp.pct) * 4);
    else if (gp && goal.mode === "gain") { girth = 1; sh = Math.max(arm, Math.round(gp.pct * 2)); }
    else if (goal.mode === "maintain") girth = 1;
    const last = log.filter(counts).reduce((m, s) => s.date > m ? s.date : m, "");
    const idle = last ? E.daysBetween(last, td) : E.daysBetween(g.start || td, td);
    const mood = last && idle <= 2 ? "happy" : idle >= 7 ? "sleepy" : "calm";
    return { hero: heroOf(S), girth, sh, arm, mood, eq: equipped(S), gp, sets28, idle };
  }

  const Core = { RAR, RAR_ZH, RCOL, ODDS, PITY_RARE, PITY_LEG, CHEST_COST, SLOTS, SLOT_NAME, SLOT_ZH, SHAPES, PATTERNS, THEME, SKILLS, CLASSES, HAIR, HAIR_COL, SKIN, REALMS,
    doneSets, levelOf, realmOf, statsAt, gearOf, equipped, heroOf, baseEvents, battle, bossFor, summary, pityOf, rollRarity, localItem, aiPrompt, parseItem, migrateItem,
    achText, ACH_COUNT: ACH.length, heroSVG, heroSpec, bossSVG, chestSVG, heroShape, hashF, seeded };
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
      chest: '<rect x="3.5" y="9.5" width="17" height="10.5" rx="1.5"/><path d="M3.5 13.5h17M5 9.5V8a4 4 0 014-4h6a4 4 0 014 4v1.5"/><rect x="10.5" y="11.8" width="3" height="3.6" rx=".8"/>',
      stone: '<path d="M12 3l6 5-2 11H8L6 8z"/><path d="M6 8h12M12 3l-2 5 2 11 2-11z"/>',
      flame: '<path d="M12.5 3c.4 3-2 4.3-3.3 6.3C8 11 7.5 12.4 7.5 14a4.5 4.5 0 009 0c0-2.4-1.3-3.6-2.1-5.2.9 2-1.6 3.4-1.6 3.4.6-3.3-.3-6.8-.3-9.2z"/>',
      shield: '<path d="M12 3l7 2.8v5.5c0 4.5-3 8-7 9.7-4-1.7-7-5.2-7-9.7V5.8z"/>',
      lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
      sword: '<path d="M14.5 4H20v5.5L9 20.5 3.5 15z"/><path d="M6 13l5 5M4 20l2-2"/>',
      heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>'
    };
    const ico = (k, cls) => h("span", { class: "q-ico " + (cls || ""), html: svg(QI[k]) });
    const rand = () => { const a = new Uint32Array(1); (self.crypto || crypto).getRandomValues(a); return a[0] / 4294967296; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    const fmt = n => Math.round(n).toLocaleString("en-US");
    let BUSY = false;

    function housekeep() {
      const g = G(); let dirty = false;
      if (!g.start) { g.start = E.today(); dirty = true; }
      for (let i = 0; i < g.items.length; i++) { const m = C.migrateItem(g.items[i]); if (m !== g.items[i]) { g.items[i] = m; dirty = true; } }
      for (const k of ["body", "back", "bg"]) if (g.eq[k]) { const it = g.items.find(i => i.id === g.eq[k]); delete g.eq[k]; if (it && !g.eq[it.slot]) g.eq[it.slot] = it.id; dirty = true; }
      const sum = summary();
      sum.ach.forEach((ok, i) => { if (ok && !g.ach[i]) { g.ach[i] = E.today(); dirty = true; } });
      // freeze fights that are over (week closed, or boss down) so later gear changes don't rewrite them
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

    /* ---------------------------------------------------- hero setup */
    function viewSetup(existing) {
      const g = G(), d = Object.assign({ cls: "sword", hair: "bun", hc: 0, skin: 1, name: "" }, existing ? g.hero : {});
      const root = h("div", { class: "quest" });
      root.append(existing ? X.subhead("Your cultivator") : X.head("踏入仙途"));
      const stage = h("div", { class: "q-stage q-bob" });
      const paint = () => { stage.innerHTML = C.heroSVG(Object.assign(C.heroSpec(S(), E), { hero: C.heroOf({ game: { hero: d } }), mood: "happy" }), { label: "Preview" }); };
      paint();
      const chips = (opts, get, set, label) => h("div", { class: "q-chips", role: "radiogroup", "aria-label": label }, opts.map(([v, l, sw]) => h("button", {
        class: "chip" + (get() === v ? " on" : "") + (sw ? " q-sw" : ""), style: sw ? { "--sw": sw } : null, "aria-label": sw ? l : null,
        onclick: e => { set(v); e.currentTarget.parentNode.querySelectorAll("button").forEach(b => b.classList.remove("on")); e.currentTarget.classList.add("on"); paint(); note.textContent = C.CLASSES[d.cls].note; }
      }, sw ? null : l)));
      const note = h("p", { class: "note" }, C.CLASSES[d.cls].note);
      const name = h("input", { class: "inp", maxlength: 24, value: d.name, placeholder: "道号 · Dao name (optional)", oninput: e => { d.name = e.target.value; } });
      root.append(h("div", { class: "card q-hero" }, stage,
        existing ? null : h("p", { class: "note q-body" }, "Your training is your cultivation. Every working set you log strikes this week's boss; food days heal you; rest too long and the boss recovers.")));
      root.append(h("div", { class: "card q-setup" },
        h("h3", null, "Path"), chips(Object.keys(C.CLASSES).map(k => [k, `${C.CLASSES[k].zh} ${C.CLASSES[k].en.split(" ")[0]}`]), () => d.cls, v => d.cls = v, "Class"), note,
        h("h3", null, "Hair"), chips(C.HAIR.map(v => [v, v[0].toUpperCase() + v.slice(1)]), () => d.hair, v => d.hair = v, "Hair style"),
        chips(C.HAIR_COL.map((c, i) => [i, "Hair colour " + (i + 1), c]), () => d.hc, v => d.hc = v, "Hair colour"),
        h("h3", null, "Skin"), chips(C.SKIN.map((c, i) => [i, "Skin tone " + (i + 1), c]), () => d.skin, v => d.skin = v, "Skin tone"),
        h("h3", null, "Name"), name,
        h("button", { class: "btn primary block", style: { marginTop: "16px" }, onclick: () => { g.hero = { cls: d.cls, hair: d.hair, hc: d.hc, skin: d.skin, name: d.name.trim().slice(0, 24) }; X.save(); existing ? X.back() : X.render(true); } },
          existing ? "Save" : "Begin cultivation")));
      if (!existing) root.append(h("p", { class: "note" }, "You can change all of this later. Your path affects how you fight, not what you train."));
      return root;
    }

    /* ---------------------------------------------------- main view */
    function view() {
      const g = G();
      if (!g.hero) return viewSetup(false);
      const sum = housekeep(), spec = C.heroSpec(S(), E);
      const root = h("div", { class: "quest" });
      root.append(X.head("Quest", h("div", { class: "q-goldchip", "aria-label": `${sum.stones} spirit stones` }, ico("stone"), h("b", null, fmt(sum.stones))),
        X.iconBtn("dots", "Quest options", () => X.openMenu([["user", "Edit cultivator", () => X.push({ v: "qhero" })]]))));

      /* hero */
      const pct = Math.max(0, Math.min(1, (sum.earned - sum.lvFrom) / (sum.lvTo - sum.lvFrom)));
      const r = sum.realm, st = sum.stats, cls = C.CLASSES[sum.hero.cls];
      root.append(h("div", { class: "card q-hero" },
        h("div", { class: "q-stage q-bob", html: C.heroSVG(spec, { label: "Your cultivator" }) }),
        h("div", { class: "q-name" }, `${sum.hero.name || "Nameless cultivator"} · ${cls.zh}`),
        h("div", { class: "q-lv" }, h("b", null, `${r.zh} · Layer ${r.layer}`), h("span", null, r.en)),
        h("div", { class: "q-xp", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct * 100) }, h("i", { style: { width: (pct * 100).toFixed(1) + "%" } })),
        h("div", { class: "q-xpn" }, `修为 ${fmt(sum.earned - sum.lvFrom)} / ${fmt(sum.lvTo - sum.lvFrom)}`),
        h("div", { class: "q-stats" },
          h("div", null, ico("sword"), h("b", null, st.atk), h("span", null, "ATK")),
          h("div", null, ico("shield"), h("b", null, st.def), h("span", null, "DEF")),
          h("div", null, ico("heart"), h("b", null, st.hp), h("span", null, "HP"))),
        h("p", { class: "note q-body" }, moodNote(spec) + " " + bodyNote(spec))));

      /* boss */
      root.append(bossCard(sum.week, sum));

      /* chests */
      const n = sum.pending.length;
      const chest = h("div", { class: "card q-chests" + (n ? " has" : "") },
        h("div", { class: "q-chestrow" },
          h("div", { class: "q-chestpic" + (n ? " wiggle" : ""), html: C.chestSVG(n ? "#E2A91F" : "#9AA0A6") }),
          h("div", { class: "q-chesttxt" },
            h("b", null, n ? `${n} chest${n > 1 ? "s" : ""} waiting` : "No chests waiting"),
            h("span", null, n ? "What's inside is decided when you open it." : "Slay the weekly boss, finish a workout with 6+ sets, or nail a food day."))));
      const btns = h("div", { class: "btnrow", style: { marginTop: "12px" } });
      if (n) btns.append(h("button", { class: "btn primary", onclick: () => openChest(sum.pending[0]) }, n > 1 ? "Open one" : "Open it"));
      btns.append(h("button", { class: "btn" + (sum.stones < C.CHEST_COST ? " dim" : ""), onclick: () => buyChest() }, ico("stone", "sm"), `Buy a chest · ${C.CHEST_COST}`));
      chest.append(btns);
      root.append(chest);

      /* gear */
      root.append(X.section("Equipment"));
      const gear = h("div", { class: "card q-gear" });
      C.SLOTS.forEach(slot => {
        const it = sum.eq[slot], count = g.items.filter(i => i.slot === slot).length;
        gear.append(h("button", { class: "q-slot", onclick: () => slotSheet(slot) },
          h("div", { class: "q-slotic", style: { "--rc": it ? C.RCOL[it.r] : "var(--card3)" }, html: it ? C.heroSVG(Object.assign({}, spec, { eq: { [slot]: it }, mood: "calm" }), { focus: slot }) : "" }),
          h("div", { class: "q-slott" },
            h("span", null, `${C.SLOT_ZH[slot]} ${C.SLOT_NAME[slot]}${count ? ` · ${count}` : ""}`),
            h("b", null, it ? it.name : "Empty"),
            it && it.skill ? h("em", null, `${C.SKILLS[it.skill.k].zh} · ${C.SKILLS[it.skill.k].t(it.skill.p)}`) : null),
          h("span", { html: svg(X.I.chev), class: "q-chev" })));
      });
      root.append(gear);

      /* feats */
      const found = sum.ach.filter(Boolean).length;
      root.append(X.section(`Hidden feats · ${found} of ${C.ACH_COUNT}`));
      const fg = h("div", { class: "q-feats" });
      sum.ach.forEach((ok, i) => {
        const t = ok ? C.achText(i) : null;
        fg.append(h("div", { class: "q-feat" + (ok ? " on" : "") }, ok ? ico("flame") : ico("lock"), h("b", null, ok ? t.name : "???"), ok ? h("span", null, t.desc) : null));
      });
      root.append(h("div", { class: "card" }, fg));

      /* recent */
      if (sum.events.length) {
        root.append(X.section("Recent"));
        root.append(h("div", { class: "card q-recent" }, sum.events.slice(0, 10).map(e => h("div", { class: "q-ev" },
          h("div", null, h("b", null, e.label), h("span", null, X.dShort(e.date))),
          h("div", { class: "q-evr" }, e.chest ? ico("chest", "sm") : null, h("b", null, "+" + e.gold))))));
      }

      root.append(h("details", { class: "card q-rules" }, h("summary", null, "How it works"),
        h("ul", null,
          h("li", null, "Each week a boss appears with HP scaled to your weekly session target. Every working set you log hits it: sets with 0–1 reps left hit hardest, easy sets hit softer. Interval rounds hit too."),
          h("li", null, "Two days in a row without a session (before you've hit your target) lets the boss heal 8% and strike you. That only matters in this week's fight: at 0 HP you hit at half power until you heal. Nothing is taken from you."),
          h("li", null, "Food days heal you: most when calories and protein are both on target, a little for any logged day."),
          h("li", null, "Defeat the boss for spirit stones and a chest. Four wins in a row earn a shield that forgives one lost week."),
          h("li", null, "Workouts with 6+ sets, interval sessions, food days and weigh-ins earn stones; the best of them also drop chests."),
          h("li", null, "Gear adds attack, defence and HP, and most pieces carry a skill that rewards a habit. Your realm rises with the stones you've earned."),
          h("li", null, "Your cultivator's build follows your smoothed weight trend toward your goal; sleeve size follows your working sets over the last four weeks."))));
      return root;
    }

    function moodNote(spec) { return spec.mood === "happy" ? "Qi flowing freely after training." : spec.mood === "sleepy" ? `No session in ${spec.idle} days. Your meridians grow sluggish.` : "Calm and ready."; }
    function bodyNote(spec) {
      const goal = S().goal || {}, gp = spec.gp;
      if (!gp) return goal.mode === "maintain" ? "Maintenance: your build holds while you stay on trend." : "Set a goal weight in Strategy and your build follows your weight trend toward it.";
      const kg = v => (Math.round(v * 10) / 10).toFixed(1);
      return `Trend ${kg(gp.current)} kg · ${Math.round(gp.pct * 100)}% of the way from ${kg(gp.start)} to ${kg(gp.goal)} kg.`;
    }

    function hpBar(cur, max, cls) {
      const p = Math.max(0, Math.min(1, cur / max));
      return h("div", { class: "q-hp " + (cls || "") }, h("i", { style: { width: (p * 100).toFixed(1) + "%" } }), h("span", null, `${fmt(Math.max(0, cur))} / ${fmt(max)}`));
    }
    function bossCard(w, sum) {
      const card = h("div", { class: "card q-boss" + (w.won ? " won" : "") });
      const status = w.won ? `Defeated on ${X.dShort(w.wonOn)}.${w.flawless ? " Not a scratch on you." : ""}`
        : w.sessions >= w.target ? `Target hit but it still stands. ${fmt(w.bhp)} HP left; one more session should finish it.`
          : `${w.target - w.sessions} more session${w.target - w.sessions > 1 ? "s" : ""} this week should bring it down.`;
      card.append(
        h("div", { class: "q-bosshead" },
          h("div", { class: "q-bosspic" + (w.won ? " dead" : ""), html: C.bossSVG(w.boss) }),
          h("div", { class: "q-bossinfo" },
            h("span", null, "This week's boss"),
            h("b", null, w.boss.zh), h("em", null, w.boss.en),
            h("div", { class: "q-streak" },
              h("span", { title: "Bosses in a row" }, ico("flame"), h("b", null, sum.streak), " in a row"),
              h("span", { title: "Shields" }, ico("shield"), h("b", null, sum.shields))))),
        h("div", { class: "q-hplbl" }, "Boss"), hpBar(w.bhp, w.hp, "boss"),
        h("div", { class: "q-hplbl" }, "You"), hpBar(w.php, w.stats.hp, "you"),
        h("p", { class: "note", style: { marginBottom: 0 } }, status),
        h("div", { class: "btnrow", style: { marginTop: "12px" } }, h("button", { class: "btn sm", onclick: () => X.push({ v: "qbattle", ws: w.ws }) }, "Battle log")));
      return card;
    }

    /* ---------------------------------------------------- battle log */
    function viewBattle(top) {
      const sum = summary(), w = sum.weeks.find(x => x.ws === top.ws) || sum.week;
      const root = h("div", { class: "quest" });
      root.append(X.subhead("Battle"));
      const spec = C.heroSpec(S(), E);
      const bossPic = h("div", { class: "q-fighter boss", html: C.bossSVG(w.boss) });
      const heroPic = h("div", { class: "q-fighter hero", html: C.heroSVG(Object.assign({}, spec, { eq: Object.assign({}, spec.eq, { aura: null }) })) });
      let bBar = hpBar(w.hp, w.hp, "boss"), pBar = hpBar(w.stats.hp, w.stats.hp, "you");
      const bBox = h("div", null, bBar), pBox = h("div", null, pBar);
      const pop = h("div", { class: "q-popwrap" });
      const arena = h("div", { class: "card q-arena" },
        h("div", { class: "q-arenarow" }, heroPic, bossPic, pop),
        h("div", { class: "q-arenabars" },
          h("div", null, h("div", { class: "q-hplbl" }, sum.hero.name || "You"), pBox),
          h("div", null, h("div", { class: "q-hplbl" }, `${w.boss.zh} · ${w.boss.en}`), bBox)));
      const setBars = (b, p) => { bBox.innerHTML = ""; bBox.append(hpBar(b, w.hp, "boss")); pBox.innerHTML = ""; pBox.append(hpBar(p, w.stats.hp, "you")); };
      setBars(w.bhp, w.php);
      root.append(arena);
      const float = (txt, cls) => { const e = h("span", { class: "q-float " + cls }, txt); pop.append(e); setTimeout(() => e.remove(), 1100); };
      let playing = false;
      const replay = h("button", { class: "btn primary", onclick: async () => {
        if (playing) return; playing = true; replay.disabled = true;
        let b = w.hp, p = w.stats.hp; setBars(b, p);
        for (const d of w.days) {
          if (d.heal) { p = Math.min(w.stats.hp, p + d.heal); float("+" + d.heal, "heal"); setBars(b, p); await sleep(450); }
          for (const hit of d.hits) {
            heroPic.classList.remove("lunge"); void heroPic.offsetWidth; heroPic.classList.add("lunge");
            await sleep(220);
            bossPic.classList.remove("hurt"); void bossPic.offsetWidth; bossPic.classList.add("hurt");
            b -= hit.dmg; float("−" + fmt(hit.dmg) + (hit.crits ? " ✦" : ""), "dmg"); setBars(b, p);
            if (hit.heal) { p = Math.min(w.stats.hp, p + hit.heal); }
            await sleep(560);
          }
          if (d.bossHeal) { b = Math.min(w.hp, b + d.bossHeal); float("+" + fmt(d.bossHeal), "bheal"); setBars(b, p); await sleep(350); }
          if (d.strike) {
            bossPic.classList.remove("lunge-l"); void bossPic.offsetWidth; bossPic.classList.add("lunge-l");
            await sleep(220);
            heroPic.classList.remove("hurt"); void heroPic.offsetWidth; heroPic.classList.add("hurt");
            p = Math.max(0, p - d.strike); float("−" + d.strike, "hit"); setBars(b, p); await sleep(560);
          } else if (d.warded) { float("Blocked", "heal"); await sleep(400); }
        }
        if (w.won) bossPic.classList.add("dead");
        playing = false; replay.disabled = false;
      } }, "Replay the week");
      root.append(h("div", { class: "btnrow", style: { margin: "12px 0" } }, replay));

      const list = h("div", { class: "card q-days" });
      for (const d of w.days.slice().reverse()) {
        const lines = [];
        d.hits.forEach(x => lines.push(h("div", { class: "q-dl" }, ico("sword", "sm"), h("span", null, `${x.name} · ${x.type === "hiit" ? x.n + " rounds" : x.n + " sets"}${x.crits ? ` · ${x.crits} double strike${x.crits > 1 ? "s" : ""}` : ""}${x.ko ? " · at half power" : ""}`), h("b", null, "−" + fmt(x.dmg)))));
        if (d.heal) lines.push(h("div", { class: "q-dl heal" }, ico("heart", "sm"), h("span", null, d.food === 2 ? "Food on target" : d.food === 1 ? "Food half on target" : "Food logged"), h("b", null, "+" + d.heal)));
        if (d.bossHeal) lines.push(h("div", { class: "q-dl bad" }, ico("flame", "sm"), h("span", null, "Rested two days; the boss recovered"), h("b", null, "+" + fmt(d.bossHeal))));
        if (d.strike) lines.push(h("div", { class: "q-dl bad" }, ico("shield", "sm"), h("span", null, d.ko ? "It struck you down to 0" : "It struck you"), h("b", null, "−" + d.strike)));
        if (d.warded) lines.push(h("div", { class: "q-dl heal" }, ico("shield", "sm"), h("span", null, "Your ward blocked its strike"), h("b", null, "")));
        if (!lines.length) lines.push(h("div", { class: "q-dl quiet" }, h("span", null, "Quiet day")));
        list.append(h("div", { class: "q-day" }, h("div", { class: "q-dayh" }, X.dLong(d.d), d.d === w.wonOn ? h("em", null, "Boss defeated") : null), lines));
      }
      if (!w.days.length) list.append(h("p", { class: "note" }, "The week has just begun."));
      root.append(list);
      root.append(h("p", { class: "note" }, `Your stats this week: ATK ${w.stats.atk}, DEF ${w.stats.def}, HP ${w.stats.hp}. Boss HP is set by your target of ${w.target} sessions.`));
      return root;
    }

    /* ---------------------------------------------------- gear sheets */
    function slotSheet(slot) {
      const g = G(), spec = C.heroSpec(S(), E);
      const list = g.items.filter(i => i.slot === slot).sort((a, b) => b.r - a.r || (b.at || 0) - (a.at || 0));
      X.openSheet(sh => {
        sh.append(h("h2", { class: "q-sheeth" }, `${C.SLOT_ZH[slot]} ${C.SLOT_NAME[slot]}`));
        if (!list.length) { sh.append(h("p", { class: "note" }, "Nothing here yet. Chests can hold this kind of item.")); return; }
        const grid = h("div", { class: "q-grid" });
        list.forEach(it => {
          const on = g.eq[slot] === it.id;
          grid.append(h("button", { class: "q-tile" + (on ? " on" : ""), style: { "--rc": C.RCOL[it.r] }, "aria-label": `${it.name}, ${C.RAR[it.r]}${on ? ", equipped" : ""}`, onclick: () => itemSheet(it) },
            h("div", { class: "q-mini", html: C.heroSVG(Object.assign({}, spec, { eq: { [slot]: it }, mood: "calm" }), { focus: slot }) }), h("i", { class: "rar" })));
        });
        sh.append(grid);
      });
    }
    function statLine(it) {
      const s = it.stat || {}, bits = [];
      if (s.atk) bits.push(`ATK +${s.atk}`); if (s.def) bits.push(`DEF +${s.def}`); if (s.hp) bits.push(`HP +${s.hp}`);
      return bits.join(" · ");
    }
    function itemCard(it, spec) {
      return h("div", { class: "q-reveal done", style: { "--rc": C.RCOL[it.r] } },
        h("div", { class: "q-rar" }, `${C.RAR_ZH[it.r]} ${C.RAR[it.r]} · ${C.SLOT_NAME[it.slot]}`),
        h("div", { class: "q-stage sm", html: C.heroSVG(Object.assign({}, spec, { eq: Object.assign({}, spec.eq, { [it.slot]: it }) })) }),
        h("h2", null, it.name),
        statLine(it) ? h("div", { class: "q-statl" }, statLine(it)) : null,
        it.skill ? h("div", { class: "q-skill" }, h("b", null, C.SKILLS[it.skill.k].zh), " ", C.SKILLS[it.skill.k].t(it.skill.p)) : null,
        h("p", { class: "note" }, it.flavor));
    }
    function itemSheet(it) {
      const g = G(), on = g.eq[it.slot] === it.id, spec = C.heroSpec(S(), E);
      X.openSheet(sh => {
        sh.append(itemCard(it, spec),
          h("button", { class: "btn primary block", onclick: () => { g.eq[it.slot] = on ? null : it.id; X.save(); X.closeSheet(); X.render(false); } }, on ? "Unequip" : "Equip"));
      });
    }

    /* ---------------------------------------------------- chests */
    function buyChest() {
      const sum = summary();
      if (sum.stones < C.CHEST_COST) { X.toast(`${C.CHEST_COST - sum.stones} more spirit stones needed`); return; }
      openChest({ id: "buy:" + X.uid(), cost: C.CHEST_COST, min: 0 });
    }
    async function openChest(ev) {
      if (BUSY) return;
      const g = G();
      if (g.items.some(i => i.id === ev.id)) return;
      BUSY = true;
      const r = C.rollRarity(rand(), g.items, ev.min || 0);
      const slot = C.SLOTS[Math.floor(rand() * C.SLOTS.length)];
      const shape = Math.floor(rand() * C.SHAPES[slot].length);
      let item = C.localItem(rand, slot, shape, r);
      const box = h("div", { class: "q-reveal", style: { "--rc": C.RCOL[r] } },
        h("div", { class: "q-bigchest shake", html: C.chestSVG("#E2A91F") }), h("p", { class: "note" }, "Opening…"));
      X.openSheet(sh => sh.append(box));
      const t0 = Date.now();
      if (X.aiReady && X.aiReady()) {
        const words = C.THEME.slice().sort(() => rand() - 0.5).slice(0, 2);
        try { const txt = await withTimeout(X.aiCall("loot", C.aiPrompt(item, words), null, 400), 14000); item = C.parseItem(txt, item) || item; } catch (e) { }
      }
      item.id = ev.id; item.at = Date.now();
      if (ev.cost) item.cost = ev.cost;
      g.items.push(item); X.save();
      await sleep(Math.max(0, 1300 - (Date.now() - t0)));
      BUSY = false;
      if (!box.isConnected) { X.render(false); return; }
      const spec = C.heroSpec(S(), E), left = summary().pending;
      const card = itemCard(item, spec);
      box.replaceWith(card);
      card.prepend(h("div", { class: "q-burst" }));
      card.querySelector(".q-stage").classList.add("pop");
      card.append(h("div", { class: "btnrow", style: { justifyContent: "center", marginTop: "14px" } },
        h("button", { class: "btn primary", onclick: () => { g.eq[slot] = item.id; X.save(); X.closeSheet(); X.render(false); } }, "Equip"),
        left.length ? h("button", { class: "btn", onclick: () => { X.closeSheet(true); openChest(left[0]); } }, `Open next (${left.length})`)
          : h("button", { class: "btn", onclick: () => { X.closeSheet(); X.render(false); } }, "Keep it")));
    }

    return { view, pendingCount, screens: { qbattle: viewBattle, qhero: () => viewSetup(true) } };
  };
})(typeof self !== "undefined" ? self : globalThis);
