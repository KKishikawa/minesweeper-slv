import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let commit: string | null = null;
let dirty: boolean | null = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
} catch { /* A source archive has no Git metadata; export explicit nulls. */ }
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
export default defineConfig({ define: { __BUILD_IDENTITY__: JSON.stringify({ version, commit, dirty }) } });
