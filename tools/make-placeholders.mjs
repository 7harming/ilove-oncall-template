// node tools/make-placeholders.mjs: draws the placeholder portraits in assets/game/char/.
//
// The template ships no character art of its own: these are flat SVG figures, one per name the
// game asks for (nurse_worried, pgy_f_eating, ...), with a face for each expression. To use real
// art, put your own pictures in assets/game/char/ under the same names (see README.md, 角色立繪).
// Run this again after changing the colours below; it overwrites only the .svg files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets/game/char/', import.meta.url));
const INK = '#3b2a24', SKIN = '#f2c9a6', SKIN_SHADE = '#e3b28c';

// who: hair, clothes and anything they carry
const ROLES = {
  nurse: { hair: 'ponytail', hairColor: '#6b3f22', clothes: 'nurse' },
  pgy_m: { hair: 'short', hairColor: '#2b2421', clothes: 'coat' },
  pgy_f: { hair: 'long', hairColor: '#2b2421', clothes: 'coat' },
  chief: { hair: 'short', hairColor: '#3a302b', clothes: 'coat', scrubs: '#2f5d62', glasses: true },
  akai: { hair: 'short', hairColor: '#2a2420', clothes: 'polo', top: '#4f6f95' },
  azhu: { hair: 'bob', hairColor: '#9c9c9c', clothes: 'polo', top: '#8fb3a2' },
};

// how they look: brows, eyes, mouth and the extras around the face
const FACES = {
  neutral: { brow: 'flat', eye: 'dot', mouth: 'small' },
  worried: { brow: 'worried', eye: 'dot', mouth: 'frown' },
  panic: { brow: 'worried', eye: 'wide', mouth: 'open', extra: ['sweat'] },
  shocked: { brow: 'high', eye: 'wide', mouth: 'o' },
  relieved: { brow: 'soft', eye: 'closed', mouth: 'smile', extra: ['sweat'] },
  annoyed: { brow: 'angry', eye: 'half', mouth: 'frown' },
  thankful: { brow: 'soft', eye: 'happy', mouth: 'bigsmile', extra: ['blush'] },
  caring: { brow: 'soft', eye: 'dot', mouth: 'smile', extra: ['blush'] },
  sleepy: { brow: 'flat', eye: 'closed', mouth: 'o', extra: ['zzz'] },
  stern: { brow: 'angry', eye: 'dot', mouth: 'line' },
  holding_laugh: { brow: 'worried', eye: 'happy', mouth: 'wavy', extra: ['blush'] },
  deadpan: { brow: 'flat', eye: 'half', mouth: 'line' },
  nervous: { brow: 'worried', eye: 'dot', mouth: 'wavy', extra: ['sweat'] },
  eating: { brow: 'soft', eye: 'happy', mouth: 'o', extra: ['bento'] },
  scolded: { brow: 'sad', eye: 'down', mouth: 'frown', extra: ['sweat'] },
  confident: { brow: 'high', eye: 'dot', mouth: 'bigsmile' },
  survived: { brow: 'soft', eye: 'half', mouth: 'smile', extra: ['bags'] },
  approve: { brow: 'soft', eye: 'happy', mouth: 'smile' },
  tired: { brow: 'flat', eye: 'half', mouth: 'line', extra: ['bags'] },
  smile: { brow: 'soft', eye: 'happy', mouth: 'smile', extra: ['blush'] },
  coffee: { brow: 'soft', eye: 'dot', mouth: 'smile', extra: ['coffee'] },
};

// every portrait the game asks for
const NAMES = [
  ...['annoyed', 'caring', 'deadpan', 'holding_laugh', 'neutral', 'panic', 'relieved', 'shocked', 'sleepy', 'stern', 'thankful', 'worried'].map(f => `nurse_${f}`),
  ...['m', 'f'].flatMap(g => ['confident', 'eating', 'nervous', 'neutral', 'scolded', 'sleepy', 'survived'].map(f => `pgy_${g}_${f}`)),
  'chief_approve', 'chief_tired', 'akai_coffee', 'azhu_smile',
];

const line = (d, w = 9, color = INK) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pair = (l, r, w) => line(l, w) + line(r, w);

const HAIR_BACK = {
  ponytail: c => `<ellipse cx="300" cy="300" rx="124" ry="122" fill="${c}"/><path d="M372 238 C478 250 492 390 436 488 C426 430 410 372 366 326 Z" fill="${c}"/>`,
  long: c => `<path d="M186 300 C170 196 240 164 300 164 C362 164 432 196 416 300 L442 566 C380 588 220 588 158 566 Z" fill="${c}"/>`,
  bob: c => `<path d="M180 300 C170 198 240 166 300 166 C362 166 432 198 420 300 L426 448 C382 466 218 466 174 448 Z" fill="${c}"/>`,
  short: () => '',
};
const HAIR_FRONT = {
  ponytail: c => `<path d="M188 330 C180 212 248 176 300 176 C360 176 424 212 412 330 C396 282 352 250 304 256 C262 250 214 278 188 330 Z" fill="${c}"/>`,
  short: c => `<path d="M190 336 C178 214 244 178 300 176 C366 178 428 214 410 336 C404 290 380 254 332 248 C300 264 258 264 232 254 C204 270 194 302 190 336 Z" fill="${c}"/>`,
  long: c => `<path d="M188 336 C178 210 246 172 300 172 C364 172 426 210 412 336 C394 270 340 236 286 246 C252 270 214 290 188 336 Z" fill="${c}"/>`,
  bob: c => `<path d="M186 346 C176 214 244 176 300 176 C362 176 426 214 414 346 C402 300 384 262 300 258 C230 262 198 300 186 346 Z" fill="${c}"/>`,
};

function clothes(role) {
  const torso = fill => `<path d="M64 800 C76 640 160 572 300 562 C440 572 524 640 536 800 Z" fill="${fill}"/>`;
  if (role.clothes === 'nurse') {
    return torso('#f4f6f8') + line('M246 566 L300 636 L354 566', 10, '#e9a3b8')
      + '<rect x="364" y="652" width="66" height="38" rx="6" fill="#7fb6d6"/><rect x="374" y="664" width="46" height="6" rx="3" fill="#fff"/>';
  }
  if (role.clothes === 'coat') {
    return torso('#f2f4f6') + `<path d="M238 566 L300 664 L362 566 Z" fill="${role.scrubs || '#5b8fc9'}"/>`
      + line('M238 566 L276 720', 6, '#c9d1d8') + line('M362 566 L324 720', 6, '#c9d1d8')
      + line('M232 578 C226 652 266 694 300 694 C334 694 374 652 368 578', 10, '#4a5560') + '<circle cx="300" cy="704" r="16" fill="#9aa5ae"/>';
  }
  return torso(role.top) + line('M252 566 L300 610 L348 566', 10, '#ffffff');
}

const BROW = {
  flat: ['M228 300 L278 300', 'M322 300 L372 300'],
  soft: ['M228 304 Q253 290 278 300', 'M322 300 Q347 290 372 304'],
  worried: ['M228 304 L278 290', 'M322 290 L372 304'],
  sad: ['M230 308 L278 284', 'M322 284 L370 308'],
  angry: ['M228 290 L278 306', 'M322 306 L372 290'],
  high: ['M228 284 Q253 272 278 284', 'M322 284 Q347 272 372 284'],
};
const EYE = {
  dot: () => `<circle cx="255" cy="350" r="12" fill="${INK}"/><circle cx="345" cy="350" r="12" fill="${INK}"/>`,
  down: () => `<circle cx="255" cy="360" r="10" fill="${INK}"/><circle cx="345" cy="360" r="10" fill="${INK}"/>`,
  wide: () => [255, 345].map(x => `<circle cx="${x}" cy="350" r="22" fill="#fff" stroke="${INK}" stroke-width="5"/><circle cx="${x}" cy="350" r="9" fill="${INK}"/>`).join(''),
  closed: () => pair('M235 350 Q255 362 275 350', 'M325 350 Q345 362 365 350', 8),
  happy: () => pair('M235 358 Q255 338 275 358', 'M325 358 Q345 338 365 358', 8),
  half: () => pair('M236 344 L274 344', 'M326 344 L364 344', 7)
    + `<path d="M243 345 A12 12 0 0 0 267 345 Z" fill="${INK}"/><path d="M333 345 A12 12 0 0 0 357 345 Z" fill="${INK}"/>`,
};
const MOUTH = {
  small: () => line('M284 426 Q300 434 316 426', 7),
  line: () => line('M282 428 L318 428', 7),
  smile: () => line('M270 418 Q300 446 330 418', 8),
  bigsmile: () => '<path d="M264 414 Q300 466 336 414 Z" fill="#7a3b33"/>',
  frown: () => line('M276 436 Q300 418 324 436', 8),
  o: () => '<ellipse cx="300" cy="430" rx="11" ry="14" fill="#7a3b33"/>',
  open: () => '<ellipse cx="300" cy="432" rx="20" ry="26" fill="#7a3b33"/>',
  wavy: () => line('M268 430 Q278 420 288 430 T308 430 T328 430', 7),
};
const EXTRA = {
  blush: () => '<ellipse cx="228" cy="392" rx="22" ry="12" fill="#f29a9a" opacity=".55"/><ellipse cx="372" cy="392" rx="22" ry="12" fill="#f29a9a" opacity=".55"/>',
  sweat: () => '<path d="M412 262 C424 286 428 296 428 302 A16 16 0 0 1 396 302 C396 296 400 286 412 262 Z" fill="#9fd8f2" stroke="#4ba3d0" stroke-width="4"/>',
  zzz: () => '<text x="420" y="236" font-family="sans-serif" font-size="56" font-weight="700" fill="#8ab4d8">Z</text><text x="466" y="196" font-family="sans-serif" font-size="38" font-weight="700" fill="#8ab4d8">z</text>',
  bags: () => pair('M238 374 Q255 382 272 374', 'M328 374 Q345 382 362 374', 5).replaceAll(INK, '#b98f86'),
  bento: () => '<rect x="196" y="684" width="208" height="92" rx="16" fill="#c8553d"/><ellipse cx="300" cy="692" rx="92" ry="20" fill="#fbf7ef"/>'
    + line('M330 690 L432 560', 7, '#a0703f') + line('M348 692 L446 574', 7, '#a0703f'),
  coffee: () => `<ellipse cx="420" cy="740" rx="56" ry="40" fill="${SKIN}"/><rect x="384" y="618" width="76" height="104" rx="8" fill="#ffffff"/>`
    + '<rect x="384" y="652" width="76" height="34" fill="#a0703f"/><rect x="378" y="606" width="88" height="18" rx="6" fill="#d9dde1"/>'
    + line('M406 588 Q398 570 410 552', 5, '#c9d1d8') + line('M436 588 Q428 570 440 552', 5, '#c9d1d8'),
};

function portrait(name) {
  const [roleKey, faceKey] = name.startsWith('pgy_') ? [name.slice(0, 5), name.slice(6)] : [name.split('_')[0], name.split('_').slice(1).join('_')];
  const role = ROLES[roleKey], face = FACES[faceKey];
  if (!role || !face) throw new Error(`不知道怎麼畫 ${name}`);
  const glasses = role.glasses ? pair('M225 350 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0', 'M315 350 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0', 6) + line('M285 348 L315 348', 6) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<!-- placeholder portrait: ${name} (tools/make-placeholders.mjs) -->
${HAIR_BACK[role.hair](role.hairColor)}
<rect x="266" y="420" width="68" height="160" rx="24" fill="${SKIN_SHADE}"/>
${clothes(role)}
<ellipse cx="190" cy="348" rx="18" ry="28" fill="${SKIN}"/><ellipse cx="410" cy="348" rx="18" ry="28" fill="${SKIN}"/>
<ellipse cx="300" cy="332" rx="112" ry="128" fill="${SKIN}"/>
${HAIR_FRONT[role.hair](role.hairColor)}
${pair(...BROW[face.brow], 8)}
${EYE[face.eye]()}
${MOUTH[face.mouth]()}
${glasses}
${(face.extra || []).map(e => EXTRA[e]()).join('')}
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const name of NAMES) writeFileSync(`${OUT}${name}.svg`, portrait(name));
console.log(`畫好 ${NAMES.length} 張佔位立繪：assets/game/char/*.svg`);
