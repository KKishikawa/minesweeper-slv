import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { preview } from 'vite';
import type { PreviewServer } from 'vite';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';

let output: string;
let server: PreviewServer | undefined;
let browser: Browser | undefined;
let origin: string;
beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'minesweeper-pages-'));
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this test through npm test');
  execFileSync(process.execPath, [npm, 'run', 'build:pages', '--', '--outDir', output], { stdio: 'pipe' });
  server = await preview({ base: '/minesweeper-slv/', build: { outDir: output }, preview: { host: '127.0.0.1', port: 0 } });
  const address = server.httpServer!.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
}, 30_000);
afterAll(async () => {
  try { await browser?.close(); }
  finally { try { await server?.close(); } finally { if (output) await rm(output, { recursive: true, force: true }); } }
});

it('loads the Pages subpath and runs the real solver Worker without root asset requests', async () => {
  const page = await browser!.newPage();
  const requests: string[] = [];
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/minesweeper-slv/`);
  expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('マインスイーパー ソルバー');
  await page.getByLabel('幅', { exact: true }).fill('3');
  await page.getByLabel('高さ', { exact: true }).fill('1');
  await page.getByLabel('総地雷数', { exact: true }).fill('1');
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  await page.getByRole('gridcell').first().focus();
  await page.keyboard.press('0');
  await page.getByRole('status').filter({ hasText: '確定した手があります' }).waitFor();
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('安全 S');
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('地雷 M');
  expect(requests.some(url => url.includes('/minesweeper-slv/assets/solver.worker-'))).toBe(true);
  expect(requests.every(url => new URL(url).origin === origin && new URL(url).pathname.startsWith('/minesweeper-slv/'))).toBe(true);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
  await page.close();
});
