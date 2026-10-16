import { findMatches } from './match3.js';

/* ───────── 基礎工具 ───────── */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(...n) {
  let h = 2166136261;
  for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const lerp = (a, b, t) => a + (b - a) * t;

/* ───────── 組合數 (Combinations) ───────── */
export function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
/** combinadic：把整數 idx 轉成 {0..n-1} 的第 idx 個 k 子集（字典序）。 */
export function unrank(n, k, idx) {
  const res = [];
  let x = 0;
  for (let i = 0; i < k; i++) {
    for (;; x++) {
      const c = binom(n - x - 1, k - i - 1);
      if (idx < c) { res.push(x); x++; break; }
      idx -= c;
    }
  }
  return res;
}

/* ───────── 難度曲線 ───────── */
export function difficultyCurve(L, d) {
  const t = 1 - Math.pow(0.5, (L - 1) / d.halfLife);          // 0 → 1 漸近
  const boss = L % d.bossEvery === 0;
  const rest = L > 1 && L % d.bossEvery === 1;                  // BOSS 後的喘息關
  let slack = lerp(d.slackStart, d.slackEnd, t);
  if (boss) slack *= 1 - d.bossSlackCut;
  if (rest) slack *= 1 + d.restSlackBonus;
  const colors = Math.min(d.maxColors, d.baseColors + Math.floor((L - 1) / d.colorEvery));
  const goalTypes = Math.min(d.maxGoalTypes, 1 + Math.floor((L - 1) / d.goalTypeEvery));
  let total = Math.min(d.goalMax, Math.round(d.goalBase + d.goalGrowth * Math.pow(L, d.goalPower)));
  if (boss) total = Math.round(total * d.bossGoalMul);
  return { t, boss, rest, slack, colors, goalTypes, total };
}

/* ───────── 倒推法用的「預埋解法」模板 ─────────
 * 每個模板佔 2x3 格：pair=已並排的兩個目標、feeder=待移入的第三個目標、blocker=與 feeder 交換的位置。
 * 交換 blocker<->feeder 即完成一次 match-3。轉置後得到 3x2 版本。 */
const PATTERNS = [
  { pair: [[0, 0], [0, 1]], feeder: [1, 2], blocker: [0, 2] },
  { pair: [[0, 1], [0, 2]], feeder: [1, 0], blocker: [0, 0] },
  { pair: [[1, 0], [1, 1]], feeder: [0, 2], blocker: [1, 2] },
  { pair: [[1, 1], [1, 2]], feeder: [0, 0], blocker: [1, 0] },
];
function orient(p, transpose) {
  const f = ([r, c]) => (transpose ? [c, r] : [r, c]);
  return {
    pair: p.pair.map(f), feeder: f(p.feeder), blocker: f(p.blocker),
    h: transpose ? 3 : 2, w: transpose ? 2 : 3,
  };
}

/**
 * 產生第 L 關。
 *  1. 組合數：從 N 種商品中以 combinadic 挑出 k 種上場；再從 k 種中挑 m 種當目標。
 *  2. 倒推法：目標數 → 至少需要幾次 match-3 (par) → 預埋 par 個「一步可完成」的解法 → 步數 = par × slack。
 *  3. 其餘格以 seeded RNG 填入且不產生現成消除，並驗證。
 */
export function generateLevel(L, ctx) {
  const d = ctx.diff, cols = ctx.cols, rows = ctx.rows, pool = ctx.pool, N = pool.length;
  const salt = ctx.salt | 0;
  const cur = difficultyCurve(L, d);
  const k = Math.max(3, Math.min(cur.colors, N));
  const rng0 = mulberry32(hash(L, salt, N, k));

  const comboCount = binom(N, k);
  const comboIdx = Math.floor(rng0() * comboCount);
  const types = unrank(N, k, comboIdx).map(i => pool[i]);

  const m = Math.max(1, Math.min(cur.goalTypes, k));
  const goalCombos = binom(k, m);
  const goalIdx = Math.floor(rng0() * goalCombos);
  const goalTypes = unrank(k, m, goalIdx).map(i => types[i]);

  // ── 倒推：目標 → par → 預埋解法 ──
  const per = Math.ceil(cur.total / m);
  const goals = goalTypes.map(t => ({ type: t, count: per }));
  const par = goals.reduce((s, g) => s + Math.ceil(g.count / 3), 0);
  const moves = Math.max(par + 2, Math.ceil(par * cur.slack));

  const queue = [];
  const need = goals.map(g => Math.ceil(g.count / 3));
  for (let more = true; more;) {
    more = false;
    goals.forEach((g, i) => { if (need[i] > 0) { queue.push(g.type); need[i]--; more = true; } });
  }
  const planned = Math.min(par, d.maxPlanted, queue.length);

  for (let attempt = 0; attempt < 80; attempt++) {
    const rng = mulberry32(hash(L, attempt, salt, 99));
    const g = Array.from({ length: rows }, () => Array(cols).fill(null));
    const occ = Array.from({ length: rows }, () => Array(cols).fill(false));
    const solution = [];
    let placed = 0;

    for (let i = 0; i < planned; i++) {
      const T = queue[i];
      const nonT = types.filter(t => t !== T);
      for (let tries = 0; tries < 200; tries++) {
        const pat = orient(PATTERNS[Math.floor(rng() * 4)], rng() < 0.5);
        const r0 = Math.floor(rng() * (rows - pat.h + 1));
        const c0 = Math.floor(rng() * (cols - pat.w + 1));
        let free = true;
        for (let r = 0; r < pat.h && free; r++) for (let c = 0; c < pat.w; c++) if (occ[r0 + r][c0 + c]) { free = false; break; }
        if (!free) continue;
        for (let r = 0; r < pat.h; r++) for (let c = 0; c < pat.w; c++) {
          occ[r0 + r][c0 + c] = true;
          g[r0 + r][c0 + c] = nonT[Math.floor(rng() * nonT.length)];
        }
        for (const [r, c] of [...pat.pair, pat.feeder]) g[r0 + r][c0 + c] = T;
        solution.push({
          a: { r: r0 + pat.blocker[0], c: c0 + pat.blocker[1] },
          b: { r: r0 + pat.feeder[0], c: c0 + pat.feeder[1] },
        });
        placed++;
        break;
      }
    }
    // 由上而下解，才不會被重力破壞尚未解的預埋圖樣
    solution.sort((x, y) => Math.min(x.a.r, x.b.r) - Math.min(y.a.r, y.b.r));

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (g[r][c] != null) continue;
      const bad = new Set();
      if (c >= 2 && g[r][c - 1] === g[r][c - 2]) bad.add(g[r][c - 1]);
      if (r >= 2 && g[r - 1][c] === g[r - 2][c]) bad.add(g[r - 1][c]);
      const opts = types.filter(t => !bad.has(t));
      g[r][c] = opts[Math.floor(rng() * opts.length)];
    }
    if (findMatches(g).size === 0 && placed >= 1) {
      return {
        level: L, types, goals, moves, par, planted: placed, solution,
        board: g, boss: cur.boss, rest: cur.rest, attempt,
        stats: { N, k, m, comboCount, goalCombos, comboIdx, goalIdx, slack: cur.slack },
      };
    }
  }
  throw new Error('generateLevel failed for level ' + L);
}
