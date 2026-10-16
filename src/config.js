const LS_CACHE = 'm3.liveops.cache.v1';

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

/** 載入 base config + LiveOps（失敗則退回上次快取）。 */
export async function loadConfig() {
  const base = await fetchJson('config/game-config.json');
  let live = null;
  try {
    const u = base.liveops.url;
    const bucket = Math.floor(Date.now() / (base.liveops.cacheMinutes * 60000));
    live = await fetchJson(`${u}${u.includes('?') ? '&' : '?'}t=${bucket}`);
    try { localStorage.setItem(LS_CACHE, JSON.stringify(live)); } catch {}
  } catch (e) {
    try { live = JSON.parse(localStorage.getItem(LS_CACHE)); } catch {}
  }
  return buildConfig(base, live || {}, new Date());
}

/** 純函式：合併 base 與 LiveOps（Node 模擬腳本也會使用）。 */
export function buildConfig(base, live = {}, now = new Date()) {
  const events = (live.events || []).filter(
    e => e.enabled !== false && new Date(e.start) <= now && now <= new Date(e.end)
  );
  const disabled = new Set(live.disabledTiles || []);
  const packs = [...base.packs];
  const tiles = [...base.tiles];
  for (const e of events) {
    for (const p of e.packs || []) if (!packs.find(x => x.key === p.key)) packs.push(p);
    for (const t of e.tiles || []) if (!tiles.find(x => x.id === t.id)) tiles.push(t);
  }
  const tileMap = {};
  tiles.forEach(t => (tileMap[t.id] = t));
  return {
    ...base,
    packs,
    tileMap,
    pool: tiles.filter(t => !disabled.has(t.id)).map(t => t.id),
    activeEvents: events,
    scoreMul: events.reduce((m, e) => m * (e.scoreMultiplier || 1), 1),
    extraSeconds: events.reduce((s, e) => s + (e.extraSeconds || 0), 0),
    difficulty: { ...base.difficulty, ...(live.difficultyPatch || {}) },
    levelOverrides: live.levelOverrides || {},
    maintenance: live.maintenance || { enabled: false },
    liveopsVersion: live.version || 'offline',
  };
}
