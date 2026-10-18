// Small talk on the ward: everyone the doctor walks past can be spoken to (E), in both versions.
// Nothing here is clinical; it is the night around the calls -- the snack runs, the superstitions,
// the people who keep the floor going -- and now and then someone looks after the doctor.
//
// Each person:
//   name, role                 what the dialog's name tag says: `${role}${name}`
//   faces                      portraits in assets/game/char/ to pick from; none for people with no art
//   lines                      { text, when?, gift?, pri? }
//     when(s)                  s is { evening, night, dawn, hungry, tired, needLoo }
//     gift                     { full?, energy?, bladder?, toast } -- given once a night per person
//     pri                      said first when it fits (a hungry doctor hears about food)
// Lines are not repeated until every fitting line has been said. The first line of each person
// should have no `when` and no gift: it is what they say when nothing else fits.
//
// The template keeps a line or two a person; write your own.

export const CHATTER = {
  pinyu: {
    name: '品妤', role: '護理師', faces: ['nurse_worried', 'nurse_neutral'],
    lines: [
      { text: '學姊說夜班最重要的三件事：交班交清楚、有事早點叫醫師、記得吃飯。' },
      { text: '醫師你還沒吃飯對不對？我多買了一個飯糰，給你！', when: s => s.hungry, pri: true,
        gift: { full: 20, toast: '你吃掉了品妤給的飯糰，肚子飽了一點。' } },
    ],
  },
  shuhan: {
    name: '書涵', role: '護理師', faces: ['nurse_caring', 'nurse_holding_laugh'],
    lines: [
      { text: '噓——千萬不要說「今天好像很閒」，說了一定會忙起來。' },
      { text: '醫師你眼睛都紅了。趁現在沒人找你，去值班室躺一下，有事我叫你。', when: s => s.tired, pri: true },
    ],
  },
  akai: {
    name: '阿凱', role: '傳送員', faces: ['akai_coffee'],
    lines: [
      { text: '每次推病人去檢查，我們都要對手圈、對名字。推錯人是大事。' },
      { text: '醫師，我要下樓去便利商店，順便幫你帶一杯咖啡？……來，熱的。',
        gift: { energy: 6, bladder: 12, toast: '你喝了阿凱帶的咖啡，比較有精神了，不過等一下可能要跑廁所。' } },
    ],
  },
  azhu: {
    name: '阿珠姨', role: '清潔人員', faces: ['azhu_smile'],
    lines: [
      { text: '地板剛拖過，走路小心不要滑倒喔！' },
      { text: '你吃飯了沒？沒吃不行啦，便當冷了也要吃。', when: s => s.hungry, pri: true },
    ],
  },
  shufen: {
    name: '淑芬學姊', role: '夜班組長', faces: ['nurse_stern', 'nurse_caring', 'nurse_neutral'],
    lines: [
      { text: '我們打電話給你，不是故意吵你。有些事真的要醫師決定，多包涵。' },
    ],
  },
  yaqi: {
    name: '雅琪', role: '護理師', faces: ['nurse_holding_laugh', 'nurse_neutral'],
    lines: [
      { text: '我在打護理紀錄，打到眼睛都花了。' },
      { text: '醫師，廁所在值班室裡面，你不要憋喔，我們看過醫師憋到尿道發炎的。', when: s => s.needLoo, pri: true },
    ],
  },
  azhe: {
    name: '阿哲', role: '總醫師', faces: ['chief_approve', 'chief_tired'],
    lines: [
      { text: '值班的時候，吃飯和睡覺也是工作的一部分，不是偷懶。' },
    ],
  },
  jingyi: {
    name: '靜怡', role: '護理師', faces: ['nurse_neutral', 'nurse_caring'],
    lines: [
      { text: '每一包藥我們都要核對：是不是這個病人、是不是這個藥、量對不對。' },
    ],
  },
  // the nurse who called the doctor to a bed, once that bed is settled; name is filled in
  bed: {
    name: '', role: '護理師', faces: ['nurse_thankful', 'nurse_caring', 'nurse_sleepy'],
    lines: [
      { text: '剛剛那床謝謝你，醫師。有你來看，我比較安心。' },
      { text: '醫師你快去睡吧，有事我再打。', when: s => s.night },
    ],
  },
};
