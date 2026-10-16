const LS_KEY = 'm3.profile.v1';
const LS_OUTBOX = 'm3.outbox.v1';
const LS_FAILS = 'm3.fails.v1';
const now = () => Date.now();
const uuid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'p-' + Math.random().toString(36).slice(2) + now().toString(36);

function blank() {
  return {
    playerId: uuid(),
    name: '玩家' + Math.floor(1000 + Math.random() * 9000),
    level: 1, coins: 0, best: {},
    createdAt: now(), updatedAt: now(), rev: 0,
  };
}

/** Gamer Profile：localStorage 為主、Google Apps Script(Google 試算表) 為雲端備份。離線可玩，連線後自動補傳。 */
export class Profile {
  constructor(gasCfg) {
    this.gas = gasCfg || {};
    this.online = false;
    this.data = this._load(LS_KEY, null) || blank();
    this._save();
  }

  _load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  _save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch {} }

  /** 同一關連續失敗次數（僅存本機，用來提供遞增的時間輔助）。 */
  failCount(level) { return this._load(LS_FAILS, {})[level] || 0; }
  _setFails(level, win) {
    const f = this._load(LS_FAILS, {});
    if (win) delete f[level]; else f[level] = (f[level] || 0) + 1;
    try { localStorage.setItem(LS_FAILS, JSON.stringify(f)); } catch {}
  }

  get level() { return this.data.level; }
  get name() { return this.data.name; }
  get totalStars() { return Object.values(this.data.best).reduce((s, b) => s + (b.stars || 0), 0); }

  async _call(payload) {
    if (!this.gas.url) throw new Error('GAS url not set');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.gas.timeoutMs || 8000);
    try {
      // text/plain 可避免 CORS preflight（GAS 不支援 OPTIONS）
      const res = await fetch(this.gas.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'gas error');
      return j;
    } finally { clearTimeout(timer); }
  }

  async sync() {
    try {
      await this._flush();
      const j = await this._call({ action: 'sync', profile: this.data });
      this.data = j.profile;
      this.online = true;
    } catch { this.online = false; }
    this._save();
    return this.online;
  }

  async _flush() {
    const box = this._load(LS_OUTBOX, []);
    while (box.length) {
      await this._call(box[0]);
      box.shift();
      try { localStorage.setItem(LS_OUTBOX, JSON.stringify(box)); } catch {}
    }
  }

  setName(name) {
    this.data.name = String(name).slice(0, 20) || this.data.name;
    this.data.updatedAt = now();
    this._save();
    this.sync();
  }

  /** 結算：更新本機 → 放入 outbox → 嘗試上傳（失敗保留待下次）。 */
  async reportResult({ level, win, score, stars, moves, timeLimit, timeUsed, events }) {
    const d = this.data;
    this._setFails(level, win);
    if (win) {
      const prev = d.best[level] || { score: 0, stars: 0 };
      d.best[level] = { score: Math.max(prev.score, score), stars: Math.max(prev.stars, stars) };
      if (level === d.level) d.level++;
      d.coins += 10 + stars * 5;
    }
    d.updatedAt = now();
    this._save();

    const box = this._load(LS_OUTBOX, []);
    box.push({
      action: 'result', playerId: d.playerId, name: d.name,
      level, win, score, stars, moves, timeLimit, timeUsed, events, client: 'web-2',
    });
    try { localStorage.setItem(LS_OUTBOX, JSON.stringify(box.slice(-200))); } catch {}
    try { await this._flush(); this.online = true; } catch { this.online = false; }
  }
}
