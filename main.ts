// Porto Verde — entry point (Node 22, stdlib only): copies game/ and
// screenshots/ into the output directory and writes dossier.json.
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(out, { recursive: true });
for (const d of ['game', 'screenshots']) {
  const dest = join(out, d);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
}
cpSync('game', join(out, 'game'), { recursive: true });
if (existsSync('screenshots')) cpSync('screenshots', join(out, 'screenshots'), { recursive: true });
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log('dossier bytes:', dossier.length);
