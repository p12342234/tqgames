# 商品消除 Match-3（Phaser 3 + GitHub Pages + LiveOps + GAS）

純靜態網頁遊戲：程式與資源由 **GitHub Pages** 託管，玩家進度存在 **Google 試算表（Apps Script）**，活動與商品資源透過 **LiveOps 設定檔 + Texture Atlas** 不改程式即可更新。

```
index.html                 入口（Phaser 由 CDN 載入）
config/game-config.json    ① 遊戲設定檔（Config）：盤面、GAS 網址、基礎商品、難度參數
config/liveops.json        ② LiveOps：活動、新商品/圖集、停用商品、難度補丁、單關熱修、維護模式
assets/atlas/*.png|json    ③ TexturePacker 輸出的 Texture Atlas（每個「包」一組）
art/<pack>/*.png           ④ 原始圖（TexturePacker 的輸入；目前是佔位圖）
src/levelgen.js            ⑤ 關卡生成：組合數 + 倒推法 + 難度曲線（純函式，瀏覽器/Node 共用）
src/match3.js              ⑥ 消除規則（找連線、重力、洗牌、可走步驗證）
src/scenes/*.js            Preload / Menu / Game 場景
src/profile.js             ⑦ Gamer Profile（本機 + GAS 同步，離線可玩）
gas/Code.gs                ⑧ Google Apps Script 後端
tools/                     simulate.mjs（機器人測難度）、pack.sh（TexturePacker）、make_placeholder_art.py
.github/workflows/pages.yml  push 到 main 自動部署
```

## 快速開始

```bash
python3 -m http.server 8080      # 或 npm run serve；不能直接用 file:// 開
# 開 http://localhost:8080
node tools/simulate.mjs 20       # 機器人模擬各關勝率
```

## 1. 關卡設計：組合數 + 倒推法 + 無限關卡

第 `L` 關完全由 `hash(L, levelSalt, 商品數)` 決定（**同一關永遠相同**，不用存關卡資料，也能無限延伸）。

**組合數（Combinations）**
- 商品池 `N` 種（核心 6 + 活動商品），第 L 關用 `k = 4 + ⌊(L-1)/15⌋`（上限 7）種上場。
- 用 combinadic（組合數系統）把亂數索引轉成「第 idx 個 C(N,k) 子集」→ 本關上場商品。
- 同樣方式從 k 種裡挑 `m` 種當**過關目標**（`m = 1 + ⌊(L-1)/15⌋`，上限 3）。
- 目前 N=8、k=4 就有 C(8,4)=70 種商品組合 × C(4,m) 種目標組合 × 預埋位置的排列；**LiveOps 每多一種商品，組合空間就倍數成長**。

**倒推法（Backward Induction / Reverse Engineering）— 從「過關」往回推盤面**
1. 先決定終點：目標每種收集 `count` 個。
2. 往回推最少需要 `par = Σ⌈count/3⌉` 次 match-3。
3. 把其中最多 6 個「一步可完成」的解法**預埋進盤面**（4 種 2×3 圖樣＋轉置，共 8 種）：兩個目標已並排、第三個在斜角，交換一次即消。預埋時由上往下排序成 `level.solution`，所以此關**保證有解**，且已知最短路徑。
4. **時間限制** = 預期步數 × 每步秒數：預期步數 = `par × (1.2 + 0.12·(色數−4) + 0.1·(目標種類−1))`，每步秒數從 6.5 秒緩降到 5.5 秒，取整到 5 秒並限制在 45–240 秒。
5. 其餘格用 seeded RNG 填入且不產生現成三連，最後整盤驗證，失敗就換 attempt 重生。

**難度曲線**（皆在 `config.difficulty`，可由 LiveOps `difficultyPatch` 即時覆寫）

| 手段 | 作用 |
|---|---|
| 商品種類 4→7 | 盤面更雜，連線機率下降 |
| 目標 1→3 種、數量 `9 + 2·L^0.6`（上限 54） | 需要更多有效消除 |
| 每步秒數 6.5→5.5、BOSS 時間 ×0.92 | 時間逐步變緊，但永遠給足思考空間 |
| 每 10 關 BOSS（目標×1.2、時間 −8%）＋下一關喘息（時間 +10%） | 鋸齒節奏，避免只有單調變難 |

> 難度有「漸近上限」而非無限疊加，否則後期會變成不可能；後期靠 BOSS 與組合變化維持新鮮感。

## 1.5 時間限制與「悠閒玩到 100 關」

**玩法**：每關有一條計時進度條（綠→黃→紅），時間歸零即失敗；沒有步數限制。
- **碰盤面才開始計時**：進關可以先看盤面，輕觸盤面才開跑。
- **動畫與連鎖結算期間不扣時間**：看特效不吃時間。
- **連鎖加時**：連鎖 ×2 加 1.5 秒、×3 加 3 秒、×4 以上加 4.5 秒（不超過該關上限）。
- **失敗輔助**：同一關每連續失敗一次，下次多給 15% 時間（最多 4 次，約 +60%），通關後歸零。失敗次數只存本機。
- **星星**依剩餘時間評定：≥40% 三星、≥15% 兩星。

**休閒度驗證**（`node tools/simulate.mjs`）：機器人不受限制地玩，量測需要幾步過關，再用「真人每步秒數」換算在時間內過關的比例。

| 每步秒數 | 第 1–50 關 | 第 60–100 關（BOSS 為最差情況） |
|---|---|---|
| 3 秒（俐落） | 100% | 100% |
| 4.5 秒（休閒） | 100% | 95–100% |
| 6 秒（慢慢想） | 100% | 80–95%，非 BOSS 關更高 |

另外有連鎖加時與失敗輔助當緩衝，所以一般玩家應能輕鬆走到 100 關。完整的 1–100 關設計表見 [`docs/levels-1-100.md`](docs/levels-1-100.md)（`node tools/level-table.mjs > docs/levels-1-100.md` 重新產生）。

注意：機器人是貪婪策略、不會思考，只能當相對指標；上線後請用 `LevelStats` 的真實勝率校準，必要時用 `difficultyPatch`（例如調 `secStart`/`secEnd`）或 `levelOverrides`（例如 `{"37":{"timeDelta":20}}`）即時調整。

## 2. LiveOps（不改程式碼就更新）

玩家每次開啟遊戲都會抓 `config/liveops.json`（以 `cacheMinutes` 分桶避開 CDN 舊快取，失敗則用上次快取），**只改 JSON 然後 push 就生效**：

| 欄位 | 用途 |
|---|---|
| `events[]` | 活動（`start`/`end` 含時區，到期自動下架）；可帶 `scoreMultiplier`、`extraSeconds`（每關加秒數）、新 `packs`（圖集）、新 `tiles`（商品） |
| `disabledTiles` | 緊急下架有問題的商品 |
| `difficultyPatch` | 覆寫難度參數（例：`{"slackEnd":1.6}`） |
| `levelOverrides` | 單關熱修（例：`{"10":{"timeDelta":15}}`、`{"37":{"time":120}}`） |
| `maintenance` | 維護模式，`enabled:true` 時主選單鎖住開始鈕 |

新增活動商品流程：把圖放 `art/tiles-xxx/` → `bash tools/pack.sh tiles-xxx` → `liveops.json` 新增 event（含 `packs`/`tiles`）→ push。圖集更新時把該 pack 的 `version` +1（載入時以 `?v=` 破快取）。

注意：商品池改變會改變 `N`，活動期間的關卡內容會與平常不同（組合空間變大）；若需要「不論活動與否同一關都一樣」，可把 `levelSalt`/商品池鎖定在核心商品，只讓活動商品當裝飾關。

## 3. Texture Atlas（TexturePacker）

- `bash tools/pack.sh` 會把 `art/<pack>/` 每個資料夾打包成 `assets/atlas/<pack>.png|json`（`--format phaser` = JSON Hash）。
- 遊戲以 `this.load.atlas(key, png, json)` 載入，`config.tiles[].frame` 對應圖集內的影格名稱。
- 目前 `assets/atlas/` 內是 `tools/make_placeholder_art.py` 產生的**相容格式佔位圖**（沒有 TexturePacker 也能跑）；換成正式美術時覆蓋即可，程式不用改。

## 4. Gamer Profile（Google Apps Script + 試算表）

部署步驟：
1. 建立 Google 試算表 → 擴充功能 → Apps Script → 貼上 `gas/Code.gs` → 執行一次 `setup()`（會建立 `Profiles`、`Runs` 分頁並授權）。
2. 部署 → 新增部署作業 → **網頁應用程式**；執行身分「我」、存取權「任何人」→ 複製 `/exec` 網址。
3. 填入 `config/game-config.json` 的 `gas.url`，push。

運作方式：
- 玩家以匿名 `playerId`（UUID）+ 暱稱識別；進度先存 `localStorage`，離線也能玩，結算資料進 outbox，連線後補傳。
- `sync`：雲端與本機合併（每關最佳分數/星數取最大、關卡取最大）。`result`：每局寫入 `Runs`（關卡、勝敗、分數、步數、時間上限、已用時間、活動 ID）。
- 簡易防作弊：宣稱的關卡不得超過「已通關最高關 + 1」、分數上限、暱稱公式注入過濾、`LockService` 防並發寫入；異常資料在 `flag` 欄標記。
- `rebuildLevelStats()` 會把 `Runs` 彙整成 `LevelStats`（各關勝率、過關時平均剩餘秒數），可設定時間觸發器每日執行；拿來決定要調 `levelOverrides` 還是 `difficultyPatch` —— 這就是 LiveOps 的閉環。

限制：匿名 ID 存在瀏覽器，清除資料會失去進度。若要跨裝置綁定帳號，可加 Google 登入並在 GAS 以 `oauth2.googleapis.com/tokeninfo` 驗證 ID token，改用 Google 帳號 sub 當 `playerId`。

## 5. 部署到 GitHub

```bash
git init && git add . && git commit -m "init"
git branch -M main && git remote add origin https://github.com/<你>/<repo>.git && git push -u origin main
```
Repo → Settings → Pages → Source 選 **GitHub Actions**。之後每次 push 會先跑關卡生成冒煙測試，再部署。
