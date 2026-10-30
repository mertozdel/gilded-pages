// Copies the crew sprite packs (Joel, Jonas, Jason and Jonas the bassist) into public/assets/sprites/.
//   node scripts/copy-crew-sprites.mjs "<path to crew_sprites>"
// Only what the game loads is copied: the sheet (+ atlas JSON), the anims JSON, portraits, icons and
// the bassist's fretboard cards. The per-frame PNGs, previews and build tools stay in the pack.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/copy-crew-sprites.mjs <crew_sprites folder>');
  process.exit(1);
}
const out = resolve('public/assets/sprites');
for (const name of ['joel', 'jonas', 'jason', 'jonas_bass']) {
  const from = join(src, name);
  const to = join(out, name);
  mkdirSync(to, { recursive: true });
  for (const f of [`${name}_sheet.png`, `${name}_sheet.json`, `${name}_anims.json`]) cpSync(join(from, f), join(to, f));
  for (const dir of ['portraits', 'icons', 'fretboard']) {
    if (!existsSync(join(from, dir))) continue;
    mkdirSync(join(to, dir), { recursive: true });
    for (const f of readdirSync(join(from, dir))) cpSync(join(from, dir, f), join(to, dir, f));
  }
  console.log(`copied ${name}`);
}
