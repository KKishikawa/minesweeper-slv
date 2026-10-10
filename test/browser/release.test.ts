import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { release } from 'node:os';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';
let harness: Pick<BrowserHarness, 'browser' | 'baseUrl' | 'close'>;
const artifacts = process.env.RELEASE_ARTIFACTS ?? 'test/artifacts/manual-mvp';
let environment: Record<string, unknown>;
beforeAll(async () => {
  const target = process.env.RELEASE_URL;
  if (target) {
    if (!process.env.RELEASE_COMMIT) throw new Error('RELEASE_COMMIT is required for a deployed smoke test');
    const browser = await chromium.launch();
    harness = { browser, baseUrl: target, close: () => browser.close() };
    const context = await browser.newContext();
    const response = await context.request.get(new URL('release.json', target).href);
    expect(response.ok()).toBe(true);
    const deployed = await response.json();
    expect(deployed.commit).toBe(process.env.RELEASE_COMMIT);
    expect(deployed.version).toBe(JSON.parse(await readFile('package.json', 'utf8')).version);
    await context.close();
    environment = { deployed };
  } else {
    harness = await startBrowserHarness(true);
    environment = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  }
  environment = { ...environment, date: new Date().toISOString(), browser: harness.browser.version(),
    platform: process.platform, osRelease: release(), node: process.version, url: harness.baseUrl };
  await mkdir(artifacts, { recursive: true });
  await writeFile(`${artifacts}/environment.json`, JSON.stringify(environment, null, 2));
});
afterAll(async () => { await harness?.close(); });
async function create(page: Page, columns: number, height = 9, mines = 10) {
  await page.getByLabel('幅', { exact: true }).fill(String(columns));
  await page.getByLabel('高さ', { exact: true }).fill(String(height));
  await page.getByLabel('総地雷数', { exact: true }).fill(String(mines));
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
}
async function state(page: Page, message: string) { await page.getByRole('status').filter({ hasText: message }).waitFor(); }
it.each([{ width: 1920, height: 1080 }, { width: 1280, height: 800 }, { width: 960, height: 1080 }])('keeps square readable cells and no horizontal scrolling at $width x $height', async viewport => {
  const page = await harness.browser.newPage({ viewport, deviceScaleFactor: 2 }); page.setDefaultTimeout(4000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(harness.baseUrl);
  for (const columns of [9, 30]) {
    await create(page, columns);
    await page.getByRole('gridcell').first().focus(); await page.keyboard.press('0');
    await state(page, '確定した手があります');
    const geometry = await page.evaluate(() => {
      const cell = document.querySelector('[role=gridcell]')!.getBoundingClientRect();
      const canvas = document.querySelector('canvas')!;
      const surface = canvas.parentElement!;
      const workspace = document.querySelector<HTMLElement>('.workspace')!;
      return { width: cell.width, height: cell.height, surfaceScroll: surface.scrollWidth, surfaceWidth: surface.clientWidth,
        documentScroll: document.documentElement.scrollWidth, viewport: window.innerWidth, viewportHeight: window.innerHeight, dpr: window.devicePixelRatio,
        placement: workspace.dataset.placement, available: workspace.clientWidth,
        canvasWidth: canvas.width, cssCanvasWidth: canvas.getBoundingClientRect().width,
        focus: getComputedStyle(document.activeElement!).outlineStyle };
    });
    expect(geometry.viewport).toBe(viewport.width); expect(geometry.viewportHeight).toBe(viewport.height);
    expect(geometry.width).toBe(geometry.height); expect(geometry.width).toBeGreaterThanOrEqual(24);
    expect(geometry.surfaceScroll).toBe(geometry.surfaceWidth);
    expect(geometry.documentScroll).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.placement).toBe(Math.floor((geometry.available - 312) / columns) >= 24 ? 'right' : 'below');
    expect(geometry.canvasWidth).toBe(geometry.cssCanvasWidth * 2);
    expect(geometry.focus).not.toBe('none');
    await writeFile(`${artifacts}/${viewport.width}-${columns}.json`, JSON.stringify({ ...environment, columns, geometry }, null, 2));
    await page.screenshot({ path: `${artifacts}/${viewport.width}-${columns}.png`, fullPage: true });
  }
  expect(errors).toEqual([]); await page.close();
});
it('production flow stays local and leaves no browser storage behind', async () => {
  const context = await harness.browser.newContext();
  const requests: { url: string; method: string; type: string; hasBody: boolean }[] = [];
  const responses: { url: string; status: number; mime: string }[] = [];
  const failed: string[] = [];
  const sockets: string[] = [];
  const errors: string[] = [];
  context.on('request', request => requests.push({ url: request.url(), method: request.method(), type: request.resourceType(), hasBody: request.postData() !== null }));
  context.on('response', response => responses.push({ url: response.url(), status: response.status(), mime: response.headers()['content-type'] ?? '' }));
  context.on('requestfailed', request => failed.push(request.url()));
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(harness.baseUrl).origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  page.on('websocket', socket => sockets.push(socket.url())); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).beacons = [];
    navigator.sendBeacon = (url) => { (window as any).beacons.push(String(url)); return false; };
  });
  await page.goto(harness.baseUrl);
  const storage = () => page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length, workers: (await navigator.serviceWorker.getRegistrations()).length, beacons: (window as any).beacons }));
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  await create(page, 3, 1, 1);
  await page.getByRole('gridcell').first().focus(); await page.keyboard.press('0');
  await state(page, '確定した手があります');
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('提案: 地雷 M');
  await create(page, 3, 1, 2);
  await page.getByRole('gridcell').nth(1).focus(); await page.keyboard.press('1');
  await state(page, '盤面に矛盾があります');
  await page.keyboard.press('2'); await state(page, '確定した手があります');
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  await page.reload(); expect(await page.getByRole('gridcell').count()).toBe(81);
  await state(page, '推測が必要です');
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  const base = new URL(harness.baseUrl);
  expect(requests.every(request => {
    const url = new URL(request.url);
    return url.origin === base.origin && !url.search
      && (url.pathname === base.pathname || (url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/assets/`) && /\.(js|css)$/.test(url.pathname)))
      && request.method === 'GET' && !request.hasBody;
  })).toBe(true);
  expect(requests.some(request => request.url.includes('solver.worker-'))).toBe(true);
  expect(responses.some(response => response.url.includes('solver.worker-') && /(?:text|application)\/javascript/.test(response.mime))).toBe(true);
  expect(responses.filter(response => new URL(response.url).pathname.endsWith('.js')).every(response => /^(?:text|application)\/javascript(?:;|$)/.test(response.mime))).toBe(true);
  expect(responses.filter(response => new URL(response.url).pathname.endsWith('.css')).every(response => /^text\/css(?:;|$)/.test(response.mime))).toBe(true);
  expect(responses.filter(response => response.status >= 400)).toEqual([]);
  expect(failed).toEqual([]);
  expect(sockets).toEqual([]); expect(errors).toEqual([]);
  await writeFile(`${artifacts}/network.json`, JSON.stringify({ ...environment, requests, responses, failed, sockets, errors, storage: await storage() }, null, 2));
  await context.close();
});
it('supports the main workflow using keyboard navigation only', async () => {
  const page = await harness.browser.newPage(); page.setDefaultTimeout(4000); await page.goto(harness.baseUrl);
  async function tabTo(selector: string) {
    for (let count = 0; count < 40; count++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(selector => document.activeElement?.matches(selector), selector)) return;
    }
    throw new Error(`Could not reach ${selector} by Tab`);
  }
  await tabTo('input[type=number]'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('3');
  await page.keyboard.press('Tab'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('1');
  await page.keyboard.press('Tab'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('1');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await tabTo('[role=gridcell]'); await page.keyboard.press('0');
  await state(page, '確定した手があります');
  await tabTo('input[value=trusted]'); await page.keyboard.press('ArrowDown');
  expect(await page.getByLabel('入力旗を再検討する', { exact: true }).isChecked()).toBe(true);
  await tabTo('.reanalyze'); await page.keyboard.press('Enter'); await state(page, '確定した手があります');
  await tabTo('.reset-button'); await page.keyboard.press('Enter'); await state(page, '推測が必要です');
  expect(await page.getByRole('gridcell').count()).toBe(3);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('閉じたセル');
  await page.close();
});
