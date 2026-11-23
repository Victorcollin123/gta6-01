// Port Velo — a tiny static server for local play-testing. One job: serve
// the repository's files over HTTP so the game can be played and screenshotted.
// Run it with `node serve.ts` (or `node serve.ts --port=8903`) and open
// http://localhost:8080/game/ — nothing here ships in the entry's game/.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(join(fileURLToPath(new URL('.', import.meta.url))));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function portFromArgs(): number {
  for (const arg of process.argv.slice(2)) {
    const match = /^--port=(\d+)$/.exec(arg);
    if (match) return parseInt(match[1], 10);
  }
  return 8080;
}

const port = portFromArgs();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/game/';
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(repoRoot, path));
  if (!file.startsWith(repoRoot + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found\n');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, () => {
  console.log(`Port Velo serving ${repoRoot} at http://localhost:${port}/game/`);
});
