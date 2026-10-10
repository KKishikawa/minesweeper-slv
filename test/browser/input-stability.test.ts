import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';

let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });
async function settled(page: Page) {
  await page.waitForFunction(() => document.querySelector('.result-card')?.getAttribute('data-phase') !== 'solving');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function prepare(page: Page, columns = 9) {
  await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=stability`);
  await settled(page);
  await page.getByLabel('幅', { exact: true }).fill(String(columns));
  await page.getByLabel('高さ', { exact: true }).fill(String(columns === 30 ? 16 : 9));
  await page.getByLabel('総地雷数', { exact: true }).fill(String(columns === 30 ? 99 : 10));
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  await settled(page);
  await page.getByRole('gridcell').first().focus();
  await page.addScriptTag({ content: await readFile('scripts/ui/input-probe.js', 'utf8') });
  await settled(page);
  await page.evaluate(() => (window as any).inputProbe.reset());
}

// Catches empty counts/copy collapsing the result and moving the page during solving.
it.each([1920, 1280, 960].flatMap(width => [9, 30].map(columns => ({ width, columns }))))(
  'keeps input geometry stable at $width px with $columns columns through solving and recovery', async ({ width, columns }) => {
    const page = await harness.browser.newPage({ viewport: { width, height: width === 1280 ? 800 : 1080 } });
    try {
      await prepare(page, columns);
      const geometry = () => page.evaluate(() => ({
        result: document.querySelector('.result-card')!.getBoundingClientRect().height,
        workspace: document.querySelector('.workspace')!.getBoundingClientRect().height,
        page: document.documentElement.scrollHeight, scroll: scrollY,
      }));
      const before = await geometry();
      for (const key of ['0', 'Delete', 'f', 'Delete', '1', 'Delete', '8', 'Delete']) {
        await page.keyboard.press(key);
        expect(await geometry()).toEqual(before);
        await settled(page);
        expect(await geometry()).toEqual(before);
      }
      const frames = await page.evaluate(() => (window as any).inputProbe.report().events.filter((e: any) => e.type === 'frame'));
      expect(frames.every((e: any) => e.pageHeight === before.page && e.result.height === before.result && e.scrollY === before.scroll)).toBe(true);
      expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('閉じたセル 提案: 推測 ?');
      expect(await page.getByRole('gridcell').first().evaluate(el => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

// Catches redundant bitmap resets, legend repaint, and resize-triggered renders.
it('does not reset unchanged canvas dimensions or redraw unrelated legends on input', async () => {
  const page = await harness.browser.newPage();
  try {
    await prepare(page);
    await page.keyboard.press('0'); await settled(page);
    const events = await page.evaluate(() => (window as any).inputProbe.report().events) as any[];
    expect(events.filter(e => e.type === 'canvas-size' && e.canvas === 'board')).toEqual([]);
    expect(events.filter(e => e.type === 'draw' && e.canvas !== 'board')).toEqual([]);
    expect(events.filter(e => e.type === 'canvas-size')).toEqual([]);
    expect(events.filter(e => e.type === 'draw' && e.canvas === 'board')).toHaveLength(2);
  } finally { await page.close(); }
});

// Catches selection being redrawn by both select() and its focusin event.
it('draws a single selection change when moving keyboard focus', async () => {
  const page = await harness.browser.newPage();
  try {
    await prepare(page);
    await page.evaluate(() => (window as any).inputProbe.reset());
    await page.keyboard.press('ArrowRight'); await settled(page);
    const navigation = await page.evaluate(() => (window as any).inputProbe.report().events) as any[];
    expect(navigation.filter(e => e.type === 'draw' && e.canvas === 'board')).toHaveLength(1);
  } finally { await page.close(); }
});

// A result-only height change must not resize or repaint the board.
it('does not redraw the board when only the information panel height changes', async () => {
  const page = await harness.browser.newPage();
  try {
    await prepare(page);
    await page.evaluate(() => { document.querySelector<HTMLElement>('.result-card')!.style.minHeight = '500px'; });
    await settled(page);
    const events = await page.evaluate(() => (window as any).inputProbe.report().events) as any[];
    expect(events.filter(e => e.type === 'resize' && e.target === 'workspace').length).toBeGreaterThan(0);
    expect(events.filter(e => e.type === 'draw')).toEqual([]);
  } finally { await page.close(); }
});

// Catches a width observer being suppressed completely instead of ignoring height only.
it('resizes the bitmap and keeps square cells when changing sidebar placement', async () => {
  const page = await harness.browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  try {
    await prepare(page, 30);
    expect(await page.locator('.workspace').getAttribute('data-placement')).toBe('right');
    expect(await page.locator('.board-surface canvas').evaluate(el => (el as HTMLCanvasElement).width)).toBe(1740);
    await page.setViewportSize({ width: 960, height: 1080 });
    await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-placement') === 'below'
      && document.querySelector<HTMLCanvasElement>('.board-surface canvas')?.width === 1680);
    expect(await page.getByRole('gridcell').first().evaluate(el => {
      const rect = el.getBoundingClientRect(); return [rect.width, rect.height];
    })).toEqual([28, 28]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(960);
    expect(await page.getByRole('gridcell').first().evaluate(el => el === document.activeElement)).toBe(true);
  } finally { await page.close(); }
});

// Catches a legend cache surviving a DPR change and leaving blurry/stale bitmaps.
it('refreshes board and legend bitmaps after the device pixel ratio changes', async () => {
  const page = await harness.browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await prepare(page);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
    await page.keyboard.press('f'); await settled(page);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    expect(await page.locator('.board-surface canvas').evaluate(el => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height])).toEqual([720, 720]);
    expect(await page.locator('.legend canvas').evaluateAll(elements => elements.map(el => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height])))
      .toEqual([[48, 48], [48, 48], [48, 48], [48, 48], [48, 48]]);
    expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('入力旗');
  } finally { await page.close(); }
});

// Catches the automatic fallback note inserting/removing a row in the sidebar.
it('keeps the page height stable when automatic flag reconsideration starts and ends', async () => {
  const page = await harness.browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await prepare(page);
    await page.getByLabel('幅', { exact: true }).fill('3');
    await page.getByLabel('高さ', { exact: true }).fill('1');
    await page.getByLabel('総地雷数', { exact: true }).fill('1');
    await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
    await page.getByLabel('矛盾したときに入力旗を自動で再検討する', { exact: true }).check();
    await settled(page);
    await page.getByRole('gridcell').first().focus();
    await page.keyboard.press('0'); await settled(page);
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('f'); await settled(page);
    expect(await page.locator('.effective-policy').textContent()).toContain('再検討');
    expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('入力旗 提案: 安全 S');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before);
    await page.keyboard.press('Delete'); await settled(page);
    expect(await page.locator('.effective-policy').textContent()).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before);
  } finally { await page.close(); }
});
