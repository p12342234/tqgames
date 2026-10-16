/**
 * Match-3 Gamer Profile 後端（Google Apps Script，綁定 Google 試算表）
 * 部署：試算表 → 擴充功能 → Apps Script → 貼上本檔 → 先執行一次 setup()
 *       → 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取：任何人）→ 複製 /exec 網址填入 game-config.json 的 gas.url
 * 每次改完程式碼需「管理部署作業 → 編輯 → 新版本」才會生效。
 */
const SHEET_ID = '';                       // 空字串 = 使用綁定的試算表
const PROFILE_COLS = ['playerId', 'name', 'level', 'coins', 'totalStars', 'best', 'createdAt', 'updatedAt', 'rev'];
const RUN_COLS = ['ts', 'playerId', 'name', 'level', 'win', 'score', 'stars', 'moves', 'timeLimit', 'timeUsed', 'events', 'client', 'flag'];
const MAX_SCORE_PER_LEVEL = 300000;

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, cols) {
  let sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); sh.appendRow(cols); sh.setFrozenRows(1); }
  return sh;
}
function setup() { sheet_('Profiles', PROFILE_COLS); sheet_('Runs', RUN_COLS); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, service: 'match3-profile', time: new Date().toISOString() }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'sync') return json_(sync_(req));
    if (req.action === 'result') return json_(result_(req));
    return json_({ ok: false, error: 'bad action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ───── 資料存取 ───── */
function findRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}
function readProfile_(sh, row) {
  const v = sh.getRange(row, 1, 1, PROFILE_COLS.length).getValues()[0], o = {};
  PROFILE_COLS.forEach(function (k, i) { o[k] = v[i]; });
  try { o.best = JSON.parse(o.best || '{}'); } catch (x) { o.best = {}; }
  return o;
}
function writeProfile_(sh, row, p) {
  const vals = PROFILE_COLS.map(function (k) { return k === 'best' ? JSON.stringify(p.best) : p[k]; });
  if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
}

/* ───── 驗證 / 清理 ───── */
function validId_(id) { return typeof id === 'string' && /^[\w-]{8,64}$/.test(id); }
function cleanName_(s) {
  s = String(s || '玩家').replace(/[\u0000-\u001f]/g, '').slice(0, 20);
  return /^[=+\-@]/.test(s) ? "'" + s : s;          // 防試算表公式注入
}
function maxKey_(best) {
  let m = 0;
  Object.keys(best || {}).forEach(function (k) { m = Math.max(m, Number(k) || 0); });
  return m;
}
function cleanBest_(best) {
  const out = {};
  Object.keys(best || {}).forEach(function (k) {
    const lv = Number(k), b = best[k];
    if (lv >= 1 && lv <= 100000 && b && b.score >= 0 && b.score <= MAX_SCORE_PER_LEVEL)
      out[lv] = { score: Math.floor(b.score), stars: Math.max(0, Math.min(3, Math.floor(b.stars || 0))) };
  });
  return out;
}
function mergeBest_(a, b) {
  const out = {};
  [a, b].forEach(function (src) {
    Object.keys(src).forEach(function (k) {
      const x = out[k] || { score: 0, stars: 0 };
      out[k] = { score: Math.max(x.score, src[k].score), stars: Math.max(x.stars, src[k].stars) };
    });
  });
  return out;
}
function totalStars_(best) {
  let s = 0;
  Object.keys(best).forEach(function (k) { s += best[k].stars || 0; });
  return s;
}

/* ───── sync：合併「本機」與「雲端」存檔 ───── */
function sync_(req) {
  const cli = req.profile || {};
  if (!validId_(cli.playerId)) return { ok: false, error: 'bad playerId' };
  const sh = sheet_('Profiles', PROFILE_COLS);
  const row = findRow_(sh, cli.playerId);
  const nowMs = Date.now();
  const cBest = cleanBest_(cli.best);
  // 反作弊：宣稱的關卡不能超過「已通關最高關 + 1」
  const cLevel = Math.max(1, Math.min(Number(cli.level) || 1, maxKey_(cBest) + 1));

  let p;
  if (!row) {
    p = {
      playerId: cli.playerId, name: cleanName_(cli.name), level: cLevel, coins: Math.max(0, Math.min(Number(cli.coins) || 0, 1e6)),
      best: cBest, createdAt: nowMs, updatedAt: nowMs, rev: 1,
    };
  } else {
    const s = readProfile_(sh, row);
    const best = mergeBest_(s.best, cBest);
    const clientNewer = (Number(cli.updatedAt) || 0) > (Number(s.updatedAt) || 0);
    p = {
      playerId: s.playerId,
      name: clientNewer ? cleanName_(cli.name) : s.name,
      level: Math.max(Number(s.level) || 1, cLevel),
      coins: clientNewer ? Math.max(0, Math.min(Number(cli.coins) || 0, 1e6)) : s.coins,
      best: best, createdAt: s.createdAt, updatedAt: Math.max(Number(s.updatedAt) || 0, Number(cli.updatedAt) || 0, nowMs), rev: (Number(s.rev) || 0) + 1,
    };
  }
  p.totalStars = totalStars_(p.best);
  writeProfile_(sh, row, p);
  return { ok: true, profile: p };
}

/* ───── result：每次結算寫 Runs（難度分析）並更新進度 ───── */
function result_(req) {
  if (!validId_(req.playerId)) return { ok: false, error: 'bad playerId' };
  const profSh = sheet_('Profiles', PROFILE_COLS), runSh = sheet_('Runs', RUN_COLS);
  const row = findRow_(profSh, req.playerId);
  const lv = Number(req.level) || 0;
  let flag = '';
  let p = row ? readProfile_(profSh, row) : {
    playerId: req.playerId, name: cleanName_(req.name), level: 1, coins: 0, best: {}, createdAt: Date.now(), updatedAt: Date.now(), rev: 0,
  };

  if (lv < 1 || lv > p.level) flag = 'level>profile';
  else if (Number(req.score) > MAX_SCORE_PER_LEVEL || Number(req.score) < 0) flag = 'score';
  else if (req.win) {
    const stars = Math.max(1, Math.min(3, Math.floor(req.stars || 1)));
    const prev = p.best[lv] || { score: 0, stars: 0 };
    p.best[lv] = { score: Math.max(prev.score, Math.floor(req.score)), stars: Math.max(prev.stars, stars) };
    if (lv === p.level) p.level++;
    p.coins = (Number(p.coins) || 0) + 10 + stars * 5;
    p.updatedAt = Date.now(); p.rev = (Number(p.rev) || 0) + 1;
    p.totalStars = totalStars_(p.best);
    writeProfile_(profSh, row, p);
  }
  runSh.appendRow([
    new Date(), req.playerId, cleanName_(req.name), lv, !!req.win, Number(req.score) || 0, Number(req.stars) || 0,
    Number(req.moves) || 0, Number(req.timeLimit) || 0, Number(req.timeUsed) || 0, (req.events || []).join(','), String(req.client || ''), flag,
  ]);
  return { ok: true, flag: flag };
}

/* ───── 營運分析：手動或加「時間驅動觸發條件」執行，產出各關勝率，供 LiveOps 調整 levelOverrides / difficultyPatch ───── */
function rebuildLevelStats() {
  const runs = sheet_('Runs', RUN_COLS), n = runs.getLastRow();
  if (n < 2) return;
  const rows = runs.getRange(2, 1, n - 1, RUN_COLS.length).getValues(), agg = {};
  rows.forEach(function (r) {
    if (r[12]) return;                                   // 略過被標記的資料
    const lv = r[3], a = agg[lv] || (agg[lv] = { plays: 0, wins: 0, timeLeftSum: 0, players: {} });
    a.plays++; a.players[r[1]] = 1;
    if (r[4] === true || r[4] === 'TRUE') { a.wins++; a.timeLeftSum += (r[8] - r[9]); }
  });
  const out = [['level', 'plays', 'players', 'winRate', 'avgTimeLeftOnWin']];
  Object.keys(agg).map(Number).sort(function (a, b) { return a - b; }).forEach(function (lv) {
    const a = agg[lv];
    out.push([lv, a.plays, Object.keys(a.players).length, a.wins / a.plays, a.wins ? a.timeLeftSum / a.wins : 0]);
  });
  const sh = sheet_('LevelStats', out[0]);
  sh.clear();
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.getRange(2, 4, out.length - 1, 1).setNumberFormat('0.0%');
}
