// 用貪婪機器人實測各關難度：node tools/simulate.mjs [runs] [withEvent=1|0]
import fs from 'node:fs';
import { buildConfig } from '../src/config.js';
import { generateLevel, mulberry32, difficultyCurve } from '../src/levelgen.js';
import { cloneGrid, validSwaps, swapCells, resolveHeadless, shuffleGrid } from '../src/match3.js';

const runs = Number(process.argv[2] || 20);
const withEvent = process.argv[3] !== '0';
const base = JSON.parse(fs.readFileSync('config/game-config.json', 'utf8'));
const live = withEvent ? JSON.parse(fs.readFileSync('config/liveops.json', 'utf8')) : {};
const cfg = buildConfig(base, live, new Date('2026-10-16T12:00:00+08:00'));
const ctx = { pool: cfg.pool, diff: cfg.difficulty, cols: base.board.cols, rows: base.board.rows, salt: base.levelSalt };

function play(lv, seed) {
  const g = cloneGrid(lv.board), rng = mulberry32(seed);
  const need = {}; lv.goals.forEach(x => (need[x.type] = x.count));
  let moves = lv.moves + cfg.extraMoves, used = 0;
  const done = () => Object.values(need).every(v => v <= 0);
  while (moves > 0 && !done()) {
    let sw = validSwaps(g);
    if (!sw.length) { shuffleGrid(g, rng, lv.types); sw = validSwaps(g); if (!sw.length) break; }
    let best = null, bs = -1;
    sw.forEach((s, i) => {
      const c = cloneGrid(g); swapCells(c, s.a, s.b);
      const r = resolveHeadless(c, mulberry32(seed * 31 + moves * 7 + i), lv.types);
      let sc = r.tiles;
      for (const t in need) sc += 10 * Math.min(Math.max(need[t], 0), r.cleared[t] || 0);
      sc += rng() * 0.5;
      if (sc > bs) { bs = sc; best = s; }
    });
    swapCells(g, best.a, best.b);
    const r = resolveHeadless(g, rng, lv.types);
    for (const t in need) need[t] -= r.cleared[t] || 0;
    moves--; used++;
  }
  return { win: done(), left: moves };
}

const levels = [1, 2, 3, 5, 8, 10, 11, 15, 20, 30, 40, 50, 75, 100, 150, 200, 500, 1000];
console.log(`pool=${cfg.pool.length} 種 (${withEvent ? '含活動' : '僅核心'})，每關機器人 ${runs} 次`);
console.log('關卡 | 色數 目標 | par 預埋 步數 | C(N,k)  | 機器人勝率 剩餘步數');
for (const L of levels) {
  const lv = generateLevel(L, ctx);
  let w = 0, left = 0;
  for (let i = 0; i < runs; i++) { const r = play(lv, L * 1000 + i); if (r.win) { w++; left += r.left; } }
  const goalStr = lv.goals.map(g => `${g.type}x${g.count}`).join(',');
  console.log(
    String(L).padStart(4) + (lv.boss ? '*' : ' ') + '| ' + String(lv.stats.k).padStart(3) + '  ' + goalStr.padEnd(26) +
    '| ' + String(lv.par).padStart(3) + ' ' + String(lv.planted).padStart(3) + ' ' + String(lv.moves + cfg.extraMoves).padStart(4) +
    ' | ' + String(lv.stats.comboCount).padStart(5) + '   | ' + (100 * w / runs).toFixed(0).padStart(3) + '%  ' + (w ? (left / w).toFixed(1) : '-')
  );
}
