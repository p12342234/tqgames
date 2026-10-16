export const cloneGrid = g => g.map(r => r.slice());

/** 回傳所有位於 >=3 連線上的格子索引 (r*cols+c)。 */
export function findMatches(g) {
  const R = g.length, C = g[0].length, out = new Set();
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      const t = g[r][c];
      if (t == null) { c++; continue; }
      let e = c;
      while (e + 1 < C && g[r][e + 1] === t) e++;
      if (e - c >= 2) for (let k = c; k <= e; k++) out.add(r * C + k);
      c = e + 1;
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      const t = g[r][c];
      if (t == null) { r++; continue; }
      let e = r;
      while (e + 1 < R && g[e + 1][c] === t) e++;
      if (e - r >= 2) for (let k = r; k <= e; k++) out.add(k * C + c);
      r = e + 1;
    }
  }
  return out;
}

export function swapCells(g, a, b) {
  const t = g[a.r][a.c];
  g[a.r][a.c] = g[b.r][b.c];
  g[b.r][b.c] = t;
}

/** 所有「交換後會產生消除」的相鄰交換。 */
export function validSwaps(g) {
  const R = g.length, C = g[0].length, res = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= R || c2 >= C || g[r][c] === g[r2][c2]) continue;
        const a = { r, c }, b = { r: r2, c: c2 };
        swapCells(g, a, b);
        const ok = findMatches(g).size > 0;
        swapCells(g, a, b);
        if (ok) res.push({ a, b });
      }
    }
  }
  return res;
}

/** 重力 + 補格。回傳動畫用計畫：drops(掉落) 與 spawns(新生成)。 */
export function applyGravity(g, rng, types) {
  const R = g.length, C = g[0].length, drops = [], spawns = [];
  for (let c = 0; c < C; c++) {
    let w = R - 1;
    for (let r = R - 1; r >= 0; r--) {
      if (g[r][c] != null) {
        if (r !== w) { g[w][c] = g[r][c]; g[r][c] = null; drops.push({ fr: r, tr: w, c }); }
        w--;
      }
    }
    const n = w + 1;
    for (let r = w; r >= 0; r--) {
      const t = types[Math.floor(rng() * types.length)];
      g[r][c] = t;
      spawns.push({ r, c, type: t, from: r - n });
    }
  }
  return { drops, spawns };
}

/** 無動畫版連鎖結算（模擬/機器人使用）。 */
export function resolveHeadless(g, rng, types) {
  const C = g[0].length, cleared = {};
  let chain = 0, tiles = 0;
  for (;;) {
    const m = findMatches(g);
    if (!m.size) break;
    chain++;
    for (const i of m) {
      const r = Math.floor(i / C), c = i % C;
      cleared[g[r][c]] = (cleared[g[r][c]] || 0) + 1;
      g[r][c] = null;
      tiles++;
    }
    applyGravity(g, rng, types);
  }
  return { cleared, chain, tiles };
}

/** 洗牌：保證洗後無現成消除、且至少有一步可走。 */
export function shuffleGrid(g, rng, types) {
  const R = g.length, C = g[0].length;
  const flat = g.flat();
  const write = () => { for (let i = 0; i < flat.length; i++) g[Math.floor(i / C)][i % C] = flat[i]; };
  for (let t = 0; t < 200; t++) {
    for (let i = flat.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    write();
    if (!findMatches(g).size && validSwaps(g).length) return true;
  }
  for (let t = 0; t < 500; t++) {
    for (let i = 0; i < flat.length; i++) flat[i] = types[Math.floor(rng() * types.length)];
    write();
    if (!findMatches(g).size && validSwaps(g).length) return true;
  }
  return false;
}
