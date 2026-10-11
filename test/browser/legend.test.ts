import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';
let harness: BrowserHarness;
let page: Page;
beforeAll(async () => {
  harness = await startBrowserHarness();
  page = await harness.browser.newPage({ deviceScaleFactor: 1 });
  page.setDefaultTimeout(3000);
  await mkdir('test/artifacts/trusted-flags', { recursive: true });
});
afterAll(async () => { await harness?.close(); });
async function board(width: number, mines: number) {
  await page.getByLabel('幅', { exact: true }).fill(String(width));
  await page.getByLabel('高さ', { exact: true }).fill('1');
  await page.getByLabel('総地雷数', { exact: true }).fill(String(mines));
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
}
async function pixels(selector: string, index = 0) {
  return page.locator(selector).evaluate((element, index) => {
    const ctx = (element as HTMLCanvasElement).getContext('2d')!;
    // Exclude selection/focus borders; compare the actual symbol and cell interior.
    return Array.from(ctx.getImageData((index * 24 + 4) * devicePixelRatio, 4 * devicePixelRatio, 16 * devicePixelRatio, 16 * devicePixelRatio).data);
  }, index);
}
it('renders the same flag, safe, mine and guess symbols in the legend and board at 24px', async () => {
  await page.goto(harness.baseUrl);
  await page.addStyleTag({ content: '.editor-mount { --board-cell-size: 24 !important; }' });
  await page.getByRole('gridcell').first().focus(); await page.keyboard.press('f');
  await page.getByRole('status').filter({ hasText: '推測が必要です' }).waitFor();
  await page.keyboard.press('ArrowRight');
  expect(await pixels('.board-surface canvas', 0)).toEqual(await pixels('.legend [data-symbol=flag]'));
  await board(3, 1);
  await page.getByRole('gridcell').first().focus(); await page.keyboard.press('0');
  await page.getByRole('status').filter({ hasText: '確定した手があります' }).waitFor();
  expect(await pixels('.board-surface canvas', 1)).toEqual(await pixels('.legend [data-symbol=safe]'));
  expect(await pixels('.board-surface canvas', 2)).toEqual(await pixels('.legend [data-symbol=mine]'));
  await board(2, 1);
  await page.getByRole('status').filter({ hasText: '推測が必要です' }).waitFor();
  expect(await pixels('.board-surface canvas', 1)).toEqual(await pixels('.legend [data-symbol=guess]'));
});
it.each([1, 2])('keeps the fixed input flag visible through selection and focus at 24px and DPR %i', async dpr => {
  await page.close();
  page = await harness.browser.newPage({ deviceScaleFactor: dpr });
  page.setDefaultTimeout(3000);
  await page.goto(harness.baseUrl);
  await page.addStyleTag({ content: '.editor-mount { --board-cell-size: 24 !important; }' });
  await board(3, 1);
  await page.getByRole('gridcell').nth(1).focus(); await page.keyboard.press('1');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('f');
  await page.getByRole('status').filter({ hasText: '確定した手があります' }).waitFor();
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).toContain('入力旗');
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).not.toContain('提案:');
  const masks: number[][] = [];
  for (const state of ['selected', 'focused', 'unselected']) {
    if (state === 'focused') { await page.getByRole('gridcell').nth(0).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); }
    if (state === 'unselected') await page.keyboard.press('ArrowRight');
    if (state === 'focused') expect(await page.getByRole('gridcell').nth(0).evaluate(cell => getComputedStyle(cell).outlineStyle)).not.toBe('none');
    const screenshot = await page.getByRole('gridcell').nth(0).screenshot({ scale: 'css', path: `test/artifacts/trusted-flags/fixed-flag-${state}-dpr${dpr}.png` });
    const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
    const mask: number[] = [];
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset]! > 90 && data[offset + 1]! < 100 && data[offset + 2]! < 80) mask.push(y * info.width + x);
    }
    // A visible pole and pennant, not the former 5x5 corner square.
    expect(mask.length).toBeGreaterThan(15);
    const ys = mask.map(index => Math.floor(index / info.width));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(4);
    masks.push(mask);
  }
  expect(masks[1]).toEqual(masks[0]); expect(masks[2]).toEqual(masks[0]);
  expect(await pixels('.board-surface canvas', 0)).toEqual(await pixels('.legend [data-symbol=flag]'));
  await page.screenshot({ path: `test/artifacts/trusted-flags/legend-and-board-dpr${dpr}.png`, fullPage: true });
});

it('shows fixed flags in 24px cells on the responsive 30-column board', async () => {
  await page.goto(harness.baseUrl);
  await page.setViewportSize({ width: 1130, height: 1080 });
  await board(30, 1);
  await page.getByRole('gridcell').nth(1).focus(); await page.keyboard.press('1');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('f');
  await page.getByRole('status').filter({ hasText: '確定した手があります' }).waitFor();
  expect((await page.getByRole('gridcell').nth(0).boundingBox())?.width).toBe(24);
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).toContain('入力旗');
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).not.toContain('提案:');
  expect(await pixels('.board-surface canvas', 0)).toEqual(await pixels('.legend [data-symbol=flag]'));
  await page.screenshot({ path: 'test/artifacts/trusted-flags/responsive-30-columns.png', fullPage: true });
});
