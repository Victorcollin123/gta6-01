// Port Velo — Neon Tide. The entry program. Its only job is to hand the game in.
//
// It copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json there, built by buildDossier from the
// vendored makefun-game.ts, under the same caps the scorer applies.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
// The program is deterministic: two runs write identical bytes.
//
// One thing it never does: remove the output directory itself. The grader
// hands it /output as a mounted volume, and deleting a mount point throws
// EBUSY ("Device or resource busy"), which kills the run before anything
// is written. So it only empties the directory's contents and leaves the
// directory standing. The game it hands in is Port Velo: a top-down
// open-world crime game — a drivable city, traffic and pedestrians, cars to
// steal, a five-star wanted system with VPD pursuit, five story missions,
// on-foot and drive-by combat, a HUD with a live minimap, and a save.

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = dirname(fileURLToPath(import.meta.url));
// The grader hands the program /output; a local run uses MAKEFUN_OUTPUT_DIR.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory, so a stale file can never leak in —
// but clear only what is inside it. The directory itself stays put. Each
// entry goes wholesale, file or subdirectory alike, which also wipes a
// previous run's output if this directory has been used before.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}
mkdirSync(join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

// The game and its screenshots, exactly as they stand in the repository.
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The dossier the judge reads: the sources and the screenshots, capped the
// way the gate caps them — 4 screenshots at most 256 KiB each, the game at
// most 993 entries and 48 MiB, the text at most 160 KiB. The caps are
// passed in full so the program refuses exactly where the scorer would,
// instead of handing in a dossier the gate would reject.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
