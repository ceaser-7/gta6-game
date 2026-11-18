// main.ts — the entry program for the Porto Verde gta6-01 entry.
//
// What it does: it gathers the game and its screenshots into one output
// directory and writes the entry's dossier (dossier.json) there, using the
// vendored make.fun library. The scorer reads that same dossier back.
//
// How to run it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR defaults to /output when it is not set.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in — the repo root, beside game/ and screenshots/.
const root = fileURLToPath(new URL('.', import.meta.url));

// Where the finished entry goes: MAKEFUN_OUTPUT_DIR, or /output by default.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The output directory, then the game, then the screenshots.
mkdirSync(outputDir, { recursive: true });
cpSync(join(root, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier: the scorer's caps, from the bounty's gate.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
