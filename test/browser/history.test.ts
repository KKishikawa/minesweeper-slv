import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';

let harness: BrowserHarness;
let page: Page;
beforeAll(async () => { harness = await startBrowserHarness(); page = await harness.browser.newPage(); page.setDefaultTimeout(3000); });
afterAll(async () => { await harness?.close(); });
const undo = () => page.getByRole('button', { name: '元に戻す', exact: true });
const redo = () => page.getByRole('button', { name: 'やり直す', exact: true });
async function settled() {
  await page.waitForFunction(() => document.querySelector('.result-card')?.getAttribute('data-phase') !== 'solving');
}
async function start() { await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=history`); await settled(); }
async function create(width: number, height: number, mines: number) {
  await page.getByLabel('幅', { exact: true }).fill(String(width));
  await page.getByLabel('高さ', { exact: true }).fill(String(height));
  await page.getByLabel('総地雷数', { exact: true }).fill(String(mines));
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click(); await settled();
}
async function edit(index: number, key: string) { await page.getByRole('gridcell').nth(index).focus(); await page.keyboard.press(key); await settled(); }
async function runs() { return Number(await page.locator('#app').getAttribute('data-solver-runs')); }

// Missing disabled state or recording no-op reset/create would allow an empty undo.
it('disables unavailable history and keeps no-op reset and creation out of history', async () => {
  await start();
  expect(await undo().isDisabled()).toBe(true); expect(await redo().isDisabled()).toBe(true);
  await page.getByRole('button', { name: '盤面をリセット', exact: true }).click();
  await create(9, 9, 10);
  expect(await undo().isDisabled()).toBe(true); expect(await redo().isDisabled()).toBe(true);
  expect(await page.locator('.history-note').textContent()).toContain('100');
  expect(await page.locator('.history-note').textContent()).toContain('再読み込み');
});

// Failure to render stored results, or rerunning the worker on restore, loses this solved board.
it('restores the number and safe/mine proposals from limit without running another worker', async () => {
  await start(); await create(3, 1, 1); await edit(0, '0');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('提案: 安全 S');
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('提案: 地雷 M');
  await edit(0, '1');
  expect(await page.locator('.result-card').getAttribute('data-phase')).toBe('limit-reached');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).not.toContain('提案:');
  expect(await page.locator('.status-detail').textContent()).toContain('元に戻す');
  const before = await runs();
  await undo().click(); await settled();
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).toContain('空き');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('提案: 安全 S');
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('提案: 地雷 M');
  expect(await page.locator('.restored-result').textContent()).toContain('保存された解析結果');
  expect(await runs()).toBe(before);
  await redo().click(); await settled();
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).toContain('数字1');
  expect(await page.locator('.result-card').getAttribute('data-phase')).toBe('limit-reached');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).not.toContain('提案:');
  expect(await redo().isDisabled()).toBe(true); expect(await runs()).toBe(before);
});

// Omitting settings.update, or syncing only the cell count, leaves settings inconsistent with the grid.
it('restores dimensions, mine count, form values and cells after creating a different board', async () => {
  await start(); await create(3, 1, 1); await edit(0, '0'); await create(4, 2, 2);
  await page.getByLabel('幅', { exact: true }).fill('0');
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  expect(await page.getByLabel('幅', { exact: true }).getAttribute('aria-invalid')).toBe('true');
  expect(await page.locator('.field-error').textContent()).not.toBe('');
  await undo().click(); await settled();
  expect(await page.getByLabel('幅', { exact: true }).getAttribute('aria-invalid')).toBeNull();
  expect(await page.locator('.field-error').textContent()).toBe('');
  expect(await page.getByLabel('幅', { exact: true }).inputValue()).toBe('3');
  expect(await page.getByLabel('高さ', { exact: true }).inputValue()).toBe('1');
  expect(await page.getByLabel('総地雷数', { exact: true }).inputValue()).toBe('1');
  expect(await page.getByRole('grid').getAttribute('aria-colcount')).toBe('3');
  expect(await page.getByRole('grid').getAttribute('aria-rowcount')).toBe('1');
  expect(await page.getByRole('gridcell').count()).toBe(3);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('空き');
  await redo().click(); await settled();
  expect(await page.getByLabel('幅', { exact: true }).inputValue()).toBe('4');
  expect(await page.getByLabel('高さ', { exact: true }).inputValue()).toBe('2');
  expect(await page.getByLabel('総地雷数', { exact: true }).inputValue()).toBe('2');
  expect(await page.getByRole('gridcell').count()).toBe(8);
});

// Same-settings history moves must synchronize even when the restored entry has no result yet.
it.each(['history', 'draft'])('synchronizes drafts and errors on same-settings undo/redo in %s mode', async mode => {
  await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=${mode}`); await settled();
  await page.getByRole('gridcell').first().focus(); await page.keyboard.press('0');
  if (mode === 'history') await settled();
  await page.getByLabel('幅', { exact: true }).fill('12');
  await page.getByLabel('高さ', { exact: true }).fill('7');
  await page.getByLabel('総地雷数', { exact: true }).fill('20');
  await undo().click(); await settled();
  const values = () => page.locator('.board-settings input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  expect(await values()).toEqual(['9', '9', '10']);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('閉じたセル');
  await page.getByLabel('幅', { exact: true }).fill('0');
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  expect(await page.getByLabel('幅', { exact: true }).getAttribute('aria-invalid')).toBe('true');
  expect(await page.locator('.field-error').textContent()).not.toBe('');
  // Programmatic dispatch exercises the app's no-op boundary; normal disabled clicks do nothing.
  await undo().dispatchEvent('click');
  expect(await page.getByLabel('幅', { exact: true }).inputValue()).toBe('0');
  expect(await page.getByLabel('幅', { exact: true }).getAttribute('aria-invalid')).toBe('true');
  await redo().click();
  expect(await values()).toEqual(['9', '9', '10']);
  expect(await page.locator('.board-settings input[aria-invalid]').count()).toBe(0);
  expect(await page.locator('.field-error').textContent()).toBe('');
  if (mode === 'draft') {
    expect(await page.locator('.result-card').getAttribute('data-phase')).toBe('solving');
    await page.locator('#app').dispatchEvent('release-solver-result');
  }
  await settled();
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('空き');
});

// Not recording reset, or failing to discard a branch, restores the wrong cells/redo availability.
it('undoes reset and disables redo after a new edit', async () => {
  await start(); await create(3, 1, 1); await edit(0, '0');
  await page.getByRole('button', { name: '盤面をリセット', exact: true }).click(); await settled();
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('閉じたセル');
  await undo().click(); await settled();
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('空き');
  expect(await redo().isEnabled()).toBe(true);
  await edit(2, 'f');
  expect(await redo().isDisabled()).toBe(true);
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('入力旗');
  expect(await page.locator('.restored-result').textContent()).toBe('');
});

// The UI must restore proposals when an erroneous fixed flag is undone.
it('recovers from a contradictory flag by undoing it', async () => {
  await start(); await create(3, 1, 1); await edit(0, '0'); await edit(1, 'f');
  expect(await page.getByRole('status').textContent()).toBe('盤面に矛盾があります');
  await undo().click(); await settled();
  expect(await page.getByRole('status').textContent()).toBe('確定した手があります');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('閉じたセル 提案: 安全 S');
});

// Recreating the controls or handling only pointer clicks breaks focus/native activation.
it('reaches history controls with Tab and activates them with Enter and Space', async () => {
  await start(); await create(3, 1, 1); await edit(0, '0'); await edit(2, 'f');
  async function tabTo(selector: string) {
    for (let count = 0; count < 40; count++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(selector => document.activeElement?.matches(selector), selector)) return;
    }
    throw new Error(`Could not reach ${selector} by Tab`);
  }
  await tabTo('.undo-button'); await page.keyboard.press('Enter'); await settled();
  expect(await undo().evaluate(el => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Enter'); await settled();
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('閉じたセル');
  await tabTo('.redo-button'); await page.keyboard.press('Space'); await settled();
  expect(await redo().evaluate(el => el === document.activeElement)).toBe(true);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('空き');
});
