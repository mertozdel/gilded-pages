// Copies the crew sprite packs (Joel, Jonas, Jason, Jonas the bassist and Mert the regular) into
// public/assets/sprites/, the build tools into tools/crew/ and Mert's mockup into art/source/.
//   node scripts/copy-crew-sprites.mjs "<path to crew_sprites>"
// Only what the game loads is copied: the sheets (+ atlas JSON), the anims JSON, portraits, icons,
// the bassist's fretboard cards and Mert's cards. The per-frame PNGs and previews stay in the pack.
// copyFileSync, not cpSync: on Windows, Node 24's cpSync fails over an existing file and leaves it deleted.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/copy-crew-sprites.mjs <crew_sprites folder>');
  process.exit(1);
}
const out = resolve('public/assets/sprites');

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (statSync(join(from, f)).isFile()) copyFileSync(join(from, f), join(to, f));
}

// name → the pack's folder (Mert's pack folder is `mert`; his files and textures are `matt_*`).
const PACKS = [
  { name: 'joel', dir: 'joel', sheets: ['joel'] },
  { name: 'jonas', dir: 'jonas', sheets: ['jonas'] },
  { name: 'jason', dir: 'jason', sheets: ['jason'] },
  { name: 'jonas_bass', dir: 'jonas_bass', sheets: ['jonas_bass'] },
  { name: 'matt', dir: existsSync(join(src, 'mert')) ? 'mert' : 'matt', sheets: ['matt', 'matt_closeup'] },
];
for (const { name, dir, sheets } of PACKS) {
  const from = join(src, dir);
  if (!existsSync(from)) {
    console.warn(`skipped ${name}: no ${from}`);
    continue;
  }
  const to = join(out, name);
  mkdirSync(to, { recursive: true });
  for (const s of sheets) for (const f of [`${s}_sheet.png`, `${s}_sheet.json`, `${s}_anims.json`]) copyFileSync(join(from, f), join(to, f));
  for (const sub of ['portraits', 'icons', 'fretboard', 'cards']) if (existsSync(join(from, sub))) copyDir(join(from, sub), join(to, sub));
  console.log(`copied ${name}`);
}

// The build (tools/crew/) and Mert's mockup (art/source/), to rebuild the packs from here.
if (existsSync(join(src, 'tools'))) {
  copyDir(join(src, 'tools'), resolve('tools/crew'));
  console.log('copied tools → tools/crew');
}
if (existsSync(join(src, 'source', 'matt_mockup.png'))) {
  mkdirSync(resolve('art/source'), { recursive: true });
  copyFileSync(join(src, 'source', 'matt_mockup.png'), resolve('art/source/matt_mockup.png'));
  console.log('copied source/matt_mockup.png → art/source');
}
