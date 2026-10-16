// 產生 1–100 關設計表：node tools/level-table.mjs > docs/levels-1-100.md
import fs from 'node:fs';
import { buildConfig } from '../src/config.js';
import { generateLevel } from '../src/levelgen.js';

const base = JSON.parse(fs.readFileSync('config/game-config.json', 'utf8'));
const cfg = buildConfig(base, {}, new Date());          // 只算核心 6 種商品，不含活動
const ctx = { pool: cfg.pool, diff: cfg.difficulty, cols: base.board.cols, rows: base.board.rows, salt: base.levelSalt };
const name = id => cfg.tileMap[id].name;
const stage = L => (L <= 10 ? '入門' : L <= 30 ? '熟悉' : L <= 60 ? '進階' : '挑戰');

const out = [];
out.push('# 第 1–100 關設計表（核心 6 種商品、無活動加成）\n');
out.push('時間為基礎秒數；活動期間另加秒數，連鎖會再加時，連續失敗同一關會自動多給 15%（最多 4 次）。\n');
out.push('| 關卡 | 階段 | 類型 | 上場商品數 | 過關目標 | 最少消除次數 | 時間(秒) |');
out.push('|---:|---|---|---:|---|---:|---:|');
for (let L = 1; L <= 100; L++) {
  const lv = generateLevel(L, ctx);
  const kind = lv.boss ? 'BOSS' : lv.rest ? '喘息' : '一般';
  out.push(`| ${L} | ${stage(L)} | ${kind} | ${lv.stats.k} | ${lv.goals.map(g => name(g.type) + '×' + g.count).join('、')} | ${lv.par} | ${lv.time} |`);
}
console.log(out.join('\n'));
