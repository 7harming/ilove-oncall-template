# AGENTS.md

給 AI 寫程式工具（Claude Code、Codex、Cursor、Copilot……）的說明。人類請先看 [README.md](README.md)。

## 這是什麼

《我熱愛值班》一般民眾版的範本：一個瀏覽器 3D 值班遊戲。玩家是值班醫師，17:00 值到 08:00，接電話、到床邊做選擇、照顧自己的精力／肚子／尿意。介面文字是繁體中文（台灣用語）。

## 指令

- `npm start`：本機伺服器 `http://127.0.0.1:8790/`（`tools/serve.mjs`，不需要套件）
- `npm test`：檢查 `game/public-cases.js`（`tests/check-data.mjs`，不需要套件）
- 沒有 build、沒有 bundler、沒有 `node_modules`。**不要加相依套件**，也不要從 CDN 載入任何東西；three.js 已經放在 `game/vendor/three/`。

## 架構

- `index.html`：所有畫面元素都在這裡（`hidden` 切換）。`game.js` 用 `$('id')` 抓它們。
- `game/game.js`：ES module。最上面是常數、`GAME`（名稱）、`CREDIT`（出處），之後整個遊戲都在 `async function boot()` 裡。區塊以 `// ---------- 名稱 ----------` 分隔：
  - 病房（textures → floor → walls → beds → rooms → people → lights → render pipeline）：程序產生的 three.js 場景：一條走廊、南邊 12 間病房、北邊一排核心房間。`CASE_ROOMS` 決定哪些房間的床有床頭燈和監視器。
  - `calls`：`CASES`（每一床會響的東西；`kind: 'false'` 是小事電話被跑去看時演的那一幕，`kind: 'public'` 是病人，在 `startPublicNight` 才加進來），`PACE`，`night`，整晚狀態 `S`。
  - `HUD`、`interactions`（`nearest`、`act`、`pressC`、`spawnCase`、`resolve`、`openCase`、`ring`）。
  - `the night's patients`：`NIGHT_SLOTS` + `startPublicNight`（抽今晚的床、排時間）、`publicTick`（每格畫面：時間到就響電話、病人等太久就變差）、`publicCall` / `publicAnswer`（電話卡的三種答法）、床邊（`openPublicCase`、`renderPublicCase`、`choosePublic`、`publicArrest`、`startCpr`、`cprPress`、`publicDeath`）、`publicSummary`（結算）。
  - `sharing`：分享圖卡（1080×1920 canvas）、`drawStamp`（大爛班印章）。
  - `start`、`17:00 handover`、`input`、`pause`、`movement`、`loop`（`runFrame`）。
- 狀態：一個物件 `S`。`S.mode` 是現在在做什麼：`walk`、`eat`、`sleep`、`toilet`、`chat`、`scall`（電話卡）、`interrupt`（吃飯被打斷）、`recall`（護理師再打來）、`pcase`（床邊）、`pdead`（死亡畫面）、`false`（白跑一趟那一幕）、`lab`（看檢驗報告）、`end`。`runFrame` 依 `S.mode` 決定時鐘速度（`PACE` × `PUBLIC_PACE`）。床邊的狀態在 `PC`。
- `game/public-cases.js`：純資料，`game.js` 只負責播放。格式見 README〈加一床病人〉和檔案裡的註解。
- `game/chatter.js`：可以聊天的人和台詞（`when` 依時間、精力等條件出現）。
- `assets/game/char/*.svg`：佔位立繪，由 `tools/make-placeholders.mjs` 產生（`IMG()` 指到這裡）。病房本身沒有任何圖檔，全部是 `game.js` 用程式蓋的。
- `game/game.css`：全部樣式。手機橫拿、矮螢幕有各自的 `@media` 區塊。

## 慣例

- 註解說「為什麼」和「玩家會看到什麼」，用英文、完整句子，和現有程式碼一樣的密度。不要留下「已修改」「新增」這類註解。
- 畫面上的字一律繁體中文，口語、短句。醫療內容寫給一般民眾：不寫藥物劑量，監視器用白話。
- 沿用現有寫法：`$('id')`、`toast()`、`plog()`、`fmt()`、`pickN()`；新的畫面元素加在 `index.html`，樣式加在 `game.css`。
- 改 `public-cases.js` 的格式時，同步更新 `tests/check-data.mjs`、README 的欄位表、檔案裡的格式註解。
- 新增病床可用的房間要加到 `CASE_ROOMS`；新增小事電話要在 `CASES` 加一個 `v-` 開頭的場景；新增監視器第四格的種類要加到 `EXTRA`。測試會從 `game.js` 讀這三個表。
- `NIGHT_SLOTS` 的抽床規則改了，`tests/check-data.mjs` 最後模擬抽床的那段也要一起改（它照抄同一套規則）。

## 不要做

- 不要拿掉或改掉出處：`game.js` 的 `CREDIT`、`index.html` 的兩個 `<p class="credit">`、分享圖卡最下面那行。這是授權要求的（LICENSE.md）。可以在旁邊加上新作者的名字。
- 不要拿掉開始畫面的醫療提醒（`#gDisclaimer`）。
- 不要從網路或其他專案抓角色圖、照片放進來；立繪只用使用者自己提供的，或 `tools/make-placeholders.mjs` 畫的。
- 「我熱愛值班」這個名稱不在授權範圍：幫使用者改出自己的遊戲時，提醒他們把 `GAME.title` 和 `index.html` 的標題換成自己的名字。
- 不要加統計、廣告、追蹤或任何會把玩家資料送出去的東西，除非使用者明確要求，而且要在 README 寫清楚。
- 不要把醫療內容寫得像臨床指引；新的病床要提醒使用者請醫師看過。

## 改完之後

1. `npm test` 要過。
2. `npm start`，用 `http://127.0.0.1:8790/?debug` 玩到改到的地方，主控台不能有錯誤。`?debug` 會開 `window.__ward`：`__ward.S`、`__ward.step(n)`（往前跑 n 格畫面；分頁在背景時畫面不會自己跑）、`__ward.openCase(id)`、`__ward.publicCall(...)`、`__ward.startSleep()`；按 `]` 快轉 30 分鐘。
3. 改到版面的話，用手機橫向尺寸（例如 812×375）看一次。
