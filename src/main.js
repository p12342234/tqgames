import { loadConfig } from './config.js';
import { Profile } from './profile.js';
import { PreloadScene } from './scenes/Preload.js';
import { MenuScene } from './scenes/Menu.js';
import { GameScene } from './scenes/Game.js';

async function start() {
  let cfg;
  try {
    cfg = await loadConfig();
  } catch (e) {
    document.getElementById('game').innerHTML =
      '<p style="color:#fff;font:20px sans-serif;padding:24px">設定檔載入失敗：' + e.message + '</p>';
    return;
  }
  const profile = new Profile(cfg.gas);
  profile.sync();   // 背景同步，不阻塞開場

  window.__game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: cfg.game.width,
    height: cfg.game.height,
    backgroundColor: '#1b1f2a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    callbacks: { preBoot: g => g.registry.set('app', { cfg, profile }) },
    scene: [PreloadScene, MenuScene, GameScene],
  });
}
start();
