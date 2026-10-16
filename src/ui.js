export const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

export function button(scene, x, y, w, h, label, onClick, fill = 0x4f8cff) {
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, fill).setStrokeStyle(3, 0xffffff, 0.25);
  const tx = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: Math.round(h * 0.42) + 'px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5);
  c.add([bg, tx]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.96));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => { c.setScale(1); onClick(); });
  return c;
}

export const txt = (scene, x, y, s, size = 32, color = '#ffffff', extra = {}) =>
  scene.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, ...extra }).setOrigin(0.5);
