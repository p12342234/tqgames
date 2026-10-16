// 用貪婪機器人實測各關難度與「悠閒度」：node tools/simulate.mjs [runs] [withEvent=1|0]
// 機器人不受步數限制，量測它需要幾步過關；再用「真人每步所需秒數」換算在時間限制內的過關率。
import fs from 'node:fs';
import { buildConfig } from '../src/config.js';
import { generateLevel, mulberry32 } from '../src/levelgen.js';
import { cloneGrid, validSwaps, swapCells, resolveHeadless, shuffleGrid } from '../src/match3.js';

const runs = Number(process.argv[2] || 20);
const withEvent = process.argv[3] !== '0';
const base = JSON.parse(fs.readFileSync('config/game-config.json', 'utf8'));
const live = withEvent ? JSON.parse(fs.readFileSync('config/liveops.json', 'utf8')) : {};
const cfg = buildConfig(base, live, new Date('2026-10-16T12:00:00+08:00'));
const ctx = { pool: cfg.pool, diff: cfg.difficulty, cols: base.board.cols, rows: base.board.rows, salt: base.levelSalt };
const CAP = 150;                      // 機器人最多走幾步
const SEC = [3, 4.5, 6];              // 緊湊 / 休閒 / 慢慢想 的每步秒數

function play(lv, seed) {
  const g = cloneGrid(lv.board), rng = mulberry32(seed);
  const need = {}; lv.goals.forEach(x => (need[x.type] = x.count));
  let used = 0;
  const done = () => Object.values(need).every(v => v <= 0);
  while (used < CAP && !done()) {
    let sw = validSwaps(g);
    if (!sw.length) { shuffleGrid(g, rng, lv.types); sw = validSwaps(g); if (!sw.length) break; }
    let best = null, bs = -1;
    sw.forEach((s, i) => {
      const c = cloneGrid(g); swapCells(c, s.a, s.b);
      const r = resolveHeadless(c, mulberry32(seed * 31 + used * 7 + i), lv.types);
      let sc = r.tiles;
      for (const t in need) sc += 10 * Math.min(Math.max(need[t], 0), r.cleared[t] || 0);
      sc += rng() * 0.5;
      if (sc > bs) { bs = sc; best = s; }
    });
    swapCells(g, best.a, best.b);
    const r = resolveHeadless(g, rng, lv.types);
    for (const t in need) need[t] -= r.cleared[t] || 0;
    used++;
  }
  return { win: done(), used };
}

const levels = (process.argv[4] ? process.argv[4].split(',').map(Number)
  : [1, 2, 3, 5, 8, 10, 11, 15, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100, 150, 200, 500]);
console.log(`pool=${cfg.pool.length} 種 (${withEvent ? '含活動' : '僅核心'})，每關機器人 ${runs} 次；時間含活動加秒 +${cfg.extraSeconds}s`);
console.log('關卡 | 色數 目標                    | par 時間s | bot平均步 | 過關率 @3s/步 @4.5s/步 @6s/步 (真人每步秒數)');
for (const L of levels) {
  const lv = generateLevel(L, ctx);
  const T = lv.time + cfg.extraSeconds;
  const res = Array.from({ length: runs }, (_, i) => play(lv, L * 1000 + i));
  const avg = res.reduce((s, r) => s + r.used, 0) / runs;
  const rate = sec => (100 * res.filter(r => r.win && r.used * sec <= T).length / runs).toFixed(0).padStart(3) + '%';
  const goalStr = lv.goals.map(g => `${g.type}x${g.count}`).join(',');
  console.log(
    String(L).padStart(4) + (lv.boss ? '*' : ' ') + '| ' + String(lv.stats.k).padStart(3) + '  ' + goalStr.padEnd(26) +
    '| ' + String(lv.par).padStart(3) + ' ' + String(T).padStart(4) + '   | ' + avg.toFixed(1).padStart(6) +
    '    |        ' + SEC.map(rate).join('     ')
  );
}
