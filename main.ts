// Porto Verde — entrypoint (Node 22, stdlib only).
// Copies game/ and screenshots/ to the output directory and writes dossier.json
// via buildDossier from the kit's vendor/makefun-game.ts.
import { cpSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(out, { recursive: true });
if (existsSync('game')) cpSync('game', join(out, 'game'), { recursive: true });
if (existsSync('screenshots')) cpSync('screenshots', join(out, 'screenshots'), { recursive: true });
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`dossier: ${dossier.length} bytes written to ${join(out, 'dossier.json')}`);
