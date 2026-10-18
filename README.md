# 我熱愛值班 · 一般民眾版範本

一個用瀏覽器就能玩的 3D 值班遊戲範本。你是今晚的值班醫師，一個人顧整層病房，從 17:00 值到隔天 08:00。電話會響：有的只是小事，有的是真的危險。到了床邊，用選的決定怎麼做；選錯，病人會變差。吃飯、睡覺、上廁所，都得自己找空檔。

這是《我熱愛值班》一般民眾體驗版拿掉專業版和統計之後的骨架，只開放程式和文字：附兩床範例病人（低血糖、中風），角色是簡單的佔位圖。劇情、對話、病床都是資料，改 `game/public-cases.js` 就能做出你自己的一晚。

- 不用安裝任何套件，不用打包，純 HTML + JavaScript（three.js 已經放在專案裡）
- 手機、平板、電腦都能玩（手機要橫著拿）
- 只能非商業使用、要標示出處，詳見下面的〈授權〉

## 先玩玩看

需要 [Node.js](https://nodejs.org/) 18 以上：

```bash
npm start
```

打開它印出來的網址（`http://127.0.0.1:8790/`）。沒有 Node.js 的話，用 Python 也可以：

```bash
python -m http.server 8790 --bind 127.0.0.1
```

直接雙擊 `index.html` 不行：瀏覽器不讓本機檔案載入 JavaScript 模組，一定要透過伺服器。

## 資料夾

```
index.html              整個遊戲的畫面：開始卡、交班單、床邊、電話、結算……
game/
  game.js               遊戲本體：蓋病房、走路、電話、床邊、計時、結算、分享圖卡
  game.css              所有畫面的樣式
  public-cases.js       ★ 一晚會發生的事：小事電話、病人
  chatter.js            病房裡的人可以聊天的台詞
  vendor/three/         three.js（MIT 授權），3D 畫面用
assets/game/char/       角色立繪的佔位圖（SVG），換成你自己的圖
tests/check-data.mjs    npm test：檢查 public-cases.js 寫得對不對
tools/serve.mjs         npm start：本機伺服器
tools/make-placeholders.mjs  重畫佔位立繪
AGENTS.md               給 AI 寫程式工具（Claude Code、Codex、Cursor……）看的說明
LICENSE.md              授權
```

## 一晚怎麼進行

1. **開始卡**：輸入暱稱、選普通班或大爛班、選你的樣子。
2. **交班單**：白班交代幾床平安的病人（都是隨機的），按「開始值班」時間才開始走。
3. **值班**：
   - 電話響了，有三種答法：**過去看**、**電話交代**、**先不管（繼續睡）**。只能從護理師說的話判斷是小事還是危險。
   - 是小事卻跑去看，會「白跑一趟」；是病人卻沒去，他會變差，護理師會再打來。
   - 到了床邊，每一題選一個做法。選對往下走；選錯會劃掉、說明為什麼，病人變差，錯太多心跳會停。
   - 心跳停了要照節拍壓胸（每分鐘 100–120 下，連續 30 下）。範例裡低血糖那床拖太久就會走到這一步。
   - 精力、肚子、尿意會一直變。精力低於 20% 跑不動，歸零就累倒，今晚結束。
4. **結算**：穩住幾床、被吵醒幾次、幾通其實電話講就好，加上每一床「你可以記住的事」。可以分享成限時動態大小的圖卡。

床邊死掉可以「從這一床重來」，結算會記下重來幾次。

### 病人什麼時候打來

`game.js` 的 `NIGHT_SLOTS` 決定時段。普通班想要 4–6 床、大爛班 6–8 床，但不會超過 `PUBLIC_CASES` 裡有的床數。時段照這個順序排：

| 順序 | 時段 | 說明 |
|---|---|---|
| 1 | 晚餐 | 便當吃到一半打來（一直沒去吃的話，19:00 也會打來） |
| 2 | 03:00–04:30 | 半夜睡最熟的時候 |
| 3 | 17:55–18:30 | 剛接班 |
| 4 | 熄燈後 | 先響兩通小事，再來這一床 |
| 5 | 05:30–07:00 | 白班來之前 |
| 6 | 19:20–20:30 | 傍晚 |
| 7 | 22:30–23:10 | 熄燈前 |
| 8 | 01:00–01:50 | 半夜 |

只有兩床的範本，一晚就是「晚餐一床 + 半夜一床」。加越多床，晚上越忙。病人寫了 `night: true`（電話裡說「半夜」的），只會被排到熄燈（23:30）以後的時段。

另外每晚一定有：傍晚兩通小事、熄燈後兩通小事、半夜一通、天亮前兩通。

## 加一床病人

這是最常做的事。

1. 打開 `game/public-cases.js`，複製 `HYPO`（低血糖）整段，改名，例如 `ASTHMA`。
2. 改 `id`（不能和別床重複，習慣用 `p` 開頭）和 `bed`（床號，從下面「可以用的床號」挑一個沒人用的）。
3. 改人物、電話、床邊的對話、監視器的狀態（`states`）、題目（`steps`）、檢驗報告（`labs`）、衛教卡（`card`）。
4. 加到最下面的 `PUBLIC_CASES` 裡：`export const PUBLIC_CASES = [HYPO, STROKE, ASTHMA];`
5. 跑 `npm test`，照它說的修。
6. `npm start`，網址加 `?debug`，玩一晚看看（見下面〈測試〉）。

### 一床病人的欄位

| 欄位 | 是什麼 |
|---|---|
| `id`, `bed`, `nurse`, `name`, `who` | 病人是誰、在哪一床、哪位護理師（怡君、小雯、佳穎） |
| `short` | call 欄上的一行字 |
| `night` | `true`：電話裡說「半夜」，只排在熄燈後 |
| `call` | 第一通電話。`{bed}` 會換成床號 |
| `again` | 醫師沒來，護理師第二通電話（病人變差了） |
| `phone`, `callWhy` | 電話上可以怎麼交代（看起來像小事的答法），以及為什麼這床一定要有人去看 |
| `intro`, `introLate`, `late` | 到床邊時護理師說的話；拖太久才來時說的話，和那時病人的狀態 |
| `extra`, `extraOk`, `extraWarn` | 監視器第四格：`sugar`（血糖）、`ekg`、`breath`、`urine`、`skin`、`head`、`fit`、`temp`、`rr`、`stool`、`rhythm`；哪些字算正常、哪些算警訊 |
| `states` | 監視器上的狀態：`hr`（心跳，0 = 摸不到）、`bp`（`[收縮, 舒張]`，`null` = 量不到）、`spo2`、`mind`（意識，用白話），以及第四格的讀數（例如 `sugar: 38`；`null` = 還沒測，`undefined` = 沿用上一次測到的） |
| `steps` | 題目。第一題叫 `first` |
| `warn` | 危險度到 3 時的警訊（狀態、護理師喊的話、紀錄） |
| `arrestLine`, `cprNext`, `cprState`, `cprLine` | 心跳停止那一題用的；壓胸成功後接哪一題 |
| `fail` | 沒有 `arrest` 題的床（例如中風），錯太多時怎麼結束 |
| `results` | 每種結局一句話，例如 `{ stable: '王阿伯穩住了', icu: '……轉進加護病房' }` |
| `labs` | 抽血報告：`rows` 是 `[項目, 結果, 單位, 參考值, 'H' 或 'L']`，`note` 是白話說明 |
| `card` | 結算時「你可以記住的事」：`title` 和幾點 `points` |

### 一個題目、一個選項

```js
first: {
  ask: '阿伯叫不太醒、全身冒冷汗。你先做什麼？',
  askWarn: '阿伯在抽搐、叫不醒。你先做什麼？',   // 病人在警訊狀態（或拖太久才到）時改問這句，可省略
  options: [
    { id: 'sugar', text: '扎一下手指，測血糖', grade: 'best', min: 2, state: 'low', next: 'treat',
      say: '血糖機「嗶」一聲：38。' },
    { id: 'letsleep', text: '讓他睡，可能只是太累了', grade: 'bad', min: 10, state: 'worse',
      say: '十分鐘後，怡君又跑來……', why: '叫不醒不是睡著。' },
  ],
},
```

- `grade`：`best` 往下走；`ok` 危險度 +1、`bad` +2，選項會被劃掉並顯示 `why`。危險度 3 出現警訊，5 心跳停止（或走 `fail`）。
- `min`：這個做法花幾分鐘，會算進時鐘。
- `next`：下一題的名字，`'done'` 結束（要配 `outcome`，對到 `results`），`'arrest'` 直接心跳停止。
- `state`：選了之後監視器變成哪個狀態。
- `say`：護理師或旁白接著說的話。
- `cpr: true`：開始壓胸小遊戲；壓完接 `cprNext`。
- `death`：選了就死（例如心跳停了還在測血糖），寫為什麼。
- `draw: true`：這個做法順便抽血，報告 30 分鐘後出來。
- 一題最多四個選項。畫面上的順序每次都會打亂，所以資料裡怎麼排都可以（習慣把 best 放第一個）。

### 可以用的床號

病床的床頭燈和監視器是事先蓋好的，只有這幾間房的床可以響（每間 A、B、C 三床）：

`03` `04` `06` `07` `08` `11`

例如 `03C`、`08B`。要開放別間，把房號加到 `game.js` 的 `CASE_ROOMS`。護理師的分區：怡君 01–04、小雯 05–08、佳穎 09–12。同一床可以給小事電話和病人共用，但兩位病人不能同一床。

## 加一通小事電話

小事在 `public-cases.js` 最上面：`PUBLIC_CALLS`（傍晚和熄燈後）、`DEEP_CALLS`（半夜）、`DAWN_CALLS`（天亮前）。

```js
{ id: 'iv', short: '點滴打完了', need: 'phone', bed: '03A', visit: 'v-iv',
  text: '醫師，{bed} 的點滴打完了，要再接一瓶一樣的嗎？',
  phone: '再接一瓶一樣的', phoneReply: '怡君：「好，我接上。」',
  sleepNote: '等不到你回電，怡君先把點滴調到最慢，沒事。' },
```

- `need`：`'none'` 不理也沒事；`'phone'` 電話交代最好。
- `visit`：醫師真的跑去看時演的那一幕，寫在 `game.js` 的 `CASES` 裡（`'v-iv': { …, line: '醫師，電話說「續原本的」就好了啦……' }`）。新的小事要在那邊加一幕。
- `night: true`：只在熄燈後響。

## 病房和角色的畫面

**病房**：整層樓是 `game.js` 用程式蓋出來的（方塊、圓柱、canvas 畫的貼圖），沒有照片、沒有 3D 模型檔，也不是照哪一家醫院蓋的。配置很簡單：一條東西向的走廊，南邊 12 間病房（01 在東端），北邊從東到西是護理站、準備室、治療室、庫房、討論室、污物間、茶水間、值班室、被服間，走廊西端是安全梯。

想換顏色、家具、門牌，改 `game.js` 裡病房那幾段（`textures`、`floors`、`walls`、`beds`、`nurse station`……）；顏色大多集中在 `FIN`（牆面）和 `B_M`（病床）。房間寬度 `RW`、走廊位置 `ZCS`／`ZFC` 這些座標在檔案最上面。

**角色立繪**：範本不附《我熱愛值班》正式版的立繪。`assets/game/char/` 裡是 `tools/make-placeholders.mjs` 畫的佔位圖：一個角色一種表情一張，例如 `nurse_worried.svg`、`pgy_f_eating.svg`。換成你自己的圖：

1. 照同樣的檔名放進 `assets/game/char/`，建議 600×800、背景透明。
2. 如果是 PNG，把 `game/game.js` 的 `IMG` 和 `index.html` 裡的 `.svg` 改成 `.png`。
3. `npm test` 會檢查每一張遊戲用得到的圖都在。

要用的表情：護理師 `nurse_` + neutral、worried、panic、shocked、relieved、annoyed、thankful、caring、sleepy、stern、holding_laugh、deadpan；值班醫師 `pgy_m_`／`pgy_f_` + neutral、sleepy、eating、nervous、scolded、confident、survived；聊天的同事 `chief_approve`、`chief_tired`、`akai_coffee`、`azhu_smile`。

## 改名字、出處、網址

- 遊戲名稱和版本：`game/game.js` 最上面的 `GAME`，還有 `index.html` 的 `<title>`、`<meta>` 和畫面上的「我熱愛值班 · 一般民眾體驗版」。**公開你的版本時，請取你自己的遊戲名稱**：「我熱愛值班」這個名字不在授權範圍內（見〈授權〉）。
- 出處：`game/game.js` 的 `CREDIT`，會顯示在開始畫面、結算畫面和分享圖卡上。**請保留**（見〈授權〉）。你可以在旁邊加上你自己的名字。
- 上線後，把 `index.html` 裡註解起來的 `og:url`、`og:image` 填上你的網址，LINE、Facebook 分享時才會有預覽圖。

## 調難度

| 想改的 | 在哪裡 |
|---|---|
| 一晚幾床病人 | `startPublicNight` 的 `want`（普通班 4–6、大爛班 6–8），和 `NIGHT_SLOTS` |
| 時間走多快 | `PACE`（走路、床邊、睡覺時每秒幾分鐘），整體再乘 `PUBLIC_PACE` |
| 精力消耗 | `SPEND`（大爛班 ×2），`runFrame` 裡的 `0.045`（醒著）和 `0.45`（睡覺補回） |
| 跑不動的門檻 | `TIRED`（20%） |
| 抽血報告多久出來 | `LAB_WAIT`（30 分鐘） |
| 病人等多久會變差 | `publicTick` 裡的 `30`（分鐘） |
| 壓胸節拍 | `public-cases.js` 的 `CPR` |

## 測試

```bash
npm test
```

檢查 `public-cases.js`：欄位有沒有漏、`next` 指到的題目在不在、床號能不能用、一路選 best 能不能走完、每個結局有沒有選項會走到。最後模擬一千個晚上，告訴你一晚會排到幾床。

在瀏覽器裡測：網址加 `?debug`（例如 `http://127.0.0.1:8790/?debug`）

- 按 `]` 時間快轉 30 分鐘
- 主控台（F12）有 `window.__ward`：`__ward.S` 是整晚的狀態，`__ward.step(n)` 往前跑 n 格畫面，`__ward.openCase('phypo')` 直接打開某一床

`?ward=6B` 可以指定今晚的病房名稱（`5A`、`5B`、`6A`、`6B`、`7A`、`7B`，改 `game.js` 的 `WARDS`），不指定就隨機。

## 上線

沒有打包步驟，整個資料夾就是網站。放到 GitHub Pages、Cloudflare Pages、Netlify 或任何能放靜態檔案的地方都可以。

遊戲不會連到任何外部網站：沒有統計、沒有廣告、不用登入，暱稱只存在玩家自己的瀏覽器裡。

## 醫療內容

範例病人的處置是寫給一般民眾看的衛教劇情，不是臨床指引，也不寫藥物劑量。你加的每一床，上線前都請醫師看過。遊戲畫面上已經有一行提醒：「遊戲僅供衛教，不能取代就醫；遇到緊急狀況請打 119」，請保留。

## 授權

只開放程式和文字，**不得商業使用，也不提供商業授權**。

- **程式碼**（含佔位立繪）：[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
- **文字**（範例病人、小事電話、聊天台詞、畫面上的字）：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hant)
- **three.js**：MIT（`game/vendor/three/LICENSE`）
- **不在授權範圍**：《我熱愛值班》正式版的角色立繪、其他病例、專業醫師版，以及「我熱愛值班」這個名稱。

簡單說：個人、學校、醫院、社團、非營利活動可以用、可以改、可以免費分享；不能拿來賺錢；要保留遊戲裡「以《我熱愛值班》範本製作 · drcharming.net」那一行；在遊戲以外引用範例劇情，要寫明用了哪一段和出處。細節見 [LICENSE.md](LICENSE.md)。

## 貢獻

這個範本不接受 pull request。發現錯誤或有建議，歡迎開 issue。
