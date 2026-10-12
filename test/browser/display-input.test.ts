import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { startBrowserHarness, type BrowserHarness } from './harness';
import type { Page } from 'playwright';
import type {} from './image-input.fixture';
let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });
async function open(mode = '', width = 1280) {
  const page = await harness.browser.newPage({ viewport: { width, height: 900 } }); page.setDefaultTimeout(2500);
  await page.goto(`${harness.baseUrl}/test/browser/image-input.fixture.html?mode=${mode}`);
  await page.locator('.image-input summary').click(); return page;
}
async function start(page: Page) {
  await page.getByRole('button', { name: '画面共有を開始', exact: true }).click();
  await page.evaluate(() => window.imageFixture.send());
  await page.getByRole('button', { name: '最新フレームを取得', exact: true }).waitFor();
}
async function capture(page: Page, sample = false) {
  await page.getByRole('button', { name: '最新フレームを取得', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.image-status')!.textContent!.includes('読み込んでいます'));
  return page.evaluate(sample => window.imageFixture.preview(sample), sample);
}
it('captures_changed_and_static_stream', async () => {
  const page = await open(); await start(page);
  const first = await capture(page); expect(first.pixels.slice(0, 4)).toEqual([255, 0, 0, 255]);
  expect(await capture(page)).toEqual(first); expect(await capture(page)).toEqual(first);
  await page.evaluate(() => window.imageFixture.send('#0000ff'));
  await expect.poll(async () => (await capture(page)).pixels.slice(0, 4)).toEqual([0, 0, 255, 255]);
  await page.close();
});
it('updates_dimensions_on_same_stream', async () => {
  const page = await open(); await start(page); expect((await capture(page)).width).toBe(4);
  await page.evaluate(() => window.imageFixture.send('#00ff00', 6, 2));
  await expect.poll(async () => { const image = await capture(page); return [image.width, image.height]; }).toEqual([6, 2]);
  expect((await capture(page)).pixels.slice(0, 4)).toEqual([0, 255, 0, 255]); await page.close();
});
it('stop_remains_available_with_closed_panel', async () => {
  const page = await open(); await start(page); const image = await capture(page);
  await page.locator('.image-input summary').click();
  expect(await page.locator('.image-input summary').textContent()).toContain('共有中');
  await page.getByRole('button', { name: '共有を停止', exact: true }).click();
  expect(await page.evaluate(() => window.imageFixture.trackState())).toBe('ended');
  expect(await page.evaluate(() => window.imageFixture.preview())).toEqual(image); await page.close();
});
it('external_stop_and_unsupported_keep_file_input', async () => {
  for (const mode of ['', 'unsupported']) {
    const page = await open(mode);
    if (!mode) { await start(page); await page.evaluate(() => window.imageFixture.externalStop()); }
    await page.locator('.display-status').filter({ hasText: mode ? '対応していません' : '停止しました' }).waitFor();
    const file = await page.evaluate(() => window.imageFixture.image('image/png'));
    await page.locator('.image-file').setInputFiles({ name: 'test.png', mimeType: file.type, buffer: Buffer.from(file.bytes) });
    await page.locator('.image-metadata').filter({ hasText: 'ファイル' }).waitFor(); await page.close();
  }
});
it('pagehide_and_dispose_release_tracks', async () => {
  for (const mode of ['', 'pending']) for (const lifetime of ['pagehide', 'dispose']) {
    const page = await open(mode);
    if (mode) await page.getByRole('button', { name: '画面共有を開始', exact: true }).click(); else { await start(page); await capture(page); }
    await page.evaluate(lifetime => lifetime === 'pagehide' ? window.dispatchEvent(new Event('pagehide')) : window.imageFixture.dispose(), lifetime);
    if (mode) await page.evaluate(() => window.imageFixture.finishSelection());
    await expect.poll(() => page.evaluate(() => window.imageFixture.trackState())).toBe('ended');
    if (lifetime === 'pagehide') expect(await page.evaluate(() => window.imageFixture.preview())).toEqual({ width: 0, height: 0, pixels: [] });
    else expect(await page.locator('#app').innerHTML()).toBe('');
    await page.close();
  }
});
it('cancels_pending_selection_and_releases_late_stream', async () => {
  const page = await open('pending'); await page.getByRole('button', { name: '画面共有を開始', exact: true }).click();
  await page.locator('.image-input').getByRole('button', { name: '共有開始を取り消す', exact: true }).click();
  await page.evaluate(() => window.imageFixture.finishSelection());
  await expect.poll(() => page.evaluate(() => window.imageFixture.trackState())).toBe('ended');
  await page.locator('.display-status').filter({ hasText: '取り消しました' }).waitFor(); await page.close();
});
it.each([1920, 1280, 960, 390])('keeps opened preview and stop controls usable at %ipx', async width => {
  const page = await open('', width); await start(page); await page.evaluate(() => window.imageFixture.send('#ff0000', 640, 480));
  await expect.poll(async () => (await capture(page, true)).width).toBe(640);
  await page.locator('.image-input summary').focus(); await page.keyboard.press('Tab');
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('.image-preview')!.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, scroll: document.documentElement.scrollWidth, viewport: innerWidth,
      focus: getComputedStyle(document.activeElement!).outlineStyle };
  });
  expect(geometry.height).toBeLessThanOrEqual(320); expect(geometry.width / geometry.height).toBeCloseTo(4 / 3);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport); expect(geometry.focus).not.toBe('none');
  await mkdir('test/artifacts/image-input', { recursive: true });
  await page.screenshot({ path: `test/artifacts/image-input/${width}-open.png`, fullPage: true });
  await page.locator('.image-input summary').click(); await page.screenshot({ path: `test/artifacts/image-input/${width}-closed-sharing.png`, fullPage: true });
  await page.getByRole('button', { name: '共有を停止', exact: true }).click();
  await page.screenshot({ path: `test/artifacts/image-input/${width}-stopped.png`, fullPage: true }); await page.close();
});
