import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'space-output');
mkdirSync(output, { recursive: true });
// Explicit allowlist: never upload local tokens, cookies, or virtual environments.
for (const name of ['app.py', 'requirements.txt']) copyFileSync(resolve(here, name), resolve(output, name));
copyFileSync(resolve(here, 'Dockerfile.space'), resolve(output, 'Dockerfile'));
copyFileSync(resolve(here, 'SPACE.md'), resolve(output, 'README.md'));
writeFileSync(resolve(output, '.dockerignore'), '*\n!app.py\n!requirements.txt\n!Dockerfile\n');
console.log(`Prepared browser Space files: ${output}`);
