#!/usr/bin/env bash
# 以 TexturePacker CLI 把 art/<pack>/ 內每個資料夾打包成 assets/atlas/<pack>.{png,json}
# 用法：bash tools/pack.sh            （全部）
#       bash tools/pack.sh tiles-halloween   （只打包單一活動包）
set -euo pipefail
cd "$(dirname "$0")/.."
packs=("$@")
[ ${#packs[@]} -eq 0 ] && packs=($(ls art))
for p in "${packs[@]}"; do
  TexturePacker "art/$p" \
    --format phaser \
    --data  "assets/atlas/$p.json" \
    --sheet "assets/atlas/$p.png" \
    --algorithm MaxRects --trim-mode Trim --max-size 2048 \
    --extrude 1 --shape-padding 2 --disable-rotation
  echo "packed $p"
done
echo "提示：更新圖集後，請把 liveops.json / game-config.json 中該 pack 的 version +1，讓玩家抓到新檔。"
