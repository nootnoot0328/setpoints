/* Run with:  node test/quest.test.js */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const E = require("../js/engine.js");
const Q = require("../js/quest.js");
const Y = require("../js/sync.js");

const TD = "2026-09-30";   // a Wednesday; this week starts Mon 2026-09-28
const LAST = "2026-09-21"; // last week, closed by TD
function blank() {
  return {
    v: 2, profile: { sex: "m", age: 35, heightCm: 172, activity: 1.45 },
    goal: { mode: "loss", ratePct: 0.6, goalWeight: 72, startWeight: 88, startDate: "2026-09-01", proteinMode: "lbm", proteinPerKg: 2.2, fatPerKg: 0.8, weekendPct: 0 },
    settings: { kcalPerKg: 7700, alpha: 0.25, theme: "dark", demo: false, estimator: "kalman", rho: "auto" },
    weights: {}, intake: {}, fasted: {}, custom: [], meals: [], health: {}, meta: { u: {}, tomb: {} },
    program: { checkins: [] }, train: { profile: { days: 3 }, plan: null, log: [], active: null },
    game: { start: "2026-09-21", hero: { cls: "sword", name: "" }, eq: {}, ach: {}, fights: {}, items: [] }
  };
}
const lift = (id, date, n, rir, extra) => Object.assign({ id, type: "lift", date, name: "Full Body A", dur: 45,
  ex: [{ ex: "x", sets: Array.from({ length: n }, () => ({ w: 20, reps: 10, rir: rir == null ? 2 : rir, done: true })) }] }, extra || {});
const food = (kcal, p) => [{ id: "f" + kcal, name: "meal", kcal, p, f: 50, c: 200, qty: 1, t: "12:00" }];
const steps = (S, d, n) => { S.health[d] = { steps: n }; };

let pass = 0;
const test = (n, f) => { try { f(); pass++; console.log("  ok  " + n); } catch (e) { console.error("  FAIL " + n + "\n       " + (e.stack || e.message)); process.exit(1); } };

console.log("Setpoint quest");

test("steps: goal met beats that day's monster; missed escapes; no data stays open", () => {
  const S = blank();
  steps(S, "2026-09-28", 9000); steps(S, "2026-09-29", 4000);
  const st = Q.weekStops(S, E, "2026-09-28", TD);
  assert.ok(st[0].met && !st[0].missed);
  assert.ok(st[1].missed && !st[1].met);
  assert.ok(st[2].today && !st[2].met && !st[2].pending);
  assert.ok(st[3].future);
  assert.strictEqual(st[6].kind, "boss");
  const S2 = blank(); steps(S2, "2026-09-28", null);
  delete S2.health["2026-09-28"];
  assert.ok(Q.weekStops(S2, E, "2026-09-28", TD)[0].pending);
});

test("the step goal setting is respected and clamped", () => {
  const S = blank(); steps(S, "2026-09-28", 9000);
  S.game.stepGoal = 10000;
  assert.ok(Q.weekStops(S, E, "2026-09-28", TD)[0].missed);
  S.game.stepGoal = 50;
  assert.strictEqual(Q.stepGoal(S), 1000);
});

test("today's monster can be beaten as soon as today's steps reach the goal", () => {
  const S = blank(); steps(S, TD, 8500);
  const ev = Q.baseEvents(S, E, TD).list;
  assert.ok(ev.find(e => e.id === "m:" + TD && e.kind === "mob"));
});

test("monsters are six different ones per week, stable for the same week", () => {
  const a = Q.mobsForWeek("2026-09-28"), b = Q.mobsForWeek("2026-09-28");
  assert.deepStrictEqual(a, b);
  assert.strictEqual(new Set(a).size, 6);
});

test("workouts with 6+ done sets earn gold and a chest; fewer earn gold only", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 8), lift("b", "2026-09-28", 3));
  const ev = Q.baseEvents(S, E, TD).list;
  assert.ok(ev.find(e => e.id === "t:a").chest);
  assert.ok(!ev.find(e => e.id === "t:b").chest);
});

test("food days pay even off target; today doesn't count yet", () => {
  const S = blank();
  S.weights["2026-09-22"] = { kg: 88 };
  const tg = E.targetsFor(S, "2026-09-25");
  S.intake["2026-09-25"] = food(tg.kcal, tg.p); S.intake["2026-09-26"] = food(tg.kcal * 1.6, 20); S.intake[TD] = food(tg.kcal, tg.p);
  const ev = Q.baseEvents(S, E, TD).list;
  assert.strictEqual(ev.find(e => e.id === "n:2026-09-25").gold, 25);
  assert.strictEqual(ev.find(e => e.id === "n:2026-09-26").gold, 3);
  assert.ok(!ev.find(e => e.id === "n:" + TD));
});

test("the boss only falls on Sunday, even if its HP hits 0 earlier", () => {
  const S = blank();
  ["2026-09-28", "2026-09-29"].forEach((d, i) => S.train.log.push(lift("w" + i, d, 30, 0)));
  const mid = Q.battle(S, E, "2026-09-28", TD, 1, {});
  assert.ok(mid.broken && !mid.won, "broken mid-week but not yet won");
  const sun = Q.battle(S, E, "2026-09-28", "2026-10-04", 1, {});
  assert.ok(sun.won && sun.wonOn === "2026-10-04");
});

test("hitting the weekly target with a normal plan beats last week's boss", () => {
  const S = blank();
  ["2026-09-21", "2026-09-23", "2026-09-25"].forEach((d, i) => S.train.log.push(lift("w" + i, d, 16)));
  const b = Q.battle(S, E, LAST, TD, 1, {});
  assert.ok(b.won, `dealt ${b.dmg} of ${b.hp}`);
  assert.strictEqual(b.wonOn, "2026-09-27");
  const sum = Q.summary(S, E, TD);
  const ev = sum.events.find(e => e.id === "b:" + LAST);
  assert.ok(ev && ev.chest && ev.min === 1);
});

test("monsters beaten add rally damage to later sessions", () => {
  const S1 = blank(), S2 = blank();
  for (const S of [S1, S2]) S.train.log.push(lift("a", "2026-09-24", 12));
  ["2026-09-21", "2026-09-22", "2026-09-23"].forEach(d => steps(S2, d, 9000));
  const a = Q.battle(S1, E, LAST, TD, 1, {}), b = Q.battle(S2, E, LAST, TD, 1, {});
  assert.strictEqual(b.beaten, 3);
  assert.ok(Math.abs(b.dmg / a.dmg - 1.15) < 0.02, `${b.dmg} vs ${a.dmg}`);
});

test("one light session doesn't beat it; hard sets hit harder than easy ones", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-21", 16));
  assert.ok(!Q.battle(S, E, LAST, TD, 1, {}).won);
  const S1 = blank(), S2 = blank();
  S1.train.log.push(lift("a", "2026-09-21", 10, 1)); S2.train.log.push(lift("a", "2026-09-21", 10, 4));
  assert.ok(Q.battle(S1, E, LAST, TD, 1, {}).dmg > Q.battle(S2, E, LAST, TD, 1, {}).dmg * 1.5);
});

test("soft penalty: two idle days let the boss heal and strike, only before the target is met", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-21", 16));
  const b = Q.battle(S, E, LAST, TD, 1, {});
  assert.ok(b.days.some(d => d.strike > 0) && b.days.some(d => d.bossHeal > 0));
  const S2 = blank();
  ["2026-09-21", "2026-09-22", "2026-09-23"].forEach((d, i) => S2.train.log.push(lift("w" + i, d, 16)));
  assert.ok(!Q.battle(S2, E, LAST, TD, 1, {}).days.some(d => d.strike > 0));
});

test("no penalties for days before you started Quest, and boss healing is only logged when it heals", () => {
  const S = blank(); S.game.start = TD;          // started Wednesday; Mon and Tue were idle
  const b = Q.battle(S, E, "2026-09-28", TD, 1, {});
  assert.ok(!b.days.some(d => d.strike || d.bossHeal), "Mon/Tue before the start must not count");
  const S2 = blank(); S2.game.start = "2026-09-01";
  const b2 = Q.battle(S2, E, "2026-09-28", TD, 1, {});
  assert.ok(b2.days.some(d => d.strike > 0));
  assert.ok(b2.days.every(d => d.bossHeal === 0), "a boss at full HP can't recover");
});

test("this week's fight uses your current level, matching the hero card", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-22", 24), lift("b", "2026-09-24", 24), lift("c", "2026-09-26", 24), lift("d", "2026-09-29", 10));
  const sum = Q.summary(S, E, TD);
  assert.strictEqual(sum.week.stats.hp, sum.stats.hp);
});

test("gear stats and skills change the fight", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-28", 12, 1, { at: new Date("2026-09-28T07:30:00").getTime() }));
  const plain = Q.battle(S, E, "2026-09-28", TD, 1, {}).dmg;
  const sword = { id: "i1", slot: "weapon", r: 3, stat: { atk: 16, def: 0, hp: 0 }, skill: { k: "dawn", p: 60 } };
  assert.ok(Q.battle(S, E, "2026-09-28", TD, 1, { weapon: sword }).dmg > plain * 2);
  const ward = { id: "i2", slot: "boots", r: 1, stat: { atk: 1, def: 1, hp: 5 }, skill: { k: "ward", p: 1 } };
  const S2 = blank(); S2.train.log.push(lift("a", "2026-09-21", 16));
  assert.ok(Q.battle(S2, E, LAST, TD, 1, { boots: ward }).days.some(d => d.warded));
});

test("finished fights stay frozen", () => {
  const S = blank();
  ["2026-09-21", "2026-09-23", "2026-09-25"].forEach((d, i) => S.train.log.push(lift("w" + i, d, 16)));
  S.game.fights[LAST] = { won: false, on: null, lv: 1, flawless: false, eq: {} };
  const sum = Q.summary(S, E, TD);
  assert.ok(sum.weeks.find(x => x.ws === LAST).frozen);
  assert.ok(!sum.events.find(e => e.id === "b:" + LAST));
});

test("gold = earned − spent; opened chests stop being pending; starter items don't count toward pity", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 8));
  assert.ok(Q.summary(S, E, TD).pending.some(e => e.id === "t:a"));
  S.game.items.push(...Q.STARTER.map(x => Object.assign({}, x)));
  S.game.items.push(Object.assign(Q.localItem(Q.seeded(.1), "weapon", 0, 0), { id: "t:a", at: 1 }));
  S.game.items.push(Object.assign(Q.localItem(Q.seeded(.2), "helm", 1, 0), { id: "buy:x", at: 2, cost: 250 }));
  const s = Q.summary(S, E, TD);
  assert.ok(!s.pending.some(e => e.id === "t:a"));
  assert.strictEqual(s.gold, s.earned - 250);
  assert.strictEqual(Q.pityOf(S.game.items).rare, 2);
});

test("ranks follow the level", () => {
  assert.deepStrictEqual([Q.rankOf(1).en, Q.rankOf(1).tier], ["Novice", 1]);
  assert.deepStrictEqual([Q.rankOf(6).en, Q.rankOf(6).tier], ["Squire", 1]);
  assert.strictEqual(Q.rankOf(500).en, "Ascendant");
});

test("rarity rolls follow the odds and the pity timers", () => {
  assert.strictEqual(Q.rollRarity(0.1, [], 0), 0);
  assert.strictEqual(Q.rollRarity(0.99999, [], 0), 4);
  assert.strictEqual(Q.rollRarity(0.1, [], 1), 1);
  const dud = n => Array.from({ length: n }, (_, i) => ({ r: 0, at: i }));
  assert.strictEqual(Q.rollRarity(0.1, dud(6), 0), 2);
  const mixed = dud(39).map((x, i) => i % 5 === 0 ? { r: 2, at: i } : x);
  assert.strictEqual(Q.rollRarity(0.1, mixed, 0), 4);
});

test("items: stats by slot, skills from Uncommon up, AI can only rename", () => {
  const rnd = Q.seeded(0.77);
  for (const slot of Q.SLOTS) for (let sh = 0; sh < 4; sh++) for (let r = 0; r < 5; r++) {
    const it = Q.localItem(rnd, slot, sh, r);
    assert.ok(it.name.includes(Q.NOUN[slot][sh]));
    if (r === 0) assert.strictEqual(it.skill, null); else assert.ok(Q.SKILLS[it.skill.k] && it.skill.p > 0);
  }
  const base = Q.localItem(Q.seeded(0.3), "weapon", 0, 2);
  const ai = Q.parseItem('ok {"name":"Frostbitten Sword","flavor":"Cold.","stat":{"atk":999}}', base);
  assert.strictEqual(ai.name, "Frostbitten Sword");
  assert.deepStrictEqual(ai.stat, base.stat);
  assert.strictEqual(Q.parseItem("nope", base), null);
  assert.ok(!/[<>]/.test(Q.parseItem('{"name":"<b>x</b>"}', base).name));
});

test("older items migrate to the new slots", () => {
  const v2 = { id: "t:z", v: 2, slot: "robe", shape: 5, r: 2, name: "星河鹤氅 · Star River Crane Mantle", skill: { k: "heavy", p: 15 }, at: 5 };
  const m = Q.migrateItem(v2);
  assert.strictEqual(m.v, 3); assert.strictEqual(m.slot, "armor"); assert.ok(m.shape < 4);
  assert.strictEqual(m.name, "Star River Crane Mantle");
  assert.deepStrictEqual(m.skill, { k: "heavy", p: 15 });
  assert.ok(m.stat.def > 0);
  assert.strictEqual(Q.migrateItem(m), m);
  assert.strictEqual(Q.migrateItem({ id: "x", slot: "bg", r: 1 }).slot, "boots");
});

test("every art file the game can ask for exists", () => {
  const files = new Set();
  for (const slot of Q.SLOTS) for (let sh = 0; sh < 4; sh++) {
    files.add(Q.iconOf({ slot, shape: sh }));
    for (const cls of Object.keys(Q.CLASSES))
      Q.heroLayers({ [slot]: { slot, shape: sh } }, null, cls).forEach(l => { files.add(l.src); if (l.mask) files.add(l.mask); });
  }
  for (const hair of Q.HAIRS) for (const hc of Object.keys(Q.HAIR_COLORS)) for (const helm of [true, false])
    Q.heroLayers({}, { hair, hc, helm }).forEach(l => { files.add(l.src); if (l.mask) files.add(l.mask); });
  Object.keys(Q.MOBS).forEach(m => files.add(Q.art(m)));
  ["bg-forest", "platform", "platform-boss", "flag", "signpost"].forEach(k => files.add(Q.art(k)));
  for (let w = 0; w < 20; w++) files.add(Q.art(Q.bossFor(E.addDays("2026-01-05", w * 7), 1, 3).art));
  for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, "..", f)), "missing " + f);
});

test("hero look: hair shows under any helmet, class sets the outfit, armour and boots override", () => {
  const keys = ls => ls.map(l => l.src.split("/").pop());
  // Warrior, nothing but starter gear: chainmail, the helmet over the hair, hair masked under the brim
  const plain = Q.heroLayers({}, null, "sword");
  assert.deepStrictEqual(keys(plain), ["hero-cape.webp", "hero-body-chain.webp", "hero-boots.webp", "hero-wpn-sword.webp", "hero-hand.webp",
    "hero-face.webp", "hero-blink-face.webp", "hero-hair-short-brown.webp", "hero-helm-kettle.webp"]);
  assert.ok(plain.find(l => l.k === "hr").mask.endsWith("hero-hairmask-kettle.webp"));
  // circlet sits on the hair: no mask
  assert.ok(!Q.heroLayers({ helm: { slot: "helm", shape: 3 } }, null, "sword").find(l => l.k === "hr").mask);
  // class outfits
  assert.ok(keys(Q.heroLayers({}, null, "body")).includes("hero-body-plate.webp"));
  assert.ok(keys(Q.heroLayers({}, null, "alch")).includes("hero-body.webp"));
  const mage = keys(Q.heroLayers({}, null, "spell"));
  assert.ok(mage.includes("hero-body-robe.webp") && mage.includes("hero-hem-robe.webp") && !mage.includes("hero-cape.webp"));
  // equipped armour beats the class outfit; helmet hidden drops the helm and the mask
  const robe = Q.heroLayers({ armor: { slot: "armor", shape: 3 }, boots: { slot: "boots", shape: 2 } }, { helm: false, hair: "twin", hc: "teal" }, "body");
  assert.deepStrictEqual(keys(robe), ["hero-body-robe.webp", "hero-boots-winged.webp", "hero-hem-robe.webp", "hero-wpn-sword.webp", "hero-hand.webp",
    "hero-face.webp", "hero-blink-face.webp", "hero-hair-twin-teal.webp"]);
  assert.ok(!robe.some(l => l.mask));
  assert.deepStrictEqual(keys(Q.heroLayers({ armor: { slot: "armor", shape: 0 } }, null, "spell")).slice(0, 2), ["hero-cape.webp", "hero-body-leather.webp"]);
  assert.deepStrictEqual(Q.lookOf({ hair: "mohawk", hc: "pink", helm: 0 }), { hair: "short", hc: "brown", helm: true });
  const S = { game: { hero: { cls: "spell", name: "Stan", look: { hair: "long", hc: "ash", helm: false } } } };
  assert.deepStrictEqual(Q.heroOf(S).look, { hair: "long", hc: "ash", helm: false });
  assert.deepStrictEqual(Q.heroOf({ game: { hero: { cls: "spell" } } }).look, { hair: "short", hc: "brown", helm: true });
});

test("rarity picks its own drawing once it ships, never a tint", () => {
  const it = { slot: "weapon", shape: 0, r: 4 };
  assert.strictEqual(Q.artKey("weapon", it), "sword");             // not shipped yet: Common drawing
  Q.TIERED.add("weapon:sword:4");
  try {
    assert.strictEqual(Q.artKey("weapon", it), "sword-r4");
    assert.ok(Q.iconOf(it).endsWith("w-sword-r4.webp"));
    assert.ok(Q.heroLayers({ weapon: it }).some(l => l.src.endsWith("hero-wpn-sword-r4.webp")));
    assert.strictEqual(Q.artKey("weapon", { shape: 0, r: 0 }), "sword");
  } finally { Q.TIERED.delete("weapon:sword:4"); }
  const robe = Q.heroLayers({ armor: { slot: "armor", shape: 3, r: 2 } });
  assert.ok(!robe.some(l => l.k === "cape"));
});

test("every shipped tier drawing exists, with its doll layers", () => {
  const PRE = { weapon: ["w-", "hero-wpn-"], helm: ["h-", "hero-helm-"], armor: ["a-", "hero-body-"], boots: ["b-", "hero-boots-"] };
  for (const t of Q.TIERED) {
    const [slot, shape, r] = t.split(":");
    const files = PRE[slot].map(p => `${p}${shape}-r${r}`);
    if (shape === "robe") files.push(`hero-hem-robe-r${r}`);
    if (slot === "helm" && Q.HAIR_MASKED.has(shape)) files.push(`hero-hairmask-${shape}-r${r}`);
    for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, "..", Q.art(f))), "missing " + f);
  }
});

test("the service worker's art cache is named after the current art", () => {
  const { artHash } = require("../tools/art-hash.js");
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.ok(sw.includes(`"setpoint-art-${artHash()}"`), "art changed: set ART in sw.js to setpoint-art-" + artHash());
});

test("the route passes through every stop in order", () => {
  const R = Q.buildRoute(Q.STOPS_XY);
  assert.strictEqual(R.at.length, 7);
  for (let i = 1; i < 7; i++) assert.ok(R.at[i] > R.at[i - 1]);
  Q.STOPS_XY.forEach(([x, y], i) => { const p = R.pointAt(R.at[i]); assert.ok(Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01, `stop ${i}`); });
});

test("hidden feats unlock and pay once", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 25));
  for (let i = 0; i < 7; i++) steps(S, E.addDays("2026-09-23", i), 9000);
  const sum = Q.summary(S, E, TD);
  assert.ok(sum.ach[0] && sum.ach[14] && sum.ach[16], "first lift, 25 sets, 7-day step run");
  const feats = sum.events.filter(e => e.kind === "feat");
  assert.strictEqual(new Set(feats.map(e => e.id)).size, feats.length);
  assert.strictEqual(Q.ACH_COUNT, 18);
});

test("quest items, hero, fights and step goal sync as records", () => {
  const S = blank();
  S.game.items.push({ id: "t:a", v: 3, slot: "boots", shape: 3, r: 2, at: 5 });
  S.game.eq = { boots: "t:a" }; S.game.fights = { [LAST]: { won: true, on: "2026-09-27", lv: 2 } }; S.game.stepGoal = 10000;
  const back = Y.unflatten(Y.flatten(S), S);
  assert.deepStrictEqual(back.game.items, S.game.items);
  assert.deepStrictEqual(back.game.hero, S.game.hero);
  assert.deepStrictEqual(back.game.fights, S.game.fights);
  assert.strictEqual(back.game.stepGoal, 10000);
  const L = blank(), R = blank(), now = Date.now();
  L.game.items.push({ id: "t:x", slot: "helm", r: 0, at: 1 }); L.meta.u["g|t:x"] = now;
  R.game.items.push({ id: "t:y", slot: "armor", r: 1, at: 2 }); R.meta.u["g|t:y"] = now;
  assert.deepStrictEqual(Y.merge(L, R).game.items.map(i => i.id).sort(), ["t:x", "t:y"]);
});

test("Apple Health steps keep the day's highest count and when it arrived", () => {
  const S = blank();
  Y.applyHealth(S, [{ date: TD, steps: 3000, at: "2026-09-30T01:00:00Z" }, { date: TD, steps: 1200, at: "2026-09-30T00:00:00Z" }]);
  assert.strictEqual(S.health[TD].steps, 3000);
  assert.strictEqual(S.health[TD].stepsAt, "2026-09-30T01:00:00Z");
});

console.log(`\n${pass} passed`);
