import { txt } from '../ui.js';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }

  preload() {
    const { cfg } = this.registry.get('app');
    const W = cfg.game.width, H = cfg.game.height;
    const label = txt(this, W / 2, H / 2, '載入中 0%', 36);
    this.load.on('progress', p => label.setText(`載入中 ${Math.round(p * 100)}%`));
    // LiveOps 擴充的 Texture Atlas 也在這裡動態載入；?v= 讓 CDN/瀏覽器在更新後抓新檔
    for (const p of cfg.packs) {
      this.load.atlas(p.key, `${p.png}?v=${p.version}`, `${p.json}?v=${p.version}`);
    }
  }

  create() { this.scene.start('Menu'); }
}
