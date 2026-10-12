import { afterAll, beforeAll, expect, it } from 'vitest';
import { startBrowserHarness, type BrowserHarness } from './harness';
import type { Page } from 'playwright';
import type {} from './image-input.fixture';
let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });
async function open() {
  const page = await harness.browser.newPage(); page.setDefaultTimeout(2000);
  await page.goto(`${harness.baseUrl}/test/browser/image-input.fixture.html`);
  expect(await page.locator('.image-input').getAttribute('open')).toBe(null);
  await page.locator('.image-input summary').click(); return page;
}
async function ready(page: Page, source: string) { await page.locator('.image-metadata').filter({ hasText: source }).waitFor(); }
it('imports_file_paste_drop_with_identical_rgba', async () => {
  const page = await open();
  await page.locator('.result-card').getByRole('status').filter({ hasText: '推測が必要です' }).waitFor();
  const solverRequests = await page.evaluate(() => window.imageFixture.solverRequests());
  const before = await page.locator('.board-surface').innerHTML();
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    const file = await page.evaluate(type => window.imageFixture.image(type), type);
    await page.locator('.image-file').setInputFiles({ name: 'private-image', mimeType: file.type, buffer: Buffer.from(file.bytes) });
    await ready(page, 'ファイル'); const expected = await page.evaluate(() => window.imageFixture.preview());
    expect(expected.width).toBe(4); expect(expected.height).toBe(3);
    expect(expected.pixels[0]).toBeGreaterThan(240); expect(expected.pixels[1]).toBeLessThan(10); expect(expected.pixels[3]).toBe(255);
    for (const kind of ['paste', 'drop'] as const) {
      expect(await page.evaluate(({ kind, file }) => window.imageFixture.transfer('.image-input-zone', kind, [file]), { kind, file })).toBe(true);
      await ready(page, kind === 'paste' ? '貼り付け' : 'ドロップ');
      expect(await page.evaluate(() => window.imageFixture.preview())).toEqual(expected);
    }
  }
  expect(await page.locator('.board-surface').innerHTML()).toBe(before);
  expect(await page.locator('.undo-button').isDisabled()).toBe(true);
  expect(await page.evaluate(() => window.imageFixture.solverRequests())).toEqual(solverRequests);
  await page.getByRole('button', { name: '画像をクリア', exact: true }).click();
  expect(await page.evaluate(() => window.imageFixture.preview())).toEqual({ width: 0, height: 0, pixels: [] });
  await page.close();
});
it('reselects_same_file_and_selects_first_supported', async () => {
  const page = await open(); const file = await page.evaluate(() => window.imageFixture.image('image/png'));
  const input = page.locator('.image-file');
  for (let i = 0; i < 2; i++) {
    await input.setInputFiles({ name: 'same.png', mimeType: file.type, buffer: Buffer.from(file.bytes) }); await ready(page, 'ファイル');
    expect(await input.inputValue()).toBe('');
  }
  const successful = await page.evaluate(() => window.imageFixture.preview());
  await input.dispatchEvent('cancel'); expect(await page.evaluate(() => window.imageFixture.preview())).toEqual(successful);
  await page.evaluate(file => window.imageFixture.transfer('.image-input-zone', 'drop', [{ type: 'text/plain', bytes: [1] }, file, file]), file);
  await ready(page, 'ドロップ'); expect(await page.locator('.image-status').textContent()).toContain('最初の1枚');
  expect((await page.evaluate(() => window.imageFixture.preview())).pixels.slice(0, 4)).toEqual([255, 0, 0, 255]);
  await input.setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10]) });
  await page.locator('.image-status').filter({ hasText: '読み込めませんでした' }).waitFor();
  expect((await page.evaluate(() => window.imageFixture.preview())).width).toBe(4);
  await input.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await page.locator('.image-status').filter({ hasText: 'PNG・JPEG・WebP' }).waitFor(); await page.close();
});
it('keeps_file_cancel_notice_through_sharing_updates_until_image_operation', async () => {
  const page = await open();
  const file = await page.evaluate(() => window.imageFixture.image('image/png'));
  const input = page.locator('.image-file');
  const status = page.locator('.image-status');
  await input.setInputFiles({ name: 'test.png', mimeType: file.type, buffer: Buffer.from(file.bytes) });
  await ready(page, 'ファイル');
  const successful = await page.evaluate(() => window.imageFixture.preview());
  await input.dispatchEvent('cancel');
  expect(await status.textContent()).toContain('取り消しました');

  await page.getByRole('button', { name: '画面共有を開始', exact: true }).click();
  expect(await status.textContent()).toContain('取り消しました');
  await page.evaluate(() => window.imageFixture.send('#0000ff'));
  await page.getByRole('button', { name: '最新フレームを取得', exact: true }).waitFor();
  expect(await status.textContent()).toContain('取り消しました');
  expect(await page.evaluate(() => window.imageFixture.preview())).toEqual(successful);

  await page.getByRole('button', { name: '最新フレームを取得', exact: true }).click();
  await ready(page, '画面共有');
  expect(await status.textContent()).toContain('画像を取り込みました');
  const captured = await page.evaluate(() => window.imageFixture.preview());
  expect(captured.pixels.slice(0, 4)).toEqual([0, 0, 255, 255]);
  await input.dispatchEvent('cancel');
  await page.getByRole('button', { name: '共有を停止', exact: true }).click();
  expect(await status.textContent()).toContain('取り消しました');
  expect(await page.evaluate(() => window.imageFixture.preview())).toEqual(captured);

  await input.setInputFiles({ name: 'test.png', mimeType: file.type, buffer: Buffer.from(file.bytes) });
  await ready(page, 'ファイル');
  expect(await status.textContent()).toContain('画像を取り込みました');
  expect(await page.evaluate(() => window.imageFixture.preview())).toEqual(successful);
  await input.dispatchEvent('cancel');
  await page.getByRole('button', { name: '画像をクリア', exact: true }).click();
  expect(await status.textContent()).toContain('まだ取り込まれていません');
  expect(await page.evaluate(() => window.imageFixture.preview())).toEqual({ width: 0, height: 0, pixels: [] });
  await page.close();
});
it('does_not_fetch_pasted_urls_or_intercept_text', async () => {
  const page = await open(); const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  expect(await page.evaluate(() => window.imageFixture.transfer('.image-input-zone', 'paste', [], 'https://example.invalid/private.png'))).toBe(false);
  const file = await page.evaluate(() => window.imageFixture.image('image/png'));
  for (const tag of ['input', 'textarea', 'div']) {
    expect(await page.evaluate(({ tag, file }) => {
      const target = document.createElement(tag); target.className = 'editable-test';
      if (tag === 'div') target.contentEditable = 'true';
      document.querySelector('.image-input-zone')!.append(target);
      const prevented = window.imageFixture.transfer('.editable-test', 'paste', [file]); target.remove(); return prevented;
    }, { tag, file })).toBe(false);
  }
  expect(requests.some(url => url.includes('example.invalid'))).toBe(false);
  expect((await page.evaluate(() => window.imageFixture.preview())).width).toBe(0); await page.close();
});
it('prevents_outside_file_navigation_without_import', async () => {
  const page = await open(); const file = await page.evaluate(() => window.imageFixture.image('image/png'));
  for (const kind of ['dragover', 'drop'] as const) {
    expect(await page.evaluate(({ file, kind }) => window.imageFixture.transfer('.page-header', kind, [file]), { file, kind })).toBe(true);
    expect(await page.evaluate(kind => window.imageFixture.transfer('.page-header', kind, [], 'plain text'), kind)).toBe(false);
  }
  expect((await page.evaluate(() => window.imageFixture.preview())).width).toBe(0); await page.close();
});
