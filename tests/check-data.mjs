// npm test: checks game/public-cases.js against what game/game.js can play, without a browser.
//
// A bed with a typo in it (a `next` that names no question, a state the monitor does not know, a
// room with no bed lamp) loads fine and breaks only when a player reaches that choice, so every
// one of those is caught here instead. At the end it draws a thousand nights of each shift, the
// way startPublicNight does, and says how many patients a night gets from the beds listed.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url);
const read = rel => readFileSync(fileURLToPath(new URL(rel, root)), 'utf8');
const data = await import(pathToFileURL(fileURLToPath(new URL('game/public-cases.js', root))).href);
const game = read('game/game.js'), page = read('index.html');
const { PUBLIC_CALLS, DEEP_CALLS, DAWN_CALLS, AFTER_PHONE, PUBLIC_CASES, CPR } = data;

const problems = [];
const fail = (where, what) => problems.push(`${where}：${what}`);
const isText = v => typeof v === 'string' && v.trim().length > 0;

// ---------- what game.js knows: the beds that can ring, the scenes for a small call walked to,
// the monitor's fourth reading ----------
const caseRooms = game.match(/const CASE_ROOMS = \[([^\]]*)\]/);
if (!caseRooms) throw new Error('game.js 裡找不到 CASE_ROOMS');
const BEDS = new Set([...caseRooms[1].matchAll(/'(\d{2})'/g)].flatMap(m => ['A', 'B', 'C'].map(L => m[1] + L)));
const casesBlock = game.match(/const CASES = \{([\s\S]*?)\n {2}\};/);
if (!casesBlock) throw new Error('game.js 裡找不到 CASES');
const VISITS = new Set([...casesBlock[1].matchAll(/'(v-[\w-]+)': \{/g)].map(m => m[1]));
const extraBlock = game.match(/const EXTRA = \{([\s\S]*?)\};/);
if (!extraBlock) throw new Error('game.js 裡找不到 EXTRA');
const EXTRA = new Set([...extraBlock[1].matchAll(/(\w+): \[/g)].map(m => m[1]));

// ---------- the small calls ----------
const smallIds = new Set();
for (const [list, name] of [[PUBLIC_CALLS, 'PUBLIC_CALLS'], [DEEP_CALLS, 'DEEP_CALLS'], [DAWN_CALLS, 'DAWN_CALLS']]) {
  if (!Array.isArray(list)) { fail(name, '要是一個陣列'); continue; }
  for (const c of list) {
    const at = `${name} ${c.id || '(沒有 id)'}`;
    if (!isText(c.id)) fail(at, '沒有 id');
    else if (smallIds.has(c.id)) fail(at, 'id 重複了'); else smallIds.add(c.id);
    if (!['none', 'phone'].includes(c.need)) fail(at, `need 要是 'none'（不用理也沒事）或 'phone'（電話交代就好），現在是 ${JSON.stringify(c.need)}`);
    if (!BEDS.has(c.bed)) fail(at, `床號 ${c.bed} 不在 game.js 的 CASE_ROOMS 裡（那一床沒有床頭燈和監視器）`);
    if (!VISITS.has(c.visit)) fail(at, `visit '${c.visit}' 在 game.js 的 CASES 裡找不到（醫師跑去看時要演的那一幕）`);
    for (const k of ['short', 'text', 'phone', 'phoneReply', 'sleepNote']) if (!isText(c[k])) fail(at, `缺少 ${k}`);
    if (isText(c.text) && !c.text.includes('{bed}')) fail(at, 'text 裡要有 {bed}，遊戲會換成床號');
  }
}
if (PUBLIC_CALLS.filter(c => !c.night).length < 2) fail('PUBLIC_CALLS', '至少要有兩通沒有標 night 的小事（傍晚會響兩通）');
if (PUBLIC_CALLS.length < 4) fail('PUBLIC_CALLS', '至少要有四通（傍晚兩通、熄燈後兩通）');
if (!DEEP_CALLS.length) fail('DEEP_CALLS', '至少要有一通');
if (DAWN_CALLS.length < 2) fail('DAWN_CALLS', '至少要有兩通');
if (!Array.isArray(AFTER_PHONE) || !AFTER_PHONE.length || !AFTER_PHONE.every(isText)) fail('AFTER_PHONE', '至少要有一句');

// ---------- the beds ----------
const GRADES = new Set(['best', 'ok', 'bad']);
function checkBed(c) {
  const at = c?.id || '(沒有 id 的床)';
  const need = ['id', 'bed', 'nurse', 'name', 'who', 'short', 'call', 'again', 'phone', 'callWhy', 'intro', 'introLate', 'late', 'extra',
    ...(c.steps?.arrest ? ['arrestLine'] : [])];
  for (const k of need) if (!isText(c[k])) fail(at, `缺少 ${k}`);
  if (!BEDS.has(c.bed)) fail(at, `床號 ${c.bed} 不在 game.js 的 CASE_ROOMS 裡（那一床沒有床頭燈和監視器）`);
  if (isText(c.call) && !c.call.includes('{bed}')) fail(at, 'call 裡要有 {bed}');
  if (isText(c.again) && !c.again.includes('{bed}')) fail(at, 'again 裡要有 {bed}');
  if (!EXTRA.has(c.extra)) fail(at, `extra '${c.extra}' 監視器不認得，可以用：${[...EXTRA].join('、')}`);
  const states = c.states || {}, steps = c.steps || {}, results = c.results || {};
  if (!states.start) fail(at, 'states 裡要有 start（醫師剛到床邊時的樣子）');
  for (const [k, st] of Object.entries(states)) {
    if (typeof st.hr !== 'number') fail(`${at} states.${k}`, 'hr（心跳）要是數字，0 代表摸不到');
    if (!isText(st.mind)) fail(`${at} states.${k}`, '缺少 mind（意識，用白話寫）');
    if (st.bp !== null && !(Array.isArray(st.bp) && st.bp.length === 2)) fail(`${at} states.${k}`, 'bp 要是 [收縮壓, 舒張壓]，量不到寫 null');
  }
  if (!states[c.late]) fail(at, `late '${c.late}' 不在 states 裡`);
  if (!c.warn || !states[c.warn.state] || !isText(c.warn.line) || !isText(c.warn.log)) fail(at, 'warn 要有 state（在 states 裡）、line、log');
  if (!steps.first) fail(at, 'steps 裡要有 first（第一個問題）');
  if (!Object.keys(results).length) fail(at, 'results 至少要有一個結果');
  if (!c.labs || !Array.isArray(c.labs.rows) || !c.labs.rows.length || !isText(c.labs.note)) fail(at, 'labs 要有 rows 和 note');
  else c.labs.rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 4 || !isText(r[0]) || !isText(r[3])) fail(`${at} labs.rows[${i}]`, '要寫成 [項目, 結果, 單位, 參考值, 高低]');
    if (r[4] !== undefined && !['H', 'L'].includes(r[4])) fail(`${at} labs.rows[${i}]`, "第五格只能是 'H'、'L' 或不寫");
  });
  if (!c.card || !isText(c.card.title) || !Array.isArray(c.card.points) || !c.card.points.length) fail(at, 'card 要有 title 和 points');
  // a choice with cpr: true starts the compressions; when they are done, the bed goes on at cprNext
  const hasCpr = Object.values(steps).some(s => s.options?.some(o => o.cpr));
  if (hasCpr) {
    if (!steps[c.cprNext]) fail(at, `cprNext '${c.cprNext}' 不在 steps 裡（壓胸成功之後的問題）`);
    if (c.cprState && !states[c.cprState]) fail(at, `cprState '${c.cprState}' 不在 states 裡`);
    if (!isText(c.cprLine)) fail(at, '有壓胸的床要有 cprLine（壓胸成功時護理師說的話）');
  }
  if (steps.arrest && !steps.arrest.options?.some(o => o.cpr)) fail(at, 'arrest 這一題要有一個 cpr: true 的選項');
  if (!steps.arrest && (!c.fail || !isText(c.fail.title) || !isText(c.fail.text))) {
    fail(at, '沒有 arrest 這一題的床，要有 fail { title, text }（錯太多時怎麼結束）');
  }

  const usedOutcomes = new Set();
  for (const [sk, step] of Object.entries(steps)) {
    const where = `${at} steps.${sk}`;
    if (!isText(step.ask)) fail(where, '缺少 ask（問題）');
    if (!Array.isArray(step.options) || !step.options.length) { fail(where, '沒有選項'); continue; }
    if (step.options.length > 4) fail(where, '選項最多四個（鍵盤 1–4）');
    if (!step.options.some(o => o.grade === 'best')) fail(where, '至少要有一個 grade: best');
    for (const k of Object.keys(step.askBy || {})) if (!states[k]) fail(where, `askBy 的 '${k}' 不在 states 裡`);
    const ids = new Set();
    for (const o of step.options) {
      const w = `${where} ${o.id || '(沒有 id 的選項)'}`;
      if (!isText(o.id)) fail(w, '選項沒有 id'); else if (ids.has(o.id)) fail(w, '同一題裡 id 重複'); else ids.add(o.id);
      if (!isText(o.text)) fail(w, '缺少 text');
      if (!GRADES.has(o.grade)) fail(w, "grade 要是 'best'、'ok' 或 'bad'");
      if (typeof o.min !== 'number' || o.min < 0) fail(w, 'min（花幾分鐘）要是 0 以上的數字');
      if (o.state && !states[o.state]) fail(w, `state '${o.state}' 不在 states 裡`);
      if (o.next && o.next !== 'done' && o.next !== 'arrest' && !steps[o.next]) fail(w, `next '${o.next}' 不在 steps 裡`);
      if (o.next === 'arrest' && !steps.arrest && !c.fail) fail(w, 'next 是 arrest，可是這床沒有 arrest 題也沒有 fail');
      if (o.next === 'done') { if (!results[o.outcome]) fail(w, `outcome '${o.outcome}' 不在 results 裡`); else usedOutcomes.add(o.outcome); }
      if (o.grade !== 'best' && !o.death && o.next !== 'arrest' && !isText(o.why)) fail(w, '不是 best 的選項要寫 why（為什麼不好），會劃掉顯示給玩家');
      if (o.death !== undefined && !isText(o.death)) fail(w, 'death 要是一段話');
      if (o.draw && !c.labs) fail(w, 'draw: true 的床要有 labs');
    }
  }
  for (const k of Object.keys(results)) if (!usedOutcomes.has(k)) fail(at, `results.${k} 沒有任何選項會走到（outcome: '${k}'）`);
  // following only the best choices, the bed can be finished
  const seen = new Set(), queue = ['first'];
  let finishes = false;
  while (queue.length) {
    const sk = queue.shift(); if (seen.has(sk) || !steps[sk]) continue; seen.add(sk);
    for (const o of steps[sk].options.filter(o => o.grade === 'best')) {
      if (o.next === 'done') finishes = true;
      else if (o.cpr) queue.push(c.cprNext);
      else if (o.next) queue.push(o.next);
      else fail(`${at} steps.${sk} ${o.id}`, 'best 的選項要有 next（下一題，或 done 結束）');
    }
  }
  if (!finishes) fail(at, '從 first 一路選 best，走不到 done');
  for (const sk of Object.keys(steps)) {
    const reached = seen.has(sk) || Object.values(steps).some(s => s.options?.some(o => o.next === sk)) || (sk === 'arrest') || sk === c.cprNext;
    if (!reached) fail(`${at} steps.${sk}`, '沒有任何選項會走到這一題');
  }
}

const bedIds = new Set();
if (!Array.isArray(PUBLIC_CASES) || !PUBLIC_CASES.length) fail('PUBLIC_CASES', '至少要有一床');
for (const c of PUBLIC_CASES) {
  if (bedIds.has(c?.id)) fail(c.id, 'id 和別床重複了'); else bedIds.add(c?.id);
  if (smallIds.has(c?.id)) fail(c.id, 'id 和某一通小事的 id 重複了');
  checkBed(c);
}
const rooms = new Map();
for (const c of PUBLIC_CASES) { if (rooms.has(c.bed)) fail(c.id, `床號 ${c.bed} 和 ${rooms.get(c.bed)} 重複了`); else rooms.set(c.bed, c.id); }
if (!(CPR.presses > 0 && CPR.slowest < CPR.fastest && CPR.maxGap > 0)) fail('CPR', 'presses、slowest、fastest、maxGap 的數字不合理');

// ---------- the credit line the license asks for ----------
if (!/const CREDIT = \{ text: '[^']+', url: 'https?:\/\/[^']+' \}/.test(game)) fail('game.js', 'CREDIT 要有 text 和 url（授權要求保留出處）');
if ((page.match(/class="credit"/g) || []).length < 2) fail('index.html', '開始畫面和結算畫面都要有 <p class="credit"></p>（授權要求保留出處）');

// ---------- every portrait the game asks for has a file ----------
const ext = (game.match(/const IMG = n => `assets\/game\/char\/\$\{n\}(\.\w+)`/) || [])[1];
if (!ext) fail('game.js', '找不到 IMG（立繪的路徑）');
else {
  const chatter = read('game/chatter.js'), cases = read('game/public-cases.js');
  const wanted = new Set([
    ...[game, chatter, page].flatMap(src => [...src.matchAll(/['"/]((?:nurse|chief|akai|azhu)_[a-z_]+)(?:'|"|\.\w+)/g)].map(m => m[1])),
    ...[...game.matchAll(/\bME\('([a-z_]+)'\)/g)].flatMap(m => [`pgy_m_${m[1]}`, `pgy_f_${m[1]}`]),
    ...[...page.matchAll(/char\/(pgy_[mf]_[a-z_]+)\./g)].map(m => m[1]),
    ...[...cases.matchAll(/\bface: '([a-z_]+)'/g), ...casesBlock[1].matchAll(/\bface: '([a-z_]+)'/g)].map(m => `nurse_${m[1]}`),
  ]);
  for (const name of wanted) {
    if (!existsSync(fileURLToPath(new URL(`assets/game/char/${name}${ext}`, root)))) fail('立繪', `缺少 assets/game/char/${name}${ext}`);
  }
}

// ---------- a thousand nights: how many patients the bank gives ----------
// NIGHT_SLOTS is read from game.js; the fill below mirrors startPublicNight's
const slotsSrc = game.match(/const NIGHT_SLOTS = (\[[\s\S]*?\n {2}\]);/);
if (!slotsSrc) throw new Error('game.js 裡找不到 NIGHT_SLOTS');
const NIGHT_SLOTS = Function(`return ${slotsSrc[1]};`)();
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
function draw(shift) {
  const want = (shift === 'hard' ? 6 : 4) + Math.floor(Math.random() * 3);
  const left = shuffle(PUBLIC_CASES), filled = [];
  for (const slot of NIGHT_SLOTS) {
    if (filled.length >= want) break;
    const fits = left.filter(c => slot.dark || !c.night);
    const c = (slot.dark && fits.find(x => x.night)) || fits[0];
    if (!c) continue;
    left.splice(left.indexOf(c), 1); filled.push({ ...slot, c });
  }
  return filled;
}
const summary = [];
for (const shift of ['normal', 'hard']) {
  const counts = new Map(); let noDinner = 0;
  for (let i = 0; i < 1000; i++) {
    const night = draw(shift);
    counts.set(night.length, (counts.get(night.length) || 0) + 1);
    if (!night.some(f => f.name === 'dinner')) noDinner++;
    for (const f of night) if (f.c.night && !f.dark) fail('抽床', `${f.c.id} 標了 night，卻被排到熄燈前的 ${f.name}`);
  }
  summary.push(`${shift === 'hard' ? '大爛班' : '普通班'}：每晚 ${[...counts.keys()].sort().join('、')} 床${noDinner ? `（${noDinner / 10}% 的晚上沒有晚餐那一床）` : ''}`);
}

if (problems.length) {
  console.error(`檢查到 ${problems.length} 個問題：\n` + [...new Set(problems)].map(p => `  ✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ public-cases.js 沒問題：${PUBLIC_CASES.length} 床病人、小事 ${smallIds.size} 通`);
console.log(`  ${summary.join('；')}`);
if (PUBLIC_CASES.length < 8) console.log(`  床數比班別想要的少：再加床，晚上就會更忙（大爛班最多排到 8 床）`);
