import { button, txt } from '../ui.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const { cfg, profile } = this.registry.get('app');
    const W = cfg.game.width, H = cfg.game.height;

    txt(this, W / 2, 150, cfg.game.title, 84, '#ffd166', { fontStyle: 'bold' });
    txt(this, W / 2, 235, 'Match-3 商品消除', 34, '#9fb3d9');

    // 目前上場的商品（含 LiveOps 活動商品）
    const pool = cfg.pool, gap = 84, x0 = W / 2 - ((pool.length - 1) * gap) / 2;
    pool.forEach((id, i) => {
      const t = cfg.tileMap[id];
      this.add.image(x0 + i * gap, 340, t.pack, t.frame).setDisplaySize(68, 68);
    });

    const ev = cfg.activeEvents[0];
    if (ev) {
      this.add.rectangle(W / 2, 440, W - 80, 80, 0x3b2f55).setStrokeStyle(3, 0xffd166, 0.6);
      txt(this, W / 2, 440, ev.banner, 24, '#ffe9a8', { wordWrap: { width: W - 120 }, align: 'center' });
    }

    txt(this, W / 2, 570, `目前進度：第 ${profile.level} 關`, 46);
    txt(this, W / 2, 630, `累積星星 ${profile.totalStars}　金幣 ${profile.data.coins}`, 28, '#9fb3d9');

    if (cfg.maintenance.enabled) {
      txt(this, W / 2, 780, cfg.maintenance.message, 36, '#ff8080');
    } else {
      button(this, W / 2, 780, 440, 110, '開始遊戲', () => this.scene.start('Game', { level: profile.level }), 0x2fb86f);
      if (profile.level > 1) {
        button(this, W / 2, 920, 440, 84, '重玩上一關', () => this.scene.start('Game', { level: profile.level - 1 }), 0x39425a);
      }
    }

    const nameBtn = txt(this, W / 2, 1040, `暱稱：${profile.name}（點擊修改）`, 28, '#cfe0ff')
      .setInteractive({ useHandCursor: true });
    nameBtn.on('pointerup', () => {
      const n = window.prompt('輸入暱稱（最多 20 字）', profile.name);
      if (n) { profile.setName(n.trim()); this.scene.restart(); }
    });

    const sync = txt(this, W / 2, 1110, profile.gas.url ? '雲端同步：連線中…' : '雲端同步：未設定 GAS（僅存本機）', 24, '#7f8bab');
    if (profile.gas.url) {
      profile.sync().then(ok => {
        if (!sync.active) return;
        sync.setText(ok ? '雲端同步：已連線（Google 試算表）' : '雲端同步：離線，進度先存本機');
        sync.setColor(ok ? '#7be0a0' : '#ffb27a');
      });
    }
    txt(this, W / 2, H - 40, `config ${cfg.version} · liveops ${cfg.liveopsVersion}`, 20, '#556080');
  }
}
