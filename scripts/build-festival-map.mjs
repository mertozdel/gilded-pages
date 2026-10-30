// Writes src/content/rooms/festival.tmj: the one festival map both venues share (the village
// fest and the neon festival have the same layout). An isometric Tiled map, 64×32 floor tiles,
// laid over the 1920×1080 frame the venue art is fitted into. Objects are authored here in px
// of the 1024×906 venue art, then stored the Tiled way (isometric object coordinates).
//   node scripts/build-festival-map.mjs
// Edit the map in Tiled afterwards if you like; this script is only the first draft.
import { writeFileSync } from 'node:fs';

const TW = 64;
const TH = 32;
const N = 34; // tiles per side
const ORIGIN_X = (N * TW) / 2; // Tiled draws tile (0,0) here
const FRAME_X = ORIGIN_X - 960; // the 1920×1080 frame's left edge, in map px
const ART = { w: 1024, h: 906 };
const FIT = 1080 / ART.h;
const ART_X = (1920 - ART.w * FIT) / 2;

/** Art px → frame px → Tiled isometric object coordinates. */
function iso([x, y]) {
  const sx = ART_X + x * FIT + FRAME_X;
  const sy = y * FIT;
  return { x: (sx - ORIGIN_X + 2 * sy) / 2, y: (2 * sy - sx + ORIGIN_X) / 2 };
}

let nextId = 1;
const prop = (name, value) => ({ name, type: typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : typeof value === 'boolean' ? 'bool' : 'string', value });
const props = (o) => Object.entries(o).map(([k, v]) => prop(k, v));

function point(name, type, at, p = {}) {
  const c = iso(at);
  return { id: nextId++, name, type, x: c.x, y: c.y, width: 0, height: 0, rotation: 0, visible: true, point: true, properties: props(p) };
}
function poly(name, type, pts, p = {}) {
  const c = pts.map(iso);
  const o = c[0];
  return { id: nextId++, name, type, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, visible: true, polygon: c.map((q) => ({ x: q.x - o.x, y: q.y - o.y })), properties: props(p) };
}
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const layer = (name, objects) => ({ id: nextId++, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });

const B = { theme: 'bavaria' };
const C = { theme: 'neon-china' };

const layers = [
  layer('stage', [
    poly('stage-top', 'stage', [[250, 470], [510, 315], [795, 465], [495, 595]]),
    poly('stage-front', 'overlay', [[250, 470], [495, 595], [795, 465], [797, 548], [512, 692], [250, 548]]),
    poly('monitor', 'overlay', [[489, 556], [536, 558], [536, 593], [489, 591]], B),
    poly('led-floor', 'led-floor', [[272, 478], [372, 445], [665, 445], [790, 478], [515, 592]], C),
  ]),
  layer('stands', [
    poly('stand-left', 'stand', [[0, 420], [100, 330], [262, 420], [262, 600], [110, 660], [0, 600]]),
    poly('stand-right', 'stand', [[790, 440], [905, 345], [1024, 420], [1024, 640], [940, 650], [800, 560]]),
  ]),
  layer('benches', [
    poly('table-a', 'bench', [[165, 700], [270, 650], [332, 690], [332, 722], [225, 768], [165, 738]], { overlay: true }),
    poly('table-b', 'bench', [[290, 770], [400, 705], [472, 745], [472, 792], [380, 842], [290, 812]], { overlay: true }),
    poly('table-c', 'bench', [[535, 800], [640, 740], [722, 790], [722, 822], [610, 866], [535, 832]], { overlay: true }),
    poly('table-d', 'bench', [[680, 690], [790, 640], [872, 690], [872, 722], [770, 768], [680, 732]], { overlay: true }),
  ]),
  // Over the heads of the people painted in the art (their head centres, art px): where the
  // reaction bubbles pop up. The crowd is the art's own; nothing is drawn over the people.
  layer('cheers', [
    ...[
      [143, 503], [163, 556], [207, 536], [247, 525], [250, 615], [135, 663], [202, 638],
      [314, 658], [378, 686], [334, 707], [446, 722], [418, 607], [474, 622], [709, 607],
      [760, 592], [826, 627], [883, 551], [768, 658], [612, 694], [658, 694], [474, 781],
      [520, 773], [875, 760], [934, 776], [673, 852], [709, 837],
    ].map(([x, y], i) => point(`cheer-${i + 1}`, 'cheer', [x, y - 14], B)),
    ...[
      [288, 579], [337, 612], [418, 607], [474, 617], [536, 648], [582, 656], [633, 628],
      [668, 566], [735, 566], [791, 561], [709, 612], [763, 592], [826, 628], [883, 556],
      [84, 663], [31, 684], [145, 673], [219, 617], [372, 689], [480, 694], [612, 694], [653, 699],
      [740, 730], [837, 724], [515, 776], [469, 781], [577, 796], [255, 776], [286, 791],
      [643, 821], [867, 806], [918, 781], [28, 783], [429, 842], [679, 852], [709, 842],
    ].map(([x, y], i) => point(`cheer-${i + 1}`, 'cheer', [x, y - 14], C)),
  ]),
  layer('band', [
    point('bassist', 'player', [515, 552], B),
    poly('tuba-1', 'band', rect(332, 337, 407, 495), { ...B, role: 'tuba' }),
    poly('trumpet', 'band', rect(422, 310, 495, 455), { ...B, role: 'trumpet' }),
    poly('tuba-2', 'band', rect(490, 283, 560, 413), { ...B, role: 'tuba' }),
    poly('clarinet', 'band', rect(562, 312, 625, 448), { ...B, role: 'clarinet' }),
    poly('singer-1', 'band', rect(607, 345, 670, 468), { ...B, role: 'singer' }),
    poly('singer-2', 'band', rect(652, 365, 718, 493), { ...B, role: 'singer' }),
  ]),
  layer('dj-booth', [
    point('dj', 'player', [522, 392], C),
    poly('booth', 'overlay', [[375, 405], [473, 352], [522, 350], [533, 353], [663, 403], [663, 473], [627, 487], [520, 443], [420, 487], [375, 473]], C),
  ]),
  layer('lights', [
    ...[
      [315, 237, -0.35],
      [370, 210, -0.2],
      [415, 185, -0.1],
      [470, 157, 0.15],
      [552, 157, -0.15],
      [607, 187, 0.1],
      [667, 215, 0.2],
      [722, 240, 0.35],
    ].map(([x, y, aim], i) => point(`head-${i + 1}`, 'moving-head', [x, y], { ...C, aim })),
    poly('screen-left', 'screen', [[283, 247], [492, 165], [492, 282], [288, 365]], { ...C, text: '电音节' }),
    poly('screen-right', 'screen', [[546, 163], [760, 250], [758, 385], [548, 300]], { ...C, text: '龙' }),
  ]),
  layer('title', [poly('title-banner', 'title', [[372, 160], [668, 160], [668, 228], [372, 228]], { ...B, text: 'Dorffest' }), poly('title-screen', 'title', [[283, 247], [492, 165], [492, 282], [288, 365]], { ...C, text: '电音节' })]),
  layer('setlist', [poly('chalkboard', 'setlist', [[533, 612], [575, 601], [580, 682], [540, 693]], B), poly('led-screen', 'setlist', [[546, 163], [760, 250], [758, 385], [548, 300]], C)]),
  layer('signs', [
    poly('sign-left', 'sign', [[112, 445], [215, 399], [235, 446], [115, 495]], { ...B, text: 'Bier & Wurst', style: 'wood' }),
    poly('sign-right', 'sign', [[835, 420], [934, 462], [932, 508], [833, 466]], { ...B, text: 'Souvenirs', style: 'wood' }),
    poly('sign-left', 'sign', [[112, 445], [215, 399], [235, 446], [115, 495]], { ...C, text: '茶 & 酒', style: 'wood' }),
    poly('sign-right', 'sign', [[835, 420], [934, 462], [932, 508], [833, 466]], { ...C, text: '纪念品', style: 'wood' }),
    poly('neon-tower', 'sign', rect(84, 114, 109, 231), { ...C, text: '电音节', style: 'neon-v' }),
    poly('neon-small', 'sign', rect(204, 189, 234, 276), { ...C, text: '龙', style: 'neon-v' }),
    poly('neon-high', 'sign', rect(776, 54, 811, 181), { ...C, text: '电音节', style: 'neon-v' }),
    poly('neon-corner', 'sign', rect(974, 509, 1024, 631), { ...C, text: '龙', style: 'neon-v' }),
  ]),
];

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'isometric',
  renderorder: 'right-down',
  width: N,
  height: N,
  tilewidth: TW,
  tileheight: TH,
  infinite: false,
  nextlayerid: nextId,
  nextobjectid: nextId,
  properties: props({ room: 'festival', frameX: FRAME_X, frameY: 0, frameWidth: 1920, frameHeight: 1080, artWidth: ART.w, artHeight: ART.h, figureScale: 1 }),
  tilesets: [],
  layers,
};
writeFileSync(new URL('../src/content/rooms/festival.tmj', import.meta.url), `${JSON.stringify(map, null, 1)}\n`);
console.log('wrote festival.tmj');
