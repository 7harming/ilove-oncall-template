// What happens on the night, as data: the small calls and the patients.
//
// A bed is a short script of choices. Each option is something you could do at the bedside; the
// best one moves the case on, the others make the patient worse and explain why. Every option
// names how many minutes it takes, so a slow night shows on the clock.
//
// Written for the public: no drug doses, no jargon on the monitor. Anything clinical here should
// be checked by a physician before it ships -- see README.md (醫療內容).
//
// This template ships two sample beds (HYPO, STROKE). Add a bed by copying one of them, giving it its own id and bed, and listing it in PUBLIC_CASES at the end;
// `npm test` checks the shape. AGENTS.md has the full list of fields.

// The calls that need nobody at the bed: two ring in the evening, two after lights out. The
// point is what it is like to be called, and woken, for each of them anyway. `visit` is the
// scripted scene if the doctor goes to look (see CASES in game.js); `night` keeps one after dark.
export const PUBLIC_CALLS = [
  { id: 'new', short: '新病人報到', need: 'none', bed: '03B', visit: 'v-new',
    text: '醫師，{bed} 剛從急診上來一位新病人，肺炎，生命徵象都很穩，跟你報告一下。',
    phone: '好，有變化再叫我', phoneReply: '怡君：「好，醫師晚安～」',
    sleepNote: '其實不回也沒事，護理師只是照規定跟你報告。' },
  { id: 'ins', short: '病人睡不著', need: 'phone', bed: '08A', visit: 'v-ins', night: true,
    text: '醫師，{bed} 的阿伯說睡不著，可以給他一顆平常吃的安眠藥嗎？',
    phone: '可以，給他平常那一顆', phoneReply: '小雯：「好，我去給他。」',
    sleepNote: '沒回電話，阿伯醒著看電視到天亮，小雯有點不爽。' },
  { id: 'iv', short: '點滴打完了', need: 'phone', bed: '03A', visit: 'v-iv',
    text: '醫師，{bed} 的點滴打完了，要再接一瓶一樣的嗎？',
    phone: '再接一瓶一樣的', phoneReply: '怡君：「好，我接上。」',
    sleepNote: '等不到你回電，怡君先把點滴調到最慢，沒事。' },
  { id: 'fam', short: '家屬問出院時間', need: 'phone', bed: '11A', visit: 'v-fam',
    text: '醫師，{bed} 的家屬想問，明天早上幾點可以辦出院？',
    phone: '明天主治醫師查房時會說明', phoneReply: '佳穎：「好，我跟家屬說。」',
    sleepNote: '家屬在護理站等了半小時，佳穎只好自己先安撫。' },
];
// Two more just before the day shift, every night, around the morning's patient: the phone
// still rings for small things. The insomniac from midnight wants a laxative; the new patient's 06:00
// pressure is reported because the rules say so.
export const DAWN_CALLS = [
  { id: 'stool', short: '三天沒大便', need: 'phone', bed: '08A', visit: 'v-stool',
    text: '醫師，{bed} 的阿伯又按鈴了，說他三天沒大便，想要一顆軟便藥。',
    phone: '可以，給他一顆軟便藥', phoneReply: '小雯：「好，我拿給他。」',
    sleepNote: '沒回電話，阿伯又按了兩次叫人鈴，小雯只好跟他說等白班醫師。' },
  { id: 'bp', short: '早上血壓有點高', need: 'none', bed: '03B', visit: 'v-bp',
    text: '醫師，跟你報告一下，{bed} 昨天新來的病人，早上六點量血壓 148/86，他說沒有不舒服。',
    phone: '好，沒有不舒服就先觀察，交班時我會說', phoneReply: '怡君：「好～醫師你再睡一下，快交班了。」',
    sleepNote: '其實不回也沒事：血壓有一點高、人沒有不舒服，本來就可以等白班。' },
];
// The dead of night, every night: the patient going home tomorrow runs a low temperature and the
// rules say the doctor is told. It wakes the doctor not long before the patient of the dead of night.
export const DEEP_CALLS = [
  { id: 'temp', short: '體溫 37.8 度', need: 'phone', bed: '11A', visit: 'v-temp',
    text: '醫師，跟你報告一下，{bed} 明天要出院的病人體溫 37.8 度，沒有發抖、沒有不舒服，睡得還不錯。',
    phone: '先多喝水，一小時後再量，超過 38 度或有發抖、喘再叫我', phoneReply: '佳穎：「好，我一小時後再量。」',
    sleepNote: '沒回電話，佳穎一小時後再量一次：37.4，沒事。' },
];
// what goes through the doctor's head after hanging up, one at random
export const AFTER_PHONE = [
  '眼睛閉上了，腦袋還在想剛剛那床。',
];

// Each bed below has the same shape:
//   id, bed, nurse, name, who        who the patient is and where
//   call, again                      the phone call, and the second one if the doctor slept on it
//   phone, callWhy                   what a doctor might say on the phone instead of coming (the
//                                    call offers it like any other call), and why this one needed
//                                    someone at the bed; the nurse's second call says it
//   intro, introLate, late           what the nurse says at the bed; `late` is the state a
//                                    patient is found in after the doctor slept on the call
//   extra, extraOk, extraWarn        the monitor's fourth reading: 'sugar', 'ekg', 'breath', 'urine',
//                                    'skin', 'head', 'fit', 'temp', 'rr', 'stool' or 'rhythm', and which of its
//                                    words read as fine or as a worry
//   states                           the monitor in plain words; undefined keeps the last reading
//   steps                            the questions (see below); the first is `first`
//   warn                             what happens at danger 3: the first sign it is going badly
//   arrest step + cprNext/cprLine    when danger reaches 5 the heart stops; compressions are the
//                                    last chance. A bed with no arrest step fails instead (fail).
//   results                          a line per outcome, for the end of the bed and the summary
//   option draw: true                the choice draws blood as part of the care; it counts as the
//                                    bed's one blood test, and its report is the labs below
//   labs                             what a blood draw at this bed shows, LAB_WAIT game minutes
//                                    later: rows of [項目, 結果, 單位, 參考值, H/L] and a plain note
//                                    (a result written as a string, '1.0', is shown exactly so)
//   card                             what the public should take home

// One bed: an old man with diabetes, found sweaty and hard to wake at night.
export const HYPO = {
  id: 'phypo', bed: '03C', nurse: '怡君', name: '王阿伯', who: '王阿伯 · 72 歲 · 糖尿病',
  short: '叫不太醒，一直冒冷汗', late: 'seize', extra: 'sugar',
  results: { stable: '王阿伯穩住了', icu: '王阿伯救回來了，轉進加護病房' },
  labs: {
    rows: [['血糖 Glucose', 38, 'mg/dL', '70–100', 'L'], ['肌酸酐 Creatinine（腎功能）', 1.6, 'mg/dL', '0.7–1.3', 'H'],
      ['鉀 K', 3.9, 'mmol/L', '3.5–5.1'], ['血紅素 Hb', 12.8, 'g/dL', '12–16']],
    note: '抽血的血糖也是 38，跟床邊血糖機一樣低。血糖機一分鐘就有答案，抽血要等半小時，所以叫不醒的人先用血糖機。腎功能偏差，降血糖藥在身體裡排得慢，低血糖更容易發生，也更容易再來。',
  },
  call: '醫師！{bed} 的王阿伯叫不太醒，一直冒冷汗！',
  // if the doctor sleeps on the first call
  again: '醫師！{bed} 的阿伯開始抽搐了，叫都叫不醒，你快來！',
  phone: '先幫他擦擦汗、量個血壓，有變化再叫我',
  callWhy: '有糖尿病的人叫不太醒、冒冷汗，要先想到低血糖。要有人到床邊測血糖、補糖，量血壓等不到答案。',
  intro: '醫師，這是王阿伯，72 歲，有糖尿病。剛剛巡房發現他叫不太醒，一直冒冷汗。',
  introLate: '醫師你終於來了！阿伯剛剛開始抽，現在叫都叫不醒！',
  // The bedside monitor, in plain words. `sugar: undefined` keeps the last reading shown.
  states: {
    start: { hr: 108, bp: [104, 64], spo2: 96, sugar: null, mind: '叫不太醒，只會哼一聲' },
    worse: { hr: 122, bp: [100, 60], spo2: 95, sugar: undefined, mind: '叫不醒，冷汗直流' },
    seize: { hr: 138, bp: [150, 90], spo2: 88, sugar: undefined, mind: '全身抽搐，叫不醒' },
    low: { hr: 112, bp: [102, 62], spo2: 96, sugar: 38, mind: '叫不太醒' },
    choke: { hr: 132, bp: [112, 70], spo2: 82, sugar: 38, mind: '嗆咳不止，嘴唇發紫' },
    cleared: { hr: 118, bp: [106, 64], spo2: 92, sugar: 38, mind: '叫不醒' },
    awake: { hr: 92, bp: [122, 74], spo2: 97, sugar: 142, mind: '清醒，會回答' },
    relapse: { hr: 110, bp: [108, 66], spo2: 96, sugar: 52, mind: '又冒冷汗、叫不太醒' },
    arrest: { hr: 0, bp: null, spo2: null, sugar: undefined, mind: '沒有反應、沒有呼吸' },
    rosc: { hr: 118, bp: [96, 58], spo2: 94, sugar: 136, mind: '還沒醒，但心跳回來了' },
  },
  // grade: best moves on; ok and bad make the patient worse (danger +1 / +2) and are crossed
  // out with `why`. Too much danger and the patient seizes, then arrests.
  steps: {
    first: {
      ask: '阿伯叫不太醒、全身冒冷汗。你先做什麼？',
      askWarn: '阿伯在抽搐、叫不醒。你先做什麼？',
      options: [
        { id: 'sugar', text: '扎一下手指，測血糖', grade: 'best', min: 2, state: 'low', next: 'treat',
          say: '血糖機「嗶」一聲：38。怡君：「38！好低。」（一般人空腹大約 70 到 100）' },
        { id: 'letsleep', text: '讓他睡，可能只是太累了', grade: 'bad', min: 10, state: 'worse',
          say: '十分鐘後，怡君又跑來：「醫師，他冷汗越來越多，叫都叫不醒耶……」',
          why: '叫不醒不是睡著。有糖尿病的人冒冷汗、叫不醒，要先想到低血糖。' },
        { id: 'ct', text: '推去照腦部電腦斷層，怕是中風', grade: 'ok', min: 15, state: 'worse',
          say: '排檢查、推床過去要好一陣子，阿伯的冷汗一直沒停。',
          why: '中風也可能叫不醒，但測血糖只要一分鐘。叫不醒的人，先排除低血糖。' },
      ],
    },
    treat: {
      ask: '血糖只有 {sugar}，阿伯叫不太醒。接下來？',
      options: [
        { id: 'd50', text: '從點滴打一支高濃度葡萄糖', grade: 'best', min: 3, state: 'awake', next: 'after',
          say: '葡萄糖推進去沒幾分鐘，阿伯眼睛慢慢睜開：「我……怎麼了？」' },
        { id: 'feed', text: '扶他坐起來，餵他喝糖水', grade: 'bad', min: 2, state: 'choke', next: 'choke', quiet: true,
          say: '阿伯吞不下去，糖水嗆進氣管，一直咳，嘴唇開始發紫！',
          why: '叫不醒的人不能從嘴巴餵東西，會嗆到，甚至堵住呼吸道。' },
        { id: 'wait', text: '再觀察 15 分鐘看看', grade: 'bad', min: 15, state: 'seize',
          say: '十五分鐘後，阿伯突然全身抽搐！',
          why: '血糖這麼低，腦部沒有能量，拖越久越危險，要馬上補糖。' },
      ],
    },
    choke: {
      ask: '糖水嗆到了，阿伯一直咳、嘴唇發紫！你要？',
      options: [
        { id: 'side', text: '讓他側躺、抽痰，不要再餵了', grade: 'best', min: 3, state: 'cleared', next: 'treat',
          say: '抽出好多糖水，嘴唇慢慢不紫了。可是血糖還是很低，人還是叫不醒。' },
        { id: 'more', text: '繼續餵，糖分一定要補進去', grade: 'bad', min: 2, next: 'arrest',
          say: '糖水整個堵住了呼吸道……阿伯不動了。',
          why: '嗆到的時候繼續餵，只會把呼吸道堵死。' },
      ],
    },
    after: {
      ask: '阿伯醒了，血糖 142。接下來？',
      options: [
        { id: 'keep', text: '接上葡萄糖點滴、請他吃點東西、先停降血糖藥，一小時後再測血糖', grade: 'best', min: 5, next: 'done', outcome: 'stable',
          say: '阿伯吃了半個麵包：「醫師，不好意思，晚餐我只吃兩口……」他吃的那種降血糖藥，腎不好的人藥效會拖很久。怡君：「那我今晚多測幾次。」' },
        { id: 'gosleep', text: '好了，回去睡覺', grade: 'bad', min: 60, state: 'relapse', next: 'treat',
          say: '你才躺下一個小時，電話又響了：「醫師，阿伯又冒冷汗了，血糖 52！」你只好又爬起來。',
          why: '低血糖常常會再來，尤其是吃降血糖藥或打胰島素的人。醒了要吃東西、接點滴，過一陣子再測。' },
        { id: 'stopmed', text: '把降血糖藥停掉就好，不用再測血糖', grade: 'ok', min: 3,
          say: '藥停了，可是今晚吃下去的藥還在作用。',
          why: '停藥是對的，但已經吃下去的藥還會作用好幾個小時，腎不好的人更久。還是要接葡萄糖點滴、吃東西、再測血糖。' },
      ],
    },
    arrest: {
      ask: '阿伯沒有反應、沒有呼吸！你要？',
      options: [
        { id: 'cpr', text: '拍拍病人、大聲叫，確認沒反應、沒呼吸，馬上廣播急救、請護理師推 AED 來，開始壓胸', grade: 'best', min: 0, cpr: true },
        { id: 'recheck', text: '先再測一次血糖，確定是不是低血糖', grade: 'bad', min: 2,
          death: '沒有呼吸心跳的時候，每拖一分鐘，救回來的機會就少很多。這時候要先壓胸、叫人拿 AED。' },
      ],
    },
    rosc: {
      ask: '阿伯的心跳回來了，但人還沒醒。接下來？',
      options: [
        { id: 'icu', text: '聯絡加護病房，轉過去密切照顧', grade: 'best', min: 20, next: 'done', outcome: 'icu',
          say: '加護病房的護理師推床來接阿伯。你在病歷上補完紀錄，窗外天快亮了。' },
        { id: 'stay', text: '留在一般病房觀察就好', grade: 'ok', min: 3,
          say: '怡君：「醫師……他剛剛心跳停過耶，我一個人顧整排病人，顧不來。」',
          why: '心跳停過的病人，要在加護病房密切監測。' },
      ],
    },
  },
  warn: { state: 'seize', line: '怡君：「醫師！阿伯開始抽搐了！」', log: '王阿伯開始抽搐' },
  arrestLine: '怡君：「醫師！阿伯沒有呼吸了！摸不到脈搏！」',
  cprNext: 'rosc', cprState: 'rosc',
  cprLine: '壓了兩分鐘，怡君同時從點滴推進葡萄糖。「醫師！摸得到脈搏了！」',
  // what the public should take home, shown when the bed ends either way
  card: {
    title: '低血糖：你可以記住的四件事',
    points: [
      '有糖尿病的人突然冒冷汗、發抖、心跳快、講話怪怪的或叫不醒，要先想到低血糖。',
      '還清醒、能自己吞：先吃大約 15 公克的糖（約 120–150 毫升果汁或含糖汽水，或 3–4 顆方糖），15 分鐘後再測一次血糖。',
      '叫不醒、吞不下：不要硬餵，會嗆到。讓他側躺，馬上打 119。家裡如果有醫師開的升糖素（鼻噴或注射），可以先用。',
      '醒了之後要吃點東西。低血糖常常會再來，尤其是吃降血糖藥或打胰島素的人。',
    ],
  },
};

// A woman whose right arm and speech go in the night. The point: 微笑、舉手、說你好, the time she
// was last well, and no food, water or aspirin before the scan. A stroke left too long is not
// a cardiac arrest; it fails as a missed window and a life with one side that does not move.
export const STROKE = {
  id: 'pstroke', bed: '08B', nurse: '小雯', name: '陳阿嬤', who: '陳阿嬤 · 68 歲 · 高血壓',
  short: '右手突然沒力、講話怪怪的', late: 'worse', extra: 'sugar',
  results: { stable: '陳阿嬤打上了血栓溶解劑，右手慢慢有力了' },
  labs: {
    rows: [['血糖 Glucose', 132, 'mg/dL', '70–140'], ['血小板 Platelet', 210, '×10³/µL', '150–400'],
      ['凝血 INR', '1.0', '', '0.8–1.2'], ['鈉 Na', 138, 'mmol/L', '135–145']],
    note: '血糖正常，表示不是低血糖造成的；血小板和凝血功能正常，打血栓溶解劑比較安全。不過不用等這張報告才去照斷層：中風每一分鐘都重要，報告可以邊做邊等。',
  },
  call: '醫師，{bed} 的陳阿嬤剛剛起來上廁所，右手拿不住杯子，講話也怪怪的。',
  again: '醫師！{bed} 的陳阿嬤右邊整個不能動了，叫她也比較不醒！',
  phone: '可能剛睡醒還迷糊，讓她先躺著休息，有變化再叫我',
  callWhy: '手突然沒力、講話怪怪的，要先想到中風。中風的治療有時間限制，不能「睡一覺看看」。',
  intro: '醫師，這是陳阿嬤，68 歲，有高血壓。剛剛起來上廁所，右手拿不住杯子，講話也怪怪的。',
  introLate: '醫師你來了……阿嬤右邊整個不能動了，叫她也比較不醒。',
  states: {
    start: { hr: 88, bp: [188, 102], spo2: 97, sugar: null, mind: '清醒，但講話含糊、右手沒力' },
    fast: { hr: 88, bp: [188, 102], spo2: 97, sugar: undefined, mind: '右邊嘴角下垂、右手舉不起來、講話不清' },
    worse: { hr: 94, bp: [198, 108], spo2: 95, sugar: undefined, mind: '叫比較不醒，右邊都不能動' },
    choke: { hr: 104, bp: [192, 104], spo2: 89, sugar: undefined, mind: '嗆咳，右手不能動' },
    slow: { hr: 90, bp: [186, 100], spo2: 97, sugar: undefined, mind: '講話含糊、右手沒力' },
    treated: { hr: 82, bp: [164, 92], spo2: 97, sugar: 132, mind: '清醒，講話慢慢清楚，右手可以抬一點' },
    warned: { hr: 96, bp: [204, 112], spo2: 94, sugar: undefined, mind: '叫不太醒，右半邊完全不能動' },
  },
  steps: {
    first: {
      ask: '陳阿嬤講話含糊、右手沒力。你先做什麼？',
      askWarn: '阿嬤右邊越來越不能動、叫不太醒。你先做什麼？',
      options: [
        { id: 'fast', text: '請她微笑、舉起雙手、說一聲「你好」', grade: 'best', min: 2, state: 'fast', next: 'time',
          say: '阿嬤一笑，右邊嘴角垂下來；兩手舉高，右手慢慢掉下去；「你好」說得含含糊糊。小雯：「三個都有……」' },
        { id: 'sleep', text: '讓她先睡，明天早上再看', grade: 'bad', min: 30, state: 'worse',
          say: '半小時後，小雯又打來：「醫師，阿嬤叫比較不醒了，右邊都不能動！」',
          why: '突然講話不清楚、一隻手沒力，是中風的警訊。睡一覺，就可能錯過治療時間。' },
        { id: 'aspirin', text: '先給她吃一顆阿斯匹靈', grade: 'bad', min: 5, state: 'choke',
          say: '小雯：「醫師，她吞不太下去，一直嗆……」',
          why: '中風也可能是腦出血，還沒照電腦斷層前，不能先給阿斯匹靈。中風的人也常常吞不好，吃藥喝水容易嗆到。' },
      ],
    },
    time: {
      ask: '看起來很像中風。接下來最重要的是？',
      options: [
        { id: 'lkw', text: '問清楚她「最後一次還正常」是幾點', grade: 'best', min: 2, next: 'act',
          say: '小雯翻了一下紀錄：「一個小時前我巡房，她還跟我聊天，好好的。」——還在治療的黃金時間內。' },
        { id: 'wait', text: '等明天早上神經科醫師上班再說', grade: 'bad', min: 30, state: 'worse',
          say: '時間一分一秒過去，阿嬤的右手越來越不能動。',
          why: '中風治療要搶時間。血管塞住的時候，每拖一分鐘，大約就有兩百萬個腦細胞死掉。' },
        { id: 'bp', text: '先用藥把血壓降到正常再說', grade: 'ok', min: 10, state: 'slow',
          say: '血壓降了一點，阿嬤的右手還是一樣沒力。',
          why: '中風時血壓高，常常是身體在努力把血送到腦部，降到「正常」反而傷腦。只有要打血栓溶解劑時，才要先降到 185/110 以下，而且要慢慢降。現在最要緊的是搞清楚發作時間。' },
      ],
    },
    act: {
      ask: '最後正常是一個小時前，還來得及。接下來？',
      options: [
        { id: 'team', text: '測血糖，同時通知中風小組、馬上照腦部電腦斷層', grade: 'best', min: 25, state: 'treated', next: 'after',
          say: '血糖 132，不是低血糖。斷層沒有出血，血管攝影也同時照了，看要不要再用導管把血栓拉出來。血壓還在打藥的上限 185 以上，先用點滴藥慢慢降到 180 以下，神經科醫師才說：「可以打血栓溶解劑。」打上藥半小時後，阿嬤的右手可以抬起來一點了。' },
        { id: 'ctonly', text: '先照電腦斷層，血糖等一下再測', grade: 'ok', min: 10,
          say: '推床去照斷層的路上，小雯問：「醫師，血糖要不要先測一下？」',
          why: '低血糖也會讓人手沒力、講話不清楚，看起來很像中風。測血糖只要一分鐘，要一起做。' },
        { id: 'later', text: '先觀察一個小時，看會不會自己好', grade: 'bad', min: 60, state: 'worse',
          say: '一個小時後，阿嬤的右手完全抬不起來了。',
          why: '中風的症狀有時候會暫時變好，但還是要馬上檢查。等它自己好，往往就錯過治療時間。' },
      ],
    },
    after: {
      ask: '阿嬤打完藥，右手可以抬起來一點了。接下來？',
      options: [
        { id: 'icu', text: '轉加護病房，密切注意血壓和手腳力氣', grade: 'best', min: 15, next: 'done', outcome: 'stable',
          say: '加護病房的護理師來接阿嬤。臨走前，阿嬤含糊地說：「醫師……謝謝。」' },
        { id: 'ward', text: '回一般病房，明天早上再看', grade: 'ok', min: 3,
          say: '小雯：「醫師，打完這個藥不是要一直看血壓跟神經狀況嗎？我們這排就我一個人……」',
          why: '打完血栓溶解劑，可能會腦出血。最初一天要在加護病房密切監測。' },
        { id: 'eat', text: '她說肚子餓，先讓她吃點東西', grade: 'bad', min: 5, state: 'choke',
          say: '阿嬤吃了一口稀飯，就嗆得滿臉通紅。',
          why: '中風的人要先檢查吞嚥，確定吞得好才能吃東西，不然容易嗆到、得吸入性肺炎。' },
      ],
    },
  },
  warn: { state: 'warned', line: '小雯：「醫師！阿嬤右邊整個不能動了，叫她也比較不醒！」', log: '陳阿嬤右半邊完全不能動' },
  fail: {
    title: '陳阿嬤錯過了治療時間',
    text: '她活下來了，但右半邊可能從此不能動，也很難再說出完整的話。中風拖得越久，留下的後遺症越多。',
  },
  card: {
    title: '中風：你可以記住的四件事',
    points: [
      '記住「微笑、舉手、說你好」：嘴角歪一邊、一隻手舉不起來、講話不清楚，任何一個突然出現，都可能是中風。',
      '看一下時間，記住他「最後一次還正常」是幾點。醫師要靠這個時間，決定能不能打血栓溶解劑或取出血栓。',
      '馬上打 119，不要「睡一覺看看」。中風治療要搶時間，越早越好。',
      '先不要讓他吃東西、喝水或吃藥（包括阿斯匹靈）。中風的人容易嗆到，也可能是腦出血。',
    ],
  },
};

// the beds a night draws from (普通班 four to six a night, 大爛班 six to eight, never more than are
// listed here); `night: true` marks a bed whose call says 半夜, which game.js only rings after 23:30
export const PUBLIC_CASES = [HYPO, STROKE];

// CPR: chest compressions to a beat. 30 compressions at 100–120 a minute, judged on exactly the
// range the screen gives; the rate is the median of the presses after the first two, so a
// hesitant start or one stray press is forgiven.
export const CPR = { presses: 30, slowest: 100, fastest: 120, maxGap: 2.5 };
