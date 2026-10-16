import { generateLevel, mulberry32, hash } from '../levelgen.js';
import { findMatches, swapCells, applyGravity, validSwaps, shuffleGrid } from '../match3.js';
import { FONT, button, txt } from '../ui.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) { this.levelNo = data.level || 1; }

  create() {
    const app = this.registry.get('app');
    this.cfg = app.cfg;
    this.profile = app.profile;
    const b = this.cfg.board;
    this.cols = b.cols; this.rows = b.rows; this.ts = b.tileSize;
    this.W = this.cfg.game.width;
    this.ox = (this.W - this.cols * this.ts) / 2;
    this.oy = b.offsetY;

    this.level = this.buildLevel(this.levelNo);
    this.grid = this.level.board.map(r => r.slice());
    this.rng = mulberry32(hash(this.levelNo, 7, this.level.attempt));
    this.timeLimit = this.level.time;
    this.timeLeft = this.timeLimit;
    this.started = false;              // 玩家第一次碰盤面才開始計時
    this.warned = false;
    this.moveCount = 0;
    this.score = 0;
    this.collected = {};
    this.level.goals.forEach(g => (this.collected[g.type] = 0));
    this.busy = false; this.ended = false; this.sel = null; this.drag = null;

    this.drawBoard();
    this.drawHud();
    this.bindInput();
    this.armHint();
  }

  buildLevel(L) {
    const cfg = this.cfg;
    const lv = generateLevel(L, {
      pool: cfg.pool, diff: cfg.difficulty, cols: this.cols, rows: this.rows, salt: cfg.levelSalt,
    });
    const ov = cfg.levelOverrides[L] || {};        // LiveOps 針對單一關卡熱修
    if (ov.time) lv.time = ov.time;
    if (ov.timeDelta) lv.time += ov.timeDelta;
    lv.time += cfg.extraSeconds;                   // 活動加秒數
    // 動態輔助：同一關每連續失敗一次多給一點時間（上限 failAssistMax 次），讓玩家悠閒過關
    const d = cfg.difficulty, fails = Math.min(this.profile.failCount(L), d.failAssistMax);
    this.assistPct = fails * d.failAssistPct;
    if (fails) lv.time = Math.round((lv.time * (1 + this.assistPct)) / 5) * 5;
    return lv;
  }

  /* ───────── 座標 ───────── */
  cx(c) { return this.ox + c * this.ts + this.ts / 2; }
  cy(r) { return this.oy + r * this.ts + this.ts / 2; }
  toCell(x, y) {
    const c = Math.floor((x - this.ox) / this.ts), r = Math.floor((y - this.oy) / this.ts);
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols ? { r, c } : null;
  }
  tw(cfg) { return new Promise(res => this.tweens.add({ ...cfg, onComplete: res })); }
  wait(ms) { return new Promise(res => this.time.delayedCall(ms, res)); }

  /* ───────── 畫面 ───────── */
  drawBoard() {
    const pw = this.cols * this.ts + 20, ph = this.rows * this.ts + 20;
    this.add.rectangle(this.W / 2, this.oy + (this.rows * this.ts) / 2, pw, ph, 0x252b3b).setStrokeStyle(4, 0x3a4560);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      this.add.rectangle(this.cx(c), this.cy(r), this.ts - 4, this.ts - 4, (r + c) % 2 ? 0x2e364a : 0x323b52);
    }
    const mg = this.make.graphics({ x: 0, y: 0, add: false });
    mg.fillStyle(0xffffff).fillRect(this.ox, this.oy, this.cols * this.ts, this.rows * this.ts);
    this.boardMask = mg.createGeometryMask();

    this.sprites = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      this.sprites[r][c] = this.createTile(this.grid[r][c], r, c);
    }
    this.selBox = this.add.rectangle(0, 0, this.ts - 6, this.ts - 6)
      .setStrokeStyle(5, 0xffd166).setFillStyle(0xffffff, 0.08).setVisible(false).setDepth(5);
  }

  createTile(type, r, c, y) {
    const t = this.cfg.tileMap[type];
    const img = this.add.image(this.cx(c), y ?? this.cy(r), t.pack, t.frame);
    img.setDisplaySize(this.ts * 0.88, this.ts * 0.88);
    img.setMask(this.boardMask);
    img.tileType = type;
    img.baseScale = img.scaleX;
    return img;
  }

  drawHud() {
    const W = this.W, lv = this.level;
    txt(this, W / 2, 56, `第 ${this.levelNo} 關${lv.boss ? '  ★ BOSS ★' : ''}`, 44, lv.boss ? '#ffd166' : '#ffffff', { fontStyle: 'bold' });
    button(this, 70, 56, 100, 60, '☰', () => this.scene.start('Menu'), 0x39425a);
    this.movesText = txt(this, 170, 135, '', 38, '#ffffff', { fontStyle: 'bold' });
    this.scoreText = txt(this, W - 200, 135, '', 38, '#ffd166', { fontStyle: 'bold' });

    this.goalUI = {};
    const n = lv.goals.length, gap = 190, x0 = W / 2 - ((n - 1) * gap) / 2;
    lv.goals.forEach((g, i) => {
      const t = this.cfg.tileMap[g.type], x = x0 + i * gap;
      this.add.rectangle(x, 225, 170, 80, 0x2a3142).setStrokeStyle(2, 0x3a4560);
      this.add.image(x - 48, 225, t.pack, t.frame).setDisplaySize(60, 60);
      this.goalUI[g.type] = txt(this, x + 32, 225, '', 34, '#ffffff', { fontStyle: 'bold' });
    });
    const ev = this.cfg.activeEvents[0];
    if (ev) txt(this, W / 2, 272, ev.name + ' ×' + this.cfg.scoreMul.toFixed(1), 20, '#ffe9a8');

    // 計時進度條
    this.barW = W - 200;
    const by = 306;
    this.add.rectangle(W / 2, by, this.barW + 8, 26, 0x14181f).setStrokeStyle(2, 0x3a4560);
    this.barFill = this.add.rectangle(W / 2 - this.barW / 2, by, this.barW, 18, 0x4cd68a).setOrigin(0, 0.5);
    this.timeText = txt(this, W - 58, by, '', 24, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.startHint = txt(this, W / 2, by + 30, this.assistPct
      ? `已提供時間輔助 +${Math.round(this.assistPct * 100)}%・輕觸盤面開始計時`
      : '輕觸盤面開始計時', 20, '#9fb3d9');
    this.updateHud();
    this.drawTimer();
  }

  drawTimer() {
    const ratio = Math.max(0, this.timeLeft / this.timeLimit);
    this.barFill.width = Math.max(0.001, this.barW * ratio);
    this.barFill.setFillStyle(ratio > 0.5 ? 0x4cd68a : ratio > 0.25 ? 0xffd166 : 0xff6b6b);
    this.timeText.setText(Math.ceil(this.timeLeft) + 's');
    if (ratio <= 0.2 && !this.warned && this.started && !this.ended) {
      this.warned = true;
      this.tweens.add({ targets: this.barFill, alpha: 0.45, yoyo: true, repeat: -1, duration: 350 });
    }
  }

  addTime(sec) {
    this.timeLeft = Math.min(this.timeLimit, this.timeLeft + sec);
    this.drawTimer();
  }

  update(_, dt) {
    if (!this.started || this.busy || this.ended) return;   // 動畫/連鎖結算期間不扣時間
    this.timeLeft -= dt / 1000;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.drawTimer(); this.finish(false); return; }
    this.drawTimer();
  }

  updateHud() {
    this.movesText.setText(`步數 ${this.moveCount}`);
    this.scoreText.setText(`分數 ${this.score}`);
    for (const g of this.level.goals) {
      const left = Math.max(0, g.count - this.collected[g.type]);
      this.goalUI[g.type].setText(left === 0 ? '✔' : String(left)).setColor(left === 0 ? '#7be0a0' : '#ffffff');
    }
  }

  toast(msg, color = '#ffffff') {
    const t = txt(this, this.W / 2, this.oy + (this.rows * this.ts) / 2, msg, 54, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setDepth(20);
    this.tweens.add({ targets: t, y: t.y - 80, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /* ───────── 輸入 ───────── */
  bindInput() {
    this.input.on('pointerdown', p => {
      if (this.busy || this.ended) return;
      this.armHint();
      const cell = this.toCell(p.x, p.y);
      if (!cell) return;
      if (!this.started) { this.started = true; this.startHint.setVisible(false); }
      if (this.sel && this.sel.r === cell.r && this.sel.c === cell.c) { this.clearSel(); return; }
      if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) {
        const s = this.sel; this.clearSel(); this.trySwap(s, cell); return;
      }
      this.setSel(cell);
      this.drag = { cell, x: p.x, y: p.y };
    });
    this.input.on('pointermove', p => {
      if (!p.isDown || !this.drag || this.busy || this.ended) return;
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (Math.hypot(dx, dy) < this.ts * 0.35) return;
      const from = this.drag.cell;
      const to = Math.abs(dx) > Math.abs(dy)
        ? { r: from.r, c: from.c + Math.sign(dx) }
        : { r: from.r + Math.sign(dy), c: from.c };
      this.drag = null; this.clearSel();
      if (to.r < 0 || to.r >= this.rows || to.c < 0 || to.c >= this.cols) return;
      this.trySwap(from, to);
    });
    this.input.on('pointerup', () => { this.drag = null; });
  }
  setSel(cell) { this.sel = cell; this.selBox.setPosition(this.cx(cell.c), this.cy(cell.r)).setVisible(true); }
  clearSel() { this.sel = null; this.selBox.setVisible(false); }

  /* ───────── 提示 ───────── */
  armHint() {
    this.clearHint();
    this.hintEvt?.remove();
    this.hintEvt = this.time.delayedCall(this.cfg.board.hintDelayMs || 6000, () => this.showHint());
  }
  showHint() {
    if (this.busy || this.ended) return;
    const swaps = validSwaps(this.grid);
    if (!swaps.length) return;
    const goalSet = new Set(this.level.goals.map(g => g.type));
    const pick = swaps.find(s => goalSet.has(this.grid[s.a.r][s.a.c]) || goalSet.has(this.grid[s.b.r][s.b.c])) || swaps[0];
    this.hintSprites = [pick.a, pick.b].map(p => this.sprites[p.r][p.c]);
    this.hintTweens = this.hintSprites.map(s => this.tweens.add({
      targets: s, scale: s.baseScale * 1.18, yoyo: true, repeat: -1, duration: 380,
    }));
  }
  clearHint() {
    this.hintTweens?.forEach(t => t.remove());
    this.hintSprites?.forEach(s => s?.active && s.setScale(s.baseScale));
    this.hintTweens = null; this.hintSprites = null;
  }

  /* ───────── 交換 / 結算 ───────── */
  async animSwap(a, b) {
    const sA = this.sprites[a.r][a.c], sB = this.sprites[b.r][b.c];
    this.sprites[a.r][a.c] = sB; this.sprites[b.r][b.c] = sA;
    await Promise.all([
      this.tw({ targets: sA, x: this.cx(b.c), y: this.cy(b.r), duration: 140 }),
      this.tw({ targets: sB, x: this.cx(a.c), y: this.cy(a.r), duration: 140 }),
    ]);
  }

  async trySwap(a, b) {
    if (this.busy || this.ended) return;
    this.busy = true; this.clearHint();
    swapCells(this.grid, a, b);
    const ok = findMatches(this.grid).size > 0;
    await this.animSwap(a, b);
    if (!ok) {
      swapCells(this.grid, a, b);
      await this.animSwap(a, b);
      this.busy = false; this.armHint();
      return;
    }
    this.moveCount++;
    this.updateHud();
    await this.resolve();
    await this.afterMove();
    this.busy = false;
  }

  async resolve() {
    let chain = 0;
    for (;;) {
      const m = findMatches(this.grid);
      if (!m.size) break;
      chain++;
      if (chain > 1) this.addTime(this.cfg.difficulty.chainBonusSec * Math.min(chain - 1, 3));
      await this.clearCells(m, chain);
      await this.dropAndFill();
    }
  }

  async clearCells(set, chain) {
    const arr = [...set];
    this.score += Math.round(arr.length * 10 * chain * this.cfg.scoreMul);
    const dead = [];
    for (const idx of arr) {
      const r = Math.floor(idx / this.cols), c = idx % this.cols;
      const type = this.grid[r][c];
      if (type in this.collected) this.collected[type]++;
      dead.push(this.sprites[r][c]);
      this.sprites[r][c] = null;
      this.grid[r][c] = null;
    }
    if (chain > 1) this.toast(`連鎖 ×${chain}  +${(this.cfg.difficulty.chainBonusSec * Math.min(chain - 1, 3)).toFixed(1)}s`, '#ffd166');
    this.updateHud();
    await Promise.all(dead.map(s => this.tw({ targets: s, scale: 0, alpha: 0, angle: 90, duration: 180 })));
    dead.forEach(s => s.destroy());
  }

  async dropAndFill() {
    const plan = applyGravity(this.grid, this.rng, this.level.types);
    const jobs = [];
    for (const d of plan.drops) {
      const s = this.sprites[d.fr][d.c];
      this.sprites[d.fr][d.c] = null;
      this.sprites[d.tr][d.c] = s;
      jobs.push(this.tw({ targets: s, y: this.cy(d.tr), duration: 110 + 45 * (d.tr - d.fr), ease: 'Quad.easeIn' }));
    }
    for (const sp of plan.spawns) {
      const s = this.createTile(sp.type, sp.r, sp.c, this.cy(sp.from));
      this.sprites[sp.r][sp.c] = s;
      jobs.push(this.tw({ targets: s, y: this.cy(sp.r), duration: 130 + 45 * (sp.r - sp.from), ease: 'Quad.easeIn' }));
    }
    await Promise.all(jobs);
  }

  goalsDone() { return this.level.goals.every(g => this.collected[g.type] >= g.count); }

  async afterMove() {
    if (this.goalsDone()) return this.finish(true);
    if (!validSwaps(this.grid).length) {
      this.toast('重新洗牌');
      shuffleGrid(this.grid, this.rng, this.level.types);
      this.sprites.flat().forEach(s => s.destroy());
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const s = this.createTile(this.grid[r][c], r, c);
        s.setAlpha(0);
        this.tweens.add({ targets: s, alpha: 1, duration: 250 });
        this.sprites[r][c] = s;
      }
      await this.wait(300);
    }
    this.armHint();
  }

  /* ───────── 結算 ───────── */
  finish(win) {
    this.ended = true; this.clearHint(); this.tweens.killTweensOf(this.barFill); this.barFill.setAlpha(1);
    let stars = 0, bonus = 0;
    if (win) {
      bonus = Math.floor(this.timeLeft) * 20;
      this.score += bonus;
      const ratio = this.timeLeft / this.timeLimit;
      stars = ratio >= 0.4 ? 3 : ratio >= 0.15 ? 2 : 1;
    }
    this.updateHud();
    this.profile.reportResult({
      level: this.levelNo, win, score: this.score, stars,
      moves: this.moveCount, timeLimit: this.timeLimit, timeUsed: Math.round(this.timeLimit - this.timeLeft),
      events: this.cfg.activeEvents.map(e => e.id),
    });
    this.time.delayedCall(500, () => this.showResult(win, stars, bonus));
  }

  failNote() { return this.profile.failCount(this.levelNo) < this.cfg.difficulty.failAssistMax; }

  showResult(win, stars, bonus) {
    const W = this.W, H = this.cfg.game.height;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(30).setInteractive();
    this.add.rectangle(W / 2, H / 2, 560, 620, 0x2a3142).setStrokeStyle(4, win ? 0xffd166 : 0x8a4a4a).setDepth(31);
    txt(this, W / 2, H / 2 - 230, win ? '過關！' : '時間到了', 64, win ? '#ffd166' : '#ff9a9a', { fontStyle: 'bold' }).setDepth(32);
    if (win) txt(this, W / 2, H / 2 - 130, '★'.repeat(stars) + '☆'.repeat(3 - stars), 80, '#ffd166').setDepth(32);
    txt(this, W / 2, H / 2 - 30, `分數 ${this.score}` + (bonus ? `（剩餘時間獎勵 +${bonus}）` : ''), 28).setDepth(32);
    const primary = win
      ? button(this, W / 2, H / 2 + 90, 420, 100, '下一關', () => this.scene.start('Game', { level: this.levelNo + 1 }), 0x2fb86f)
      : button(this, W / 2, H / 2 + 90, 420, 100, this.failNote() ? '再試一次（多給時間）' : '再試一次', () => this.scene.start('Game', { level: this.levelNo }), 0xe0783c);
    const menu = button(this, W / 2, H / 2 + 220, 420, 84, '回主選單', () => this.scene.start('Menu'), 0x39425a);
    primary.setDepth(32); menu.setDepth(32);
  }
}
